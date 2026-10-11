import type {
  C4Edge,
  C4Node,
  Domain,
  DriftAlert,
  ExecutionFlow,
  ReviewItem,
  SystemSummary,
} from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

export const systemSummary: SystemSummary = {
  id: 'nimbus-financial',
  name: 'Fintech - Banking System (Dummy company used for reverse engineering)',
  description:
    'A digital-first neobank offering checking/savings accounts, card issuing, and P2P payments, integrated with a third-party core banking ledger, card processor, KYC/AML vendor, and ACH payment rail.',
  tags: ['fintech', 'digital-banking', 'payments'],
  lastAnalyzedAt: new Date().toISOString(),
  coverageScore: 0.71,
  totalElements: 131,
  pendingReviewCount: 6,
  driftAlertCount: 4,
};

// ---------------------------------------------------------------------------
// C4 — Context level
// ---------------------------------------------------------------------------

export const contextNodes: C4Node[] = [
  {
    id: 'ctx-customer',
    level: 'context',
    name: 'Customer',
    description: 'Opens accounts, moves money, and manages cards via web or mobile.',
    metadata: meta(
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 14)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'ctx-nimbus',
    level: 'context',
    name: 'Fintech - Banking System Platform',
    description: 'The system under analysis: onboarding, accounts, cards, payments, fraud/AML.',
    metadata: meta(
      [prov('repo://nimbus-financial', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.96),
    ),
  },
  {
    id: 'ctx-core-ledger',
    level: 'context',
    name: 'Ledger One Core Banking',
    description: 'External core banking ledger of record for account balances and postings.',
    metadata: meta(
      [prov('repo://nimbus-financial/src/ledger-adapter', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.92),
    ),
  },
  {
    id: 'ctx-card-processor',
    level: 'context',
    name: 'CardFlex Issuing Network',
    description:
      'External card issuing/processing network handling card creation and authorizations.',
    metadata: meta(
      [prov('repo://nimbus-financial/src/card-issuing', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'ctx-kyc-vendor',
    level: 'context',
    name: 'Sentinel Identity',
    description: 'Third-party KYC/identity verification vendor used during onboarding.',
    metadata: meta(
      [prov('logs://gateway/2026-06', 'log', 'inference-engine', 6)],
      conf('medium', 0.6, 'Only observed via gateway logs; no integration spec on file.'),
    ),
  },
  {
    id: 'ctx-ach-rail',
    level: 'context',
    name: 'PayRail ACH Network',
    description: 'External ACH payment rail used for external transfers and direct deposit.',
    metadata: meta(
      [prov('integration-spec://payrail-ach-v3', 'data-model', 'extraction-engine', 25)],
      conf('high', 0.87),
    ),
  },
  {
    id: 'ctx-credit-bureau',
    level: 'context',
    name: 'Legacy Credit Bureau Feed',
    description:
      'Third-party credit bureau data feed used for credit decisioning; integration status is contested.',
    metadata: meta(
      [
        prov('repo://nimbus-financial/src/credit-decision', 'source-code', 'extraction-engine', 3),
        prov('ticket://JIRA-5510', 'ticket', 'inference-engine', 50),
      ],
      conf(
        'low',
        0.38,
        'Code path is active but a ticket describes migrating away from this feed.',
      ),
    ),
  },
  {
    id: 'ctx-notify',
    level: 'context',
    name: 'Email / SMS / Push Provider',
    description: 'Transactional messaging provider for account and transaction notifications.',
    metadata: meta(
      [prov('repo://nimbus-financial/src/notifications', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.9),
    ),
  },
];

export const contextEdges: C4Edge[] = [
  {
    id: 'e-ctx-1',
    source: 'ctx-customer',
    target: 'ctx-nimbus',
    label: 'opens account, sends money',
    level: 'context',
    metadata: meta(
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 14)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'e-ctx-2',
    source: 'ctx-nimbus',
    target: 'ctx-core-ledger',
    label: 'posts balance changes',
    level: 'context',
    metadata: meta(
      [prov('repo://nimbus-financial/src/ledger-adapter', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.93),
    ),
  },
  {
    id: 'e-ctx-3',
    source: 'ctx-nimbus',
    target: 'ctx-card-processor',
    label: 'issues cards, authorizes spend',
    level: 'context',
    metadata: meta(
      [prov('repo://nimbus-financial/src/card-issuing', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'e-ctx-4',
    source: 'ctx-nimbus',
    target: 'ctx-kyc-vendor',
    label: 'verifies identity',
    level: 'context',
    metadata: meta(
      [prov('logs://gateway/2026-06', 'log', 'inference-engine', 6)],
      conf('medium', 0.6),
    ),
  },
  {
    id: 'e-ctx-5',
    source: 'ctx-nimbus',
    target: 'ctx-ach-rail',
    label: 'initiates/receives ACH transfers',
    level: 'context',
    metadata: meta(
      [prov('integration-spec://payrail-ach-v3', 'data-model', 'extraction-engine', 25)],
      conf('high', 0.87),
    ),
  },
  {
    id: 'e-ctx-6',
    source: 'ctx-nimbus',
    target: 'ctx-credit-bureau',
    label: 'pulls credit data',
    level: 'context',
    metadata: meta(
      [prov('repo://nimbus-financial/src/credit-decision', 'source-code', 'extraction-engine', 3)],
      conf('low', 0.38),
    ),
  },
  {
    id: 'e-ctx-7',
    source: 'ctx-nimbus',
    target: 'ctx-notify',
    label: 'sends notifications',
    level: 'context',
    metadata: meta(
      [prov('repo://nimbus-financial/src/notifications', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.9),
    ),
  },
];

// ---------------------------------------------------------------------------
// C4 — Container level (inside Fintech - Banking System Platform)
// ---------------------------------------------------------------------------

export const containerNodes: C4Node[] = [
  {
    id: 'ctr-banking-app',
    level: 'container',
    name: 'Banking Web/Mobile App',
    technology: 'React, React Native',
    description: 'Customer-facing app for onboarding, accounts, cards, and transfers.',
    metadata: meta(
      [prov('repo://nimbus-financial/apps/banking-app', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.93),
    ),
  },
  {
    id: 'ctr-onboarding',
    level: 'container',
    name: 'Onboarding & KYC Service',
    technology: 'Node.js',
    description: 'Orchestrates identity verification and account activation for new applicants.',
    metadata: meta(
      [prov('repo://nimbus-financial/services/onboarding', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.91),
    ),
  },
  {
    id: 'ctr-ledger-adapter',
    level: 'container',
    name: 'Core Ledger Adapter',
    technology: 'Node.js/Express (disputed)',
    description: 'Adapts account/transaction requests to the Ledger One Core Banking API.',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/ledger-adapter',
          'source-code',
          'extraction-engine',
          3,
        ),
        prov('docs/architecture-2024.pdf', 'technical-doc', 'inference-engine', 190),
      ],
      conf(
        'low',
        0.44,
        'Source code shows Node.js/Express; the 2024 architecture doc describes it as a Java/Spring service. Not yet reconciled.',
      ),
    ),
  },
  {
    id: 'ctr-card-issuing',
    level: 'container',
    name: 'Card Issuing Service',
    technology: 'Go',
    description: 'Issues virtual/physical cards and forwards authorization decisions to CardFlex.',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/card-issuing',
          'source-code',
          'extraction-engine',
          3,
        ),
      ],
      conf('high', 0.92),
    ),
  },
  {
    id: 'ctr-payments',
    level: 'container',
    name: 'Payments & Transfers Service',
    technology: 'Node.js, Temporal',
    description: 'Coordinates P2P transfers and ACH transfers as durable workflows.',
    metadata: meta(
      [prov('repo://nimbus-financial/services/payments', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.89),
    ),
  },
  {
    id: 'ctr-fraud-aml',
    level: 'container',
    name: 'Fraud & AML Monitoring Service',
    technology: 'Python',
    description: 'Screens transactions and applicants for fraud and money-laundering risk.',
    metadata: meta(
      [prov('repo://nimbus-financial/services/fraud-aml', 'source-code', 'extraction-engine', 3)],
      conf(
        'medium',
        0.65,
        'Alert-routing rules beyond the base risk score are not documented anywhere.',
      ),
    ),
  },
  {
    id: 'ctr-credit-decision',
    level: 'container',
    name: 'Credit Decisioning Service',
    technology: 'Python (legacy)',
    description: 'Evaluates credit line applications using bureau data and internal rules.',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/credit-decision',
          'source-code',
          'extraction-engine',
          3,
        ),
        prov('ticket://JIRA-5510', 'ticket', 'inference-engine', 50),
      ],
      conf(
        'low',
        0.4,
        'Active in code; a 2025 ticket proposes replacing the bureau feed but no follow-through is recorded.',
      ),
    ),
  },
  {
    id: 'ctr-notification',
    level: 'container',
    name: 'Notification Service',
    technology: 'Node.js',
    description: 'Sends account, transaction, and dispute notifications by email, SMS, and push.',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/notifications',
          'source-code',
          'extraction-engine',
          3,
        ),
      ],
      conf('high', 0.88),
    ),
  },
  {
    id: 'ctr-ops-console',
    level: 'container',
    name: 'Ops & Support Console',
    technology: 'React',
    description:
      'Internal tool for compliance/support staff to review cases, disputes, and applicants.',
    metadata: meta(
      [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.86),
    ),
  },
  {
    id: 'ctr-db',
    level: 'container',
    name: 'Primary Database',
    technology: 'PostgreSQL',
    description: 'System of record for accounts, customers, cards, and transaction metadata.',
    metadata: meta(
      [prov('data-model://nimbus-schema.sql', 'data-model', 'extraction-engine', 3)],
      conf('high', 0.97),
    ),
  },
  {
    id: 'ctr-event-bus',
    level: 'container',
    name: 'Event Bus',
    technology: 'Kafka',
    description: 'Carries domain events (AccountOpened, TransferInitiated, CardIssued, etc).',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/infra/kafka-topics.yaml',
          'source-code',
          'extraction-engine',
          3,
        ),
      ],
      conf('high', 0.9),
    ),
  },
];

export const containerEdges: C4Edge[] = [
  {
    id: 'e-1',
    source: 'ctr-banking-app',
    target: 'ctr-onboarding',
    label: 'submits application',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'e-2',
    source: 'ctr-onboarding',
    target: 'ctr-fraud-aml',
    label: 'requests identity risk score',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial', 'source-code', 'extraction-engine', 3)],
      conf('medium', 0.66),
    ),
  },
  {
    id: 'e-3',
    source: 'ctr-onboarding',
    target: 'ctr-ledger-adapter',
    label: 'opens ledger account',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'e-4',
    source: 'ctr-banking-app',
    target: 'ctr-payments',
    label: 'initiates transfer',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'e-5',
    source: 'ctr-payments',
    target: 'ctr-ledger-adapter',
    label: 'posts transfer to ledger',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.87),
    ),
  },
  {
    id: 'e-6',
    source: 'ctr-payments',
    target: 'ctr-fraud-aml',
    label: 'screens transaction',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial', 'source-code', 'extraction-engine', 3)],
      conf('medium', 0.62),
    ),
  },
  {
    id: 'e-7',
    source: 'ctr-payments',
    target: 'ctr-event-bus',
    label: 'publishes TransferInitiated',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial/infra', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.85),
    ),
  },
  {
    id: 'e-8',
    source: 'ctr-event-bus',
    target: 'ctr-notification',
    label: 'consumes transaction events',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial/infra', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.85),
    ),
  },
  {
    id: 'e-9',
    source: 'ctr-card-issuing',
    target: 'ctr-ledger-adapter',
    label: 'reserves funds for spend',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.86),
    ),
  },
  {
    id: 'e-10',
    source: 'ctr-onboarding',
    target: 'ctr-credit-decision',
    label: 'requests credit line eval',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial', 'source-code', 'extraction-engine', 3)],
      conf('low', 0.4),
    ),
  },
  {
    id: 'e-11',
    source: 'ctr-payments',
    target: 'ctr-db',
    label: 'reads/writes transfer, account',
    level: 'container',
    metadata: meta(
      [prov('data-model://nimbus-schema.sql', 'data-model', 'extraction-engine', 3)],
      conf('high', 0.94),
    ),
  },
  {
    id: 'e-12',
    source: 'ctr-ops-console',
    target: 'ctr-fraud-aml',
    label: 'reviews flagged case',
    level: 'container',
    metadata: meta(
      [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.84),
    ),
  },
];

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export const domains: Domain[] = [
  {
    id: 'dom-identity',
    name: 'Customer Identity & KYC',
    description: 'Applicant identity capture, verification, and account activation.',
    metadata: meta(
      [prov('repo://nimbus-financial/services/onboarding', 'source-code', 'inference-engine', 4)],
      conf('high', 0.89),
    ),
    aggregates: [
      {
        id: 'agg-applicant',
        name: 'Applicant',
        entities: ['Applicant', 'ApplicantDocument'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/onboarding',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('high', 0.91),
        ),
      },
      {
        id: 'agg-verification',
        name: 'VerificationCheck',
        entities: ['VerificationCheck'],
        metadata: meta(
          [prov('logs://gateway/2026-06', 'log', 'inference-engine', 6)],
          conf('medium', 0.6),
        ),
      },
    ],
  },
  {
    id: 'dom-accounts',
    name: 'Accounts & Balances',
    description: 'Deposit account lifecycle and balance state mirrored from the core ledger.',
    metadata: meta(
      [prov('data-model://nimbus-schema.sql', 'data-model', 'inference-engine', 4)],
      conf('high', 0.93),
    ),
    aggregates: [
      {
        id: 'agg-account',
        name: 'Account',
        entities: ['Account', 'AccountHolder'],
        metadata: meta(
          [prov('data-model://nimbus-schema.sql', 'data-model', 'extraction-engine', 3)],
          conf('high', 0.95),
        ),
      },
      {
        id: 'agg-balance',
        name: 'BalanceSnapshot',
        entities: ['BalanceSnapshot'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/ledger-adapter',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf(
            'medium',
            0.65,
            'Snapshot cadence vs. real-time ledger truth is inconsistently described.',
          ),
        ),
      },
    ],
  },
  {
    id: 'dom-payments',
    name: 'Payments & Transfers',
    description: 'P2P transfers and ACH transfer orchestration.',
    metadata: meta(
      [prov('repo://nimbus-financial/services/payments', 'source-code', 'inference-engine', 4)],
      conf('high', 0.9),
    ),
    aggregates: [
      {
        id: 'agg-transfer',
        name: 'Transfer',
        entities: ['Transfer', 'TransferLeg'],
        metadata: meta(
          [prov('data-model://nimbus-schema.sql', 'data-model', 'extraction-engine', 3)],
          conf('high', 0.94),
        ),
      },
      {
        id: 'agg-payee',
        name: 'Payee',
        entities: ['Payee'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/payments',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('high', 0.87),
        ),
      },
    ],
  },
  {
    id: 'dom-cards',
    name: 'Card Issuing',
    description: 'Virtual and physical card issuance and spend authorization.',
    metadata: meta(
      [prov('repo://nimbus-financial/services/card-issuing', 'source-code', 'inference-engine', 4)],
      conf('high', 0.9),
    ),
    aggregates: [
      {
        id: 'agg-card',
        name: 'Card',
        entities: ['Card', 'CardControl'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/card-issuing',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('high', 0.91),
        ),
      },
      {
        id: 'agg-authorization',
        name: 'CardAuthorization',
        entities: ['CardAuthorization'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/card-issuing',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('medium', 0.68),
        ),
      },
    ],
  },
  {
    id: 'dom-fraud-aml',
    name: 'Fraud & AML',
    description: 'Risk scoring and case management for suspicious applicants and transactions.',
    metadata: meta(
      [prov('repo://nimbus-financial/services/fraud-aml', 'source-code', 'inference-engine', 4)],
      conf(
        'medium',
        0.6,
        'Alert-routing rules beyond the base risk score are not documented in any source.',
      ),
    ),
    aggregates: [
      {
        id: 'agg-riskcase',
        name: 'ComplianceCase',
        entities: ['ComplianceCase', 'RiskSignal'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/fraud-aml',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('medium', 0.62),
        ),
      },
      {
        id: 'agg-watchlist',
        name: 'WatchlistMatch',
        entities: ['WatchlistMatch'],
        metadata: meta(
          [prov('logs://gateway/2026-06', 'log', 'inference-engine', 6)],
          conf('low', 0.36, 'Only inferred from gateway logs; no schema or spec found.'),
        ),
      },
    ],
  },
  {
    id: 'dom-credit',
    name: 'Credit & Lending',
    description: 'Credit line application evaluation and limit management.',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/credit-decision',
          'source-code',
          'inference-engine',
          4,
        ),
      ],
      conf(
        'low',
        0.42,
        'Domain boundary is clear but the underlying bureau feed is being replaced — see Gap Analysis.',
      ),
    ),
    aggregates: [
      {
        id: 'agg-creditline',
        name: 'CreditLine',
        entities: ['CreditLine', 'CreditLimitChange'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/credit-decision',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('medium', 0.58),
        ),
      },
      {
        id: 'agg-bureaupull',
        name: 'BureauPull',
        entities: ['BureauPull'],
        metadata: meta(
          [prov('ticket://JIRA-5510', 'ticket', 'inference-engine', 50)],
          conf(
            'low',
            0.35,
            'Feed is being replaced; current shape may not reflect the eventual integration.',
          ),
        ),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Execution flows
// ---------------------------------------------------------------------------

export const executionFlows: ExecutionFlow[] = [
  {
    id: 'flow-account-opening',
    name: 'Account Opening & KYC Flow',
    description: 'From application submission through an activated, funded account.',
    triggerScreen: 'Apply Screen',
    metadata: meta(
      [prov('repo://nimbus-financial/services/onboarding', 'source-code', 'inference-engine', 4)],
      conf('high', 0.86),
    ),
    steps: [
      {
        id: 'step-1',
        name: 'Capture Applicant Info',
        description: 'Collects identity and contact details from the applicant.',
        readsEntities: [],
        writesEntities: ['Applicant', 'ApplicantDocument'],
        metadata: meta(
          [prov('repo://nimbus-financial/apps/banking-app', 'source-code', 'extraction-engine', 3)],
          conf('high', 0.9),
        ),
      },
      {
        id: 'step-2',
        name: 'Verify Identity',
        description: 'Calls Sentinel Identity to verify the applicant and documents.',
        readsEntities: ['Applicant', 'ApplicantDocument'],
        writesEntities: ['VerificationCheck'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/onboarding',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf(
            'medium',
            0.6,
            'Failure/retry behavior for verification timeouts is not documented.',
          ),
        ),
      },
      {
        id: 'step-3',
        name: 'Screen for Risk',
        description: 'Fraud & AML Monitoring Service checks watchlists and computes a risk score.',
        readsEntities: ['Applicant'],
        writesEntities: ['ComplianceCase'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/fraud-aml',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('medium', 0.62, 'Score thresholds that trigger manual review are not documented.'),
        ),
      },
      {
        id: 'step-4',
        name: 'Open Ledger Account',
        description: 'Creates the account of record in Ledger One Core Banking.',
        readsEntities: [],
        writesEntities: ['Account'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/ledger-adapter',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf(
            'medium',
            0.56,
            'Retry/timeout behavior on this call is inconsistently documented between code and the 2024 architecture doc.',
          ),
        ),
      },
      {
        id: 'step-5',
        name: 'Activate Account',
        description: 'Marks the account ACTIVE and publishes AccountOpened.',
        readsEntities: [],
        writesEntities: ['Account'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/onboarding',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('high', 0.89),
        ),
      },
      {
        id: 'step-6',
        name: 'Send Welcome Notification',
        description: 'Notification Service emails/SMS a welcome and next-steps message.',
        readsEntities: ['Account', 'Applicant'],
        writesEntities: [],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/notifications',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('high', 0.87),
        ),
      },
    ],
  },
  {
    id: 'flow-transaction-dispute',
    name: 'Transaction Dispute Flow',
    description: 'Initiated by a compliance/support agent from the Ops & Support Console.',
    triggerScreen: 'Ops Console — Transaction Detail',
    metadata: meta(
      [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'inference-engine', 4)],
      conf('medium', 0.63),
    ),
    steps: [
      {
        id: 'step-d1',
        name: 'Validate Dispute Eligibility',
        description: 'Checks transaction status and dispute window.',
        readsEntities: ['Transfer'],
        writesEntities: [],
        metadata: meta(
          [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'extraction-engine', 3)],
          conf('high', 0.84),
        ),
      },
      {
        id: 'step-d2',
        name: 'Open Compliance Case',
        description: 'Creates a ComplianceCase and requests supporting evidence.',
        readsEntities: ['Transfer'],
        writesEntities: ['ComplianceCase'],
        metadata: meta(
          [prov('repo://nimbus-financial/apps/ops-console', 'source-code', 'extraction-engine', 3)],
          conf(
            'medium',
            0.6,
            'Evidence requirements vary by dispute reason code and are only partly documented.',
          ),
        ),
      },
      {
        id: 'step-d3',
        name: 'Reverse or Adjust Ledger Entry',
        description: 'Calls Ledger One to reverse or adjust the disputed posting.',
        readsEntities: ['Account'],
        writesEntities: ['BalanceSnapshot'],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/ledger-adapter',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('medium', 0.58, 'Partial-amount dispute handling is unclear from code alone.'),
        ),
      },
      {
        id: 'step-d4',
        name: 'Notify Customer',
        description: 'Sends dispute outcome notification.',
        readsEntities: ['Applicant', 'ComplianceCase'],
        writesEntities: [],
        metadata: meta(
          [
            prov(
              'repo://nimbus-financial/services/notifications',
              'source-code',
              'extraction-engine',
              3,
            ),
          ],
          conf('high', 0.85),
        ),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Review items (queue for the Human Review & Correction Loop)
// ---------------------------------------------------------------------------

export const reviewItems: ReviewItem[] = [
  {
    id: 'rev-1',
    elementType: 'Container',
    elementName: 'Core Ledger Adapter — technology',
    currentValue: 'Node.js/Express (from source code)',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/ledger-adapter',
          'source-code',
          'extraction-engine',
          3,
        ),
        prov('docs/architecture-2024.pdf', 'technical-doc', 'inference-engine', 190),
      ],
      conf('low', 0.44, 'Two sources disagree on the implementation language.'),
    ),
    conflict: [
      {
        sourceId: 'repo://nimbus-financial/services/ledger-adapter',
        sourceLabel: 'Source code (current)',
        value: 'Node.js / Express',
      },
      {
        sourceId: 'docs/architecture-2024.pdf',
        sourceLabel: 'Architecture doc (2024)',
        value: 'Java / Spring Boot',
      },
    ],
    status: 'pending',
  },
  {
    id: 'rev-2',
    elementType: 'Container',
    elementName: 'Credit Decisioning Service — status',
    currentValue: 'Active, uses Legacy Credit Bureau Feed',
    metadata: meta(
      [
        prov(
          'repo://nimbus-financial/services/credit-decision',
          'source-code',
          'extraction-engine',
          3,
        ),
        prov('ticket://JIRA-5510', 'ticket', 'inference-engine', 50),
      ],
      conf(
        'low',
        0.4,
        'Code is actively invoked; a ticket proposes replacing the bureau feed with no evidence it happened.',
      ),
    ),
    conflict: [
      {
        sourceId: 'repo://nimbus-financial/services/credit-decision',
        sourceLabel: 'Source code',
        value: 'Active — calls legacy bureau feed',
      },
      {
        sourceId: 'ticket://JIRA-5510',
        sourceLabel: 'JIRA-5510 (2025)',
        value: 'Proposed migration to a new bureau vendor',
      },
    ],
    status: 'pending',
  },
  {
    id: 'rev-3',
    elementType: 'Aggregate',
    elementName: 'WatchlistMatch — domain ownership',
    currentValue: 'Owned by Fraud & AML domain (inferred)',
    metadata: meta(
      [prov('logs://gateway/2026-06', 'log', 'inference-engine', 6)],
      conf(
        'inferred',
        0.32,
        'Only inferred from gateway logs; no code owner or schema comment found.',
      ),
    ),
    status: 'pending',
  },
  {
    id: 'rev-4',
    elementType: 'Flow Step',
    elementName: 'Screen for Risk — manual review threshold',
    currentValue: 'Unknown — no threshold documented',
    metadata: meta(
      [prov('repo://nimbus-financial/services/fraud-aml', 'source-code', 'extraction-engine', 3)],
      conf(
        'inferred',
        0.28,
        'The score is computed and stored, but the logic that routes cases to manual review is not present in any ingested source.',
      ),
    ),
    status: 'pending',
  },
  {
    id: 'rev-5',
    elementType: 'Aggregate',
    elementName: 'ApplicantDocument — retention policy',
    currentValue: 'Unknown',
    metadata: meta(
      [prov('repo://nimbus-financial/services/onboarding', 'source-code', 'extraction-engine', 3)],
      conf(
        'low',
        0.34,
        'Identity documents are stored but no retention/compliance documentation was found — flagged given KYC/PII sensitivity.',
      ),
    ),
    status: 'pending',
  },
  {
    id: 'rev-6',
    elementType: 'Entity',
    elementName: 'Account — schema',
    currentValue: 'Account(id, holder_id, type, status, currency, opened_at, ...)',
    metadata: meta(
      [prov('data-model://nimbus-schema.sql', 'data-model', 'extraction-engine', 3)],
      conf('high', 0.95),
    ),
    status: 'confirmed',
  },
];

// ---------------------------------------------------------------------------
// Drift alerts
// ---------------------------------------------------------------------------

export const driftAlerts: DriftAlert[] = [
  {
    id: 'drift-1',
    elementName: 'Fraud & AML Monitoring Service',
    changeType: 'modified',
    description:
      'New outbound call to a third-party watchlist screening endpoint detected since the last full analysis run.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
  {
    id: 'drift-2',
    elementName: 'Notification Service',
    changeType: 'added',
    description:
      'New push-notification channel added alongside the existing email and SMS channels.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
  },
  {
    id: 'drift-3',
    elementName: 'Credit Decisioning Service',
    changeType: 'modified',
    description:
      'Bureau feed call now includes a soft-pull flag; contradicts the migration ticket on file.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
  },
  {
    id: 'drift-4',
    elementName: 'Card Issuing Service',
    changeType: 'added',
    description:
      'New virtual-card-only issuance path added, bypassing physical card fulfillment entirely.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 13).toISOString(),
  },
];
