// Registry of reverse-engineering reports produced by `pnpm reverse-engineer`
// (one JSON per analysed system under ./reports). Each report is turned into
// the same bundle shape the demo fixtures use, so every existing page
// (domains, flows, personas, backlog, graph, ...) renders it unchanged.
import { buildFullGraph } from '../data/mock/build-graph.js';
import type { GraphEdge, GraphElementMetadata, GraphNode } from '../data/types.js';
import type { ReverseEngineeringReport } from './types.js';

const files = import.meta.glob<{ default: ReverseEngineeringReport }>('./reports/*.json', {
  eager: true,
});

const REPORTS: Record<string, ReverseEngineeringReport> = Object.fromEntries(
  Object.values(files).map((mod) => [
    mod.default.id,
    // Reports written before traceability existed have no such field.
    { ...mod.default, traceability: mod.default.traceability ?? [] },
  ]),
);

/** Engagement id → report id. Engagements without a report fall back to the demo fixtures. */
// An engagement shows the report generated from its own uploads (Modules page →
// Generate BRD), named after its project slug (see lib/re-inputs.ts).
const ENGAGEMENT_REPORT: Record<string, string> = {
  fintech: 'indian-banking-system',
  aurora: 'aurora-commerce',
};

export function getReport(engagementId: string): ReverseEngineeringReport | null {
  const reportId = ENGAGEMENT_REPORT[engagementId];
  return (reportId && REPORTS[reportId]) || null;
}

export function hasReport(engagementId: string): boolean {
  return getReport(engagementId) !== null;
}

export function storyCount(r: ReverseEngineeringReport): number {
  return r.epics.reduce((n, e) => n + e.features.reduce((k, f) => k + f.stories.length, 0), 0);
}

// ------------------------------------------------------------ graph extras

function extraNode(
  id: string,
  label: string,
  kind: string,
  metadata: GraphElementMetadata,
  summary: string,
  attributes: { label: string; value: string }[],
  sections: { label: string; items: string[] }[],
  route: string,
  routeLabel: string,
): GraphNode {
  return {
    id,
    label,
    kind,
    confidenceLevel: metadata.confidence.level,
    detail: { summary, attributes, sections, metadata, route, routeLabel, crossRefs: [] },
  };
}

/**
 * The fixture graph builder covers C4, domains, flows, personas, journeys and
 * the backlog. The reverse-engineering run adds modules, entities, activities,
 * reports and capabilities; they are appended here and linked into the
 * existing nodes so the explorer shows one connected graph.
 */
function fullGraph(r: ReverseEngineeringReport): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const base = buildFullGraph({
    systemSourceUri: r.run.sourceRepo,
    systemSummary: r.systemSummary,
    containerNodes: r.containerNodes,
    containerEdges: r.containerEdges,
    domains: r.domains,
    driftAlerts: r.driftAlerts,
    executionFlows: r.executionFlows,
    reviewItems: r.reviewItems,
    personas: r.personas,
    journeys: r.journeys,
    epics: r.epics,
    deploymentNodes: r.deploymentNodes,
    nonFunctionalRequirements: r.nonFunctionalRequirements,
    integrations: r.integrations,
    gapItems: r.gapItems,
  });
  const nodes = [...base.nodes];
  const edges = [...base.edges];
  const ids = new Set(nodes.map((n) => n.id));
  const add = (n: GraphNode) => {
    if (!ids.has(n.id)) {
      ids.add(n.id);
      nodes.push(n);
    }
  };
  const edgeIds = new Set(edges.map((e) => e.id));
  const link = (source: string, target: string, label: string) => {
    const id = `re-${source}-${target}-${label}`;
    // A flow can perform the same activity in several steps; keep one edge.
    if (ids.has(source) && ids.has(target) && !edgeIds.has(id)) {
      edgeIds.add(id);
      edges.push({ id, source, target, label });
    }
  };
  const systemMeta = r.domains[0]?.metadata ?? r.containerNodes[0]!.metadata;

  for (const m of r.modules) {
    add(
      extraNode(
        m.id,
        m.name,
        'Module',
        systemMeta,
        m.summary,
        [{ label: 'Coverage', value: m.coverage }],
        [],
        '/brd',
        'Requirements (BRD)',
      ),
    );
    link(r.systemSummary.id, m.id, 'has module');
  }
  for (const d of r.domains) d.moduleIds.forEach((mid) => link(mid, d.id, 'covers'));

  for (const e of r.entities) {
    add(
      extraNode(
        e.id,
        e.name,
        'Entity',
        e.metadata,
        e.description,
        [
          { label: 'Storage', value: e.storage },
          { label: 'Attributes', value: String(e.attributes.length) },
        ],
        [
          {
            label: 'Attributes',
            items: e.attributes.map(
              (a) => `${a.name}: ${a.type}${a.key ? ` (${a.key})` : ''} — ${a.description}`,
            ),
          },
        ],
        '/domains',
        'Domain model',
      ),
    );
    link(e.domainId, e.id, 'owns');
  }
  for (const rel of r.relationships)
    link(rel.fromEntityId, rel.toEntityId, `${rel.label} (${rel.cardinality})`);

  for (const a of r.activities) {
    add(
      extraNode(
        a.id,
        a.name,
        'Activity',
        a.metadata,
        a.description,
        [
          { label: 'Actor', value: a.actor },
          { label: 'Trigger', value: a.trigger },
          { label: 'Endpoint', value: a.endpoint ?? '—' },
        ],
        [
          { label: 'Inputs', items: a.inputs },
          { label: 'Outputs', items: a.outputs },
          { label: 'Business rules', items: a.businessRules },
        ],
        '/brd',
        'Requirements (BRD)',
      ),
    );
    link(a.moduleId, a.id, 'has activity');
    if (a.service) link(a.id, a.service, 'runs on');
  }
  for (const f of r.executionFlows) {
    link(f.moduleId, f.id, 'has flow');
    f.steps.forEach((s) => s.activityId && link(f.id, s.activityId, 'performs'));
  }
  for (const rep of r.reports) {
    add(
      extraNode(
        rep.id,
        rep.name,
        'Report',
        rep.metadata,
        rep.purpose,
        [
          { label: 'Status', value: rep.implemented ? 'Exists today' : 'Required — not built' },
          { label: 'Frequency', value: rep.frequency },
          { label: 'Audience', value: rep.audience.join(', ') },
        ],
        [{ label: 'Fields', items: rep.fields }],
        '/brd',
        'Requirements (BRD)',
      ),
    );
    link(rep.moduleId, rep.id, 'has report');
    rep.sourceEntityIds.forEach((eid) => link(rep.id, eid, 'reads'));
  }
  for (const c of r.capabilities) {
    add(
      extraNode(
        c.id,
        c.name,
        'Capability',
        c.metadata,
        c.description,
        [{ label: 'Status', value: c.status }],
        [],
        '/backlog',
        'Backlog',
      ),
    );
    link(c.moduleId, c.id, 'has capability');
    c.activityIds.forEach((aid) => link(c.id, aid, 'realised by'));
  }
  for (const e of r.epics) {
    link(e.moduleId, e.id, 'has epic');
    e.capabilityIds.forEach((cid) => link(cid, e.id, 'delivered by'));
  }
  return { nodes, edges };
}

/** The report as a demo-fixture-shaped bundle for the mock provider. */
export function reportBundle(r: ReverseEngineeringReport) {
  return {
    systemSummary: r.systemSummary,
    contextNodes: r.contextNodes,
    contextEdges: r.contextEdges,
    containerNodes: r.containerNodes,
    containerEdges: r.containerEdges,
    domains: r.domains,
    executionFlows: r.executionFlows,
    reviewItems: r.reviewItems,
    driftAlerts: r.driftAlerts,
    personas: r.personas,
    journeys: r.journeys,
    capabilities: r.capabilities,
    epics: r.epics,
    deploymentNodes: r.deploymentNodes,
    nonFunctionalRequirements: r.nonFunctionalRequirements,
    integrations: r.integrations,
    gapItems: r.gapItems,
    driftHistory: r.driftHistory,
    fullGraph: fullGraph(r),
  };
}
