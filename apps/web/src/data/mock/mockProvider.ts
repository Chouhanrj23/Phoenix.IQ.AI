import type { C4Level, OkfDataProvider } from '../types.js';
import type { CompanyId } from '../companies.js';
import { auroraBundle } from './aurora/index.js';
import { fintechBundle } from './fintech/index.js';

type CompanyBundle = typeof auroraBundle;

// Small artificial delay so loading states are visible in the demo, without
// making the UI feel sluggish.
function delay<T>(value: T, ms = 250): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function providerFor(bundle: CompanyBundle): OkfDataProvider {
  return {
    getSystemSummary: () => delay(bundle.systemSummary),

    getArchitecture: (level: C4Level) => {
      if (level === 'context') {
        return delay({ nodes: bundle.contextNodes, edges: bundle.contextEdges });
      }
      // 'component' level is out of scope for this demo fixture set (see the
      // Gap Analysis page — it's called out explicitly); fall back to the
      // container view rather than returning nothing.
      return delay({ nodes: bundle.containerNodes, edges: bundle.containerEdges });
    },

    getDomains: () => delay(bundle.domains),

    getExecutionFlows: () => delay(bundle.executionFlows),

    getReviewItems: () => delay(bundle.reviewItems),

    getDriftAlerts: () => delay(bundle.driftAlerts),

    getPersonas: () => delay(bundle.personas),

    getJourneys: () => delay(bundle.journeys),

    getBusinessCapabilities: () => delay(bundle.capabilities),

    getEpics: () => delay(bundle.epics),

    getDeploymentTopology: () => delay(bundle.deploymentNodes),

    getNonFunctionalRequirements: () => delay(bundle.nonFunctionalRequirements),

    getIntegrations: () => delay(bundle.integrations),

    getGapItems: () => delay(bundle.gapItems),

    getDriftHistory: () => delay(bundle.driftHistory),

    getFullGraph: () => delay(bundle.fullGraph),

    /**
     * P7-01 — the mock provider is a fixture dataset with no backend behind
     * it, so there is genuinely nowhere to persist a review decision. It
     * reports that honestly (`durability: 'none'`) instead of pretending to
     * save, or quietly inventing browser storage the rest of Phoenix knows
     * nothing about. Run the app against the API (`VITE_DATA_SOURCE=api`)
     * for real persisted review.
     */
    submitReviewDecision: () =>
      delay({
        durability: 'none' as const,
        reason:
          'This is the demo dataset, which has no backend. Review decisions are not saved. Run Phoenix against the API to record real review decisions.',
      }),
  };
}

const providersByCompany: Record<CompanyId, OkfDataProvider> = {
  aurora: providerFor(auroraBundle),
  fintech: providerFor(fintechBundle),
};

/** Returns the mock provider bound to a specific company's fixture dataset. */
export function mockProviderFor(companyId: CompanyId): OkfDataProvider {
  return providersByCompany[companyId] ?? providersByCompany.aurora;
}

// Backward-compatible default export — always bound to the Aurora Commerce
// (e-commerce) dataset. Existing tests and any code that doesn't care about
// company switching can keep importing this directly.
export const mockProvider: OkfDataProvider = mockProviderFor('aurora');
