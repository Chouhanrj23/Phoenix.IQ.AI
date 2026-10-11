import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  API_FIXTURE_FALLBACK_AREAS,
  apiProvider,
  responseDataOrigin,
} from '../src/data/api/apiProvider.js';
import type { OkfDataProvider } from '../src/data/types.js';
import {
  API_COMPANY,
  companySelection,
  dataModeBadge,
  dataOrigin,
  displayedCompany,
  fixtureNotice,
  seedNotice,
} from '../src/lib/data-origin.js';
import {
  ORCHESTRATOR_DESCRIPTION,
  STAGE_IMPLEMENTATION,
  STAGES,
  WALKTHROUGH_NOTICE,
} from '../src/pages/AgentPipelinePage.js';

/**
 * P8 -- the UI never presents demo fixtures or browser-only state as backend
 * functionality.
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

type ReadMethod = Exclude<keyof OkfDataProvider, 'submitReviewDecision'>;
const READ_METHODS: ReadMethod[] = [
  'getSystemSummary',
  'getArchitecture',
  'getDomains',
  'getExecutionFlows',
  'getReviewItems',
  'getDriftAlerts',
  'getPersonas',
  'getJourneys',
  'getBusinessCapabilities',
  'getEpics',
  'getDeploymentTopology',
  'getNonFunctionalRequirements',
  'getIntegrations',
  'getGapItems',
  'getDriftHistory',
  'getFullGraph',
];

function areaOf(method: ReadMethod): string {
  const name = method.slice('get'.length);
  return name.charAt(0).toLowerCase() + name.slice(1);
}

describe('API provider — declared fixture areas match what it actually does', () => {
  it('exactly the declared fallback areas are answered without calling the API', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
    vi.stubGlobal('fetch', fetchMock);

    const servedLocally: string[] = [];
    for (const method of READ_METHODS) {
      const before = fetchMock.mock.calls.length;
      await (apiProvider[method] as (arg?: unknown) => Promise<unknown>)('container');
      if (fetchMock.mock.calls.length === before) servedLocally.push(areaOf(method));
    }
    expect(servedLocally.sort()).toEqual([...API_FIXTURE_FALLBACK_AREAS].sort());
  });
});

describe('data origin (P8)', () => {
  it('in demo mode everything is fixture data', () => {
    expect(dataOrigin('fullGraph', 'mock')).toBe('fixture');
    expect(dataOrigin('reviewItems', 'mock')).toBe('fixture');
  });

  it('in API mode only the fallback areas are fixtures', () => {
    expect(dataOrigin('reviewItems', 'api')).toBe('api');
    expect(dataOrigin('fullGraph', 'api')).toBe('api');
    for (const area of API_FIXTURE_FALLBACK_AREAS) expect(dataOrigin(area, 'api')).toBe('fixture');
  });

  it('the masthead never claims everything is live when it is not', () => {
    const badge = dataModeBadge('api');
    expect(badge.label).not.toBe('Live API mode');
    expect(badge.label).toContain('demo fixtures');
    expect(badge.title).toContain('personas');
    expect(dataModeBadge('mock').label).toBe('Demo mode — fixture data');
  });

  it('labels fixture-backed areas in API mode, and only those', () => {
    expect(fixtureNotice(['personas', 'journeys'], 'api')).toMatch(
      /Phoenix API does not serve personas or journeys/,
    );
    expect(fixtureNotice(['fullGraph', 'reviewItems'], 'api')).toBeUndefined();
    expect(fixtureNotice(['personas'], 'mock')).toBeUndefined();
  });

  it('in API mode only the system the API serves can be selected, and the header names it', () => {
    const api = companySelection('api');
    expect(api.filter((c) => c.selectable).map((c) => c.id)).toEqual([API_COMPANY]);
    for (const entry of api.filter((c) => !c.selectable))
      expect(entry.note).toContain('Demo mode only');
    expect(displayedCompany('fintech', 'api')).toBe(API_COMPANY);
    expect(displayedCompany('fintech', 'mock')).toBe('fintech');
    expect(companySelection('mock').every((c) => c.selectable)).toBe(true);
  });
});

describe('Agent Pipeline walkthrough is labelled as what it is (P8)', () => {
  it('states that the run and its approval gates are scripted and saved nowhere', () => {
    expect(WALKTHROUGH_NOTICE).toMatch(/scripted/);
    expect(WALKTHROUGH_NOTICE).toMatch(/nothing is saved/);
  });

  it('does not claim orchestration features that are not implemented', () => {
    expect(ORCHESTRATOR_DESCRIPTION).toMatch(/not implemented/);
  });

  it('declares an implementation status for every stage, and the scaffolds as not implemented', () => {
    expect(Object.keys(STAGE_IMPLEMENTATION).sort()).toEqual(STAGES.map((s) => s.code).sort());
    const byName = new Map(STAGES.map((s) => [s.name, STAGE_IMPLEMENTATION[s.code]?.status]));
    expect(byName.get('Gap analysis planner')).toBe('not-implemented');
    expect(byName.get('Drift detection')).toBe('not-implemented');
    expect(byName.get('Evaluation harness')).toBe('not-implemented');
  });

  it('no longer labels rule-based inference as an AI agent', () => {
    const inference = STAGES.find((s) => s.name === 'Semantic inference');
    expect(inference?.badges).not.toContain('AI agent');
    expect(inference?.role).toMatch(/rule-based/);
  });
});

describe('seed vs. pipeline data on drift and gap views (P8)', () => {
  function stubFetch(origin: string | null): void {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        statusText: 'OK',
        headers: new Headers(origin === null ? {} : { 'x-phoenix-data-origin': origin }),
        json: async () => [],
      })),
    );
  }

  it('records the origin the API reports for each response', async () => {
    stubFetch('seed');
    await apiProvider.getDriftHistory();
    expect(responseDataOrigin('/api/drift-history')).toBe('seed');
    stubFetch('pipeline');
    await apiProvider.getDriftHistory();
    expect(responseDataOrigin('/api/drift-history')).toBe('pipeline');
    stubFetch(null);
    await apiProvider.getDriftHistory();
    expect(responseDataOrigin('/api/drift-history')).toBeUndefined();
  });

  it('labels seed data as sample data, and only in API mode', () => {
    const seed = () => 'seed' as const;
    const pipeline = () => 'pipeline' as const;
    expect(seedNotice(['/api/gap-items'], 'api', seed)).toMatch(/^Sample data: no analysis run/);
    expect(seedNotice(['/api/gap-items'], 'api', pipeline)).toBeUndefined();
    expect(seedNotice(['/api/gap-items'], 'mock', seed)).toBeUndefined();
  });
});
