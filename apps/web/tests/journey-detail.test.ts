import { describe, expect, it } from 'vitest';
import { mockProvider, mockProviderFor } from '../src/data/mock/mockProvider.js';
import { deriveJourneyDetail } from '../src/lib/journey-detail.js';
import type { Journey } from '../src/data/index.js';

async function loadAurora() {
  const [journeys, flows, domains, architecture, deployment, integrations] = await Promise.all([
    mockProvider.getJourneys(),
    mockProvider.getExecutionFlows(),
    mockProvider.getDomains(),
    mockProvider.getArchitecture('container'),
    mockProvider.getDeploymentTopology(),
    mockProvider.getIntegrations(),
  ]);
  return { journeys, flows, domains, containers: architecture.nodes, deployment, integrations };
}

describe('deriveJourneyDetail (PC-03) — real Aurora fixture data', () => {
  it('derives real business concepts (aggregates) whose entities are actually touched by the journey', async () => {
    const { journeys, flows, domains, containers, deployment, integrations } = await loadAurora();
    const journey = journeys.find((j) => j.id === 'journey-browse-to-purchase')!;
    const detail = deriveJourneyDetail(
      journey,
      flows,
      domains,
      containers,
      deployment,
      integrations,
    );

    const conceptNames = detail.businessConcepts.map((c) => c.name).sort();
    // Every one of these aggregates genuinely owns an entity read/written by
    // flow-checkout's steps (Cart, Product, PriceList, Order, OrderLine,
    // CustomerProfile, DeviceFingerprint, RiskCase, Payment, PaymentAttempt,
    // WarehouseAllocation) -- verified directly against fixtures.ts.
    expect(conceptNames).toEqual(
      expect.arrayContaining([
        'Cart',
        'Product',
        'PriceList',
        'Order',
        'Payment',
        'CustomerProfile',
      ]),
    );
    // Refund/Shipment/LoyaltyAccount are real aggregates in this system but
    // are NOT touched by this journey's steps -- must never appear.
    expect(conceptNames).not.toContain('Refund');
    expect(conceptNames).not.toContain('Shipment');
    expect(conceptNames).not.toContain('LoyaltyAccount');
  });

  it('derives real domain entities as the exact union of readsEntities/writesEntities across the journey', async () => {
    const { journeys, flows, domains, containers, deployment, integrations } = await loadAurora();
    const journey = journeys.find((j) => j.id === 'journey-browse-to-purchase')!;
    const detail = deriveJourneyDetail(
      journey,
      flows,
      domains,
      containers,
      deployment,
      integrations,
    );

    expect(detail.domainEntityNames).toEqual(
      expect.arrayContaining([
        'Cart',
        'Order',
        'OrderLine',
        'Payment',
        'PaymentAttempt',
        'WarehouseAllocation',
      ]),
    );
  });

  it('derives real services via exact provenance sourceId match between flow steps and containers', async () => {
    const { journeys, flows, domains, containers, deployment, integrations } = await loadAurora();
    const journey = journeys.find((j) => j.id === 'journey-browse-to-purchase')!;
    const detail = deriveJourneyDetail(
      journey,
      flows,
      domains,
      containers,
      deployment,
      integrations,
    );

    const serviceIds = detail.services.map((s) => s.id).sort();
    expect(serviceIds).toEqual(
      [
        'ctr-checkout',
        'ctr-fraud',
        'ctr-inventory',
        'ctr-notification',
        'ctr-order-orch',
        'ctr-payments',
      ].sort(),
    );
    // Every returned service must be traceable back to a real step's provenance.
    for (const service of detail.services) {
      const serviceSourceIds = new Set(service.metadata.provenance.map((p) => p.sourceId));
      const matchesSomeStep = detail.steps.some(({ step }) =>
        step.metadata.provenance.some((p) => serviceSourceIds.has(p.sourceId)),
      );
      expect(matchesSomeStep).toBe(true);
    }
  });

  it('derives technology only from matched services -- never fabricated', async () => {
    const { journeys, flows, domains, containers, deployment, integrations } = await loadAurora();
    const journey = journeys.find((j) => j.id === 'journey-browse-to-purchase')!;
    const detail = deriveJourneyDetail(
      journey,
      flows,
      domains,
      containers,
      deployment,
      integrations,
    );

    expect(detail.technologies.length).toBeGreaterThan(0);
    const serviceTechnologies = new Set(detail.services.map((s) => s.technology).filter(Boolean));
    for (const tech of detail.technologies) {
      expect(serviceTechnologies.has(tech)).toBe(true);
    }
  });

  it('derives deployment instances only for matched services, via exact containerId match', async () => {
    const { journeys, flows, domains, containers, deployment, integrations } = await loadAurora();
    const journey = journeys.find((j) => j.id === 'journey-browse-to-purchase')!;
    const detail = deriveJourneyDetail(
      journey,
      flows,
      domains,
      containers,
      deployment,
      integrations,
    );

    const serviceIds = new Set(detail.services.map((s) => s.id));
    expect(detail.deploymentInstances.length).toBeGreaterThan(0);
    for (const instance of detail.deploymentInstances) {
      expect(instance.kind).toBe('instance');
      expect(instance.containerId).toBeDefined();
      expect(serviceIds.has(instance.containerId as string)).toBe(true);
    }
  });

  it('derives only the 2 real integrations whose provenance matches a touched service (payments, notifications) -- never the 3 that do not', async () => {
    const { journeys, flows, domains, containers, deployment, integrations } = await loadAurora();
    const journey = journeys.find((j) => j.id === 'journey-browse-to-purchase')!;
    const detail = deriveJourneyDetail(
      journey,
      flows,
      domains,
      containers,
      deployment,
      integrations,
    );

    const integrationIds = detail.integrations.map((i) => i.id).sort();
    expect(integrationIds).toEqual(['int-meridian-pay', 'int-notify-provider']);
  });

  it("collects real, deduplicated provenance from the journey's own steps for the Evidence section", async () => {
    const { journeys, flows, domains, containers, deployment, integrations } = await loadAurora();
    const journey = journeys.find((j) => j.id === 'journey-browse-to-purchase')!;
    const detail = deriveJourneyDetail(
      journey,
      flows,
      domains,
      containers,
      deployment,
      integrations,
    );

    expect(detail.provenance.length).toBeGreaterThan(0);
    const keys = detail.provenance.map((p) => `${p.sourceId}::${p.sourceType}::${p.derivedBy}`);
    expect(new Set(keys).size).toBe(keys.length); // no duplicates
  });

  it('never invents data for a journey with no execution flows -- every derived field is empty, not fabricated', async () => {
    const { flows, domains, containers, deployment, integrations } = await loadAurora();
    const emptyJourney: Journey = {
      id: 'journey-empty-test',
      name: 'Journey With No Flows',
      personaId: 'persona-returning-shopper',
      description: 'A synthetic journey with no flowIds, to prove nothing is fabricated.',
      flowIds: [],
      metadata: { provenance: [], confidence: { level: 'low' } },
    };
    const detail = deriveJourneyDetail(
      emptyJourney,
      flows,
      domains,
      containers,
      deployment,
      integrations,
    );

    expect(detail.steps).toEqual([]);
    expect(detail.businessConcepts).toEqual([]);
    expect(detail.domainEntityNames).toEqual([]);
    expect(detail.services).toEqual([]);
    expect(detail.technologies).toEqual([]);
    expect(detail.deploymentInstances).toEqual([]);
    expect(detail.integrations).toEqual([]);
    expect(detail.provenance).toEqual([]);
  });
});

describe('deriveJourneyDetail (PC-03) — real fintech fixture data (cross-domain sanity)', () => {
  it('produces structurally valid, non-fabricated output for a real fintech journey', async () => {
    const provider = mockProviderFor('fintech');
    const [journeys, flows, domains, architecture, deployment, integrations] = await Promise.all([
      provider.getJourneys(),
      provider.getExecutionFlows(),
      provider.getDomains(),
      provider.getArchitecture('container'),
      provider.getDeploymentTopology(),
      provider.getIntegrations(),
    ]);
    const journey = journeys[0]!;
    const detail = deriveJourneyDetail(
      journey,
      flows,
      domains,
      architecture.nodes,
      deployment,
      integrations,
    );

    // Every business concept must genuinely own a touched entity.
    for (const concept of detail.businessConcepts) {
      const domain = domains.find((d) => d.aggregates.some((a) => a.id === concept.id));
      const aggregate = domain?.aggregates.find((a) => a.id === concept.id);
      expect(aggregate).toBeDefined();
      expect(aggregate!.entities.some((e) => detail.domainEntityNames.includes(e))).toBe(true);
    }
    // Every service must be traceable to a real step's provenance.
    for (const service of detail.services) {
      const serviceSourceIds = new Set(service.metadata.provenance.map((p) => p.sourceId));
      const matchesSomeStep = detail.steps.some(({ step }) =>
        step.metadata.provenance.some((p) => serviceSourceIds.has(p.sourceId)),
      );
      expect(matchesSomeStep).toBe(true);
    }
  });
});
