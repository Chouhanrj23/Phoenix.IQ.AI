import { afterEach, describe, expect, it, vi } from 'vitest';
import { mockProvider } from '../src/data/mock/mockProvider.js';
import { apiProvider } from '../src/data/api/apiProvider.js';
import {
  buildCorrelationGraph,
  getRelated,
  nodeKey,
  reviewMatchesFor,
  reviewStatusFor,
  type CorrelationBundle,
} from '../src/lib/correlation.js';
import { deriveJourneyDetail } from '../src/lib/journey-detail.js';
import { describeReviewOutcome } from '../src/lib/review-feedback.js';

/**
 * P7-04 -- end-to-end synchronisation between persisted review data, the
 * knowledge graph projection, and the UI's own data layer.
 *
 * These walk the real flows the requirement names, over the real Aurora
 * dataset and the real `lib/correlation.ts` graph -- no fixtures invented to
 * make a flow appear to work. Where a step genuinely cannot be walked, the
 * test asserts that it is absent rather than papering over it.
 */

async function auroraBundle(): Promise<CorrelationBundle> {
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

describe('P7-04 flow: Persona → Journey → Entity → Service → API', () => {
  it('walks Persona → Journey → Entity → Service on the real graph', async () => {
    const graph = buildCorrelationGraph(await auroraBundle());

    // 1. Persona
    const persona = getRelated(graph, nodeKey('persona', 'persona-returning-shopper'));
    expect(persona?.center.label).toBe('Returning Shopper');

    // 2. → Journey
    const journeys = persona?.groups.find((g) => g.kind === 'journey')?.nodes ?? [];
    const journey = journeys.find((j) => j.id === 'journey-browse-to-purchase');
    expect(journey).toBeDefined();

    // 3. → Entity (selecting the journey re-centres the graph)
    const fromJourney = getRelated(graph, journey!.key);
    const entities = fromJourney?.groups.find((g) => g.kind === 'entity')?.nodes ?? [];
    const entity = entities.find((e) => e.id === 'Order');
    expect(entity).toBeDefined();

    // 4. → Service (reverse-traversal from the entity)
    const fromEntity = getRelated(graph, entity!.key);
    const services = fromEntity?.groups.find((g) => g.kind === 'service')?.nodes ?? [];
    expect(services.length).toBeGreaterThan(0);

    // 5. → API: genuinely unavailable. No API/interface object exists anywhere
    // in the dataset, so the chain honestly stops at Service rather than
    // inventing a node to complete the picture.
    const anyApiNode = graph.nodes.some((n) => (n.kind as string) === 'api');
    expect(anyApiNode).toBe(false);
    expect(fromEntity?.groups.some((g) => (g.kind as string) === 'api')).toBe(false);
  });

  it('keeps every step of that walk selectable, so navigation is never a dead end', async () => {
    const graph = buildCorrelationGraph(await auroraBundle());
    for (const key of [
      nodeKey('persona', 'persona-returning-shopper'),
      nodeKey('journey', 'journey-browse-to-purchase'),
      nodeKey('entity', 'Order'),
      nodeKey('service', 'ctr-payments'),
    ]) {
      const related = getRelated(graph, key);
      expect(related, `${key} must resolve`).toBeDefined();
      expect(related!.groups.length).toBeGreaterThan(0);
    }
  });
});

describe('P7-04 flow: Journey → Entity → Evidence → Technical Trace', () => {
  it('reaches real evidence and a real technical trace from a journey', async () => {
    const bundle = await auroraBundle();
    const journey = bundle.journeys.find((j) => j.id === 'journey-browse-to-purchase')!;

    const detail = deriveJourneyDetail(
      journey,
      bundle.flows,
      bundle.domains,
      bundle.containers,
      bundle.deploymentNodes,
      bundle.integrations,
    );

    // → Entity
    expect(detail.domainEntityNames).toContain('Order');
    // → Evidence (real provenance, not a placeholder)
    expect(detail.provenance.length).toBeGreaterThan(0);
    // → Technical trace: services, and through them technology/deployment
    expect(detail.services.length).toBeGreaterThan(0);
    expect(detail.technologies.length).toBeGreaterThan(0);
  });

  it('carries service-level provenance so the technical trace is navigable from the graph too', async () => {
    const graph = buildCorrelationGraph(await auroraBundle());
    const service = graph.nodesByKey.get(nodeKey('service', 'ctr-payments'));
    expect(service?.metadata?.provenance.length).toBeGreaterThan(0);
    expect(service?.description).toBeTruthy();
  });
});

describe('P7-04 flow: Object → Review → Correction → Graph → Related Objects', () => {
  it('binds a selected graph object to its review item by canonical id', async () => {
    const bundle = await auroraBundle();
    const graph = buildCorrelationGraph(bundle);
    const service = graph.nodesByKey.get(nodeKey('service', 'ctr-payments'))!;

    // The Aurora queue item rev-1 carries elementId 'ctr-payments' in the API
    // seed. The mock fixtures predate that binding, so this asserts the
    // matcher resolves by whichever key is actually present — never neither.
    const matches = reviewMatchesFor(bundle.reviewItems, service.label, service.id);
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]?.elementName).toContain('Payments Gateway Adapter');
  });

  it('prefers an exact canonical-id binding over name matching when both could match', () => {
    const items = [
      {
        id: 'rev-name',
        elementType: 'Container',
        elementName: 'Payments Gateway Adapter — technology',
        currentValue: 'Node.js',
        metadata: { provenance: [], confidence: { level: 'low' as const } },
        status: 'pending' as const,
      },
      {
        id: 'rev-id',
        elementId: 'ctr-payments',
        elementType: 'Container',
        elementName: 'Something else entirely',
        currentValue: 'Node.js',
        metadata: { provenance: [], confidence: { level: 'low' as const } },
        status: 'confirmed' as const,
      },
    ];

    // The id binding wins, so status reflects the item genuinely about this element.
    expect(reviewStatusFor(items, 'Payments Gateway Adapter', 'ctr-payments')).toBe('confirmed');
    // With no id supplied, name matching still works — no regression.
    expect(reviewStatusFor(items, 'Payments Gateway Adapter')).toBe('pending');
  });

  it('reports review status independently of confidence', async () => {
    const bundle = await auroraBundle();
    const graph = buildCorrelationGraph(bundle);
    const service = graph.nodesByKey.get(nodeKey('service', 'ctr-payments'))!;

    const status = reviewStatusFor(bundle.reviewItems, service.label, service.id);
    // ctr-payments is low confidence AND pending review: two separate signals,
    // neither derived from the other.
    expect(service.metadata?.confidence.level).toBe('low');
    expect(status).toBe('pending');

    // An element with no review item is 'none' regardless of its confidence.
    const inventory = graph.nodesByKey.get(nodeKey('service', 'ctr-inventory'))!;
    expect(inventory.metadata?.confidence.level).toBe('high');
    expect(reviewStatusFor(bundle.reviewItems, inventory.label, inventory.id)).toBe('none');
  });

  it('leaves related objects navigable after a correction — the graph is not rebuilt from review data', async () => {
    const bundle = await auroraBundle();
    const beforeGraph = buildCorrelationGraph(bundle);
    const beforeRelated = getRelated(beforeGraph, nodeKey('service', 'ctr-payments'))!;

    // Simulate what the page does after a persisted correction: the queue comes
    // back with the item corrected, and the graph is rebuilt from it.
    const corrected = bundle.reviewItems.map((item) =>
      item.elementName.includes('Payments Gateway Adapter')
        ? { ...item, status: 'corrected' as const, currentValue: 'Java / Spring Boot' }
        : item,
    );
    const afterRelated = getRelated(
      buildCorrelationGraph({ ...bundle, reviewItems: corrected }),
      nodeKey('service', 'ctr-payments'),
    )!;

    // Every relationship the user could follow before is still there after.
    expect(afterRelated.groups.map((g) => g.kind)).toEqual(beforeRelated.groups.map((g) => g.kind));
    expect(afterRelated.immediateNeighborKeys.size).toBe(beforeRelated.immediateNeighborKeys.size);
    expect(reviewStatusFor(corrected, 'Payments Gateway Adapter', 'ctr-payments')).toBe(
      'corrected',
    );
  });
});

describe('P7-04 — what the UI tells the reviewer matches what actually happened', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('states both where the decision was stored and whether it reached the graph', () => {
    expect(
      describeReviewOutcome({
        durability: 'graph',
        propagation: { outcome: 'propagated', reason: 'x' },
      }),
    ).toEqual({
      kind: 'ok',
      message:
        'Saved to the knowledge graph. The reviewed element was updated in the knowledge graph.',
    });
  });

  it('does NOT claim the graph was updated when the element has no node there', () => {
    const outcome = describeReviewOutcome({
      durability: 'memory',
      propagation: { outcome: 'target-missing', reason: 'x' },
    });
    expect(outcome.kind).toBe('ok');
    expect(outcome.message).toContain('in memory only');
    expect(outcome.message).toContain('no node in the knowledge graph yet');
    expect(outcome.message).not.toContain('was updated in the knowledge graph.');
  });

  it('surfaces a genuine backend limitation as an error rather than a success', async () => {
    const outcome = describeReviewOutcome(
      await mockProvider.submitReviewDecision({
        targetObjectId: 'ctr-payments',
        targetLabel: 'Payments Gateway Adapter',
        decision: 'confirmed',
        previousValue: 'Node.js',
        reviewerId: 'reviewer-a',
      }),
    );
    expect(outcome.kind).toBe('error');
    expect(outcome.message).toContain('not saved');
  });

  it('sends the canonical element id to the API, so persistence binds to the right object', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      json: async () => ({
        durability: 'graph',
        propagation: { outcome: 'propagated', reason: '' },
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await apiProvider.submitReviewDecision({
      targetObjectId: 'ctr-payments',
      targetLabel: 'Payments Gateway Adapter — technology',
      decision: 'corrected',
      previousValue: 'Node.js/Express (from source code)',
      correctedValue: 'Java / Spring Boot',
      reviewerId: 'reviewer-a',
      previousStatus: 'pending',
    });

    const body = JSON.parse(String((fetchMock.mock.calls[0] as [string, RequestInit])[1].body));
    expect(body.targetObjectId).toBe('ctr-payments');
    expect(body.correctedValue).toBe('Java / Spring Boot');
  });
});
