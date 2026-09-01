import type { BusinessCapability } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

// One capability per real domain (see fixtures.ts), matching the
// clustering shape packages/inference-engine's real P5-04
// `inferBusinessCapabilities` produces (concepts co-located under a shared
// source module, named "<Module> Management") — not one capability per
// class/service.
export const capabilities: BusinessCapability[] = [
  {
    id: 'capability-identity',
    name: 'Identity & Onboarding Management',
    description: 'Applicant identity verification and account opening.',
    domainId: 'dom-identity',
    metadata: meta(
      [prov('repo://nimbus-financial/services/onboarding', 'source-code', 'inference-engine', 3)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'capability-accounts',
    name: 'Account Management',
    description: 'Account balances and ledger state for every customer.',
    domainId: 'dom-accounts',
    metadata: meta(
      [prov('data-model://nimbus-schema.sql', 'data-model', 'inference-engine', 3)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'capability-payments',
    name: 'Payments & Transfers Management',
    description: 'P2P and ACH transfers between accounts and payees.',
    domainId: 'dom-payments',
    metadata: meta(
      [prov('repo://nimbus-financial/services/payments', 'source-code', 'inference-engine', 3)],
      conf('high', 0.89),
    ),
  },
  {
    id: 'capability-cards',
    name: 'Card Management',
    description: 'Issuing and authorizing spend on virtual and physical cards.',
    domainId: 'dom-cards',
    metadata: meta(
      [prov('repo://nimbus-financial/services/card-issuing', 'source-code', 'inference-engine', 3)],
      conf('high', 0.84),
    ),
  },
  {
    id: 'capability-fraud-aml',
    name: 'Fraud & Compliance Management',
    description: 'Screening transactions and applicants for fraud and AML risk.',
    domainId: 'dom-fraud-aml',
    metadata: meta(
      [prov('repo://nimbus-financial/services/fraud-aml', 'source-code', 'inference-engine', 6)],
      conf('medium', 0.6),
    ),
  },
  {
    id: 'capability-credit',
    name: 'Credit Management',
    description: 'Evaluating and issuing credit lines to eligible customers.',
    domainId: 'dom-credit',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/credit-decision',
          'source-code',
          'inference-engine',
          3,
        ),
      ],
      conf('medium', 0.55),
    ),
  },
];
