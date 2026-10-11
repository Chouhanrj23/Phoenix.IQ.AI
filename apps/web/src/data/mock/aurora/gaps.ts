import type { GapItem } from '../../types.js';

export const gapItems: GapItem[] = [
  {
    id: 'gap-fraud-thresholds',
    area: 'Fraud decisioning rules',
    description:
      'No source documents the risk-score thresholds that route an order to auto-approve, manual review, or auto-deny.',
    missingInputs: ['Fraud policy documentation', 'A walkthrough session with the fraud team'],
    severity: 'high',
    suggestedAction:
      'Request the fraud team’s internal runbook, or schedule a short interview to capture the thresholds.',
  },
  {
    id: 'gap-loyalty-ownership',
    area: 'Loyalty program ownership',
    description:
      'No team or individual could be identified as the current owner of the LoyaltyAccount aggregate.',
    missingInputs: [
      'Team/ownership metadata (e.g. CODEOWNERS)',
      'Recent commit history with author-to-team mapping',
    ],
    severity: 'medium',
    suggestedAction:
      'Confirm with engineering leadership which team currently maintains this capability.',
  },
  {
    id: 'gap-erp-deprecation',
    area: 'Legacy ERP deprecation status',
    description:
      'A 2025 ticket proposes deprecating the ERP connector, but the connector runs nightly in production and its schedule was recently changed to twice daily — a direct contradiction.',
    missingInputs: [
      'Updated ticket status from the platform team',
      'Current ERP migration roadmap, if one exists',
    ],
    severity: 'high',
    suggestedAction:
      'Verify the real deprecation timeline directly with the platform team before relying on either source.',
  },
  {
    id: 'gap-pii-retention-policy',
    area: 'PII retention policy',
    description:
      'DeviceFingerprint and related fraud signals are stored with no documented retention or deletion policy, despite being personally identifying.',
    missingInputs: ['A data retention policy document', 'Legal/compliance sign-off record'],
    severity: 'blocking',
    suggestedAction:
      'Escalate to compliance before this system is used in any regulated-data context.',
  },
  {
    id: 'gap-component-level-detail',
    area: 'Component-level architecture',
    description:
      'Only Context and Container C4 levels were recoverable. No ingested source was granular enough to derive Component-level detail for any container.',
    missingInputs: [
      'A source-code walkthrough at module/function level',
      'Sequence diagrams, if any exist',
    ],
    severity: 'low',
    suggestedAction:
      'Optional — only pursue if deeper implementation detail is required for a specific initiative.',
  },
];
