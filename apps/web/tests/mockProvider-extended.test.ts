import { describe, expect, it } from 'vitest';
import { mockProvider, mockProviderFor } from '../src/data/mock/mockProvider.js';

describe('mockProvider — extended demo data', () => {
  // PC-01: Business Overview cards read real counts from getBusinessCapabilities().
  it('returns business capabilities that each reference a real domain', async () => {
    const capabilities = await mockProvider.getBusinessCapabilities();
    const domains = await mockProvider.getDomains();
    expect(capabilities.length).toBeGreaterThan(0);
    const domainIds = new Set(domains.map((d) => d.id));
    for (const capability of capabilities) {
      expect(domainIds.has(capability.domainId)).toBe(true);
      expect(capability.name.length).toBeGreaterThan(0);
    }
  });

  it('returns genuinely different business capabilities for each company (never a single hard-coded set)', async () => {
    const aurora = await mockProviderFor('aurora').getBusinessCapabilities();
    const fintech = await mockProviderFor('fintech').getBusinessCapabilities();
    expect(aurora.length).toBeGreaterThan(0);
    expect(fintech.length).toBeGreaterThan(0);
    const auroraNames = new Set(aurora.map((c) => c.name));
    const fintechNames = new Set(fintech.map((c) => c.name));
    const overlap = [...auroraNames].filter((name) => fintechNames.has(name));
    expect(overlap.length).toBe(0);
  });

  it('returns personas and journeys that reference valid personas', async () => {
    const personas = await mockProvider.getPersonas();
    const journeys = await mockProvider.getJourneys();
    expect(personas.length).toBeGreaterThan(0);
    expect(journeys.length).toBeGreaterThan(0);
    const personaIds = new Set(personas.map((p) => p.id));
    for (const journey of journeys) {
      expect(personaIds.has(journey.personaId)).toBe(true);
    }
  });

  it('every journey references at least one real execution flow', async () => {
    const journeys = await mockProvider.getJourneys();
    const flows = await mockProvider.getExecutionFlows();
    const flowIds = new Set(flows.map((f) => f.id));
    for (const journey of journeys) {
      expect(journey.flowIds.length).toBeGreaterThan(0);
      for (const flowId of journey.flowIds) {
        expect(flowIds.has(flowId)).toBe(true);
      }
    }
  });

  it('returns epics with nested features and stories', async () => {
    const epics = await mockProvider.getEpics();
    expect(epics.length).toBeGreaterThan(0);
    for (const epic of epics) {
      expect(epic.features.length).toBeGreaterThan(0);
      for (const feature of epic.features) {
        expect(feature.stories.length).toBeGreaterThan(0);
      }
    }
  });

  it('returns a deployment topology with instances tied to real containers', async () => {
    const topology = await mockProvider.getDeploymentTopology();
    const architecture = await mockProvider.getArchitecture('container');
    const containerIds = new Set(architecture.nodes.map((n) => n.id));
    const environments = topology.filter((n) => n.kind === 'environment');
    const instances = topology.filter((n) => n.kind === 'instance');
    expect(environments.length).toBeGreaterThan(0);
    expect(instances.length).toBeGreaterThan(0);
    for (const instance of instances) {
      expect(instance.containerId).toBeDefined();
      expect(containerIds.has(instance.containerId as string)).toBe(true);
    }
  });

  it('returns NFRs, integrations, and gap items', async () => {
    const nfrs = await mockProvider.getNonFunctionalRequirements();
    const integrations = await mockProvider.getIntegrations();
    const gaps = await mockProvider.getGapItems();
    expect(nfrs.length).toBeGreaterThan(0);
    expect(integrations.length).toBeGreaterThan(0);
    expect(gaps.length).toBeGreaterThan(0);
    expect(gaps.some((g) => g.severity === 'blocking')).toBe(true);
  });

  it('returns drift history ordered with the most recent run first', async () => {
    const history = await mockProvider.getDriftHistory();
    expect(history.length).toBeGreaterThan(1);
    const dates = history.map((r) => new Date(r.runDate).getTime());
    const sorted = [...dates].sort((a, b) => b - a);
    expect(dates).toEqual(sorted);
  });

  it('returns a full graph whose edges only reference existing nodes', async () => {
    const graph = await mockProvider.getFullGraph();
    const nodeIds = new Set(graph.nodes.map((n) => n.id));
    expect(graph.nodes.length).toBeGreaterThan(20);
    for (const edge of graph.edges) {
      expect(nodeIds.has(edge.source)).toBe(true);
      expect(nodeIds.has(edge.target)).toBe(true);
    }
  });
});
