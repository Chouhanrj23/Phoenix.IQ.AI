import type { NonFunctionalRequirement } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

export const nonFunctionalRequirements: NonFunctionalRequirement[] = [
  {
    id: 'nfr-payments-latency',
    category: 'performance',
    requirement:
      'Payments & Transfers Service must confirm a P2P transfer within acceptable latency under normal load.',
    target: 'p95 < 500ms',
    appliesTo: ['Payments & Transfers Service'],
    metadata: meta(
      [prov('docs/load-test-2025.pdf', 'technical-doc', 'inference-engine', 95)],
      conf(
        'medium',
        0.57,
        'Target found in a single load-test report; not reflected in any current monitoring config.',
      ),
    ),
  },
  {
    id: 'nfr-db-availability',
    category: 'availability',
    requirement: 'Primary Database must meet the platform-wide availability SLA.',
    target: '99.99% uptime',
    appliesTo: ['Primary Database'],
    metadata: meta(
      [prov('infra://terraform/production', 'source-code', 'extraction-engine', 4)],
      conf('high', 0.91, 'Multi-AZ configuration directly observed in infrastructure code.'),
    ),
  },
  {
    id: 'nfr-card-pci',
    category: 'security',
    requirement: 'Card PANs and CVVs must never be logged in plaintext.',
    target: 'PCI-DSS aligned handling',
    appliesTo: ['Card Issuing Service'],
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/card-issuing',
          'source-code',
          'extraction-engine',
          3,
        ),
      ],
      conf('high', 0.89, 'Redaction of card fields confirmed directly in logging middleware.'),
    ),
  },
  {
    id: 'nfr-kyc-retention',
    category: 'compliance',
    requirement:
      'Applicant identity documents must be retained only as long as required under BSA/AML recordkeeping rules.',
    target: 'Unknown — no documented retention period',
    appliesTo: ['Onboarding & KYC Service', 'Primary Database'],
    metadata: meta(
      [prov('repo://nimbus-financial/services/onboarding', 'source-code', 'inference-engine', 6)],
      conf(
        'inferred',
        0.27,
        'No retention or deletion policy document was found for ApplicantDocument or related identity artifacts — see Gap Analysis.',
      ),
    ),
  },
  {
    id: 'nfr-payments-peak-scale',
    category: 'scalability',
    requirement:
      'Payments & Transfers Service must sustain payday/benefits-day peak transfer volume without degradation.',
    target: '8x baseline throughput (per 2025 capacity planning ticket)',
    appliesTo: ['Payments & Transfers Service'],
    metadata: meta(
      [prov('ticket://JIRA-4790', 'ticket', 'inference-engine', 220)],
      conf(
        'medium',
        0.54,
        'Target comes from a planning ticket, not a load-tested or contractually confirmed figure.',
      ),
    ),
  },
];
