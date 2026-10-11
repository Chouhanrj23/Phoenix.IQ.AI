import type { Epic } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

export const epics: Epic[] = [
  {
    id: 'epic-checkout-payment',
    name: 'Checkout & Payment',
    description: 'Everything needed to take a shopper from cart to a confirmed, paid order.',
    metadata: meta(
      [prov('repo://aurora-commerce/services/checkout', 'source-code', 'inference-engine', 4)],
      conf('high', 0.86),
    ),
    features: [
      {
        id: 'feature-cart-order-creation',
        name: 'Cart & Order Creation',
        description: 'Validate cart contents and convert them into a durable order record.',
        metadata: meta(
          [prov('repo://aurora-commerce/services/checkout', 'source-code', 'extraction-engine', 2)],
          conf('high', 0.9),
        ),
        stories: [
          {
            id: 'story-review-cart',
            title: 'As a shopper, I can review my cart before paying',
            description: 'Cart contents, quantities, and price are shown before checkout begins.',
            acceptanceCriteria: [
              { id: 'ac-1', description: 'Cart total reflects current PriceList at time of view.' },
              { id: 'ac-2', description: 'Out-of-stock items are flagged before checkout starts.' },
            ],
            metadata: meta(
              [
                prov(
                  'repo://aurora-commerce/apps/storefront',
                  'source-code',
                  'extraction-engine',
                  2,
                ),
              ],
              conf('high', 0.87),
            ),
          },
          {
            id: 'story-order-on-payment',
            title: 'As a shopper, my order is created once payment is authorized',
            description:
              'An Order moves from PENDING to CONFIRMED only after payment authorization succeeds.',
            acceptanceCriteria: [
              { id: 'ac-3', description: 'Order remains PENDING if payment authorization fails.' },
              {
                id: 'ac-4',
                description: 'Customer sees a confirmation screen only after CONFIRMED status.',
              },
            ],
            metadata: meta(
              [
                prov(
                  'repo://aurora-commerce/services/order-orchestrator',
                  'source-code',
                  'extraction-engine',
                  2,
                ),
              ],
              conf('high', 0.91),
            ),
          },
        ],
      },
      {
        id: 'feature-fraud-screening',
        name: 'Fraud Screening',
        description: 'Flag suspicious orders for manual review before fulfillment.',
        metadata: meta(
          [
            prov(
              'repo://aurora-commerce/services/fraud-detection',
              'source-code',
              'inference-engine',
              4,
            ),
          ],
          conf(
            'medium',
            0.6,
            'The feature boundary is clear; the decisioning rules within it are not.',
          ),
        ),
        stories: [
          {
            id: 'story-flag-suspicious-orders',
            title: 'As the platform, suspicious orders are flagged for review',
            description:
              'Orders scoring above an undocumented risk threshold are routed to a RiskCase.',
            acceptanceCriteria: [
              {
                id: 'ac-5',
                description: 'A RiskCase is created when the risk score exceeds the threshold.',
              },
              {
                id: 'ac-6',
                description: '(Unverified) Threshold value and manual-review routing logic.',
              },
            ],
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
                'low',
                0.4,
                'Story recovered from code paths; the acceptance criteria around thresholds are inferred, not confirmed.',
              ),
            ),
          },
        ],
      },
    ],
  },
  {
    id: 'epic-returns-refunds',
    name: 'Returns & Refunds',
    description: 'Support-agent-driven return validation and refund issuance.',
    metadata: meta(
      [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'inference-engine', 4)],
      conf('high', 0.82),
    ),
    features: [
      {
        id: 'feature-return-eligibility',
        name: 'Return Eligibility',
        description: 'Determine whether an order is still within its return window.',
        metadata: meta(
          [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'extraction-engine', 2)],
          conf('high', 0.85),
        ),
        stories: [
          {
            id: 'story-check-return-eligibility',
            title: 'As a support agent, I can check if an order is eligible for return',
            description:
              'The portal surfaces order status and return-window remaining before allowing a return.',
            acceptanceCriteria: [
              {
                id: 'ac-7',
                description:
                  'Orders outside the return window are blocked from initiating a return.',
              },
            ],
            metadata: meta(
              [
                prov(
                  'repo://aurora-commerce/apps/csr-portal',
                  'source-code',
                  'extraction-engine',
                  2,
                ),
              ],
              conf('high', 0.85),
            ),
          },
        ],
      },
      {
        id: 'feature-refund-processing',
        name: 'Refund Processing',
        description: 'Issue full or partial refunds and reconcile inventory.',
        metadata: meta(
          [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'extraction-engine', 2)],
          conf(
            'medium',
            0.62,
            'Partial-refund handling for multi-item orders is unclear from code alone.',
          ),
        ),
        stories: [
          {
            id: 'story-issue-refund',
            title: 'As a support agent, I can issue a full or partial refund',
            description:
              'A Refund record is created and Meridian Pay is called to reverse the charge.',
            acceptanceCriteria: [
              { id: 'ac-8', description: 'Full refunds restock all order lines.' },
              {
                id: 'ac-9',
                description: '(Unverified) Partial refund behaviour for multi-item orders.',
              },
            ],
            metadata: meta(
              [
                prov(
                  'repo://aurora-commerce/apps/csr-portal',
                  'source-code',
                  'extraction-engine',
                  2,
                ),
              ],
              conf('medium', 0.6),
            ),
          },
        ],
      },
    ],
  },
];
