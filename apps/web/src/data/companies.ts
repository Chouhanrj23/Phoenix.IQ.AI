import { getReport } from '../reverse-engineering/index.js';

export type CompanyId = 'aurora' | 'fintech';
export const COMPANY_IDS: readonly CompanyId[] = ['aurora', 'fintech'];

export interface CompanyOption {
  id: CompanyId;
  /** Full display name, e.g. "Aurora Commerce". */
  name: string;
  /** Short label used in nav/chrome. */
  shortName: string;
  industry: string;
  tagline: string;
  description: string;
  /** Headline stats shown on the selection card. */
  stats: {
    elements: number;
    domains: number;
    integrations: number;
  };
  /** KPMG brand accent driving the card/badge color. */
  accent: 'blue' | 'cobalt';
}

export const COMPANIES: CompanyOption[] = [
  {
    id: 'aurora',
    name: 'Aurora Commerce',
    shortName: 'Aurora',
    industry: 'E-commerce',
    tagline: 'Storefront, checkout, payments & fulfillment',
    description:
      'A mid-size e-commerce platform handling storefront browsing, checkout, payments, fraud screening, and fulfillment across web and mobile, integrated with a legacy ERP for finance and inventory reconciliation.',
    stats: { elements: 142, domains: 6, integrations: 5 },
    accent: 'cobalt',
  },
  bankingEngagement(),
];

/**
 * The banking engagement. When the reverse-engineering run has produced its
 * report (Bank of Anthos, `pnpm reverse-engineer`), the engagement shows that
 * analysis and its description and headline stats come from it; otherwise it
 * falls back to the demo fixtures.
 */
function bankingEngagement(): CompanyOption {
  const base: CompanyOption = {
    id: 'fintech',
    name: 'Fintech - Banking System',
    shortName: 'Banking System',
    industry: 'Fintech — Digital Banking & Payments',
    tagline: 'Onboarding, accounts, cards, payments & fraud/AML',
    description:
      'A digital-first neobank offering checking/savings accounts, card issuing, and P2P payments, integrated with a third-party core banking ledger, card processor, KYC/AML vendor, and ACH payment rail.',
    stats: { elements: 131, domains: 6, integrations: 5 },
    accent: 'blue',
  };
  const report = getReport('fintech');
  if (!report) return base;
  return {
    ...base,
    tagline: 'Accounts, payments, deposits & history — reverse-engineered from Bank of Anthos',
    description: report.systemSummary.description,
    stats: {
      elements: report.systemSummary.totalElements,
      domains: report.domains.length,
      integrations: report.integrations.length,
    },
  };
}

export const DEFAULT_COMPANY: CompanyId = 'aurora';

const COMPANIES_BY_ID: Record<CompanyId, CompanyOption> = Object.fromEntries(
  COMPANIES.map((c) => [c.id, c]),
) as Record<CompanyId, CompanyOption>;

export function isCompanyAvailable(id: CompanyId): boolean {
  return id in COMPANIES_BY_ID;
}

export function getCompany(id: CompanyId): CompanyOption {
  return COMPANIES_BY_ID[id] ?? COMPANIES_BY_ID[DEFAULT_COMPANY];
}
