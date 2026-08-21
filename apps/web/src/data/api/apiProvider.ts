import type { C4Level, OkfDataProvider } from '../types.js';
import { mockProviderFor } from '../mock/mockProvider.js';
import { DEFAULT_COMPANY } from '../companies.js';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) {
    throw new Error(`Request to ${path} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * DEMO/FALLBACK DATA — not real backend data.
 *
 * @phoenix-ai/api has no route yet for execution flows, personas, journeys,
 * or epics (later-phase work over @phoenix-ai/knowledge-graph /
 * @phoenix-ai/okf-renderers / @phoenix-ai/review-loop / a real drift engine —
 * see docs/phase-1/README.md). Rather than letting the pages that need them
 * 404 in `api` mode, those four methods fall back to the mock provider's
 * fixture data below. apiProvider has no concept of company selection (the
 * backend only ever serves the Aurora dataset), so the fallback is pinned to
 * DEFAULT_COMPANY rather than whatever company is selected in the UI, to
 * avoid mixing live Aurora API data with a different company's fixtures.
 *
 * `getFullGraph` is NOT in this list (as of P4-08) — it now hits the real
 * `/api/full-graph` route (`@phoenix-ai/graph-persistence` behind it). A
 * failure there must surface as a real error (`useAsync`'s error state,
 * `GraphExplorerPage`'s `ErrorState`), never silently fall back to fixture
 * data — a fallback would hide a real backend/Neo4j outage behind what
 * looks like a normal, populated graph.
 */
const fallback = mockProviderFor(DEFAULT_COMPANY);

/**
 * Real backend implementation of OkfDataProvider — REAL BACKEND DATA.
 *
 * Phase 1 (P1-03–P1-08) wired up real @phoenix-ai/api routes for System
 * Summary, Architecture, Domain Model, Integrations, Deployment/NFR, and
 * Review/Gaps/Drift; P1-09 connected them here. getSystemSummary through
 * getDriftHistory below hit those routes directly. The shape returned by
 * each matches the types in apps/web/src/data/types.ts (sourced from
 * @phoenix-ai/shared) exactly, so the UI needs zero changes to consume them.
 */
export const apiProvider: OkfDataProvider = {
  getSystemSummary: () => getJson('/api/system-summary'),
  getArchitecture: (level: C4Level) => getJson(`/api/architecture?level=${level}`),
  getDomains: () => getJson('/api/domains'),
  getExecutionFlows: () => fallback.getExecutionFlows(),
  getReviewItems: () => getJson('/api/review-items'),
  getDriftAlerts: () => getJson('/api/drift-alerts'),
  getPersonas: () => fallback.getPersonas(),
  getJourneys: () => fallback.getJourneys(),
  getEpics: () => fallback.getEpics(),
  getDeploymentTopology: () => getJson('/api/deployment-topology'),
  getNonFunctionalRequirements: () => getJson('/api/nfrs'),
  getIntegrations: () => getJson('/api/integrations'),
  getGapItems: () => getJson('/api/gap-items'),
  getDriftHistory: () => getJson('/api/drift-history'),
  getFullGraph: () => getJson('/api/full-graph'),
};
