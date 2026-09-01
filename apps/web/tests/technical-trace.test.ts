import { describe, expect, it } from 'vitest';
import { mockProvider } from '../src/data/mock/mockProvider.js';
import {
  buildCorrelationGraph,
  getRelated,
  nodeKey,
  type CorrelationBundle,
} from '../src/lib/correlation.js';
import { physicalModelProvenance, technicalEvidenceServices } from '../src/lib/technical-trace.js';

async function loadAuroraGraph() {
  const [
    personas,
    journeys,
    flows,
    domains,
    capabilities,
    architecture,
    deployment,
    integrations,
    reviewItems,
  ] = await Promise.all([
    mockProvider.getPersonas(),
    mockProvider.getJourneys(),
    mockProvider.getExecutionFlows(),
    mockProvider.getDomains(),
    mockProvider.getBusinessCapabilities(),
    mockProvider.getArchitecture('container'),
    mockProvider.getDeploymentTopology(),
    mockProvider.getIntegrations(),
    mockProvider.getReviewItems(),
  ]);
  const bundle: CorrelationBundle = {
    personas,
    journeys,
    flows,
    domains,
    capabilities,
    containers: architecture.nodes,
    deploymentNodes: deployment,
    integrations,
    reviewItems,
  };
  return buildCorrelationGraph(bundle);
}

describe('technicalEvidenceServices (PC-HR-02) — real Service correlation, never fabricated', () => {
  it('surfaces the real Service(s) technically realising a selected Entity, each with its own real provenance', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('entity', 'Order'))!;
    const services = technicalEvidenceServices(related.center, related.groups);
    expect(services.length).toBeGreaterThan(0);
    for (const service of services) {
      expect(service.kind).toBe('service');
      // Every real service in this fixture carries its own metadata.
      expect(service.metadata).toBeDefined();
    }
  });

  it('surfaces the real Service(s) technically realising a selected Journey', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('journey', 'journey-browse-to-purchase'))!;
    const services = technicalEvidenceServices(related.center, related.groups);
    expect(services.map((s) => s.label)).toEqual(
      expect.arrayContaining([
        'Checkout Service',
        'Order Orchestrator',
        'Payments Gateway Adapter',
      ]),
    );
  });

  it('is empty for a Service itself — nothing to chain to below itself', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('service', 'ctr-payments'))!;
    expect(technicalEvidenceServices(related.center, related.groups)).toEqual([]);
  });

  it('is empty (never fabricated) for a genuinely isolated object with no real service correlation', () => {
    const isolatedGraph = buildCorrelationGraph({
      personas: [
        {
          id: 'persona-isolated',
          name: 'Isolated Persona',
          role: 'Nobody experiences this persona in any journey',
          goals: [],
          painPoints: [],
          metadata: { provenance: [], confidence: { level: 'low' } },
        },
      ],
      journeys: [],
      flows: [],
      domains: [],
      capabilities: [],
      containers: [],
      deploymentNodes: [],
      integrations: [],
    });
    const related = getRelated(isolatedGraph, nodeKey('persona', 'persona-isolated'))!;
    expect(technicalEvidenceServices(related.center, related.groups)).toEqual([]);
  });
});

describe('physicalModelProvenance (PC-HR-02) — real data-model provenance, honest omission otherwise', () => {
  it('finds the real data-model source for a Concept genuinely derived from a schema file', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('concept', 'agg-order'))!;
    const provenance = physicalModelProvenance(related.center, related.groups);
    expect(provenance.length).toBeGreaterThan(0);
    expect(provenance.every((p) => p.sourceType === 'data-model')).toBe(true);
    expect(provenance.some((p) => p.sourceId === 'data-model://aurora-schema.sql')).toBe(true);
  });

  it('resolves the same real data-model source for an Entity via its owning Concept', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('entity', 'Order'))!;
    const provenance = physicalModelProvenance(related.center, related.groups);
    expect(provenance.some((p) => p.sourceId === 'data-model://aurora-schema.sql')).toBe(true);
  });

  it('is genuinely empty for a Concept only ever cited from a wiki page, never a schema file — no fabricated physical mapping', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('concept', 'agg-loyalty'))!;
    expect(physicalModelProvenance(related.center, related.groups)).toEqual([]);
  });
});
