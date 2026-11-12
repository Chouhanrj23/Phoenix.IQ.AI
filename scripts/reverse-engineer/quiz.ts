// Expert questionnaires from a finished reverse-engineering run.
//
//   node scripts/reverse-engineer/quiz.ts --project <slug> [--rules-only]
//
// Reads the final BRD dataset (apps/web/src/reverse-engineering/reports/<id>.json)
// and its knowledge graph (docs/reverse-engineering/<id>/knowledge-graph.json),
// asks the model for three levels of questions per module for domain experts, and
// writes apps/web/src/reverse-engineering/quizzes/<id>.json for the Modules page.
//
// The questions are not a test: there are no right or wrong answers. They target
// what the BRD leaves uncertain (rules to confirm, exceptions, gaps, contradicted
// requirements, open questions), experts answer in their own words, and the dev
// server saves each answer as a training record for the model.
//
// Questions are never random: each one cites the BRD / graph ids it is about, and
// ids the evidence does not contain are rejected. When no model is configured (or
// it fails for a module) the levels are filled with questions built directly from
// BRD facts.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLlmClient, setLlmLogger, type LlmClient } from './llm.ts';
import { StatusFile } from './status.ts';
import type { ReverseEngineeringReport } from '../../apps/web/src/reverse-engineering/types.ts';
import {
  QUIZ_LEVEL_IDS,
  type GeneratedQuestion,
  type ModuleQuizData,
  type ProjectQuiz,
  type QuestionIntent,
  type QuizLevelId,
  type QuizSource,
} from '../../apps/web/src/reverse-engineering/quiz-types.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PER_LEVEL = 4;
const INTENTS = new Set<QuestionIntent>([
  'confirm',
  'explain',
  'edge-cases',
  'fill-gap',
  'resolve',
]);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const project = arg('project') ?? '';
if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(project))
  throw new Error(`--project must be a lowercase slug, got "${project}"`);
const rulesOnly = process.argv.includes('--rules-only');

const reportPath = join(
  ROOT,
  'apps',
  'web',
  'src',
  'reverse-engineering',
  'reports',
  `${project}.json`,
);
const graphPath = join(ROOT, 'docs', 'reverse-engineering', project, 'knowledge-graph.json');
const quizOut = join(
  ROOT,
  'apps',
  'web',
  'src',
  'reverse-engineering',
  'quizzes',
  `${project}.json`,
);
const work = join(ROOT, '.phoenix-workspace', 'reverse-engineering', project);

interface GraphNode {
  id: string;
  kind: string;
  label: string;
}
interface GraphEdge {
  source: string;
  target: string;
  /** Relationship name, e.g. HAS_ACTIVITY (written by assemble.ts buildKnowledgeGraph). */
  type?: string;
}
interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ------------------------------------------------------------ evidence

interface ModuleEvidence {
  moduleId: string;
  moduleName: string;
  /** Compact JSON the model reads. */
  facts: Record<string, unknown>;
  /** Every id the questions may cite, with a readable label. */
  labels: Map<string, string>;
}

/** Provenance is for the graph UI; the model only needs the facts. */
const stripMeta = <T extends object>(o: T): Omit<T, 'metadata'> => {
  const { metadata, ...rest } = o as T & { metadata?: unknown };
  void metadata;
  return rest;
};

/** Words of a module name a gap description must mention, e.g. "Cards" → "card". */
const nameStems = (name: string) =>
  name
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 3 && w !== 'overview')
    .map((w) => w.replace(/s$/, ''));

function moduleEvidence(
  r: ReverseEngineeringReport,
  g: KnowledgeGraph,
  moduleId: string,
): ModuleEvidence {
  const mod = r.modules.find((m) => m.id === moduleId)!;
  const labels = new Map<string, string>([[mod.id, mod.name]]);
  const keep = <T extends { id: string }>(items: T[], label: (x: T) => string): T[] => {
    items.forEach((x) => labels.set(x.id, label(x)));
    return items;
  };

  const activities = keep(
    r.activities.filter((a) => a.moduleId === moduleId),
    (a) => a.name,
  );
  const domainIds = new Set([
    ...activities.map((a) => a.domainId),
    ...r.domains.filter((d) => d.moduleIds.includes(moduleId)).map((d) => d.id),
  ]);
  const domains = keep(
    r.domains.filter((d) => domainIds.has(d.id)),
    (d) => d.name,
  );
  const entities = keep(
    r.entities.filter((e) => domainIds.has(e.domainId)),
    (e) => e.name,
  );
  const entityIds = new Set(entities.map((e) => e.id));
  const relationships = keep(
    r.relationships.filter((x) => entityIds.has(x.fromEntityId) || entityIds.has(x.toEntityId)),
    (x) => `${x.fromEntityId} ${x.label} ${x.toEntityId}`,
  );
  const services = new Set(activities.map((a) => a.service).filter(Boolean));
  const mentions = belongsTo(r, moduleId);

  const facts = {
    module: { id: mod.id, name: mod.name, coverage: mod.coverage, summary: mod.summary },
    domains: domains.map((d) => ({ id: d.id, name: d.name, responsibilities: d.responsibilities })),
    activities: activities.map(stripMeta),
    entities: entities.map((e) => ({
      id: e.id,
      name: e.name,
      description: e.description,
      storage: e.storage,
      attributes: e.attributes.map((a) => `${a.name}: ${a.type}${a.key ? ` (${a.key})` : ''}`),
    })),
    relationships: relationships.map(stripMeta),
    executionFlows: keep(
      r.executionFlows.filter((f) => f.moduleId === moduleId),
      (f) => f.name,
    ).map((f) => ({
      id: f.id,
      name: f.name,
      actor: f.actor,
      steps: f.steps.map((s) => ({ name: s.name, description: s.description, service: s.service })),
    })),
    capabilities: keep(
      r.capabilities.filter((c) => c.moduleId === moduleId),
      (c) => c.name,
    ).map(stripMeta),
    reports: keep(
      r.reports.filter((x) => x.moduleId === moduleId),
      (x) => x.name,
    ).map(stripMeta),
    businessRules: keep(
      r.brd.businessRules.filter((b) => b.moduleId === moduleId),
      (b) => b.rule,
    ),
    traceability: keep(
      r.traceability.filter((t) => t.moduleId === moduleId),
      (t) => t.requirement,
    ),
    personas: keep(
      r.personas.filter((p) => p.moduleIds.includes(moduleId)),
      (p) => p.name,
    ).map(stripMeta),
    journeys: keep(
      r.journeys.filter((j) => j.moduleId === moduleId),
      (j) => j.name,
    ).map(stripMeta),
    epics: keep(
      r.epics.filter((e) => e.moduleId === moduleId),
      (e) => e.name,
    ).map((e) => ({
      id: e.id,
      name: e.name,
      stories: e.features.flatMap((f) => f.stories.map((s) => `As a ${s.asA}, I want ${s.iWant}`)),
    })),
    nonFunctionalRequirements: keep(
      r.nonFunctionalRequirements.filter((n) => n.appliesTo.some((s) => services.has(s))),
      (n) => n.requirement,
    ).map(stripMeta),
    gaps: keep(
      r.gapItems.filter((x) => mentions(`${x.area} ${x.description}`)),
      (x) => x.description,
    ),
    // Points the BRD itself leaves uncertain: the best things to ask an expert about.
    openQuestions: r.brd.openQuestions.filter(mentions),
    assumptions: r.brd.assumptions.filter(mentions),
    risks: r.brd.risks.filter((x) => mentions(x.risk)),
    knowledgeGraph: moduleSubgraph(g, moduleId, labels),
  };
  return { moduleId, moduleName: mod.name, facts, labels };
}

/**
 * The module's node and everything within two hops, as readable triples. The
 * System root is not expanded, or every module would be pulled in through it.
 */
function moduleSubgraph(g: KnowledgeGraph, moduleId: string, labels: Map<string, string>) {
  const byId = new Map(g.nodes.map((n) => [n.id, n]));
  const reached = new Set([moduleId]);
  let frontier = new Set([moduleId]);
  for (let hop = 0; hop < 2; hop++) {
    const next = new Set<string>();
    for (const e of g.edges) {
      const ends: [string, string][] = [
        [e.source, e.target],
        [e.target, e.source],
      ];
      for (const [from, to] of ends) {
        if (frontier.has(from) && !reached.has(to) && byId.get(to)?.kind !== 'System') next.add(to);
      }
    }
    next.forEach((id) => reached.add(id));
    frontier = next;
  }
  const triples: string[] = [];
  for (const e of g.edges) {
    if (!reached.has(e.source) || !reached.has(e.target)) continue;
    const s = byId.get(e.source);
    const t = byId.get(e.target);
    if (!s || !t) continue;
    labels.set(s.id, labels.get(s.id) ?? s.label);
    labels.set(t.id, labels.get(t.id) ?? t.label);
    triples.push(
      `${s.kind} ${s.id} "${s.label}" —${e.type ?? 'RELATED_TO'}→ ${t.kind} ${t.id} "${t.label}"`,
    );
  }
  return triples.slice(0, 120);
}

/**
 * Whether a free-text BRD item (gap, open question, risk) belongs to a module:
 * it names the module (e.g. "card" for Cards). Items no module names are
 * cross-cutting and go to Overview, whose name gives nothing to match.
 */
function belongsTo(r: ReverseEngineeringReport, moduleId: string): (text: string) => boolean {
  const mod = r.modules.find((m) => m.id === moduleId)!;
  const stems = nameStems(mod.name);
  const allStems = r.modules.flatMap((m) => nameStems(m.name));
  const has = (text: string, list: string[]) => list.some((s) => text.toLowerCase().includes(s));
  return stems.length ? (text) => has(text, stems) : (text) => !has(text, allStems);
}

// ------------------------------------------------------------ questions from BRD facts

interface Draft {
  prompt: string;
  context: string;
  intent: QuestionIntent;
  sourceIds: string[];
  origin: 'llm' | 'brd-rules';
}

const draft = (
  prompt: string,
  context: string,
  intent: QuestionIntent,
  sourceIds: string[],
): Draft => ({ prompt, context, intent, sourceIds, origin: 'brd-rules' });

const TRACE_FINDING: Record<string, string> = {
  partial: 'only partly implemented',
  'not-implemented': 'not implemented',
  contradicted: 'contradicted by the implementation',
};

/** Expert questions built straight from BRD facts: used when no model is available and to top up thin levels. */
function ruleQuestions(
  r: ReverseEngineeringReport,
  moduleId: string,
): Record<QuizLevelId, Draft[]> {
  const mod = r.modules.find((m) => m.id === moduleId)!;
  const mine = belongsTo(r, moduleId);
  const acts = r.activities.filter((a) => a.moduleId === moduleId);
  const caps = r.capabilities.filter((c) => c.moduleId === moduleId);
  const rules = r.brd.businessRules.filter((b) => b.moduleId === moduleId);
  const traces = r.traceability.filter((t) => t.moduleId === moduleId && t.status !== 'confirmed');
  const flows = r.executionFlows.filter((f) => f.moduleId === moduleId);
  const personas = r.personas.filter((p) => p.moduleIds.includes(moduleId));
  const domainIds = new Set(acts.map((a) => a.domainId));
  const entities = r.entities.filter((e) => domainIds.has(e.domainId));
  const services = new Set(acts.map((a) => a.service).filter(Boolean));
  const nfrs = r.nonFunctionalRequirements.filter((n) => n.appliesTo.some((s) => services.has(s)));
  const gaps = r.gapItems.filter((x) => mine(`${x.area} ${x.description}`));
  const openQuestions = r.brd.openQuestions.filter(mine);
  const risks = r.brd.risks.filter((x) => mine(x.risk));

  const introductory: Draft[][] = [
    [
      draft(
        `Is this an accurate and complete description of what ${mod.name} does in your organisation? What is missing or wrong?`,
        `Summary: "${mod.summary}" (coverage found in the system: ${mod.coverage}).`,
        'confirm',
        [mod.id],
      ),
    ],
    personas.map((p) =>
      draft(
        `How does a ${p.role.toLowerCase()} use ${mod.name} day to day, and what matters most to them?`,
        `Persona ${p.name} (${p.role}). Goals: ${p.goals.join('; ')}.`,
        'explain',
        [p.id],
      ),
    ),
    caps.map((c) =>
      draft(
        `Who relies on "${c.name}", and which business outcome does it support?`,
        `Capability (${c.status}): ${c.description}.`,
        'explain',
        [c.id],
      ),
    ),
    entities.map((e) =>
      draft(
        `What does a ${e.name} record represent in the business, and who is responsible for keeping it correct?`,
        `Entity: ${e.description}. Stored in ${e.storage}.`,
        'explain',
        [e.id],
      ),
    ),
  ];

  const intermediate: Draft[][] = [
    rules.map((b) =>
      draft(
        'Is this rule correct as written? What exceptions, limits or approvals apply in practice?',
        `Business rule: "${b.rule}".`,
        'confirm',
        [b.id],
      ),
    ),
    acts.map((a) =>
      draft(
        `When "${a.name}" runs, what should happen if the input is invalid or a step fails?`,
        `Activity: ${a.description}. Trigger: ${a.trigger}. Inputs: ${a.inputs.join(', ')}. Outputs: ${a.outputs.join(', ')}.`,
        'edge-cases',
        [a.id],
      ),
    ),
    // Capabilities with no code behind them have no rules or flows yet; ask how they should work.
    caps
      .filter((c) => c.status !== 'implemented')
      .map((c) =>
        draft(
          `How should "${c.name}" work step by step: who starts it, what is checked, and what is the outcome?`,
          `Capability (${c.status}): ${c.description}.`,
          'fill-gap',
          [c.id],
        ),
      ),
    flows.map((f) =>
      draft(
        `Which alternative or exception paths are missing from "${f.name}"?`,
        `Flow: ${f.steps.map((s) => s.name).join(' → ')}.`,
        'edge-cases',
        [f.id],
      ),
    ),
  ];

  const indepth: Draft[][] = [
    traces.map((t) =>
      draft(
        `Requirement ${t.id} was found ${TRACE_FINDING[t.status] ?? t.status}. What is the intended behaviour, and should the requirement or the system change?`,
        `Requirement: "${t.requirement}". Finding: ${t.finding}`,
        'resolve',
        [t.id, ...t.relatedIds],
      ),
    ),
    gaps.map((x) =>
      draft(
        `What are the actual requirements here? Please cover: ${x.missingInputs.join('; ')}.`,
        `Gap (${x.severity}): ${x.description}. Suggested action: ${x.suggestedAction}.`,
        'fill-gap',
        [x.id],
      ),
    ),
    caps
      .filter((c) => c.status !== 'implemented')
      .map((c) =>
        draft(
          `"${c.name}" is ${c.status === 'gap' ? 'not built' : 'only partly built'}. What must it do to be complete, and how important is it?`,
          `Capability: ${c.description}.`,
          'fill-gap',
          [c.id],
        ),
      ),
    openQuestions.map((q) =>
      draft(q, `An open question the BRD leaves unanswered for ${mod.name}.`, 'resolve', [mod.id]),
    ),
    risks.map((x) =>
      draft(
        'How should this risk be handled in practice, and who owns it?',
        `Risk (${x.impact} impact): ${x.risk}. Proposed mitigation: ${x.mitigation}.`,
        'resolve',
        [mod.id],
      ),
    ),
    nfrs.map((n) =>
      draft(
        `Is this ${n.category} target right for production, and how should it be measured?`,
        `Requirement for ${n.target}: "${n.requirement}".`,
        'confirm',
        [n.id],
      ),
    ),
  ];

  // One question of each kind in turn, so a level mixes topics instead of repeating one template.
  const mix = (groups: Draft[][]) => {
    const out: Draft[] = [];
    for (let i = 0; groups.some((g) => i < g.length); i++)
      groups.forEach((g) => g[i] && out.push(g[i]));
    return out;
  };
  return {
    introductory: mix(introductory),
    intermediate: mix(intermediate),
    indepth: mix(indepth),
  };
}

// ------------------------------------------------------------ model

const SYSTEM = `You write questions for domain experts about one module of a reverse-engineered banking system.
This is NOT a test. There are no right or wrong answers. The experts answer in their own words, and their answers are used as training data so the model learns what the documents and code could not tell it.

Base every question ONLY on the evidence JSON (the final BRD dataset and its knowledge graph). Ask about what it leaves uncertain or incomplete; never ask the expert to recall something the BRD already states plainly, and never invent names, rules or numbers.

Return JSON: {"introductory":[Q,...],"intermediate":[Q,...],"indepth":[Q,...]}
where Q = {"prompt": string, "context": string, "intent": "confirm"|"explain"|"edge-cases"|"fill-gap"|"resolve", "sourceIds": [ids]}.

Levels:
- introductory: the business view — confirm what the module is for, who uses it and why, what its capabilities and records mean to the business.
- intermediate: how it should work — whether business rules are right and their exceptions, limits and approvals; what happens when inputs are invalid or steps fail; missing alternative paths in flows.
- indepth: what is unresolved — requirements found partial, not implemented or contradicted; gaps and their missing inputs; capabilities not built; BRD open questions and risks; whether non-functional targets are right for production; dependencies on other modules shown in the graph.

Rules:
- Up to ${PER_LEVEL} questions per level. If the evidence cannot support ${PER_LEVEL} distinct questions for a level, return fewer. Never pad.
- Open questions that need a sentence or more to answer. No yes/no-only questions, no multiple choice.
- "context" quotes or summarises exactly what the BRD says on the point, so the expert can see what they are confirming or correcting.
- "sourceIds" lists the evidence ids (e.g. "act-user-login", "br-auth-session", "IN-01", "gap-kyc-aml") the question is about. Use only ids that appear in the evidence.
- Every question covers a different point.`;

function validate(raw: unknown, labels: Map<string, string>): Record<QuizLevelId, Draft[]> {
  const out: Record<QuizLevelId, Draft[]> = { introductory: [], intermediate: [], indepth: [] };
  if (!raw || typeof raw !== 'object') return out;
  for (const level of QUIZ_LEVEL_IDS) {
    const list = (raw as Record<string, unknown>)[level];
    if (!Array.isArray(list)) continue;
    for (const item of list as Record<string, unknown>[]) {
      const sourceIds = (Array.isArray(item.sourceIds) ? item.sourceIds : [])
        .map(String)
        .filter((id) => labels.has(id));
      const intent = String(item.intent) as QuestionIntent;
      if (typeof item.prompt !== 'string' || !item.prompt.trim() || sourceIds.length === 0)
        continue;
      out[level].push({
        prompt: item.prompt.trim(),
        context: String(item.context ?? '').trim(),
        intent: INTENTS.has(intent) ? intent : 'explain',
        sourceIds,
        origin: 'llm',
      });
    }
  }
  return out;
}

async function askModel(llm: LlmClient, ev: ModuleEvidence): Promise<Record<QuizLevelId, Draft[]>> {
  const raw = await llm.generateJson({
    system: SYSTEM,
    prompt: `Module: ${ev.moduleName} (${ev.moduleId})\n\nEvidence:\n${JSON.stringify(ev.facts, null, 1)}`,
  });
  return validate(raw, ev.labels);
}

// ------------------------------------------------------------ run

function finalise(
  moduleId: string,
  level: QuizLevelId,
  drafts: Draft[],
  labels: Map<string, string>,
): GeneratedQuestion[] {
  const seen = new Set<string>();
  return drafts
    .filter((d) => {
      // The same template is asked about different facts, so the context is part of the key.
      const k = `${d.prompt}|${d.context}`.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, PER_LEVEL)
    .map((d, i) => ({
      id: `${moduleId}-${level}-${i + 1}`,
      prompt: d.prompt,
      context: d.context,
      intent: d.intent,
      sources: d.sourceIds.map((id): QuizSource => ({ id, label: labels.get(id) ?? id })),
      origin: d.origin,
    }));
}

async function main(): Promise<void> {
  const status = new StatusFile(join(work, 'quiz-status.json'), project, 2);
  try {
    if (!existsSync(reportPath))
      throw new Error('No BRD for this project yet. Generate the BRD first, then the questions.');
    const reportText = readFileSync(reportPath, 'utf8');
    const graphText = existsSync(graphPath)
      ? readFileSync(graphPath, 'utf8')
      : '{"nodes":[],"edges":[]}';
    const report = JSON.parse(reportText) as ReverseEngineeringReport;
    const graph = JSON.parse(graphText) as KnowledgeGraph;
    const sourceHash = createHash('sha256')
      .update(reportText)
      .update(graphText)
      .digest('hex')
      .slice(0, 16);

    status.step(1, 'Connecting to the model');
    setLlmLogger((msg) => status.log(msg));
    let llm: LlmClient | null = null;
    if (!rulesOnly) {
      try {
        llm = await createLlmClient(process.env);
      } catch (err) {
        status.log(`Model not available: ${(err as Error).message}`);
      }
    }
    status.log(
      llm
        ? `Using ${llm.provider} (${llm.model}).`
        : 'No model configured: building questions directly from BRD facts.',
    );

    status.step(2, 'Writing expert questions for each module');
    const modules: ModuleQuizData[] = [];
    for (const mod of report.modules) {
      const ev = moduleEvidence(report, graph, mod.id);
      let fromModel: Record<QuizLevelId, Draft[]> = {
        introductory: [],
        intermediate: [],
        indepth: [],
      };
      if (llm) {
        try {
          fromModel = await askModel(llm, ev);
        } catch (err) {
          status.log(`${mod.name}: model failed (${(err as Error).message}); using BRD facts.`);
        }
      }
      const fromRules = ruleQuestions(report, mod.id);
      const levels = Object.fromEntries(
        QUIZ_LEVEL_IDS.map((level) => [
          level,
          finalise(mod.id, level, [...fromModel[level], ...fromRules[level]], ev.labels),
        ]),
      ) as Record<QuizLevelId, GeneratedQuestion[]>;
      const origins = new Set(QUIZ_LEVEL_IDS.flatMap((l) => levels[l].map((q) => q.origin)));
      const mode = origins.size > 1 ? 'mixed' : origins.has('llm') ? 'llm' : 'brd-rules';
      modules.push({
        moduleId: mod.id,
        moduleName: mod.name,
        generatedBy: {
          mode,
          provider: llm && mode !== 'brd-rules' ? llm.provider : 'none',
          model: llm && mode !== 'brd-rules' ? llm.model : 'brd-rules',
        },
        levels,
      });
      const counts = QUIZ_LEVEL_IDS.map((l) => levels[l].length).join('/');
      status.log(`${mod.name}: ${counts} questions (${mode}).`);
    }

    const quiz: ProjectQuiz = {
      project,
      sourceHash,
      generatedAt: new Date().toISOString(),
      modules,
    };
    mkdirSync(dirname(quizOut), { recursive: true });
    writeFileSync(quizOut, `${JSON.stringify(quiz, null, 1)}\n`);
    status.done(undefined);
  } catch (err) {
    status.fail((err as Error).message);
    process.exitCode = 1;
  }
}

await main();
