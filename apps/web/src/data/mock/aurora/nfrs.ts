import type { NonFunctionalRequirement } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

export const nonFunctionalRequirements: NonFunctionalRequirement[] = [
  {
    id: 'nfr-checkout-latency',
    category: 'performance',
    requirement: 'Checkout Service must respond within acceptable latency under normal load.',
    target: 'p95 < 400ms',
    appliesTo: ['Checkout Service'],
    metadata: meta(
      [prov('docs/load-test-2025.pdf', 'technical-doc', 'inference-engine', 90)],
      conf(
        'medium',
        0.58,
        'Target found in a single load-test report; not reflected in any current monitoring config.',
      ),
    ),
  },
  {
    id: 'nfr-db-availability',
    category: 'availability',
    requirement: 'Primary Database must meet the platform-wide availability SLA.',
    target: '99.95% uptime',
    appliesTo: ['Primary Database'],
    metadata: meta(
      [prov('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.9, 'Multi-AZ configuration directly observed in infrastructure code.'),
    ),
  },
  {
    id: 'nfr-payments-pci',
    category: 'security',
    requirement: 'Payment data must never be logged in plaintext.',
    target: 'PCI-DSS aligned handling',
    appliesTo: ['Payments Gateway Adapter'],
    metadata: meta(
      [
        prov(
          'repo://aurora-commerce/services/payments-adapter',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.88, 'Redaction of card fields confirmed directly in logging middleware.'),
    ),
  },
  {
    id: 'nfr-pii-retention',
    category: 'compliance',
    requirement:
      'Customer PII and device fingerprints must be retained only as long as legally required.',
    target: 'Unknown — no documented retention period',
    appliesTo: ['Fraud Detection Service', 'Primary Database'],
    metadata: meta(
      [prov('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
      conf(
        'inferred',
        0.25,
        'No retention or deletion policy document was found for DeviceFingerprint or related fraud signals — see Gap Analysis.',
      ),
    ),
  },
  {
    id: 'nfr-inventory-peak-scale',
    category: 'scalability',
    requirement: 'Inventory Service must sustain seasonal peak order volume without degradation.',
    target: '10x baseline throughput (Black Friday peak, per 2025 planning ticket)',
    appliesTo: ['Inventory Service'],
    metadata: meta(
      [prov('ticket://JIRA-3190', 'ticket', 'inference-engine', 240)],
      conf(
        'medium',
        0.55,
        'Target comes from a planning ticket, not a load-tested or contractually confirmed figure.',
      ),
    ),
  },
];
