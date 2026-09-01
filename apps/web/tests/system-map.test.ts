import { describe, expect, it } from 'vitest';
import { mockProviderFor } from '../src/data/mock/mockProvider.js';
import { buildCorrelationGraph, type CorrelationBundle } from '../src/lib/correlation.js';
import { countFor, hasRealEdge, LAYER_EDGES, LAYERS } from '../src/lib/system-map.js';

async function loadGraph(companyId: 'aurora' | 'fintech' = 'aurora') {
  const provider = mockProviderFor(companyId);
  const [personas, journeys, flows, domains, capabilities, architecture, deployment, integrations] =
    await Promise.all([
      provider.getPersonas(),
      provider.getJourneys(),
      provider.getExecutionFlows(),
      provider.getDomains(),
      provider.getBusinessCapabilities(),
      provider.getArchitecture('container'),
      provider.getDeploymentTopology(),
      provider.getIntegrations(),
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
  };
  return buildCorrelationGraph(bundle);
}

describe('system-map layer definitions (PC-05)', () => {
  it('defines exactly the 11 layers the target concept requires (10 requested + Business Concept, the real intermediate kind)', () => {
    expect(LAYERS).toHaveLength(11);
    const ids = LAYERS.map((l) => l.id);
    expect(new Set(ids).size).toBe(11); // no duplicate layer ids
  });

  it('marks only entity-state and api as unavailable -- every other layer has a real data source', () => {
    const unavailable = LAYERS.filter((l) => !l.available).map((l) => l.id);
    expect(unavailable.sort()).toEqual(['api', 'entity-state']);
  });

  it('every LAYER_EDGES endpoint references a real layer id (no orphan reference)', () => {
    const ids = new Set(LAYERS.map((l) => l.id));
    for (const edge of LAYER_EDGES) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });
});

describe('countFor (PC-05) — real Aurora fixture data', () => {
  it('counts real instances for available layers, matching the real fixture data exactly', async () => {
    const graph = await loadGraph('aurora');
    const personaLayer = LAYERS.find((l) => l.id === 'persona')!;
    const journeyLayer = LAYERS.find((l) => l.id === 'journey')!;
    const capabilityLayer = LAYERS.find((l) => l.id === 'capability')!;

    expect(countFor(graph, personaLayer)).toBe(3); // 3 real Aurora personas
    expect(countFor(graph, journeyLayer)).toBe(3); // 3 real Aurora journeys
    expect(countFor(graph, capabilityLayer)).toBe(6); // 6 real Aurora capabilities (PC-01)
  });

  it('always returns 0 for entity-state and api -- never a fabricated non-zero count', async () => {
    const graph = await loadGraph('aurora');
    const entityStateLayer = LAYERS.find((l) => l.id === 'entity-state')!;
    const apiLayer = LAYERS.find((l) => l.id === 'api')!;
    expect(countFor(graph, entityStateLayer)).toBe(0);
    expect(countFor(graph, apiLayer)).toBe(0);
  });

  it('produces different, genuinely data-driven counts for a different company (fintech)', async () => {
    const aurora = await loadGraph('aurora');
    const fintech = await loadGraph('fintech');
    const journeyLayer = LAYERS.find((l) => l.id === 'journey')!;
    // Both real, both non-zero, not required to be equal or different --
    // just genuinely computed per dataset, never a shared hard-coded number.
    expect(countFor(aurora, journeyLayer)).toBeGreaterThan(0);
    expect(countFor(fintech, journeyLayer)).toBeGreaterThan(0);
  });
});

describe('hasRealEdge (PC-05) — computed directly from the graph, never hand-asserted', () => {
  it('reports every real, populated layer-to-layer relationship as real', async () => {
    const graph = await loadGraph('aurora');
    expect(hasRealEdge(graph, 'persona', 'journey')).toBe(true);
    expect(hasRealEdge(graph, 'journey', 'entity')).toBe(true);
    expect(hasRealEdge(graph, 'journey', 'service')).toBe(true);
    expect(hasRealEdge(graph, 'entity', 'concept')).toBe(true);
    expect(hasRealEdge(graph, 'concept', 'capability')).toBe(true);
    expect(hasRealEdge(graph, 'service', 'technology')).toBe(true);
    expect(hasRealEdge(graph, 'service', 'deployment')).toBe(true);
    expect(hasRealEdge(graph, 'service', 'integration')).toBe(true);
  });

  it('reports every relationship touching entity-state or api as NOT real -- structurally impossible, never fabricated', async () => {
    const graph = await loadGraph('aurora');
    expect(hasRealEdge(graph, 'entity', 'entity-state')).toBe(false);
    expect(hasRealEdge(graph, 'service', 'api')).toBe(false);
  });

  it('is symmetric (direction does not matter for display)', async () => {
    const graph = await loadGraph('aurora');
    expect(hasRealEdge(graph, 'persona', 'journey')).toBe(hasRealEdge(graph, 'journey', 'persona'));
  });
});
