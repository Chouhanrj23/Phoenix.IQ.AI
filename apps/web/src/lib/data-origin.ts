import {
  API_FIXTURE_FALLBACK_AREAS,
  responseDataOrigin,
  type ApiFixtureFallbackArea,
  type ResponseDataOrigin,
} from '../data/api/apiProvider.js';
import { COMPANIES, DEFAULT_COMPANY, getCompany, type CompanyId } from '../data/companies.js';

/**
 * P8 -- where each piece of data on screen actually comes from, so the UI
 * never presents demo fixtures as backend results.
 *
 *  - `mock` mode: everything is fixture data, and the shell says so.
 *  - `api` mode: most areas come from the Phoenix API, but some
 *    (`API_FIXTURE_FALLBACK_AREAS`) are still answered from the bundled
 *    fixtures because no endpoint exists. Those are labelled where they are
 *    shown, and the shell badge no longer claims everything is live.
 */

export type DataSourceMode = 'api' | 'mock';
export type DataOrigin = 'api' | 'fixture';
export type DataArea =
  | ApiFixtureFallbackArea
  | 'systemSummary'
  | 'architecture'
  | 'domains'
  | 'reviewItems'
  | 'driftAlerts'
  | 'deploymentTopology'
  | 'nonFunctionalRequirements'
  | 'integrations'
  | 'gapItems'
  | 'driftHistory'
  | 'fullGraph';

export function currentDataSourceMode(): DataSourceMode {
  return import.meta.env.VITE_DATA_SOURCE === 'api' ? 'api' : 'mock';
}

export function dataOrigin(area: DataArea, mode: DataSourceMode): DataOrigin {
  if (mode === 'mock') return 'fixture';
  return (API_FIXTURE_FALLBACK_AREAS as readonly string[]).includes(area) ? 'fixture' : 'api';
}

const AREA_LABELS: Record<ApiFixtureFallbackArea, string> = {
  executionFlows: 'execution flows',
  personas: 'personas',
  journeys: 'journeys',
  businessCapabilities: 'business capabilities',
  epics: 'epics & stories',
};

/** The masthead badge: what mode the app is in, without overstating it. */
export function dataModeBadge(mode: DataSourceMode): { label: string; title: string } {
  if (mode === 'mock') {
    return {
      label: 'Demo mode — fixture data',
      title:
        'Everything shown comes from bundled demo fixtures; nothing is read from or saved to a backend.',
    };
  }
  const fixtureAreas = API_FIXTURE_FALLBACK_AREAS.map((area) => AREA_LABELS[area]);
  return {
    label: 'Live API mode — some areas from demo fixtures',
    title: `Served by the Phoenix API, except ${fixtureAreas.join(', ')}: the API has no endpoint for these yet, so they are shown from demo fixtures.`,
  };
}

/** The notice for an area shown from fixtures in API mode; `undefined` when no notice is needed. */
export function fixtureNotice(
  areas: readonly DataArea[],
  mode: DataSourceMode,
): string | undefined {
  if (mode !== 'api') return undefined; // the masthead already says everything is a fixture
  const fixtures = areas.filter((area) => dataOrigin(area, mode) === 'fixture');
  if (fixtures.length === 0) return undefined;
  const names = fixtures.map((area) => AREA_LABELS[area as ApiFixtureFallbackArea]);
  return `Demo fixture data: the Phoenix API does not serve ${names.join(' or ')} yet, so ${names.length === 1 ? 'this is' : 'these are'} shown from the bundled demo dataset — not from an analysis run.`;
}

/**
 * P8 -- drift and gap endpoints serve real run output once the system has
 * been analysed, and the API's seed sample before that, saying which in a
 * response header. When any of the given endpoints answered with seed data,
 * the page must say so: a seed changelog is not this system's history.
 */
export function seedNotice(
  paths: readonly string[],
  mode: DataSourceMode,
  originOf: (path: string) => ResponseDataOrigin | undefined = responseDataOrigin,
): string | undefined {
  if (mode !== 'api') return undefined;
  if (!paths.some((path) => originOf(path) === 'seed')) return undefined;
  return 'Sample data: no analysis run has completed for this system yet, so the API is serving its built-in sample. Register a source and start a run (POST /api/sources, POST /api/runs) to see this system’s own results here.';
}

/**
 * The single system the API serves (its seed is Aurora Commerce). In API mode
 * only that engagement can be selected: picking another relabelled the
 * header while every API-backed page still showed Aurora's data.
 */
export const API_COMPANY: CompanyId = DEFAULT_COMPANY;

export function companySelection(
  mode: DataSourceMode,
): ReadonlyArray<{ id: CompanyId; selectable: boolean; note?: string }> {
  return COMPANIES.map((company) =>
    mode === 'mock' || company.id === API_COMPANY
      ? { id: company.id, selectable: true }
      : {
          id: company.id,
          selectable: false,
          note: `Demo mode only — the Phoenix API serves ${getCompany(API_COMPANY).name}.`,
        },
  );
}

/** The engagement the header may name: in API mode always the API's own system. */
export function displayedCompany(selected: CompanyId, mode: DataSourceMode): CompanyId {
  return mode === 'api' ? API_COMPANY : selected;
}
