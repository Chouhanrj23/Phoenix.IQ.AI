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
  id: 'aurora-commerce',
  name: 'Aurora Commerce (Dummy company used for reverse engineering)',
  description:
    'A mid-size e-commerce platform handling storefront browsing, checkout, payments, fraud screening, and fulfillment across web and mobile, integrated with a legacy ERP for finance and inventory reconciliation.',
  tags: ['e-commerce', 'payments', 'fulfillment'],
  lastAnalyzedAt: new Date().toISOString(),
  coverageScore: 0.78,
  totalElements: 142,
  pendingReviewCount: 5,
  driftAlertCount: 3,
};

// ---------------------------------------------------------------------------
// C4 — Context level
// ---------------------------------------------------------------------------

export const contextNodes: C4Node[] = [
  {
    id: 'ctx-customer',
    level: 'context',
    name: 'Customer',
    description: 'Shops, checks out, and manages orders via web or mobile.',
    metadata: meta(
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 12)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'ctx-aurora',
    level: 'context',
    name: 'Aurora Commerce Platform',
    description: 'The system under analysis: storefront, checkout, payments, fraud, fulfillment.',
    metadata: meta(
      [prov('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.97),
    ),
  },
  {
    id: 'ctx-payment-processor',
    level: 'context',
    name: 'Meridian Pay',
    description: 'External payment processor handling card authorization and settlement.',
    metadata: meta(
      [prov('repo://aurora-commerce/src/payments', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.93),
    ),
  },
  {
    id: 'ctx-fraud-ml',
    level: 'context',
    name: 'RiskShield ML API',
    description: 'Third-party fraud scoring API called during checkout.',
    metadata: meta(
      [prov('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
      conf('medium', 0.62, 'Only observed via gateway logs; no integration spec on file.'),
    ),
  },
  {
    id: 'ctx-warehouse',
    level: 'context',
    name: 'Warehouse & 3PL System',
    description: 'External logistics provider handling shipment and inventory allocation.',
    metadata: meta(
      [prov('integration-spec://warehouse-3pl-v2', 'data-model', 'extraction-engine', 20)],
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
        prov('repo://aurora-commerce/src/erp-connector', 'source-code', 'extraction-engine', 2),
        prov('ticket://JIRA-4821', 'ticket', 'inference-engine', 45),
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
      [prov('repo://aurora-commerce/src/notifications', 'source-code', 'extraction-engine', 2)],
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
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 12)],
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
      [prov('repo://aurora-commerce/src/payments', 'source-code', 'extraction-engine', 2)],
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
      [prov('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
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
      [prov('integration-spec://warehouse-3pl-v2', 'data-model', 'extraction-engine', 20)],
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
      [prov('repo://aurora-commerce/src/erp-connector', 'source-code', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce/src/notifications', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.9),
    ),
  },
];

// ---------------------------------------------------------------------------
// C4 — Container level (inside Aurora Commerce Platform)
// ---------------------------------------------------------------------------

export const containerNodes: C4Node[] = [
  {
    id: 'ctr-storefront',
    level: 'container',
    name: 'Storefront Web/Mobile',
    technology: 'React, React Native',
    description: 'Customer-facing browsing, cart, and checkout UI.',
    metadata: meta(
      [prov('repo://aurora-commerce/apps/storefront', 'source-code', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce/services/checkout', 'source-code', 'extraction-engine', 2)],
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
        prov(
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
        prov(
          'repo://aurora-commerce/services/payments-adapter',
          'source-code',
          'extraction-engine',
          2,
        ),
        prov('docs/architecture-2024.pdf', 'technical-doc', 'inference-engine', 180),
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
      [prov('repo://aurora-commerce/services/inventory', 'source-code', 'extraction-engine', 2)],
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
        prov(
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
        prov(
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
      [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'extraction-engine', 2)],
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
        prov(
          'repo://aurora-commerce/services/erp-connector',
          'source-code',
          'extraction-engine',
          2,
        ),
        prov('ticket://JIRA-4821', 'ticket', 'inference-engine', 45),
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
      [prov('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
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
        prov(
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
      [prov('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce', 'source-code', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce/infra', 'source-code', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce/infra', 'source-code', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce/infra', 'source-code', 'extraction-engine', 2)],
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
      [prov('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'extraction-engine', 2)],
      conf('high', 0.85),
    ),
  },
];

// ---------------------------------------------------------------------------
// Domains
// ---------------------------------------------------------------------------

export const domains: Domain[] = [
  {
    id: 'dom-catalog',
    name: 'Catalog & Pricing',
    description: 'Product listings, categories, and price lists shown in the storefront.',
    metadata: meta(
      [prov('data-model://aurora-schema.sql', 'data-model', 'inference-engine', 3)],
      conf('high', 0.92),
    ),
    aggregates: [
      {
        id: 'agg-product',
        name: 'Product',
        entities: ['Product', 'ProductVariant', 'Category'],
        metadata: meta(
          [prov('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
          conf('high', 0.95),
        ),
      },
      {
        id: 'agg-pricelist',
        name: 'PriceList',
        entities: ['PriceList', 'PriceRule'],
        metadata: meta(
          [prov('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
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
      [prov('repo://aurora-commerce/services/checkout', 'source-code', 'inference-engine', 3)],
      conf('high', 0.91),
    ),
    aggregates: [
      {
        id: 'agg-cart',
        name: 'Cart',
        entities: ['Cart', 'CartLine'],
        metadata: meta(
          [prov('repo://aurora-commerce/services/checkout', 'source-code', 'extraction-engine', 2)],
          conf('high', 0.93),
        ),
      },
      {
        id: 'agg-order',
        name: 'Order',
        entities: ['Order', 'OrderLine', 'OrderStatusHistory'],
        metadata: meta(
          [prov('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
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
        prov(
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
            prov(
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
          [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'extraction-engine', 2)],
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
        prov(
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
            prov(
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
          [prov('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
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
      [prov('integration-spec://warehouse-3pl-v2', 'data-model', 'inference-engine', 20)],
      conf('high', 0.85),
    ),
    aggregates: [
      {
        id: 'agg-shipment',
        name: 'Shipment',
        entities: ['Shipment', 'ShipmentLine', 'TrackingEvent'],
        metadata: meta(
          [prov('integration-spec://warehouse-3pl-v2', 'data-model', 'extraction-engine', 20)],
          conf('high', 0.88),
        ),
      },
      {
        id: 'agg-allocation',
        name: 'WarehouseAllocation',
        entities: ['WarehouseAllocation'],
        metadata: meta(
          [
            prov(
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
      [prov('data-model://aurora-schema.sql', 'data-model', 'inference-engine', 3)],
      conf('high', 0.87),
    ),
    aggregates: [
      {
        id: 'agg-profile',
        name: 'CustomerProfile',
        entities: ['CustomerProfile', 'Address'],
        metadata: meta(
          [prov('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
          conf('high', 0.92),
        ),
      },
      {
        id: 'agg-loyalty',
        name: 'LoyaltyAccount',
        entities: ['LoyaltyAccount', 'LoyaltyLedgerEntry'],
        metadata: meta(
          [prov('wiki://loyalty-program-notes', 'business-doc', 'inference-engine', 60)],
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
// Execution flows
// ---------------------------------------------------------------------------

export const executionFlows: ExecutionFlow[] = [
  {
    id: 'flow-checkout',
    name: 'Checkout & Payment Flow',
    description: 'From cart submission through order confirmation.',
    triggerScreen: 'Checkout Screen',
    metadata: meta(
      [prov('repo://aurora-commerce/services/checkout', 'source-code', 'inference-engine', 3)],
      conf('high', 0.87),
    ),
    steps: [
      {
        id: 'step-1',
        name: 'Validate Cart',
        description: 'Checks stock and price consistency before order creation.',
        readsEntities: ['Cart', 'Product', 'PriceList'],
        writesEntities: [],
        metadata: meta(
          [prov('repo://aurora-commerce/services/checkout', 'source-code', 'extraction-engine', 2)],
          conf('high', 0.9),
        ),
      },
      {
        id: 'step-2',
        name: 'Create Order',
        description: 'Persists a new Order in PENDING status.',
        readsEntities: ['Cart'],
        writesEntities: ['Order', 'OrderLine'],
        metadata: meta(
          [
            prov(
              'repo://aurora-commerce/services/order-orchestrator',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('high', 0.92),
        ),
      },
      {
        id: 'step-3',
        name: 'Score Fraud Risk',
        description: 'Calls Fraud Detection Service, which queries RiskShield ML.',
        readsEntities: ['CustomerProfile', 'DeviceFingerprint'],
        writesEntities: ['RiskCase'],
        metadata: meta(
          [
            prov(
              'repo://aurora-commerce/services/fraud-detection',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('medium', 0.6, 'Score thresholds that trigger manual review are not documented.'),
        ),
      },
      {
        id: 'step-4',
        name: 'Authorize Payment',
        description: 'Calls Meridian Pay to authorize the card.',
        readsEntities: ['Payment'],
        writesEntities: ['PaymentAttempt'],
        metadata: meta(
          [
            prov(
              'repo://aurora-commerce/services/payments-adapter',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf(
            'medium',
            0.55,
            'Retry/timeout behavior on this call is inconsistently documented between code and the 2024 architecture doc.',
          ),
        ),
      },
      {
        id: 'step-5',
        name: 'Reserve Inventory',
        description: 'Allocates stock for each order line.',
        readsEntities: ['Product'],
        writesEntities: ['WarehouseAllocation'],
        metadata: meta(
          [
            prov(
              'repo://aurora-commerce/services/inventory',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('high', 0.89),
        ),
      },
      {
        id: 'step-6',
        name: 'Confirm Order',
        description: 'Marks the order CONFIRMED and publishes OrderPlaced.',
        readsEntities: [],
        writesEntities: ['Order', 'OrderStatusHistory'],
        metadata: meta(
          [
            prov(
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
        id: 'step-7',
        name: 'Send Confirmation',
        description: 'Notification Service emails/SMS a confirmation to the customer.',
        readsEntities: ['Order', 'CustomerProfile'],
        writesEntities: [],
        metadata: meta(
          [
            prov(
              'repo://aurora-commerce/services/notifications',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('high', 0.88),
        ),
      },
    ],
  },
  {
    id: 'flow-return',
    name: 'Return & Refund Flow',
    description: 'Initiated by a support agent from the Customer Service Portal.',
    triggerScreen: 'CSR Portal — Order Detail',
    metadata: meta(
      [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'inference-engine', 3)],
      conf('medium', 0.65),
    ),
    steps: [
      {
        id: 'step-r1',
        name: 'Validate Return Eligibility',
        description: 'Checks order status and return window.',
        readsEntities: ['Order', 'OrderStatusHistory'],
        writesEntities: [],
        metadata: meta(
          [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'extraction-engine', 2)],
          conf('high', 0.85),
        ),
      },
      {
        id: 'step-r2',
        name: 'Approve Refund',
        description: 'Creates a Refund record and calls Meridian Pay to reverse the charge.',
        readsEntities: ['Payment'],
        writesEntities: ['Refund'],
        metadata: meta(
          [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'extraction-engine', 2)],
          conf(
            'medium',
            0.62,
            'Partial-refund handling for multi-item orders is unclear from code alone.',
          ),
        ),
      },
      {
        id: 'step-r3',
        name: 'Restock Inventory',
        description: 'Releases the allocation back to available stock.',
        readsEntities: ['WarehouseAllocation'],
        writesEntities: ['WarehouseAllocation'],
        metadata: meta(
          [
            prov(
              'repo://aurora-commerce/services/inventory',
              'source-code',
              'extraction-engine',
              2,
            ),
          ],
          conf('high', 0.83),
        ),
      },
      {
        id: 'step-r4',
        name: 'Notify Customer',
        description: 'Sends refund confirmation.',
        readsEntities: ['CustomerProfile', 'Refund'],
        writesEntities: [],
        metadata: meta(
          [
            prov(
              'repo://aurora-commerce/services/notifications',
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
];

// ---------------------------------------------------------------------------
// Review items (queue for the Human Review & Correction Loop)
// ---------------------------------------------------------------------------

export const reviewItems: ReviewItem[] = [
  {
    id: 'rev-1',
    elementType: 'Container',
    elementName: 'Payments Gateway Adapter — technology',
    currentValue: 'Node.js/Express (from source code)',
    metadata: meta(
      [
        prov(
          'repo://aurora-commerce/services/payments-adapter',
          'source-code',
          'extraction-engine',
          2,
        ),
        prov('docs/architecture-2024.pdf', 'technical-doc', 'inference-engine', 180),
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
    elementName: 'Legacy ERP Connector — status',
    currentValue: 'Active nightly batch sync',
    metadata: meta(
      [
        prov(
          'repo://aurora-commerce/services/erp-connector',
          'source-code',
          'extraction-engine',
          2,
        ),
        prov('ticket://JIRA-4821', 'ticket', 'inference-engine', 45),
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
    elementName: 'LoyaltyAccount — domain ownership',
    currentValue: 'Owned by Customer domain (inferred)',
    metadata: meta(
      [prov('wiki://loyalty-program-notes', 'business-doc', 'inference-engine', 60)],
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
        prov(
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
    elementName: 'DeviceFingerprint — retention policy',
    currentValue: 'Unknown',
    metadata: meta(
      [prov('logs://gateway/2026-06', 'log', 'inference-engine', 5)],
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
    elementName: 'Order — schema',
    currentValue: 'Order(id, customer_id, status, total, currency, created_at, ...)',
    metadata: meta(
      [prov('data-model://aurora-schema.sql', 'data-model', 'extraction-engine', 2)],
      conf('high', 0.96),
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
