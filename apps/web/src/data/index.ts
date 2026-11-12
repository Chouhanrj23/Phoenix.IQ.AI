import type { OkfDataProvider } from './types.js';
import { mockProviderFor } from './mock/mockProvider.js';
import { apiProvider } from './api/apiProvider.js';
import { COMPANY_IDS, DEFAULT_COMPANY, isCompanyAvailable, type CompanyId } from './companies.js';

// Single switch between the two implementations. Everything in src/pages
// and src/components consumes `dataProvider` and never imports mock/api
// modules directly, so flipping this env var is the only change needed to
// go from a standalone demo to the full-stack app.
const source = import.meta.env.VITE_DATA_SOURCE ?? 'mock';

const STORAGE_KEY = 'phoenix.selectedCompany';

function readStoredCompany(): CompanyId | null {
  if (typeof window === 'undefined') return null;
  const value = window.localStorage.getItem(STORAGE_KEY);
  const id = COMPANY_IDS.find((c) => c === value);
  return id && isCompanyAvailable(id) ? id : null;
}

let activeCompany: CompanyId = readStoredCompany() ?? DEFAULT_COMPANY;

/** Which company's dataset the app currently shows. */
export function getActiveCompany(): CompanyId {
  return activeCompany;
}

/** Switch the whole app over to a different company's dataset. */
export function setActiveCompany(companyId: CompanyId): void {
  activeCompany = companyId;
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, companyId);
  }
}

/** Whether the user has ever picked a company (vs. just getting the default). */
export function hasSelectedCompany(): boolean {
  return readStoredCompany() !== null;
}

function resolveProvider(): OkfDataProvider {
  return source === 'api' ? apiProvider : mockProviderFor(activeCompany);
}

// `dataProvider` is consumed as a plain singleton object across ~15 files
// (`dataProvider.getX()`), so rather than threading the active company
// through every call site, this Proxy transparently re-resolves the
// underlying provider on every method call. Switching companies is just
// `setActiveCompany(...)` — every existing call site keeps working unchanged.
export const dataProvider: OkfDataProvider = new Proxy({} as OkfDataProvider, {
  get(_target, prop: string | symbol) {
    const provider = resolveProvider();
    const value = provider[prop as keyof OkfDataProvider];
    return typeof value === 'function' ? value.bind(provider) : value;
  },
});

export * from './types.js';
export * from './companies.js';
