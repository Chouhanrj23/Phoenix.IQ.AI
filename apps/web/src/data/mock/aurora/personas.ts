import type { Journey, Persona } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

export const personas: Persona[] = [
  {
    id: 'persona-returning-shopper',
    name: 'Returning Shopper',
    role: 'Customer',
    goals: ['Reorder favourite items quickly', 'Track shipment status without contacting support'],
    painPoints: [
      'Checkout occasionally times out during payment authorization',
      'Return policy is not clearly surfaced before purchase',
    ],
    metadata: meta(
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 12)],
      conf(
        'medium',
        0.65,
        'Persona synthesised from a personas doc plus patterns in support tickets; not verified with real users.',
      ),
    ),
  },
  {
    id: 'persona-first-time-buyer',
    name: 'First-time Buyer',
    role: 'Customer',
    goals: [
      'Trust that the site is legitimate before entering payment details',
      'Understand total cost before checkout',
    ],
    painPoints: [
      'Account creation is required before seeing final shipping cost',
      'No visible trust signals (reviews, guarantees) on product pages',
    ],
    metadata: meta(
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 12)],
      conf('medium', 0.6),
    ),
  },
  {
    id: 'persona-support-agent',
    name: 'Support Agent',
    role: 'Internal — Customer Service',
    goals: [
      'Resolve return/refund requests in a single interaction',
      'Explain order status confidently to the customer',
    ],
    painPoints: [
      'No visibility into why an order was flagged by fraud screening',
      'Legacy ERP sync delays mean inventory counts in the portal can be stale',
    ],
    metadata: meta(
      [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'inference-engine', 5)],
      conf(
        'medium',
        0.62,
        'Inferred from CSR portal capabilities and support-ticket language; no formal persona doc for internal users.',
      ),
    ),
  },
];

export const journeys: Journey[] = [
  {
    id: 'journey-browse-to-purchase',
    name: 'Browse to Purchase',
    personaId: 'persona-returning-shopper',
    description:
      'From landing on the storefront through a confirmed order — the primary revenue-generating journey.',
    flowIds: ['flow-checkout'],
    metadata: meta(
      [prov('repo://aurora-commerce/apps/storefront', 'source-code', 'inference-engine', 5)],
      conf('high', 0.84),
    ),
  },
  {
    id: 'journey-request-refund',
    name: 'Request a Refund',
    personaId: 'persona-support-agent',
    description:
      'A support agent validates, approves, and processes a refund on behalf of a customer.',
    flowIds: ['flow-return'],
    metadata: meta(
      [prov('repo://aurora-commerce/apps/csr-portal', 'source-code', 'inference-engine', 5)],
      conf('medium', 0.66),
    ),
  },
  {
    id: 'journey-first-purchase-trust',
    name: 'First Purchase & Trust Building',
    personaId: 'persona-first-time-buyer',
    description:
      'A new customer evaluates the storefront and completes their first order — shares the same underlying flow as returning shoppers but with different friction points.',
    flowIds: ['flow-checkout'],
    metadata: meta(
      [prov('docs/personas.md', 'business-doc', 'inference-engine', 12)],
      conf(
        'low',
        0.42,
        'Journey framing is inferred from persona pain points, not directly observed in analytics.',
      ),
    ),
  },
];
