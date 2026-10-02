/**
 * Static seed data for the Phase 1 read endpoints.
 *
 * Mirrors the "Aurora Commerce" fixture dataset already used by
 * apps/web/src/data/mock (the demo the UI ships with today) so that
 * VITE_DATA_SOURCE=mock and VITE_DATA_SOURCE=api render the same content.
 * apps/api cannot import apps/web directly, so this is a self-contained
 * copy scoped to the six Phase 1 functional areas — no persistence layer
 * yet, per the Phase 1 scope.
 */

import type {
  Confidence,
  ConfidenceLevel,
  Provenance,
  SourceType,
  C4Edge,
  C4Node,
  Domain,
  DriftAlert,
  DriftRun,
  GapItem,
  GraphElementMetadata,
  Integration,
  DeploymentNode,
  NonFunctionalRequirement,
  ReviewItem,
  SystemSummary,
} from '@phoenix-ai/shared';

function conf(level: ConfidenceLevel, score?: number, rationale?: string): Confidence {
  return { level, score, rationale };
}

function meta(provenance: Provenance[], confidence: Confidence): GraphElementMetadata {
  return { provenance, confidence };
}

// System Summary (P1-03), Architecture (P1-04), Domain Model (P1-05),
// Integrations (P1-06), Deployment/NFR (P1-07), and Review (P1-08)
// responses must be deterministic, so their provenance timestamps are
// computed from a fixed anchor instead of `new Date()` at module-load time.
// `driftAlerts.detectedAt` (below, part of P1-08) is deliberately NOT
// converted: it intentionally reads as "recently detected" relative to
// whenever the demo is viewed, matching apps/web's mock provider exactly
// (ported from the same fixture) — this is demo-freshness behavior, not
// oversight. `gapItems` carries no provenance at all (no `metadata` field
// on the GapItem contract), so there is nothing to convert there.
const SEED_ANCHOR_MS = Date.parse('2026-08-01T00:00:00.000Z');

function daysBeforeAnchorIso(days: number): string {
  return new Date(SEED_ANCHOR_MS - days * 24 * 60 * 60 * 1000).toISOString();
}

function provFixed(
  sourceId: string,
  sourceType: SourceType,
  derivedBy: string,
  daysAgo = 3,
): Provenance {
  return { sourceId, sourceType, derivedBy, derivedAt: daysBeforeAnchorIso(daysAgo) };
}

// ---------------------------------------------------------------------------
// System summary
// ---------------------------------------------------------------------------

export const systemSummary: SystemSummary = {
  id: 'aurora-commerce',
  name: 'Aurora Commerce (Dummy company used for reverse engineering)',
  description:
    'A mid-size e-commerce platform handling storefront browsing, checkout, payments, fraud screening, and fulfillment across web and mobile, integrated with a legacy ERP for finance and inventory reconciliation.',
  tags: ['e-commerce', 'payments', 'fulfillment'],
  lastAnalyzedAt: '2026-08-01T00:00:00.000Z', // fixed anchor — deterministic per P1-03
  coverageScore: 0.78,
  totalElements: 142,
  pendingReviewCount: 5,
  driftAlertCount: 3,
};

// ---------------------------------------------------------------------------
// Architecture — C4 Context level
// ---------------------------------------------------------------------------

export const contextNodes: C4Node[] = [
  {
    id: 'ctx-customer',
    level: 'context',
    name: 'Customer',
    description: 'Shops, checks out, and manages orders via web or mobile.',
    metadata: meta(
      [provFixed('docs/personas.md', 'business-doc', 'inference-engine', 12)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'ctx-aurora',
    level: 'context',
    name: 'Aurora Commerce Platform',
    description: 'The system under analysis: storefront, checkout, payments, fraud, fulfillment.',
    metadata: meta(
      [provFixed('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.97),
    ),
  },
  {
    id: 'ctx-payment-processor',
    level: 'context',
    name: 'Meridian Pay',
    description: 'External payment processor handling card authorization and settlement.',
    metadata: meta(
      [provFixed('repo://aurora-commerce/src/payments', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.93),
    ),
  },
  {
    id: 'ctx-fraud-ml',
    level: 'context',
    name: 'RiskShield ML API',
    description: 'Third-party fraud scoring API called during checkout.',
    metadata: meta(
      [provFixed('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
      conf('medium', 0.62, 'Only observed via gateway logs; no integration spec on file.'),
    ),
  },
  {
    id: 'ctx-warehouse',
    level: 'context',
    name: 'Warehouse & 3PL System',
    description: 'External logistics provider handling shipment and inventory allocation.',
    metadata: meta(
      [provFixed('integration-spec://warehouse-3pl-v2', 'data-model', 'extraction-engine', 20)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'ctx-legacy-erp',
    level: 'context',
    name: 'Legacy ERP',
    description: 'Finance and inventory system of record; integration status is contested.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/src/erp-connector',
          'source-code',
          'extraction-engine',
          2,
        ),
        provFixed('ticket://JIRA-4821', 'ticket', 'inference-engine', 45),
      ],
      conf('low', 0.4, 'Code path is active but a ticket describes it as deprecated.'),
    ),
  },
  {
    id: 'ctx-notify',
    level: 'context',
    name: 'Email / SMS Provider',
    description: 'Transactional messaging provider for order and shipment notifications.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/src/notifications',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.91),
    ),
  },
];

export const contextEdges: C4Edge[] = [
  {
    id: 'e-ctx-1',
    source: 'ctx-customer',
    target: 'ctx-aurora',
    label: 'browses, checks out',
    level: 'context',
    metadata: meta(
      [provFixed('docs/personas.md', 'business-doc', 'inference-engine', 12)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'e-ctx-2',
    source: 'ctx-aurora',
    target: 'ctx-payment-processor',
    label: 'authorizes payment',
    level: 'context',
    metadata: meta(
      [provFixed('repo://aurora-commerce/src/payments', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.95),
    ),
  },
  {
    id: 'e-ctx-3',
    source: 'ctx-aurora',
    target: 'ctx-fraud-ml',
    label: 'requests risk score',
    level: 'context',
    metadata: meta(
      [provFixed('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
      conf('medium', 0.6),
    ),
  },
  {
    id: 'e-ctx-4',
    source: 'ctx-aurora',
    target: 'ctx-warehouse',
    label: 'reserves & ships inventory',
    level: 'context',
    metadata: meta(
      [provFixed('integration-spec://warehouse-3pl-v2', 'data-model', 'extraction-engine', 20)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'e-ctx-5',
    source: 'ctx-aurora',
    target: 'ctx-legacy-erp',
    label: 'syncs finance & inventory',
    level: 'context',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/src/erp-connector',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('low', 0.4),
    ),
  },
  {
    id: 'e-ctx-6',
    source: 'ctx-aurora',
    target: 'ctx-notify',
    label: 'sends notifications',
    level: 'context',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/src/notifications',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.9),
    ),
  },
];

// ---------------------------------------------------------------------------
// Architecture — C4 Container level
// ---------------------------------------------------------------------------

export const containerNodes: C4Node[] = [
  {
    id: 'ctr-storefront',
    level: 'container',
    name: 'Storefront Web/Mobile',
    technology: 'React, React Native',
    description: 'Customer-facing browsing, cart, and checkout UI.',
    metadata: meta(
      [provFixed('repo://aurora-commerce/apps/storefront', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.94),
    ),
  },
  {
    id: 'ctr-checkout',
    level: 'container',
    name: 'Checkout Service',
    technology: 'Node.js',
    description: 'Orchestrates cart validation, order creation, and payment/fraud calls.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/checkout',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.92),
    ),
  },
  {
    id: 'ctr-order-orch',
    level: 'container',
    name: 'Order Orchestrator',
    technology: 'Node.js, Temporal',
    description: 'Coordinates the multi-step order lifecycle as a durable workflow.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/order-orchestrator',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.9),
    ),
  },
  {
    id: 'ctr-payments',
    level: 'container',
    name: 'Payments Gateway Adapter',
    technology: 'Node.js/Express (disputed)',
    description: 'Adapts checkout requests to the Meridian Pay API.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/payments-adapter',
          'source-code',
          'extraction-engine',
          2,
        ),
        provFixed('docs/architecture-2024.pdf', 'technical-doc', 'inference-engine', 180),
      ],
      conf(
        'low',
        0.45,
        'Source code shows Node.js/Express; the 2024 architecture doc describes it as a Java/Spring service. Not yet reconciled.',
      ),
    ),
  },
  {
    id: 'ctr-inventory',
    level: 'container',
    name: 'Inventory Service',
    technology: 'Go',
    description: 'Tracks stock levels and reserves inventory for orders.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/inventory',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.93),
    ),
  },
  {
    id: 'ctr-fraud',
    level: 'container',
    name: 'Fraud Detection Service',
    technology: 'Python',
    description: 'Aggregates signals and calls RiskShield ML for a risk score.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/fraud-detection',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('medium', 0.68, 'Decisioning rationale beyond the ML call is not documented anywhere.'),
    ),
  },
  {
    id: 'ctr-notification',
    level: 'container',
    name: 'Notification Service',
    technology: 'Node.js',
    description: 'Sends order, shipment, and refund notifications by email and SMS.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/notifications',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.89),
    ),
  },
  {
    id: 'ctr-csr-portal',
    level: 'container',
    name: 'Customer Service Portal',
    technology: 'React',
    description: 'Internal tool for support agents to manage orders, returns, and refunds.',
    metadata: meta(
      [provFixed('repo://aurora-commerce/apps/csr-portal', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.87),
    ),
  },
  {
    id: 'ctr-erp-connector',
    level: 'container',
    name: 'Legacy ERP Connector',
    technology: 'Java',
    description: 'Batch-syncs orders and inventory adjustments to the legacy ERP nightly.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/erp-connector',
          'source-code',
          'extraction-engine',
          2,
        ),
        provFixed('ticket://JIRA-4821', 'ticket', 'inference-engine', 45),
      ],
      conf(
        'low',
        0.4,
        'Active in code; a 2025 ticket proposed deprecating it but no follow-through is recorded.',
      ),
    ),
  },
  {
    id: 'ctr-db',
    level: 'container',
    name: 'Primary Database',
    technology: 'PostgreSQL',
    description: 'System of record for orders, customers, and catalog data.',
    metadata: meta(
      [provFixed('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
      conf('high', 0.98),
    ),
  },
  {
    id: 'ctr-event-bus',
    level: 'container',
    name: 'Event Bus',
    technology: 'Kafka',
    description: 'Carries domain events (OrderPlaced, PaymentAuthorized, ShipmentCreated, etc).',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/infra/kafka-topics.yaml',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.91),
    ),
  },
];

export const containerEdges: C4Edge[] = [
  {
    id: 'e-1',
    source: 'ctr-storefront',
    target: 'ctr-checkout',
    label: 'submits cart / checkout',
    level: 'container',
    metadata: meta(
      [provFixed('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'e-2',
    source: 'ctr-checkout',
    target: 'ctr-order-orch',
    label: 'starts order workflow',
    level: 'container',
    metadata: meta(
      [provFixed('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'e-3',
    source: 'ctr-order-orch',
    target: 'ctr-payments',
    label: 'authorize payment',
    level: 'container',
    metadata: meta(
      [provFixed('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'e-4',
    source: 'ctr-order-orch',
    target: 'ctr-fraud',
    label: 'request risk score',
    level: 'container',
    metadata: meta(
      [provFixed('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
      conf('medium', 0.65),
    ),
  },
  {
    id: 'e-5',
    source: 'ctr-order-orch',
    target: 'ctr-inventory',
    label: 'reserve stock',
    level: 'container',
    metadata: meta(
      [provFixed('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'e-6',
    source: 'ctr-order-orch',
    target: 'ctr-event-bus',
    label: 'publishes OrderPlaced',
    level: 'container',
    metadata: meta(
      [provFixed('repo://aurora-commerce/infra', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.85),
    ),
  },
  {
    id: 'e-7',
    source: 'ctr-event-bus',
    target: 'ctr-notification',
    label: 'consumes order events',
    level: 'container',
    metadata: meta(
      [provFixed('repo://aurora-commerce/infra', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.85),
    ),
  },
  {
    id: 'e-8',
    source: 'ctr-event-bus',
    target: 'ctr-erp-connector',
    label: 'consumes order events',
    level: 'container',
    metadata: meta(
      [provFixed('repo://aurora-commerce/infra', 'source-code', 'extraction-engine', 2)],
      conf('low', 0.4),
    ),
  },
  {
    id: 'e-9',
    source: 'ctr-checkout',
    target: 'ctr-db',
    label: 'reads/writes cart, order',
    level: 'container',
    metadata: meta(
      [provFixed('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
      conf('high', 0.95),
    ),
  },
  {
    id: 'e-10',
    source: 'ctr-csr-portal',
    target: 'ctr-order-orch',
    label: 'issues return/refund',
    level: 'container',
    metadata: meta(
      [provFixed('repo://aurora-commerce/apps/csr-portal', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.85),
    ),
  },
];

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

export const domains: Domain[] = [
  {
    id: 'dom-catalog',
    name: 'Catalog & Pricing',
    description: 'Product listings, categories, and price lists shown in the storefront.',
    metadata: meta(
      [provFixed('data-model://aurora-schema.sql', 'data-model', 'inference-engine', 3)],
      conf('high', 0.92),
    ),
    aggregates: [
      {
        id: 'agg-product',
        name: 'Product',
        entities: ['Product', 'ProductVariant', 'Category'],
        metadata: meta(
          [provFixed('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
          conf('high', 0.95),
        ),
      },
      {
        id: 'agg-pricelist',
        name: 'PriceList',
        entities: ['PriceList', 'PriceRule'],
        metadata: meta(
          [provFixed('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
          conf('high', 0.9),
        ),
      },
    ],
  },
  {
    id: 'dom-ordering',
    name: 'Ordering',
    description: 'Shopping cart through order placement and lifecycle state.',
    metadata: meta(
      [provFixed('repo://aurora-commerce/services/checkout', 'source-code', 'inference-engine', 3)],
      conf('high', 0.91),
    ),
    aggregates: [
      {
        id: 'agg-cart',
        name: 'Cart',
        entities: ['Cart', 'CartLine'],
        metadata: meta(
          [
            provFixed(
              'repo://aurora-commerce/services/checkout',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('high', 0.93),
        ),
      },
      {
        id: 'agg-order',
        name: 'Order',
        entities: ['Order', 'OrderLine', 'OrderStatusHistory'],
        metadata: meta(
          [provFixed('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
          conf('high', 0.96),
        ),
      },
    ],
  },
  {
    id: 'dom-payments',
    name: 'Payments',
    description: 'Payment authorization, capture, and refund processing via Meridian Pay.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/payments-adapter',
          'source-code',
          'inference-engine',
          3,
        ),
      ],
      conf(
        'medium',
        0.6,
        'Container technology is disputed; domain boundary itself is high-confidence.',
      ),
    ),
    aggregates: [
      {
        id: 'agg-payment',
        name: 'Payment',
        entities: ['Payment', 'PaymentAttempt'],
        metadata: meta(
          [
            provFixed(
              'repo://aurora-commerce/services/payments-adapter',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('high', 0.88),
        ),
      },
      {
        id: 'agg-refund',
        name: 'Refund',
        entities: ['Refund'],
        metadata: meta(
          [
            provFixed(
              'repo://aurora-commerce/apps/csr-portal',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('medium', 0.7),
        ),
      },
    ],
  },
  {
    id: 'dom-fraud',
    name: 'Fraud & Risk',
    description: 'Risk scoring and case management for suspicious orders.',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/fraud-detection',
          'source-code',
          'inference-engine',
          3,
        ),
      ],
      conf(
        'medium',
        0.58,
        'Decisioning rules beyond the ML score call are not documented in any source.',
      ),
    ),
    aggregates: [
      {
        id: 'agg-riskcase',
        name: 'RiskCase',
        entities: ['RiskCase', 'RiskSignal'],
        metadata: meta(
          [
            provFixed(
              'repo://aurora-commerce/services/fraud-detection',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('medium', 0.6),
        ),
      },
      {
        id: 'agg-devicefp',
        name: 'DeviceFingerprint',
        entities: ['DeviceFingerprint'],
        metadata: meta(
          [provFixed('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
          conf('low', 0.35, 'Only inferred from gateway logs; no schema or spec found.'),
        ),
      },
    ],
  },
  {
    id: 'dom-fulfillment',
    name: 'Fulfillment',
    description: 'Shipment creation and warehouse inventory allocation.',
    metadata: meta(
      [provFixed('integration-spec://warehouse-3pl-v2', 'data-model', 'inference-engine', 20)],
      conf('high', 0.85),
    ),
    aggregates: [
      {
        id: 'agg-shipment',
        name: 'Shipment',
        entities: ['Shipment', 'ShipmentLine', 'TrackingEvent'],
        metadata: meta(
          [provFixed('integration-spec://warehouse-3pl-v2', 'data-model', 'extraction-engine', 20)],
          conf('high', 0.88),
        ),
      },
      {
        id: 'agg-allocation',
        name: 'WarehouseAllocation',
        entities: ['WarehouseAllocation'],
        metadata: meta(
          [
            provFixed(
              'repo://aurora-commerce/services/inventory',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('high', 0.86),
        ),
      },
    ],
  },
  {
    id: 'dom-customer',
    name: 'Customer',
    description: 'Customer identity, profile, and loyalty program membership.',
    metadata: meta(
      [provFixed('data-model://aurora-schema.sql', 'data-model', 'inference-engine', 3)],
      conf('high', 0.87),
    ),
    aggregates: [
      {
        id: 'agg-profile',
        name: 'CustomerProfile',
        entities: ['CustomerProfile', 'Address'],
        metadata: meta(
          [provFixed('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
          conf('high', 0.92),
        ),
      },
      {
        id: 'agg-loyalty',
        name: 'LoyaltyAccount',
        entities: ['LoyaltyAccount', 'LoyaltyLedgerEntry'],
        metadata: meta(
          [provFixed('wiki://loyalty-program-notes', 'business-doc', 'inference-engine', 60)],
          conf(
            'low',
            0.38,
            'Only a stub wiki page found; ownership and current usage are unclear.',
          ),
        ),
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export const integrations: Integration[] = [
  {
    id: 'int-meridian-pay',
    name: 'Meridian Pay',
    counterpart: 'External payment processor',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged: 'Card token, amount, currency, order reference → authorization/capture result',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/payments-adapter',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.9),
    ),
  },
  {
    id: 'int-riskshield',
    name: 'RiskShield ML API',
    counterpart: 'Third-party fraud scoring service',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged: 'Order + device signals → numeric risk score',
    metadata: meta(
      [provFixed('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
      conf(
        'medium',
        0.6,
        'Only observed via gateway logs; no integration spec on file for request/response schema.',
      ),
    ),
  },
  {
    id: 'int-warehouse-3pl',
    name: 'Warehouse & 3PL System',
    counterpart: 'External logistics provider',
    direction: 'bidirectional',
    protocol: 'REST/HTTPS + nightly SFTP batch',
    dataExchanged: 'Outbound: shipment requests. Inbound: stock levels, tracking events.',
    metadata: meta(
      [provFixed('integration-spec://warehouse-3pl-v2', 'data-model', 'extraction-engine', 20)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'int-legacy-erp',
    name: 'Legacy ERP',
    counterpart: 'Internal finance & inventory system of record',
    direction: 'outbound',
    protocol: 'Nightly batch file (flat-file export)',
    dataExchanged: 'Confirmed orders and inventory adjustments',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/erp-connector',
          'source-code',
          'extraction-engine',
          2,
        ),
        provFixed('ticket://JIRA-4821', 'ticket', 'inference-engine', 45),
      ],
      conf(
        'low',
        0.4,
        'Integration is active in code; a ticket proposes deprecating it with no evidence it happened.',
      ),
    ),
  },
  {
    id: 'int-notify-provider',
    name: 'Email / SMS Provider',
    counterpart: 'Transactional messaging provider',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged: 'Order/shipment/refund events → rendered email or SMS',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/notifications',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf('high', 0.89),
    ),
  },
];

// ---------------------------------------------------------------------------
// Deployment topology
// ---------------------------------------------------------------------------

export const deploymentNodes: DeploymentNode[] = [
  {
    id: 'env-production',
    kind: 'environment',
    name: 'Production (aws us-east-1)',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.92),
    ),
  },
  {
    id: 'env-staging',
    kind: 'environment',
    name: 'Staging (aws us-east-1)',
    metadata: meta(
      [provFixed('infra://terraform/staging', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'inst-storefront-prod',
    kind: 'instance',
    name: 'storefront-web',
    environmentId: 'env-production',
    containerId: 'ctr-storefront',
    runtime: 'ECS Fargate',
    scale: '6 tasks',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'inst-checkout-prod',
    kind: 'instance',
    name: 'checkout-service',
    environmentId: 'env-production',
    containerId: 'ctr-checkout',
    runtime: 'ECS Fargate',
    scale: '4 tasks',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'inst-order-orch-prod',
    kind: 'instance',
    name: 'order-orchestrator',
    environmentId: 'env-production',
    containerId: 'ctr-order-orch',
    runtime: 'ECS Fargate',
    scale: '3 tasks',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.88),
    ),
  },
  {
    id: 'inst-payments-prod',
    kind: 'instance',
    name: 'payments-adapter',
    environmentId: 'env-production',
    containerId: 'ctr-payments',
    runtime: 'ECS Fargate',
    scale: '2 tasks',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf(
        'medium',
        0.55,
        'Instance count confirmed; the underlying runtime/language for this service is disputed (see Review).',
      ),
    ),
  },
  {
    id: 'inst-inventory-prod',
    kind: 'instance',
    name: 'inventory-service',
    environmentId: 'env-production',
    containerId: 'ctr-inventory',
    runtime: 'ECS Fargate',
    scale: '3 tasks',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.87),
    ),
  },
  {
    id: 'inst-fraud-prod',
    kind: 'instance',
    name: 'fraud-detection',
    environmentId: 'env-production',
    containerId: 'ctr-fraud',
    runtime: 'AWS Lambda',
    scale: 'on-demand',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('medium', 0.6),
    ),
  },
  {
    id: 'inst-notification-prod',
    kind: 'instance',
    name: 'notification-service',
    environmentId: 'env-production',
    containerId: 'ctr-notification',
    runtime: 'ECS Fargate',
    scale: '2 tasks',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.86),
    ),
  },
  {
    id: 'inst-erp-prod',
    kind: 'instance',
    name: 'erp-connector',
    environmentId: 'env-production',
    containerId: 'ctr-erp-connector',
    runtime: 'ECS Fargate (scheduled task)',
    scale: '1 task, nightly',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('low', 0.42, 'Schedule contradicts the deprecation ticket on file — see Review.'),
    ),
  },
  {
    id: 'inst-db-prod',
    kind: 'instance',
    name: 'primary-database',
    environmentId: 'env-production',
    containerId: 'ctr-db',
    runtime: 'RDS PostgreSQL, Multi-AZ',
    scale: 'db.r6g.xlarge',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.94),
    ),
  },
  {
    id: 'inst-kafka-prod',
    kind: 'instance',
    name: 'event-bus',
    environmentId: 'env-production',
    containerId: 'ctr-event-bus',
    runtime: 'MSK (Kafka)',
    scale: '3 brokers',
    metadata: meta(
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.89),
    ),
  },
  {
    id: 'inst-storefront-staging',
    kind: 'instance',
    name: 'storefront-web',
    environmentId: 'env-staging',
    containerId: 'ctr-storefront',
    runtime: 'ECS Fargate',
    scale: '1 task',
    metadata: meta(
      [provFixed('infra://terraform/staging', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.85),
    ),
  },
  {
    id: 'inst-checkout-staging',
    kind: 'instance',
    name: 'checkout-service',
    environmentId: 'env-staging',
    containerId: 'ctr-checkout',
    runtime: 'ECS Fargate',
    scale: '1 task',
    metadata: meta(
      [provFixed('infra://terraform/staging', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.85),
    ),
  },
  {
    id: 'inst-db-staging',
    kind: 'instance',
    name: 'primary-database',
    environmentId: 'env-staging',
    containerId: 'ctr-db',
    runtime: 'RDS PostgreSQL, single-AZ',
    scale: 'db.t4g.medium',
    metadata: meta(
      [provFixed('infra://terraform/staging', 'source-code', 'extraction-engine', 3)],
      conf('high', 0.85),
    ),
  },
];

// ---------------------------------------------------------------------------
// Non-functional requirements
// ---------------------------------------------------------------------------

export const nonFunctionalRequirements: NonFunctionalRequirement[] = [
  {
    id: 'nfr-checkout-latency',
    category: 'performance',
    requirement: 'Checkout Service must respond within acceptable latency under normal load.',
    target: 'p95 < 400ms',
    appliesTo: ['Checkout Service'],
    metadata: meta(
      [provFixed('docs/load-test-2025.pdf', 'technical-doc', 'inference-engine', 90)],
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
      [provFixed('infra://terraform/production', 'source-code', 'extraction-engine', 3)],
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
        provFixed(
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
      [provFixed('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
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
      [provFixed('ticket://JIRA-3190', 'ticket', 'inference-engine', 240)],
      conf(
        'medium',
        0.55,
        'Target comes from a planning ticket, not a load-tested or contractually confirmed figure.',
      ),
    ),
  },
];

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export const reviewItems: ReviewItem[] = [
  {
    id: 'rev-1',
    elementType: 'Container',
    elementId: 'ctr-payments',
    elementName: 'Payments Gateway Adapter — technology',
    currentValue: 'Node.js/Express (from source code)',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/payments-adapter',
          'source-code',
          'extraction-engine',
          2,
        ),
        provFixed('docs/architecture-2024.pdf', 'technical-doc', 'inference-engine', 180),
      ],
      conf('low', 0.45, 'Two sources disagree on the implementation language.'),
    ),
    conflict: [
      {
        sourceId: 'repo://aurora-commerce/services/payments-adapter',
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
    elementId: 'ctr-erp-connector',
    elementName: 'Legacy ERP Connector — status',
    currentValue: 'Active nightly batch sync',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/erp-connector',
          'source-code',
          'extraction-engine',
          2,
        ),
        provFixed('ticket://JIRA-4821', 'ticket', 'inference-engine', 45),
      ],
      conf(
        'low',
        0.4,
        'Code is actively invoked; a ticket proposes deprecation with no evidence it happened.',
      ),
    ),
    conflict: [
      {
        sourceId: 'repo://aurora-commerce/services/erp-connector',
        sourceLabel: 'Source code',
        value: 'Active — runs nightly',
      },
      {
        sourceId: 'ticket://JIRA-4821',
        sourceLabel: 'JIRA-4821 (2025)',
        value: 'Proposed for deprecation',
      },
    ],
    status: 'pending',
  },
  {
    id: 'rev-3',
    elementType: 'Aggregate',
    elementId: 'agg-loyalty',
    elementName: 'LoyaltyAccount — domain ownership',
    currentValue: 'Owned by Customer domain (inferred)',
    metadata: meta(
      [provFixed('wiki://loyalty-program-notes', 'business-doc', 'inference-engine', 60)],
      conf(
        'inferred',
        0.3,
        'Only a stub wiki page references this; no code owner or schema comment found.',
      ),
    ),
    status: 'pending',
  },
  {
    id: 'rev-4',
    elementType: 'Flow Step',
    elementName: 'Score Fraud Risk — manual review threshold',
    currentValue: 'Unknown — no threshold documented',
    metadata: meta(
      [
        provFixed(
          'repo://aurora-commerce/services/fraud-detection',
          'source-code',
          'extraction-engine',
          2,
        ),
      ],
      conf(
        'inferred',
        0.25,
        'The score is computed and stored, but the logic that routes cases to manual review is not present in any ingested source.',
      ),
    ),
    status: 'pending',
  },
  {
    id: 'rev-5',
    elementType: 'Aggregate',
    elementId: 'agg-devicefp',
    elementName: 'DeviceFingerprint — retention policy',
    currentValue: 'Unknown',
    metadata: meta(
      [provFixed('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
      conf(
        'low',
        0.35,
        'Field is populated in logs but no retention/compliance documentation was found — flagged given potential PII.',
      ),
    ),
    status: 'pending',
  },
  {
    id: 'rev-6',
    elementType: 'Entity',
    elementId: 'agg-order',
    elementName: 'Order — schema',
    currentValue: 'Order(id, customer_id, status, total, currency, created_at, ...)',
    metadata: meta(
      [provFixed('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
      conf('high', 0.96),
    ),
    status: 'confirmed',
  },
];

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Drift alerts & history
// ---------------------------------------------------------------------------

export const driftAlerts: DriftAlert[] = [
  {
    id: 'drift-1',
    elementName: 'Fraud Detection Service',
    changeType: 'modified',
    description:
      'New outbound call to a third-party ML scoring endpoint detected since the last full analysis run.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString(),
  },
  {
    id: 'drift-2',
    elementName: 'Notification Service',
    changeType: 'added',
    description: 'New SMS notification channel added alongside the existing email channel.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 6).toISOString(),
  },
  {
    id: 'drift-3',
    elementName: 'Legacy ERP Connector',
    changeType: 'modified',
    description:
      'Batch sync schedule changed from nightly to twice daily; contradicts the deprecation ticket on file.',
    detectedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 9).toISOString(),
  },
];

export const driftHistory: DriftRun[] = [
  {
    id: 'run-2026-07-20',
    runDate: '2026-07-20T09:00:00.000Z',
    summary: 'Differential run — 3 changes detected since the previous run.',
    changes: driftAlerts,
  },
  {
    id: 'run-2026-07-06',
    runDate: '2026-07-06T09:00:00.000Z',
    summary: 'Differential run — 2 changes detected since the previous run.',
    changes: [
      {
        id: 'drift-hist-1',
        elementName: 'Checkout Service',
        changeType: 'modified',
        description:
          'New outbound dependency on Fraud Detection Service added directly to the checkout path (previously async via event bus only).',
        detectedAt: '2026-07-06T09:00:00.000Z',
      },
      {
        id: 'drift-hist-2',
        elementName: 'Inventory Service',
        changeType: 'modified',
        description:
          'Schema change: new column added to WarehouseAllocation for partial-reservation support.',
        detectedAt: '2026-07-06T09:00:00.000Z',
      },
    ],
  },
  {
    id: 'run-2026-06-22',
    runDate: '2026-06-22T09:00:00.000Z',
    summary: 'Baseline run — initial ingestion and extraction.',
    changes: [
      {
        id: 'drift-hist-3',
        elementName: 'Aurora Commerce (Dummy Company used for reverse engineering)',
        changeType: 'added',
        description:
          'Baseline established: 142 elements extracted across 6 domains, 11 containers, and 2 execution flows.',
        detectedAt: '2026-06-22T09:00:00.000Z',
      },
    ],
  },
];
