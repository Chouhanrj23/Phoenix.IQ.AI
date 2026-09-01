import { describe, expect, it } from 'vitest';
import { mockProviderFor } from '../src/data/mock/mockProvider.js';
import {
  computeConnectedSources,
  type ConnectedSourcesBundle,
} from '../src/lib/connected-sources.js';

async function loadBundle(companyId: 'aurora' | 'fintech'): Promise<ConnectedSourcesBundle> {
  const provider = mockProviderFor(companyId);
  const [
    personas,
    journeys,
    flows,
    domains,
    capabilities,
    architecture,
    deploymentNodes,
    integrations,
    nonFunctionalRequirements,
  ] = await Promise.all([
    provider.getPersonas(),
    provider.getJourneys(),
    provider.getExecutionFlows(),
    provider.getDomains(),
    provider.getBusinessCapabilities(),
    provider.getArchitecture('container'),
    provider.getDeploymentTopology(),
    provider.getIntegrations(),
    provider.getNonFunctionalRequirements(),
  ]);
  return {
    personas,
    journeys,
    flows,
    domains,
    capabilities,
    containers: architecture.nodes,
    deploymentNodes,
    integrations,
    nonFunctionalRequirements,
  };
}

function findGroup(groups: ReturnType<typeof computeConnectedSources>, id: string) {
  return groups.find((g) => g.id === id);
}

describe('computeConnectedSources (PC-06) — real Aurora fixture data', () => {
  it('collapses every repo:// path under the same root into exactly ONE Repository (duplicate source representation)', async () => {
    const bundle = await loadBundle('aurora');
    const groups = computeConnectedSources(bundle);
    const repoGroup = findGroup(groups, 'repo');
    expect(repoGroup).toBeDefined();
    // Every repo:// provenance entry in Aurora's real fixtures is under
    // "aurora-commerce" (services/checkout, apps/storefront, infra/..., etc.)
    // -- verified directly against the fixture files -- so this MUST collapse
    // to exactly 1, never one-per-path.
    expect(repoGroup!.count).toBe(1);
    expect(repoGroup!.quantityLabel).toBe('Repository');
    expect(repoGroup!.label).toBe('Git Repositories');
  });

  it('counts real, distinct Jira issues from ticket:// provenance (a source WITH a real count)', async () => {
    const bundle = await loadBundle('aurora');
    const groups = computeConnectedSources(bundle);
    const jiraGroup = findGroup(groups, 'ticket');
    expect(jiraGroup).toBeDefined();
    // Aurora's real fixtures reference exactly 2 distinct tickets: JIRA-3190, JIRA-4821.
    expect(jiraGroup!.count).toBe(2);
    expect(jiraGroup!.quantityLabel).toBe('Issues');
    expect(jiraGroup!.label).toBe('Jira');
  });

  it('counts real documentation and wiki references separately, exactly matching the real fixtures', async () => {
    const bundle = await loadBundle('aurora');
    const groups = computeConnectedSources(bundle);
    const docsGroup = findGroup(groups, 'docs');
    const wikiGroup = findGroup(groups, 'wiki');
    expect(docsGroup!.count).toBe(3); // architecture-2024.pdf, load-test-2025.pdf, personas.md
    expect(wikiGroup!.count).toBe(1); // loyalty-program-notes
  });

  it('never includes a source group with zero real references (no fabricated "0 X" placeholder)', async () => {
    const bundle = await loadBundle('aurora');
    const groups = computeConnectedSources(bundle);
    for (const group of groups) {
      expect(group.count).toBeGreaterThan(0);
    }
  });

  it('produces genuinely different counts for a different company (fintech has no wiki reference, Aurora does)', async () => {
    const aurora = await loadBundle('aurora');
    const fintech = await loadBundle('fintech');
    const auroraGroups = computeConnectedSources(aurora);
    const fintechGroups = computeConnectedSources(fintech);

    expect(findGroup(auroraGroups, 'wiki')).toBeDefined();
    expect(findGroup(fintechGroups, 'wiki')).toBeUndefined(); // fintech's real fixtures cite no wiki:// source at all

    // Fintech's real repo:// provenance is entirely under "nimbus-financial" -- also collapses to 1.
    expect(findGroup(fintechGroups, 'repo')!.count).toBe(1);
    expect(findGroup(fintechGroups, 'ticket')!.count).toBe(2); // JIRA-4790, JIRA-5510
  });

  it('returns an empty list for a bundle with no data at all (zero sources), never throwing', () => {
    const emptyBundle: ConnectedSourcesBundle = {
      personas: [],
      journeys: [],
      flows: [],
      domains: [],
      capabilities: [],
      containers: [],
      deploymentNodes: [],
      integrations: [],
      nonFunctionalRequirements: [],
    };
    expect(computeConnectedSources(emptyBundle)).toEqual([]);
  });

  it('falls back to a generic "Other Sources" group for an unrecognized sourceId scheme, rather than crashing or mislabeling it', () => {
    const bundle: ConnectedSourcesBundle = {
      personas: [
        {
          id: 'p1',
          name: 'Test Persona',
          role: 'Test',
          goals: [],
          painPoints: [],
          metadata: {
            provenance: [
              {
                sourceId: 'mystery-system://weird-thing',
                sourceType: 'other',
                derivedBy: 'test',
                derivedAt: '2026-01-01T00:00:00.000Z',
              },
            ],
            confidence: { level: 'low' },
          },
        },
      ],
      journeys: [],
      flows: [],
      domains: [],
      capabilities: [],
      containers: [],
      deploymentNodes: [],
      integrations: [],
      nonFunctionalRequirements: [],
    };
    const groups = computeConnectedSources(bundle);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.id).toBe('other');
    expect(groups[0]!.count).toBe(1);
  });

  it('is sorted with the highest-count source first', async () => {
    const bundle = await loadBundle('aurora');
    const groups = computeConnectedSources(bundle);
    for (let i = 1; i < groups.length; i++) {
      expect(groups[i - 1]!.count).toBeGreaterThanOrEqual(groups[i]!.count);
    }
  });

  // PC-08: Connected Sources cards must be genuinely clickable, revealing
  // real per-source detail -- never a dead click into nothing.
  it('exposes the real, individual source behind each group (drill-down detail, never a dead click)', async () => {
    const bundle = await loadBundle('aurora');
    const groups = computeConnectedSources(bundle);
    const repoGroup = findGroup(groups, 'repo')!;
    expect(repoGroup.items).toHaveLength(1);
    expect(repoGroup.items[0]!.key).toBe('aurora-commerce');
    expect(repoGroup.items[0]!.sourceType).toBe('source-code');
    expect(repoGroup.items[0]!.referenceCount).toBeGreaterThan(1); // many real objects cite this same repo

    const jiraGroup = findGroup(groups, 'ticket')!;
    const jiraKeys = jiraGroup.items.map((i) => i.key).sort();
    expect(jiraKeys).toEqual(['ticket://JIRA-3190', 'ticket://JIRA-4821']);
    for (const item of jiraGroup.items) {
      expect(item.sourceType).toBe('ticket');
      expect(item.referenceCount).toBeGreaterThan(0);
    }
  });

  it("every group's item count always matches its own reported count", async () => {
    const bundle = await loadBundle('aurora');
    const groups = computeConnectedSources(bundle);
    for (const group of groups) {
      expect(group.items).toHaveLength(group.count);
    }
  });
});
