import type { Epic } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

export const epics: Epic[] = [
  {
    id: 'epic-onboarding-kyc',
    name: 'Onboarding & KYC',
    description:
      'Everything needed to take an applicant from signup to an activated, funded account.',
    metadata: meta(
      [prov('repo://nimbus-financial/services/onboarding', 'source-code', 'inference-engine', 4)],
      conf('high', 0.85),
    ),
    features: [
      {
        id: 'feature-applicant-verification',
        name: 'Applicant Verification',
        description: 'Verify applicant identity before an account can be opened.',
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/onboarding',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('high', 0.88),
        ),
        stories: [
          {
            id: 'story-submit-identity',
            title: 'As an applicant, I can submit my identity documents',
            description:
              'Document uploads and basic identity info are captured before verification begins.',
            acceptanceCriteria: [
              {
                id: 'ac-1',
                description: 'Applicant cannot proceed without a government-issued ID upload.',
              },
              {
                id: 'ac-2',
                description:
                  'Duplicate applications with the same SSN are flagged before submission.',
              },
            ],
            metadata: meta(
              [
                prov(
                  'repo://nimbus-financial/apps/banking-app',
                  'source-code',
                  'extraction-engine',
                  3,
                ),
              ],
              conf('high', 0.86),
            ),
          },
          {
            id: 'story-account-on-verification',
            title: 'As the platform, an account opens only once verification passes',
            description:
              'An Account is created in the ledger only after identity verification succeeds.',
            acceptanceCriteria: [
              { id: 'ac-3', description: 'Account remains unopened if verification fails.' },
              {
                id: 'ac-4',
                description:
                  'Applicant sees an activation screen only after the account is ACTIVE.',
              },
            ],
            metadata: meta(
              [
                prov(
                  'repo://nimbus-financial/services/onboarding',
                  'source-code',
                  'extraction-engine',
                  3,
                ),
              ],
              conf('high', 0.9),
            ),
          },
        ],
      },
      {
        id: 'feature-applicant-risk-screening',
        name: 'Applicant Risk Screening',
        description: 'Flag suspicious applicants for manual compliance review before activation.',
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/fraud-aml',
              'source-code',
              'inference-engine',
              4,
            ),
          ],
          conf(
            'medium',
            0.62,
            'The feature boundary is clear; the decisioning rules within it are not.',
          ),
        ),
        stories: [
          {
            id: 'story-flag-suspicious-applicants',
            title: 'As the platform, suspicious applicants are flagged for review',
            description:
              'Applicants scoring above an undocumented risk threshold are routed to a ComplianceCase.',
            acceptanceCriteria: [
              {
                id: 'ac-5',
                description:
                  'A ComplianceCase is created when the risk score exceeds the threshold.',
              },
              {
                id: 'ac-6',
                description: '(Unverified) Threshold value and manual-review routing logic.',
              },
            ],
            metadata: meta(
              [
                prov(
                  'repo://nimbus-financial/services/fraud-aml',
                  'source-code',
                  'extraction-engine',
                  3,
                ),
              ],
              conf(
                'low',
                0.42,
                'Story recovered from code paths; the acceptance criteria around thresholds are inferred, not confirmed.',
              ),
            ),
          },
        ],
      },
    ],
  },
  {
    id: 'epic-disputes-support',
    name: 'Transaction Disputes & Support',
    description: 'Compliance-analyst-driven dispute validation and resolution.',
    metadata: meta(
      [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'inference-engine', 4)],
      conf('high', 0.8),
    ),
    features: [
      {
        id: 'feature-dispute-eligibility',
        name: 'Dispute Eligibility',
        description: 'Determine whether a transaction is still within its dispute window.',
        metadata: meta(
          [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'extraction-engine', 3)],
          conf('high', 0.84),
        ),
        stories: [
          {
            id: 'story-check-dispute-eligibility',
            title: 'As a compliance analyst, I can check if a transaction is eligible for dispute',
            description:
              'The console surfaces transaction status and dispute-window remaining before allowing a case to open.',
            acceptanceCriteria: [
              {
                id: 'ac-7',
                description:
                  'Transactions outside the dispute window are blocked from opening a case.',
              },
            ],
            metadata: meta(
              [
                prov(
                  'repo://nimbus-financial/apps/ops-console',
                  'source-code',
                  'extraction-engine',
                  3,
                ),
              ],
              conf('high', 0.84),
            ),
          },
        ],
      },
      {
        id: 'feature-dispute-resolution',
        name: 'Dispute Resolution',
        description: 'Reverse or adjust ledger entries and reconcile account balances.',
        metadata: meta(
          [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'extraction-engine', 3)],
          conf('medium', 0.6, 'Partial-amount dispute handling is unclear from code alone.'),
        ),
        stories: [
          {
            id: 'story-resolve-dispute',
            title: 'As a compliance analyst, I can reverse or adjust a disputed transaction',
            description:
              'A BalanceSnapshot is updated and Ledger One Core Banking is called to reverse or adjust the posting.',
            acceptanceCriteria: [
              {
                id: 'ac-8',
                description:
                  'Full reversals restore the account balance to its pre-transaction state.',
              },
              {
                id: 'ac-9',
                description: '(Unverified) Partial-adjustment behaviour for split transactions.',
              },
            ],
            metadata: meta(
              [
                prov(
                  'repo://nimbus-financial/apps/ops-console',
                  'source-code',
                  'extraction-engine',
                  3,
                ),
              ],
              conf('medium', 0.58),
            ),
          },
        ],
      },
    ],
  },
];
