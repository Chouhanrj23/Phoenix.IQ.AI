import { describe, expect, it } from 'vitest';
import { mockProvider } from '../src/data/mock/mockProvider.js';
import {
  buildCorrelationGraph,
  getRelated,
  nodeKey,
  type CorrelationBundle,
} from '../src/lib/correlation.js';

async function loadAuroraGraph() {
  const [personas, journeys, flows, domains, capabilities, architecture, deployment, integrations] =
    await Promise.all([
      mockProvider.getPersonas(),
      mockProvider.getJourneys(),
      mockProvider.getExecutionFlows(),
      mockProvider.getDomains(),
      mockProvider.getBusinessCapabilities(),
      mockProvider.getArchitecture('container'),
      mockProvider.getDeploymentTopology(),
      mockProvider.getIntegrations(),
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

function namesOf(
  groups: ReturnType<typeof getRelated> extends infer R
    ? R extends { groups: infer G }
      ? G
      : never
    : never,
  kind: string,
): string[] {
  const g = (groups as { kind: string; nodes: { label: string }[] }[]).find(
    (entry) => entry.kind === kind,
  );
  return g ? g.nodes.map((n) => n.label).sort() : [];
}

describe('buildCorrelationGraph / getRelated (PC-04) — real Aurora fixture data', () => {
  it('selecting a Journey reveals its persona, touched entities, and services at shallow depth', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('journey', 'journey-browse-to-purchase'))!;
    expect(related).toBeDefined();
    expect(related.center.label).toBe('Browse to Purchase');

    expect(namesOf(related.groups, 'persona')).toEqual(['Returning Shopper']);
    expect(namesOf(related.groups, 'entity')).toEqual(
      expect.arrayContaining(['Order', 'Cart', 'Payment', 'CustomerProfile']),
    );
    expect(namesOf(related.groups, 'service')).toEqual(
      expect.arrayContaining([
        'Checkout Service',
        'Order Orchestrator',
        'Payments Gateway Adapter',
      ]),
    );
  });

  it('a Journey transitively reaches Business Concepts and Business Capabilities through its touched entities', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('journey', 'journey-browse-to-purchase'))!;

    // Order/Cart/Payment are real aggregates whose entities this journey's steps touch.
    expect(namesOf(related.groups, 'concept')).toEqual(
      expect.arrayContaining(['Order', 'Cart', 'Payment']),
    );
    // Those aggregates' domains (ordering, catalog, payments) have real PC-01 capabilities.
    expect(namesOf(related.groups, 'capability')).toEqual(
      expect.arrayContaining(['Order Management', 'Catalog Management', 'Payment Management']),
    );
  });

  it('a Journey reaches Technology, Deployment, and Integration only through its matched Services', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('journey', 'journey-browse-to-purchase'))!;

    expect(namesOf(related.groups, 'technology').length).toBeGreaterThan(0);
    expect(namesOf(related.groups, 'deployment').length).toBeGreaterThan(0);
    // Only these 2 integrations share a provenance sourceId with a service this journey touches.
    expect(namesOf(related.groups, 'integration')).toEqual([
      'Email / SMS Provider',
      'Meridian Pay',
    ]);
  });

  it('selecting an Entity reverse-traverses to every real Journey that touches it, and its owning Concept', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('entity', 'Order'))!;
    expect(related).toBeDefined();

    // 3 real Aurora journeys genuinely touch "Order": 2 via flow-checkout, 1 via flow-return.
    expect(namesOf(related.groups, 'journey')).toEqual(
      expect.arrayContaining([
        'Browse to Purchase',
        'Request a Refund',
        'First Purchase & Trust Building',
      ]),
    );
    expect(namesOf(related.groups, 'concept')).toEqual(['Order']);
    expect(namesOf(related.groups, 'capability')).toContain('Order Management');
  });

  it('selecting a Service reverse-traverses to Journeys, and transitively to Technology/Deployment/Integration', async () => {
    const graph = await loadAuroraGraph();
    const related = getRelated(graph, nodeKey('service', 'ctr-payments'))!;
    expect(related).toBeDefined();

    expect(namesOf(related.groups, 'journey')).toEqual(
      expect.arrayContaining(['Browse to Purchase']),
    );
    expect(namesOf(related.groups, 'technology')).toEqual(
      expect.arrayContaining(['Node.js/Express (disputed)']),
    );
    expect(namesOf(related.groups, 'integration')).toEqual(
      expect.arrayContaining(['Meridian Pay']),
    );
  });

  it('a sparsely-connected node (an entity not directly touched by any journey step) still resolves via its concept, without fabricating journey links', async () => {
    const graph = await loadAuroraGraph();
    // "ProductVariant" is a real entity on the Product aggregate, but no flow
    // step reads/writes it directly (only "Product" is) -- it must NOT show
    // any journey relationship, since none genuinely exists.
    const related = getRelated(graph, nodeKey('entity', 'ProductVariant'));
    expect(related).toBeDefined();
    expect(namesOf(related!.groups, 'concept')).toEqual(['Product']);
    expect(namesOf(related!.groups, 'journey')).toEqual([]);
  });

  it('returns undefined for a selection that does not exist in the graph, rather than throwing', async () => {
    const graph = await loadAuroraGraph();
    expect(getRelated(graph, nodeKey('journey', 'does-not-exist'))).toBeUndefined();
  });

  it('never produces an "entity-state" or "api" correlation kind -- no real data source for either exists', async () => {
    const graph = await loadAuroraGraph();
    const kinds = new Set(graph.nodes.map((n) => n.kind));
    expect(kinds.has('entity-state' as never)).toBe(false);
    expect(kinds.has('api' as never)).toBe(false);
  });

  it('a genuinely isolated node (zero real relationships) returns an empty related result, not a broken/undefined one', () => {
    const isolatedBundle: CorrelationBundle = {
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
    };
    const graph = buildCorrelationGraph(isolatedBundle);
    const related = getRelated(graph, nodeKey('persona', 'persona-isolated'));
    expect(related).toBeDefined();
    expect(related!.groups).toEqual([]);
    expect(related!.immediateNeighborKeys.size).toBe(0);
  });
});
