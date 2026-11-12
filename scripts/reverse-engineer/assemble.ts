// Deterministic assembly: raw stage outputs -> the typed report the web app
// reads, plus the BRD (Markdown) and the knowledge graph (JSON + Cypher).
// No model calls here; every number in the outputs is computed from the data.
import type {
  ReActivity,
  ReBusinessDomain,
  ReCapability,
  ReEntity,
  ReEpic,
  ReFlow,
  ReJourney,
  RePersona,
  ReRelationship,
  ReReport,
  ReInputBrd,
  ReRunInfo,
  ReTraceStatus,
  ReverseEngineeringReport,
} from '../../apps/web/src/reverse-engineering/types.ts';
import { MODULES } from './stages.ts';

type Any = any;
type SourceType =
  | 'source-code'
  | 'technical-doc'
  | 'business-doc'
  | 'ticket'
  | 'log'
  | 'data-model'
  | 'test'
  | 'recording'
  | 'other';

const list = (v: unknown): Any[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] =>
  list(v)
    .filter((x) => typeof x === 'string' && x.trim())
    .map((x: string) => x.trim());
const str = (v: unknown, fallback = ''): string =>
  typeof v === 'string' && v.trim() ? v.trim() : fallback;

function sourceTypeOf(ref: string): SourceType {
  const p = ref.replace(/:\d+$/, '');
  if (/\.(sql)$|initdb\//i.test(p)) return 'data-model';
  if (/\.(png|jpe?g)$/i.test(p)) return 'recording';
  if (/^log:|logging\.conf$/i.test(p)) return 'log';
  if (/\.(md)$/i.test(p)) return /docs\//.test(p) ? 'technical-doc' : 'business-doc';
  if (/\.(ya?ml|tf|toml|properties|xml)$/i.test(p)) return 'technical-doc';
  if (/tests?\//.test(p)) return 'test';
  return 'source-code';
}

export function makeMeta(raw: Any, stage: string, derivedAt: string, repo: string) {
  const evidence = strs(raw?.evidence);
  const score =
    typeof raw?.confidence === 'number' ? Math.max(0, Math.min(1, raw.confidence)) : 0.5;
  const inferred = raw?.basis === 'inferred' || evidence.length === 0;
  const level = inferred ? 'inferred' : score >= 0.8 ? 'high' : score >= 0.6 ? 'medium' : 'low';
  const rationale = inferred
    ? 'Inferred by the model from indirect evidence; needs confirmation.'
    : `Read from ${evidence.length} artifact location${evidence.length === 1 ? '' : 's'}.`;
  return {
    provenance: (evidence.length ? evidence : [`repo://${repo}`]).slice(0, 6).map((ref) => ({
      sourceId: ref.includes('://') ? ref : `repo://${repo}/${ref}`,
      sourceType: evidence.length ? sourceTypeOf(ref) : ('other' as SourceType),
      derivedBy: `llm:${stage}`,
      derivedAt,
    })),
    confidence: { level, score: Math.round(score * 100) / 100, rationale },
  } as const;
}

/** Makes ids unique and returns the kept elements. */
function uniqueById<T extends { id: string }>(items: T[], prefix: string, warnings: string[]): T[] {
  const seen = new Set<string>();
  return items.map((it, i) => {
    let id = str(it.id, `${prefix}-${i + 1}`)
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-');
    if (seen.has(id)) {
      warnings.push(`duplicate id ${id} renamed`);
      id = `${id}-${i + 1}`;
    }
    seen.add(id);
    return { ...it, id };
  });
}

export function assembleReport(args: {
  id: string;
  outputs: Record<string, Any>;
  run: Omit<ReRunInfo, 'warnings'>;
  inputBrd?: ReInputBrd | null;
}): ReverseEngineeringReport {
  const { outputs, run } = args;
  const warnings: string[] = [];
  const at = run.finishedAt;
  const repo = args.id;
  const m = (raw: Any, stage: string) => makeMeta(raw, stage, at, repo);
  const inv = outputs.inventory ?? {};
  const dom = outputs.domains ?? {};
  const act = outputs.activities ?? {};
  const flw = outputs.flows ?? {};
  const blg = outputs.backlog ?? {};
  const arc = outputs.architecture ?? {};
  const brdOut = outputs.brd ?? {};
  const moduleIds = new Set<string>(MODULES.map((x) => x.id));
  const modOf = (v: unknown): string =>
    typeof v === 'string' && moduleIds.has(v) ? v : 'module-1';

  // --- 1/2 domains & domain model ---------------------------------------
  const entities: ReEntity[] = uniqueById(list(dom.entities), 'ent', warnings).map((e: Any) => ({
    id: e.id,
    name: str(e.name, e.id),
    domainId: str(e.domainId),
    description: str(e.description),
    storage: str(e.storage, 'Not determined'),
    attributes: list(e.attributes).map((a: Any) => ({
      name: str(a.name, '?'),
      type: str(a.type, 'unknown'),
      description: str(a.description),
      ...(a.key === 'pk' || a.key === 'fk' || a.key === 'unique' ? { key: a.key } : {}),
      ...(typeof a.required === 'boolean' ? { required: a.required } : {}),
    })),
    metadata: m(e, 'domains'),
  }));
  const entityIds = new Set(entities.map((e) => e.id));
  const entityName = (id: string) => entities.find((e) => e.id === id)?.name ?? id;

  const domains: ReBusinessDomain[] = uniqueById(list(dom.domains), 'dom', warnings).map(
    (d: Any) => ({
      id: d.id,
      name: str(d.name, d.id),
      description: str(d.description),
      moduleIds: strs(d.moduleIds).filter((x) => moduleIds.has(x)),
      responsibilities: strs(d.responsibilities),
      owningServices: strs(d.owningServices),
      aggregates: uniqueById(list(d.aggregates), `${d.id}-agg`, warnings).map((a: Any) => ({
        id: a.id,
        name: str(a.name, a.id),
        // The Domain Model page shows entity *names*.
        entities: strs(a.entityIds ?? a.entities).map(entityName),
        metadata: m(a, 'domains'),
      })),
      metadata: m(d, 'domains'),
    }),
  );
  const domainIds = new Set(domains.map((d) => d.id));
  for (const e of entities)
    if (!domainIds.has(e.domainId))
      warnings.push(`entity ${e.id} has unknown domain ${e.domainId}`);

  const relationships: ReRelationship[] = uniqueById(list(dom.relationships), 'rel', warnings)
    .filter((r: Any) => {
      const ok = entityIds.has(r.from) && entityIds.has(r.to);
      if (!ok) warnings.push(`relationship ${r.id} dropped: unknown entity`);
      return ok;
    })
    .map((r: Any) => ({
      id: r.id,
      fromEntityId: r.from,
      toEntityId: r.to,
      cardinality: ['1:1', '1:N', 'N:1', 'N:M'].includes(r.cardinality) ? r.cardinality : '1:N',
      label: str(r.label, 'relates to'),
      metadata: m(r, 'domains'),
    }));

  // --- 3 activities, 6 reports -----------------------------------------
  const activities: ReActivity[] = uniqueById(list(act.activities), 'act', warnings).map(
    (a: Any) => ({
      id: a.id,
      name: str(a.name, a.id),
      moduleId: modOf(a.moduleId),
      domainId: str(a.domainId),
      actor: str(a.actor, 'Customer'),
      trigger: str(a.trigger),
      description: str(a.description),
      inputs: strs(a.inputs),
      outputs: strs(a.outputs),
      businessRules: strs(a.businessRules),
      ...(str(a.endpoint) && a.endpoint !== 'null' ? { endpoint: str(a.endpoint) } : {}),
      ...(str(a.service) && a.service !== 'null' ? { service: str(a.service) } : {}),
      metadata: m(a, 'activities'),
    }),
  );
  const activityIds = new Set(activities.map((a) => a.id));

  const reports: ReReport[] = uniqueById(list(act.reports), 'rep', warnings).map((r: Any) => ({
    id: r.id,
    name: str(r.name, r.id),
    moduleId: modOf(r.moduleId),
    purpose: str(r.purpose),
    audience: strs(r.audience),
    fields: strs(r.fields),
    sourceEntityIds: strs(r.sourceEntityIds).filter((x) => entityIds.has(x)),
    frequency: str(r.frequency, 'on demand'),
    implemented: r.implemented !== false,
    metadata: m(r, 'activities'),
  }));

  // --- 4 flows, 5 personas & journeys ------------------------------------
  const executionFlows: ReFlow[] = uniqueById(list(flw.executionFlows), 'flow', warnings).map(
    (f: Any) => ({
      id: f.id,
      name: str(f.name, f.id),
      description: str(f.description),
      moduleId: modOf(f.moduleId),
      actor: str(f.actor, 'Customer'),
      triggerScreen: str(f.triggerScreen, 'Not determined'),
      steps: uniqueById(list(f.steps), `${f.id}-step`, warnings).map((s: Any) => ({
        id: s.id,
        name: str(s.name, s.id),
        description: str(s.description),
        ...(str(s.service) ? { service: str(s.service) } : {}),
        ...(activityIds.has(s.activityId) ? { activityId: s.activityId } : {}),
        // The Execution Flows page shows entity *names*.
        readsEntities: strs(s.readsEntities).map(entityName),
        writesEntities: strs(s.writesEntities).map(entityName),
        metadata: m(s, 'flows'),
      })),
      metadata: m(f, 'flows'),
    }),
  );
  const flowIds = new Set(executionFlows.map((f) => f.id));

  const personas: RePersona[] = uniqueById(list(flw.personas), 'per', warnings).map((p: Any) => ({
    id: p.id,
    name: str(p.name, p.id),
    role: str(p.role),
    goals: strs(p.goals),
    painPoints: strs(p.painPoints),
    moduleIds: strs(p.moduleIds).filter((x) => moduleIds.has(x)),
    metadata: m(p, 'flows'),
  }));
  const journeys: ReJourney[] = uniqueById(list(flw.journeys), 'jrn', warnings).map((j: Any) => ({
    id: j.id,
    name: str(j.name, j.id),
    personaId: str(j.personaId),
    moduleId: modOf(j.moduleId),
    description: str(j.description),
    flowIds: strs(j.flowIds).filter((x) => flowIds.has(x)),
    stages: list(j.stages).map((s: Any) => ({
      stage: str(s.stage, 'Step'),
      action: str(s.action),
      touchpoint: str(s.touchpoint),
      ...(str(s.painPoint) ? { painPoint: str(s.painPoint) } : {}),
    })),
    metadata: m(j, 'flows'),
  }));

  // --- 7 capabilities & backlog ----------------------------------------
  const capabilities: ReCapability[] = uniqueById(list(blg.capabilities), 'cap', warnings).map(
    (c: Any) => ({
      id: c.id,
      name: str(c.name, c.id),
      description: str(c.description),
      moduleId: modOf(c.moduleId),
      domainId: str(c.domainId, domains[0]?.id ?? ''),
      status: ['implemented', 'partial', 'gap'].includes(c.status) ? c.status : 'partial',
      activityIds: strs(c.activityIds).filter((x) => activityIds.has(x)),
      metadata: m(c, 'backlog'),
    }),
  );
  const capIds = new Set(capabilities.map((c) => c.id));
  let storySeq = 0;
  const epics: ReEpic[] = uniqueById(list(blg.epics), 'epic', warnings).map((e: Any) => ({
    id: e.id,
    name: str(e.name, e.id),
    description: str(e.description),
    moduleId: modOf(e.moduleId),
    capabilityIds: strs(e.capabilityIds).filter((x) => capIds.has(x)),
    metadata: m(e, 'backlog'),
    features: uniqueById(list(e.features), `${e.id}-feat`, warnings).map((f: Any) => ({
      id: f.id,
      name: str(f.name, f.id),
      description: str(f.description),
      metadata: m(f, 'backlog'),
      stories: list(f.stories).map((s: Any) => {
        storySeq += 1;
        const asA = str(s.asA, 'customer');
        const iWant = str(s.iWant);
        const soThat = str(s.soThat);
        const id = `story-${String(storySeq).padStart(3, '0')}`;
        return {
          id,
          title: str(s.title, iWant || id),
          asA,
          iWant,
          soThat,
          priority: ['must', 'should', 'could'].includes(s.priority) ? s.priority : 'should',
          description: `As a ${asA}, I want ${iWant}, so that ${soThat}.`,
          acceptanceCriteria: strs(s.acceptanceCriteria).map((d, i) => ({
            id: `${id}-ac${i + 1}`,
            description: d,
          })),
          metadata: m(s, 'backlog'),
        };
      }),
    })),
  }));

  // --- architecture & operations ------------------------------------------
  const c4 = (items: Any[], level: 'context' | 'container', prefix: string) =>
    uniqueById(items, prefix, warnings).map((n: Any) => ({
      id: n.id,
      level,
      name: str(n.name, n.id),
      description: str(n.description),
      ...(str(n.technology) ? { technology: str(n.technology) } : {}),
      metadata: m(n, 'architecture'),
    }));
  const contextNodes = c4(list(arc.contextNodes), 'context', 'ctx');
  const containerNodes = c4(list(arc.containerNodes), 'container', 'ctr');
  const edges = (
    items: Any[],
    level: 'context' | 'container',
    nodes: { id: string }[],
    prefix: string,
  ) => {
    const ids = new Set(nodes.map((n) => n.id));
    return uniqueById(items, prefix, warnings)
      .filter((e: Any) => ids.has(e.source) && ids.has(e.target))
      .map((e: Any) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        label: str(e.label, 'uses'),
        level,
        metadata: m(e, 'architecture'),
      }));
  };
  const contextEdges = edges(list(arc.contextEdges), 'context', contextNodes, 'ce');
  const containerEdges = edges(list(arc.containerEdges), 'container', containerNodes, 'cte');
  const integrations = uniqueById(list(arc.integrations), 'int', warnings).map((i: Any) => ({
    id: i.id,
    name: str(i.name, i.id),
    counterpart: str(i.counterpart),
    direction: ['outbound', 'inbound', 'bidirectional'].includes(i.direction)
      ? i.direction
      : 'bidirectional',
    protocol: str(i.protocol, 'Not determined'),
    dataExchanged: str(i.dataExchanged),
    metadata: m(i, 'architecture'),
  }));
  const deploymentNodes = uniqueById(list(arc.deployment), 'dep', warnings).map((d: Any) => ({
    id: d.id,
    kind: d.kind === 'environment' ? 'environment' : 'instance',
    name: str(d.name, d.id),
    ...(str(d.environmentId) ? { environmentId: str(d.environmentId) } : {}),
    ...(str(d.containerId) ? { containerId: str(d.containerId) } : {}),
    ...(str(d.runtime) ? { runtime: str(d.runtime) } : {}),
    ...(str(d.scale) ? { scale: str(d.scale) } : {}),
    metadata: m(d, 'architecture'),
  }));
  const nfrCats = ['performance', 'availability', 'security', 'compliance', 'scalability'];
  const nonFunctionalRequirements = uniqueById(list(arc.nfrs), 'nfr', warnings).map((n: Any) => ({
    id: n.id,
    category: nfrCats.includes(n.category) ? n.category : 'security',
    requirement: str(n.requirement),
    target: str(n.target, 'Not specified'),
    appliesTo: strs(n.appliesTo),
    metadata: m(n, 'architecture'),
  }));
  const gapItems = uniqueById(list(brdOut.gaps), 'gap', warnings).map((g: Any) => ({
    id: g.id,
    area: str(g.area),
    description: str(g.description),
    missingInputs: strs(g.missingInputs),
    severity: ['blocking', 'high', 'medium', 'low'].includes(g.severity) ? g.severity : 'medium',
    suggestedAction: str(g.suggestedAction),
  }));

  // Review queue: the lowest-confidence elements that a person should check first.
  const reviewable = [
    ...domains.map((x) => ({ t: 'Domain', x, v: x.description })),
    ...entities.map((x) => ({ t: 'Entity', x, v: x.description })),
    ...activities.map((x) => ({ t: 'Activity', x, v: x.description })),
    ...executionFlows.map((x) => ({ t: 'Execution flow', x, v: x.description })),
    ...capabilities.map((x) => ({ t: 'Capability', x, v: x.description })),
    ...integrations.map((x) => ({ t: 'Integration', x, v: `${x.counterpart} via ${x.protocol}` })),
  ]
    .filter(
      ({ x }) => x.metadata.confidence.level === 'low' || x.metadata.confidence.level === 'medium',
    )
    .sort((a, b) => (a.x.metadata.confidence.score ?? 0) - (b.x.metadata.confidence.score ?? 0))
    .slice(0, 12);
  const reviewItems = reviewable.map(({ t, x, v }) => ({
    id: `rev-${x.id}`,
    elementType: t,
    elementName: x.name,
    elementId: x.id,
    currentValue: v,
    metadata: x.metadata,
    status: 'pending' as const,
  }));

  const brdRaw = brdOut.brd ?? {};
  const brd = {
    executiveSummary: str(brdRaw.executiveSummary),
    businessContext: str(brdRaw.businessContext),
    objectives: strs(brdRaw.objectives),
    scopeIn: strs(brdRaw.scopeIn),
    scopeOut: strs(brdRaw.scopeOut),
    stakeholders: list(brdRaw.stakeholders).map((s: Any) => ({
      role: str(s.role),
      interest: str(s.interest),
    })),
    businessRules: list(brdRaw.businessRules).map((r: Any, i: number) => ({
      id: str(r.id, `br-${i + 1}`),
      rule: str(r.rule),
      moduleId: modOf(r.moduleId),
      evidence: strs(r.evidence),
    })),
    assumptions: strs(brdRaw.assumptions),
    constraints: strs(brdRaw.constraints),
    risks: list(brdRaw.risks).map((r: Any) => ({
      risk: str(r.risk),
      impact: ['high', 'medium', 'low'].includes(r.impact) ? r.impact : 'medium',
      mitigation: str(r.mitigation),
    })),
    openQuestions: strs(brdRaw.openQuestions),
    glossary: [...list(dom.glossary), ...list(brdRaw.glossary)]
      .map((g: Any) => ({ term: str(g.term), definition: str(g.definition) }))
      .filter(
        (g, i, all) =>
          g.term && all.findIndex((o) => o.term.toLowerCase() === g.term.toLowerCase()) === i,
      )
      .sort((a, b) => a.term.localeCompare(b.term)),
  };

  const modules = MODULES.map((mod) => {
    const raw = list(dom.modules).find((x: Any) => x.id === mod.id) ?? {};
    return {
      id: mod.id,
      name: mod.name,
      coverage: (['full', 'partial', 'none'].includes(raw.coverage) ? raw.coverage : 'partial') as
        'full' | 'partial' | 'none',
      summary: str(raw.summary, mod.hint),
    };
  });

  const allElements = [
    ...domains,
    ...entities,
    ...relationships,
    ...activities,
    ...reports,
    ...executionFlows,
    ...personas,
    ...journeys,
    ...capabilities,
    ...epics,
    ...contextNodes,
    ...containerNodes,
    ...integrations,
    ...deploymentNodes,
    ...nonFunctionalRequirements,
  ];
  const storyCount = epics.reduce(
    (n, e) => n + e.features.reduce((k, f) => k + f.stories.length, 0),
    0,
  );
  const sys = inv.system ?? {};

  const report: ReverseEngineeringReport = {
    id: args.id,
    run: { ...run, warnings },
    systemSummary: {
      id: args.id,
      name: str(sys.name, args.id),
      description: str(sys.description, str(brd.executiveSummary).slice(0, 300)),
      tags: strs(sys.tags),
      lastAnalyzedAt: run.finishedAt,
      coverageScore:
        Math.round((modules.filter((x) => x.coverage !== 'none').length / modules.length) * 100) /
        100,
      totalElements: allElements.length + storyCount,
      pendingReviewCount: reviewItems.length,
      driftAlertCount: 0,
    },
    modules,
    brd,
    ...(args.inputBrd ? { inputBrd: args.inputBrd } : {}),
    // Traceability only means something against the initial BRD it was produced from.
    traceability: args.inputBrd
      ? list(brdOut.inputTraceability).map((t: Any, i: number) => ({
          id: str(t.id, `IN-${String(i + 1).padStart(2, '0')}`),
          requirement: str(t.requirement),
          moduleId: modOf(t.moduleId),
          status: (['confirmed', 'partial', 'not-implemented', 'contradicted'].includes(t.status)
            ? t.status
            : 'partial') as ReTraceStatus,
          finding: str(t.finding),
          evidence: strs(t.evidence),
          relatedIds: strs(t.relatedIds),
        }))
      : [],
    domains,
    entities,
    relationships,
    activities,
    executionFlows,
    personas,
    journeys,
    reports,
    capabilities,
    epics,
    contextNodes,
    contextEdges,
    containerNodes,
    containerEdges,
    integrations,
    deploymentNodes,
    nonFunctionalRequirements,
    gapItems,
    reviewItems,
    driftAlerts: [],
    driftHistory: [],
  } as ReverseEngineeringReport;
  return report;
}

// ------------------------------------------------------------ knowledge graph

export interface KgNode {
  id: string;
  kind: string;
  label: string;
  module?: string;
  confidence?: string;
  props: Record<string, string>;
}
export interface KgEdge {
  source: string;
  target: string;
  type: string;
}

export function buildKnowledgeGraph(r: ReverseEngineeringReport): {
  nodes: KgNode[];
  edges: KgEdge[];
} {
  const nodes: KgNode[] = [];
  const edges: KgEdge[] = [];
  const ids = new Set<string>();
  const add = (n: KgNode) => {
    if (!ids.has(n.id)) {
      ids.add(n.id);
      nodes.push(n);
    }
  };
  const link = (source: string, target: string, type: string) => {
    if (source && target) edges.push({ source, target, type });
  };
  const entityByName = new Map(r.entities.map((e) => [e.name, e.id]));

  add({
    id: r.id,
    kind: 'System',
    label: r.systemSummary.name,
    props: { description: r.systemSummary.description },
  });
  for (const m of r.modules) {
    add({
      id: m.id,
      kind: 'Module',
      label: m.name,
      props: { coverage: m.coverage, summary: m.summary },
    });
    link(r.id, m.id, 'HAS_MODULE');
  }
  for (const d of r.domains) {
    add({
      id: d.id,
      kind: 'Domain',
      label: d.name,
      confidence: d.metadata.confidence.level,
      props: { description: d.description },
    });
    d.moduleIds.forEach((mid) => link(mid, d.id, 'COVERS_DOMAIN'));
    for (const a of d.aggregates) {
      add({
        id: a.id,
        kind: 'Aggregate',
        label: a.name,
        confidence: a.metadata.confidence.level,
        props: {},
      });
      link(d.id, a.id, 'HAS_AGGREGATE');
      a.entities.forEach((en) => link(a.id, entityByName.get(en) ?? '', 'CONTAINS'));
    }
  }
  for (const e of r.entities) {
    add({
      id: e.id,
      kind: 'Entity',
      label: e.name,
      confidence: e.metadata.confidence.level,
      props: { storage: e.storage, attributes: e.attributes.map((a) => a.name).join(', ') },
    });
    link(e.domainId, e.id, 'OWNS_ENTITY');
  }
  for (const rel of r.relationships)
    link(rel.fromEntityId, rel.toEntityId, `RELATES_${rel.cardinality.replace(':', '_')}`);
  for (const a of r.activities) {
    add({
      id: a.id,
      kind: 'Activity',
      label: a.name,
      module: a.moduleId,
      confidence: a.metadata.confidence.level,
      props: { actor: a.actor, endpoint: a.endpoint ?? '' },
    });
    link(a.moduleId, a.id, 'HAS_ACTIVITY');
    link(a.domainId, a.id, 'PERFORMS');
    if (a.service) link(a.id, a.service, 'EXECUTED_BY');
  }
  for (const f of r.executionFlows) {
    add({
      id: f.id,
      kind: 'Flow',
      label: f.name,
      module: f.moduleId,
      confidence: f.metadata.confidence.level,
      props: { actor: f.actor },
    });
    link(f.moduleId, f.id, 'HAS_FLOW');
    f.steps.forEach((s) => {
      if (s.activityId) link(f.id, s.activityId, 'STEP');
      s.writesEntities.forEach((en) => link(f.id, entityByName.get(en) ?? '', 'WRITES'));
      s.readsEntities.forEach((en) => link(f.id, entityByName.get(en) ?? '', 'READS'));
    });
  }
  for (const p of r.personas) {
    add({
      id: p.id,
      kind: 'Persona',
      label: p.name,
      confidence: p.metadata.confidence.level,
      props: { role: p.role },
    });
  }
  for (const j of r.journeys) {
    add({
      id: j.id,
      kind: 'Journey',
      label: j.name,
      module: j.moduleId,
      confidence: j.metadata.confidence.level,
      props: {},
    });
    link(j.personaId, j.id, 'UNDERTAKES');
    j.flowIds.forEach((fid) => link(j.id, fid, 'REALISED_BY'));
  }
  for (const rep of r.reports) {
    add({
      id: rep.id,
      kind: 'Report',
      label: rep.name,
      module: rep.moduleId,
      confidence: rep.metadata.confidence.level,
      props: { implemented: String(rep.implemented) },
    });
    link(rep.moduleId, rep.id, 'HAS_REPORT');
    rep.sourceEntityIds.forEach((eid) => link(rep.id, eid, 'READS'));
  }
  for (const c of r.capabilities) {
    add({
      id: c.id,
      kind: 'Capability',
      label: c.name,
      module: c.moduleId,
      confidence: c.metadata.confidence.level,
      props: { status: c.status },
    });
    link(c.moduleId, c.id, 'HAS_CAPABILITY');
    c.activityIds.forEach((aid) => link(c.id, aid, 'REALISED_BY'));
  }
  for (const e of r.epics) {
    add({
      id: e.id,
      kind: 'Epic',
      label: e.name,
      module: e.moduleId,
      confidence: e.metadata.confidence.level,
      props: {},
    });
    e.capabilityIds.forEach((cid) => link(cid, e.id, 'DELIVERED_BY'));
    link(e.moduleId, e.id, 'HAS_EPIC');
    for (const f of e.features) {
      add({
        id: f.id,
        kind: 'Feature',
        label: f.name,
        confidence: f.metadata.confidence.level,
        props: {},
      });
      link(e.id, f.id, 'HAS_FEATURE');
      for (const s of f.stories) {
        add({
          id: s.id,
          kind: 'Story',
          label: s.title,
          confidence: s.metadata.confidence.level,
          props: { priority: s.priority, story: s.description },
        });
        link(f.id, s.id, 'HAS_STORY');
      }
    }
  }
  for (const c of r.containerNodes) {
    add({
      id: c.id,
      kind: 'Container',
      label: c.name,
      confidence: c.metadata.confidence.level,
      props: { technology: c.technology ?? '' },
    });
    link(r.id, c.id, 'CONTAINS');
  }
  for (const e of r.containerEdges) link(e.source, e.target, 'CALLS');
  for (const i of r.integrations) {
    add({
      id: i.id,
      kind: 'Integration',
      label: i.name,
      confidence: i.metadata.confidence.level,
      props: { protocol: i.protocol, counterpart: i.counterpart },
    });
    link(r.id, i.id, 'INTEGRATES_WITH');
  }
  return { nodes, edges: edges.filter((e) => ids.has(e.source) && ids.has(e.target)) };
}

export function toCypher(g: { nodes: KgNode[]; edges: KgEdge[] }, systemId: string): string {
  const q = (s: string) => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  const lines = [
    '// Phoenix reverse-engineering knowledge graph. Load with cypher-shell or paste into Neo4j Browser.',
    `// Nodes are keyed on (id, systemId), matching graph-persistence's tenancy model.`,
  ];
  for (const n of g.nodes) {
    const props = Object.entries({
      label: n.label,
      module: n.module ?? '',
      confidence: n.confidence ?? '',
      ...n.props,
    })
      .filter(([, v]) => v !== '')
      .map(([k, v]) => `n.${k} = ${q(v)}`)
      .join(', ');
    lines.push(`MERGE (n:${n.kind} {id: ${q(n.id)}, systemId: ${q(systemId)}}) SET ${props};`);
  }
  for (const e of g.edges) {
    lines.push(
      `MATCH (a {id: ${q(e.source)}, systemId: ${q(systemId)}}), (b {id: ${q(e.target)}, systemId: ${q(systemId)}}) MERGE (a)-[:${e.type}]->(b);`,
    );
  }
  return lines.join('\n') + '\n';
}
