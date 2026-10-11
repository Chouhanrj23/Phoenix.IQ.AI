import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiProvider } from '../src/data/api/apiProvider.js';

function mockFetchOnce(body: unknown, ok = true, status = 200, statusText = 'OK') {
  const fetchMock = vi.fn().mockResolvedValue({
    ok,
    status,
    statusText,
    json: async () => body,
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// P1-09: the six Phase 1 functional areas must hit real @phoenix-ai/api
// routes — REAL BACKEND DATA.
describe('apiProvider — real backend calls (P1-09)', () => {
  it('calls the correct real endpoint for each of the six Phase 1 functional areas', async () => {
    const fetchMock = mockFetchOnce({});

    await apiProvider.getSystemSummary();
    await apiProvider.getArchitecture('context');
    await apiProvider.getDomains();
    await apiProvider.getIntegrations();
    await apiProvider.getDeploymentTopology();
    await apiProvider.getNonFunctionalRequirements();
    await apiProvider.getReviewItems();
    await apiProvider.getGapItems();
    await apiProvider.getDriftAlerts();
    await apiProvider.getDriftHistory();
    await apiProvider.getFullGraph();

    const calledUrls = fetchMock.mock.calls.map((call) => call[0]);
    expect(calledUrls).toEqual([
      expect.stringContaining('/api/system-summary'),
      expect.stringContaining('/api/architecture?level=context'),
      expect.stringContaining('/api/domains'),
      expect.stringContaining('/api/integrations'),
      expect.stringContaining('/api/deployment-topology'),
      expect.stringContaining('/api/nfrs'),
      expect.stringContaining('/api/review-items'),
      expect.stringContaining('/api/gap-items'),
      expect.stringContaining('/api/drift-alerts'),
      expect.stringContaining('/api/drift-history'),
      expect.stringContaining('/api/full-graph'),
    ]);
  });

  it('throws a descriptive error (surfaced by useAsync as the page error state) when a real backend call fails', async () => {
    mockFetchOnce(null, false, 500, 'Internal Server Error');
    await expect(apiProvider.getSystemSummary()).rejects.toThrow(
      'Request to /api/system-summary failed: 500 Internal Server Error',
    );
  });

  it("shows the API's own explanation when it sends one, e.g. an unavailable graph (P8)", async () => {
    mockFetchOnce(
      { statusCode: 503, message: 'The knowledge graph is temporarily unavailable.' },
      false,
      503,
      'Service Unavailable',
    );
    await expect(apiProvider.getFullGraph()).rejects.toThrow(
      'The knowledge graph is temporarily unavailable.',
    );
  });

  it('resolves an empty array without throwing when the backend returns no data', async () => {
    mockFetchOnce([]);
    await expect(apiProvider.getDomains()).resolves.toEqual([]);
  });

  // P4-08: getFullGraph must behave exactly like every other real route above
  // — a backend/Neo4j failure is a real rejection (surfaced as
  // GraphExplorerPage's ErrorState), never silently swapped for mock fixture
  // data. A fallback here would hide a real outage behind what looks like a
  // normal, populated graph.
  it('propagates a real backend failure for getFullGraph instead of falling back to fixture data', async () => {
    mockFetchOnce(null, false, 503, 'Service Unavailable');
    await expect(apiProvider.getFullGraph()).rejects.toThrow(
      'Request to /api/full-graph failed: 503 Service Unavailable',
    );
  });

  it('resolves an empty graph, not an error and not fixture data, when the backend graph is empty', async () => {
    mockFetchOnce({ nodes: [], edges: [] });
    await expect(apiProvider.getFullGraph()).resolves.toEqual({ nodes: [], edges: [] });
  });
});

// P1-10: methods with no backend route yet must not crash — they fall back
// to mock fixture data instead. DEMO/FALLBACK DATA, not a real backend call.
describe('apiProvider — fallback to mock fixture data for not-yet-implemented areas (P1-10)', () => {
  it('returns fixture data without calling fetch for execution flows, personas, journeys, and epics', async () => {
    const fetchMock = mockFetchOnce({});

    const [flows, personas, journeys, epics] = await Promise.all([
      apiProvider.getExecutionFlows(),
      apiProvider.getPersonas(),
      apiProvider.getJourneys(),
      apiProvider.getEpics(),
    ]);

    expect(flows.length).toBeGreaterThan(0);
    expect(personas.length).toBeGreaterThan(0);
    expect(journeys.length).toBeGreaterThan(0);
    expect(epics.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // PC-01: business capabilities have no @phoenix-ai/api route either (Phase 5
  // output was never wired through @phoenix-ai/graph-persistence/apps/api) —
  // same fallback discipline as the four methods above, not a new pattern.
  it('returns fixture data without calling fetch for business capabilities', async () => {
    const fetchMock = mockFetchOnce({});
    const capabilities = await apiProvider.getBusinessCapabilities();
    expect(capabilities.length).toBeGreaterThan(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
