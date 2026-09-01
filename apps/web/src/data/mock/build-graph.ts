import type {
  C4Edge,
  C4Node,
  Domain,
  DriftAlert,
  Epic,
  ExecutionFlow,
  DeploymentNode,
  GapItem,
  GraphCrossRef,
  GraphEdge,
  GraphNode,
  GraphNodeAttribute,
  GraphNodeDetail,
  GraphNodeSection,
  Integration,
  Journey,
  NonFunctionalRequirement,
  Persona,
  ReviewItem,
  SystemSummary,
} from '../types.js';
import { conf, meta, prov } from './helpers.js';

/**
 * Everything buildFullGraph() needs, sourced from one company's fixtures.
 * Keeping this generic (rather than importing a fixed `./fixtures.js`)
 * lets the same graph-building logic run over any company's mock dataset.
 */
export interface GraphBundle {
  /** Provenance source id for the root "System" node, e.g. 'repo://aurora-commerce'. */
  systemSourceUri: string;
  systemSummary: SystemSummary;
  containerNodes: C4Node[];
  containerEdges: C4Edge[];
  domains: Domain[];
  driftAlerts: DriftAlert[];
  executionFlows: ExecutionFlow[];
  reviewItems: ReviewItem[];
  personas: Persona[];
  journeys: Journey[];
  epics: Epic[];
  deploymentNodes: DeploymentNode[];
  nonFunctionalRequirements: NonFunctionalRequirement[];
  integrations: Integration[];
  gapItems: GapItem[];
}

// ---------------------------------------------------------------------------
// Cross-reference resolution
//
// Every other page in the demo (review queue, gap analysis, drift history,
// NFRs, integrations, deployment) talks about elements *by name*. Rather than
// hand-maintaining a second link table, we resolve those references here so a
// node's dossier always reflects what those pages currently say.
// ---------------------------------------------------------------------------

/**
 * Whole-word containment. Naive substring matching produced false positives
 * ("Product" matching "production", the Payment aggregate matching a review
 * item about the "Payments Gateway Adapter"), so references only resolve on
 * word boundaries.
 */
function mentions(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}

function crossRefsFor(bundle: GraphBundle, label: string, nodeId: string): GraphCrossRef[] {
  const refs: GraphCrossRef[] = [];

  for (const item of bundle.reviewItems) {
    if (!mentions(item.elementName, label)) continue;
    refs.push({
      id: item.id,
      kind: 'review',
      label: `${item.status === 'pending' ? 'Open review' : 'Reviewed'} — ${item.elementName}`,
      detail:
        item.conflict && item.conflict.length > 0
          ? item.conflict.map((c) => `${c.sourceLabel}: ${c.value}`).join('  ·  ')
          : item.currentValue,
      route: '/review',
    });
  }

  for (const alert of bundle.driftAlerts) {
    if (!mentions(alert.elementName, label)) continue;
    refs.push({
      id: alert.id,
      kind: 'drift',
      label: `Drift (${alert.changeType}) — detected ${new Date(alert.detectedAt).toLocaleDateString()}`,
      detail: alert.description,
      route: '/drift',
    });
  }

  for (const gap of bundle.gapItems) {
    if (!mentions(gap.description, label) && !mentions(gap.area, label)) continue;
    refs.push({
      id: gap.id,
      kind: 'gap',
      label: `Gap (${gap.severity}) — ${gap.area}`,
      detail: `${gap.description} Missing: ${gap.missingInputs.join(', ')}.`,
      route: '/gaps',
    });
  }

  for (const nfr of bundle.nonFunctionalRequirements) {
    if (!nfr.appliesTo.some((target) => mentions(target, label) || mentions(label, target)))
      continue;
    refs.push({
      id: nfr.id,
      kind: 'nfr',
      label: `NFR (${nfr.category}) — ${nfr.target}`,
      detail: nfr.requirement,
      route: '/nfrs',
    });
  }

  for (const integration of bundle.integrations) {
    if (!mentions(integration.name, label) && !mentions(label, integration.name)) continue;
    refs.push({
      id: integration.id,
      kind: 'integration',
      label: `Integration (${integration.direction}) — ${integration.protocol}`,
      detail: `${integration.counterpart}. ${integration.dataExchanged}`,
      route: '/integrations',
    });
  }

  for (const instance of bundle.deploymentNodes) {
    if (instance.kind !== 'instance' || instance.containerId !== nodeId) continue;
    const environment = bundle.deploymentNodes.find((n) => n.id === instance.environmentId);
    refs.push({
      id: instance.id,
      kind: 'deployment',
      label: `Deployed to ${environment?.name ?? 'unknown environment'}`,
      detail: [instance.runtime, instance.scale].filter(Boolean).join(' · ') || instance.name,
      route: '/deployment',
    });
  }

  return refs;
}

function detail(
  bundle: GraphBundle,
  args: Omit<GraphNodeDetail, 'crossRefs' | 'attributes' | 'sections'> & {
    attributes?: GraphNodeAttribute[];
    sections?: GraphNodeSection[];
    nodeId: string;
    label: string;
  },
): GraphNodeDetail {
  const { nodeId, label, attributes = [], sections = [], ...rest } = args;
  return {
    ...rest,
    attributes,
    sections: sections.filter((s) => s.items.length > 0),
    crossRefs: crossRefsFor(bundle, label, nodeId),
  };
}

/**
 * Derives one big node/edge list spanning containers, domains, personas,
 * journeys, flows, and the product backlog — for the graph explorer view.
 * Deliberately built from the *same* fixture data every other page reads,
 * rather than a separate hand-authored dataset, so the explorer can never
 * drift out of sync with what the rest of the demo shows.
 *
 * Each node also carries a full dossier (`detail`) so clicking a node in the
 * explorer answers: what is it, what do we know about it, how confident are we
 * and why, which sources it came from, and what still needs human attention.
 *
 * Generic over `GraphBundle` so it can build the explorer graph for any
 * company's mock dataset from the same logic.
 */
export function buildFullGraph(bundle: GraphBundle): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // --- System -------------------------------------------------------------
  nodes.push({
    id: bundle.systemSummary.id,
    label: bundle.systemSummary.name,
    kind: 'System',
    confidenceLevel: 'high',
    detail: detail(bundle, {
      nodeId: bundle.systemSummary.id,
      label: bundle.systemSummary.name,
      summary: bundle.systemSummary.description,
      attributes: [
        { label: 'Tags', value: bundle.systemSummary.tags.join(', ') },
        { label: 'Elements extracted', value: String(bundle.systemSummary.totalElements) },
        { label: 'Coverage', value: `${Math.round(bundle.systemSummary.coverageScore * 100)}%` },
        { label: 'Pending review', value: `${bundle.systemSummary.pendingReviewCount} items` },
        { label: 'Open drift alerts', value: String(bundle.systemSummary.driftAlertCount) },
        {
          label: 'Last analyzed',
          value: new Date(bundle.systemSummary.lastAnalyzedAt).toLocaleString(),
        },
      ],
      metadata: meta(
        [prov(bundle.systemSourceUri, 'source-code', 'orchestration', 2)],
        conf('high', 0.97, 'Root of the graph — asserted by the ingestion run itself.'),
      ),
      route: '/',
      routeLabel: 'Overview',
    }),
  });

  // --- Containers ---------------------------------------------------------
  for (const c of bundle.containerNodes) {
    const talksTo = bundle.containerEdges
      .filter((e) => e.source === c.id)
      .map(
        (e) =>
          `${e.label} → ${bundle.containerNodes.find((n) => n.id === e.target)?.name ?? e.target}`,
      );
    const calledBy = bundle.containerEdges
      .filter((e) => e.target === c.id)
      .map(
        (e) =>
          `${bundle.containerNodes.find((n) => n.id === e.source)?.name ?? e.source} — ${e.label}`,
      );

    nodes.push({
      id: c.id,
      label: c.name,
      kind: 'Container',
      confidenceLevel: c.metadata.confidence.level,
      detail: detail(bundle, {
        nodeId: c.id,
        label: c.name,
        summary: c.description,
        attributes: [
          { label: 'C4 level', value: c.level },
          { label: 'Technology', value: c.technology ?? 'Not determined from any source' },
          { label: 'Part of', value: bundle.systemSummary.name },
        ],
        sections: [
          { label: 'Outbound dependencies', items: talksTo },
          { label: 'Inbound callers', items: calledBy },
        ],
        metadata: c.metadata,
        route: '/architecture',
        routeLabel: 'Architecture (C4)',
      }),
    });
    edges.push({
      id: `sys-${c.id}`,
      source: bundle.systemSummary.id,
      target: c.id,
      label: 'contains',
    });
  }
  for (const e of bundle.containerEdges) {
    edges.push({ id: e.id, source: e.source, target: e.target, label: e.label });
  }

  // --- Domains & aggregates ----------------------------------------------
  for (const d of bundle.domains) {
    nodes.push({
      id: d.id,
      label: d.name,
      kind: 'Domain',
      confidenceLevel: d.metadata.confidence.level,
      detail: detail(bundle, {
        nodeId: d.id,
        label: d.name,
        summary: d.description,
        attributes: [
          { label: 'Aggregates', value: String(d.aggregates.length) },
          {
            label: 'Entities',
            value: String(d.aggregates.reduce((sum, a) => sum + a.entities.length, 0)),
          },
        ],
        sections: [
          {
            label: 'Aggregates in this domain',
            items: d.aggregates.map((a) => `${a.name} (${a.entities.join(', ')})`),
          },
        ],
        metadata: d.metadata,
        route: '/domains',
        routeLabel: 'Domain model',
      }),
    });

    for (const a of d.aggregates) {
      const touchedBy = bundle.executionFlows.flatMap((f) =>
        f.steps
          .filter(
            (s) =>
              s.readsEntities.some((entity) => a.entities.includes(entity)) ||
              s.writesEntities.some((entity) => a.entities.includes(entity)),
          )
          .map((s) => `${f.name} → ${s.name}`),
      );

      nodes.push({
        id: a.id,
        label: a.name,
        kind: 'Aggregate',
        confidenceLevel: a.metadata.confidence.level,
        detail: detail(bundle, {
          nodeId: a.id,
          label: a.name,
          summary: `Aggregate root in the ${d.name} domain, grouping ${a.entities.length} entit${a.entities.length === 1 ? 'y' : 'ies'} that change together under a single consistency boundary.`,
          attributes: [
            { label: 'Domain', value: d.name },
            { label: 'Aggregate root', value: a.name },
            { label: 'Entity count', value: String(a.entities.length) },
          ],
          sections: [
            { label: 'Entities', items: a.entities },
            { label: 'Read/written by', items: [...new Set(touchedBy)] },
          ],
          metadata: a.metadata,
          route: '/domains',
          routeLabel: 'Domain model',
        }),
      });
      edges.push({ id: `${d.id}-${a.id}`, source: d.id, target: a.id, label: 'has' });
    }
  }

  // --- Personas -----------------------------------------------------------
  for (const p of bundle.personas) {
    const theirJourneys = bundle.journeys.filter((j) => j.personaId === p.id);
    nodes.push({
      id: p.id,
      label: p.name,
      kind: 'Persona',
      confidenceLevel: p.metadata.confidence.level,
      detail: detail(bundle, {
        nodeId: p.id,
        label: p.name,
        summary: `${p.role} who interacts with the system across ${theirJourneys.length} mapped journey${theirJourneys.length === 1 ? '' : 's'}.`,
        attributes: [
          { label: 'Role', value: p.role },
          { label: 'Journeys', value: String(theirJourneys.length) },
        ],
        sections: [
          { label: 'Goals', items: p.goals },
          { label: 'Pain points', items: p.painPoints },
          { label: 'Journeys', items: theirJourneys.map((j) => j.name) },
        ],
        metadata: p.metadata,
        route: `/personas?persona=${p.id}`,
        routeLabel: 'Personas & journeys',
      }),
    });
  }

  // --- Journeys -----------------------------------------------------------
  for (const j of bundle.journeys) {
    const persona = bundle.personas.find((p) => p.id === j.personaId);
    const realisedBy = j.flowIds
      .map((id) => bundle.executionFlows.find((f) => f.id === id))
      .filter((f): f is (typeof bundle.executionFlows)[number] => Boolean(f));

    nodes.push({
      id: j.id,
      label: j.name,
      kind: 'Journey',
      confidenceLevel: j.metadata.confidence.level,
      detail: detail(bundle, {
        nodeId: j.id,
        label: j.name,
        summary: j.description,
        attributes: [
          { label: 'Persona', value: persona?.name ?? j.personaId },
          { label: 'Realised by', value: `${realisedBy.length} execution flow(s)` },
          {
            label: 'Entry point',
            value: realisedBy.map((f) => f.triggerScreen).join(', ') || 'Unknown',
          },
        ],
        sections: [
          {
            label: 'Execution flows',
            items: realisedBy.map((f) => `${f.name} — ${f.steps.length} steps`),
          },
          {
            label: 'Persona pain points carried into this journey',
            items: persona?.painPoints ?? [],
          },
        ],
        metadata: j.metadata,
        route: `/personas?persona=${j.personaId}&journey=${j.id}`,
        routeLabel: 'Personas & journeys',
      }),
    });
    edges.push({
      id: `${j.personaId}-${j.id}`,
      source: j.personaId,
      target: j.id,
      label: 'experiences',
    });
    for (const flowId of j.flowIds) {
      const flow = bundle.executionFlows.find((f) => f.id === flowId);
      if (flow) {
        edges.push({ id: `${j.id}-${flowId}`, source: j.id, target: flowId, label: 'realised by' });
      }
    }
  }

  // --- Execution flows ----------------------------------------------------
  for (const f of bundle.executionFlows) {
    const reads = [...new Set(f.steps.flatMap((s) => s.readsEntities))];
    const writes = [...new Set(f.steps.flatMap((s) => s.writesEntities))];
    const weakSteps = f.steps.filter(
      (s) => s.metadata.confidence.level === 'low' || s.metadata.confidence.level === 'medium',
    );

    nodes.push({
      id: f.id,
      label: f.name,
      kind: 'Flow',
      confidenceLevel: f.metadata.confidence.level,
      detail: detail(bundle, {
        nodeId: f.id,
        label: f.name,
        summary: f.description,
        attributes: [
          { label: 'Trigger screen', value: f.triggerScreen },
          { label: 'Steps', value: String(f.steps.length) },
          { label: 'Entities read', value: reads.join(', ') || 'None' },
          { label: 'Entities written', value: writes.join(', ') || 'None' },
          { label: 'Steps needing review', value: String(weakSteps.length) },
        ],
        sections: [
          {
            label: 'Steps',
            items: f.steps.map((s, i) => `${i + 1}. ${s.name} — ${s.description}`),
          },
          {
            label: 'Weakest links',
            items: weakSteps.map(
              (s) =>
                `${s.name}: ${s.metadata.confidence.rationale ?? `${s.metadata.confidence.level} confidence`}`,
            ),
          },
        ],
        metadata: f.metadata,
        route: `/flows?flow=${f.id}`,
        routeLabel: 'Execution flows',
      }),
    });
  }

  // --- Backlog: epics → features → stories --------------------------------
  for (const e of bundle.epics) {
    const storyCount = e.features.reduce((sum, feature) => sum + feature.stories.length, 0);
    nodes.push({
      id: e.id,
      label: e.name,
      kind: 'Epic',
      confidenceLevel: e.metadata.confidence.level,
      detail: detail(bundle, {
        nodeId: e.id,
        label: e.name,
        summary: e.description,
        attributes: [
          { label: 'Features', value: String(e.features.length) },
          { label: 'Stories', value: String(storyCount) },
        ],
        sections: [
          {
            label: 'Features',
            items: e.features.map((feature) => `${feature.name} — ${feature.description}`),
          },
        ],
        metadata: e.metadata,
        route: '/backlog',
        routeLabel: 'Product backlog',
      }),
    });

    for (const feature of e.features) {
      nodes.push({
        id: feature.id,
        label: feature.name,
        kind: 'Feature',
        confidenceLevel: feature.metadata.confidence.level,
        detail: detail(bundle, {
          nodeId: feature.id,
          label: feature.name,
          summary: feature.description,
          attributes: [
            { label: 'Epic', value: e.name },
            { label: 'Stories', value: String(feature.stories.length) },
            {
              label: 'Acceptance criteria',
              value: String(
                feature.stories.reduce((sum, s) => sum + s.acceptanceCriteria.length, 0),
              ),
            },
          ],
          sections: [{ label: 'Stories', items: feature.stories.map((s) => s.title) }],
          metadata: feature.metadata,
          route: '/backlog',
          routeLabel: 'Product backlog',
        }),
      });
      edges.push({
        id: `${e.id}-${feature.id}`,
        source: e.id,
        target: feature.id,
        label: 'contains',
      });

      for (const story of feature.stories) {
        nodes.push({
          id: story.id,
          label: story.title,
          kind: 'Story',
          confidenceLevel: story.metadata.confidence.level,
          detail: detail(bundle, {
            nodeId: story.id,
            label: story.title,
            summary: story.description,
            attributes: [
              { label: 'Epic', value: e.name },
              { label: 'Feature', value: feature.name },
              { label: 'Acceptance criteria', value: String(story.acceptanceCriteria.length) },
            ],
            sections: [
              {
                label: 'Acceptance criteria',
                items: story.acceptanceCriteria.map((ac) => ac.description),
              },
            ],
            metadata: story.metadata,
            route: '/backlog',
            routeLabel: 'Product backlog',
          }),
        });
        edges.push({
          id: `${feature.id}-${story.id}`,
          source: feature.id,
          target: story.id,
          label: 'contains',
        });
      }
    }
  }

  return { nodes, edges };
}
