import type { GapItem } from '../../types.js';

export const gapItems: GapItem[] = [
  {
    id: 'gap-fraud-thresholds',
    area: 'Fraud/AML decisioning rules',
    description:
      'No source documents the risk-score thresholds that route an applicant or transaction to auto-approve, manual review, or auto-deny.',
    missingInputs: ['AML policy documentation', 'A walkthrough session with the compliance team'],
    severity: 'high',
    suggestedAction:
      'Request the compliance team’s internal runbook, or schedule a short interview to capture the thresholds.',
  },
  {
    id: 'gap-credit-bureau-migration',
    area: 'Credit bureau feed migration status',
    description:
      'A 2025 ticket proposes replacing the Legacy Credit Bureau Feed, but the Credit Decisioning Service still calls it in production and a recent change added a soft-pull flag — a direct contradiction.',
    missingInputs: [
      'Updated ticket status from the credit team',
      'Current bureau migration roadmap, if one exists',
    ],
    severity: 'high',
    suggestedAction:
      'Verify the real migration timeline directly with the credit/lending team before relying on either source.',
  },
  {
    id: 'gap-watchlist-ownership',
    area: 'Watchlist match ownership',
    description:
      'No team or individual could be identified as the current owner of the WatchlistMatch aggregate.',
    missingInputs: [
      'Team/ownership metadata (e.g. CODEOWNERS)',
      'Recent commit history with author-to-team mapping',
    ],
    severity: 'medium',
    suggestedAction:
      'Confirm with engineering leadership which team currently maintains this capability.',
  },
  {
    id: 'gap-kyc-retention-policy',
    area: 'KYC document retention policy',
    description:
      'ApplicantDocument and related identity artifacts are stored with no documented retention or deletion policy, despite being subject to BSA/AML recordkeeping requirements.',
    missingInputs: ['A data retention policy document', 'Legal/compliance sign-off record'],
    severity: 'blocking',
    suggestedAction:
      'Escalate to compliance before this system is relied on for any regulatory audit.',
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
