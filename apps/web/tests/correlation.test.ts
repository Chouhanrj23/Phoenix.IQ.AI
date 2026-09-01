import { describe, expect, it } from 'vitest';
import { mockProvider } from '../src/data/mock/mockProvider.js';
import {
  buildCorrelationGraph,
  getRelated,
  nodeKey,
  reviewMatchesFor,
  reviewStatusFor,
  type CorrelationBundle,
} from '../src/lib/correlation.js';

async function loadAuroraBundle(): Promise<CorrelationBundle> {
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
  return {
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
}

async function loadAuroraGraph() {
  return buildCorrelationGraph(await loadAuroraBundle());
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

  // PC-09: every object's business detail (description, confidence,
  // review status) must come from its own real field -- never invented,
  // never borrowed from an unrelated object.
  describe('description/metadata (PC-09) — reused directly from real Phase 1-5 fields, never composed', () => {
    it('uses the real Journey.description verbatim, and carries its real confidence/provenance', async () => {
      const bundle = await loadAuroraBundle();
      const graph = buildCorrelationGraph(bundle);
      const node = graph.nodesByKey.get(nodeKey('journey', 'journey-browse-to-purchase'))!;
      const journey = bundle.journeys.find((j) => j.id === 'journey-browse-to-purchase')!;
      expect(node.description).toBe(journey.description);
      expect(node.metadata).toBe(journey.metadata);
    });

    it('uses the real C4Node.description verbatim for a Service', async () => {
      const bundle = await loadAuroraBundle();
      const graph = buildCorrelationGraph(bundle);
      const node = graph.nodesByKey.get(nodeKey('service', 'ctr-fraud'))!;
      expect(node.description).toBe('Aggregates signals and calls RiskShield ML for a risk score.');
    });

    it('never invents a description for Persona or Concept -- neither type has a real description field', async () => {
      const bundle = await loadAuroraBundle();
      const graph = buildCorrelationGraph(bundle);
      const persona = graph.nodesByKey.get(nodeKey('persona', 'persona-returning-shopper'));
      const concept = graph.nodesByKey.get(nodeKey('concept', 'agg-loyalty'));
      expect(persona?.description).toBeUndefined();
      expect(concept?.description).toBeUndefined();
      // Both still carry their own real confidence/provenance.
      expect(persona?.metadata).toBeDefined();
      expect(concept?.metadata).toBeDefined();
    });

    it('never fabricates metadata for Entity or Technology -- neither is its own tracked object anywhere in Phase 1-5', async () => {
      const bundle = await loadAuroraBundle();
      const graph = buildCorrelationGraph(bundle);
      const entity = graph.nodesByKey.get(nodeKey('entity', 'Order'));
      const technology = graph.nodesByKey.get(nodeKey('technology', 'Python'));
      expect(entity?.metadata).toBeUndefined();
      expect(entity?.description).toBeUndefined();
      expect(technology?.metadata).toBeUndefined();
    });
  });

  describe('reviewStatusFor (PC-09) — real review-queue status by name, reusing the same whole-word join build-graph.ts uses', () => {
    it('reports "pending" for an object with a real open review item referencing it', async () => {
      const bundle = await loadAuroraBundle();
      // rev-1: "Payments Gateway Adapter — technology", status: pending.
      expect(reviewStatusFor(bundle.reviewItems, 'Payments Gateway Adapter')).toBe('pending');
      // rev-3: "LoyaltyAccount — domain ownership", status: pending.
      expect(reviewStatusFor(bundle.reviewItems, 'LoyaltyAccount')).toBe('pending');
    });

    it('reports "confirmed" — distinct from "corrected" — when the matching review item was accepted as-is', async () => {
      const bundle = await loadAuroraBundle();
      // rev-6: "Order — schema", status: confirmed.
      expect(reviewStatusFor(bundle.reviewItems, 'Order')).toBe('confirmed');
    });

    it('reports "corrected" — distinct from "confirmed" — when a matching review item was corrected, never collapsed into one undifferentiated "reviewed" bucket', () => {
      const items = [
        {
          id: 'rev-x',
          elementType: 'Container',
          elementName: 'Widget Service',
          currentValue: 'Corrected value',
          metadata: { provenance: [], confidence: { level: 'high' as const } },
          status: 'corrected' as const,
        },
      ];
      expect(reviewStatusFor(items, 'Widget Service')).toBe('corrected');
    });

    it('prioritises "pending" over "corrected"/"confirmed" when multiple review items disagree on the same object', () => {
      const items = [
        {
          id: 'rev-a',
          elementType: 'Container',
          elementName: 'Widget Service — technology',
          currentValue: 'a',
          metadata: { provenance: [], confidence: { level: 'high' as const } },
          status: 'confirmed' as const,
        },
        {
          id: 'rev-b',
          elementType: 'Container',
          elementName: 'Widget Service — status',
          currentValue: 'b',
          metadata: { provenance: [], confidence: { level: 'high' as const } },
          status: 'pending' as const,
        },
      ];
      expect(reviewStatusFor(items, 'Widget Service')).toBe('pending');
    });

    it('reports "none" — never a false "validated" claim — when no review item references the object', async () => {
      const bundle = await loadAuroraBundle();
      expect(reviewStatusFor(bundle.reviewItems, 'Notification Service')).toBe('none');
      expect(reviewStatusFor([], 'Order')).toBe('none');
      expect(reviewStatusFor(undefined, 'Order')).toBe('none');
    });
  });

  describe('reviewMatchesFor (PC-HR-03) — the real ReviewItem(s) behind a status, for deep-linking to the Review queue', () => {
    it('returns the real matching review item(s) for an object, never an invented one', async () => {
      const bundle = await loadAuroraBundle();
      const matches = reviewMatchesFor(bundle.reviewItems, 'LoyaltyAccount');
      expect(matches).toHaveLength(1);
      expect(matches[0]!.id).toBe('rev-3');
      expect(matches[0]!.status).toBe('pending');
    });

    it('returns an empty list — never throwing — for an object with no review item, or when reviewItems is undefined', async () => {
      const bundle = await loadAuroraBundle();
      expect(reviewMatchesFor(bundle.reviewItems, 'Notification Service')).toEqual([]);
      expect(reviewMatchesFor(undefined, 'Order')).toEqual([]);
    });
  });
});
