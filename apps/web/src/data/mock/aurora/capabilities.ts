import type { BusinessCapability } from '../../types.js';
import { conf, meta, prov } from '../helpers.js';

// One capability per real domain (see fixtures.ts), matching the
// clustering shape packages/inference-engine's real P5-04
// `inferBusinessCapabilities` produces (concepts co-located under a shared
// source module, named "<Module> Management") — not one capability per
// class/service.
export const capabilities: BusinessCapability[] = [
  {
    id: 'capability-catalog',
    name: 'Catalog Management',
    description: 'Product, variant, and pricing information shown to shoppers.',
    domainId: 'dom-catalog',
    metadata: meta(
      [prov('data-model://aurora-schema.sql', 'data-model', 'inference-engine', 2)],
      conf('high', 0.9),
    ),
  },
  {
    id: 'capability-ordering',
    name: 'Order Management',
    description: 'Carts through confirmed, trackable orders.',
    domainId: 'dom-ordering',
    metadata: meta(
      [prov('repo://aurora-commerce/services/checkout', 'source-code', 'inference-engine', 2)],
      conf('high', 0.92),
    ),
  },
  {
    id: 'capability-payments',
    name: 'Payment Management',
    description: 'Authorizing, capturing, and refunding customer payments.',
    domainId: 'dom-payments',
    metadata: meta(
      [
        prov(
          'repo://aurora-commerce/services/payments-adapter',
          'source-code',
          'inference-engine',
          2,
        ),
      ],
      conf('high', 0.86),
    ),
  },
  {
    id: 'capability-fraud',
    name: 'Fraud & Risk Management',
    description: 'Screening orders and devices for fraud risk before fulfillment.',
    domainId: 'dom-fraud',
    metadata: meta(
      [
        prov(
          'repo://aurora-commerce/services/fraud-detection',
          'source-code',
          'inference-engine',
          5,
        ),
      ],
      conf('medium', 0.58),
    ),
  },
  {
    id: 'capability-fulfillment',
    name: 'Fulfillment Management',
    description: 'Allocating inventory and shipping confirmed orders.',
    domainId: 'dom-fulfillment',
    metadata: meta(
      [prov('integration-spec://warehouse-3pl-v2', 'data-model', 'inference-engine', 20)],
      conf('high', 0.85),
    ),
  },
  {
    id: 'capability-customer',
    name: 'Customer Management',
    description: 'Customer profiles, addresses, and loyalty accounts.',
    domainId: 'dom-customer',
    metadata: meta(
      [prov('data-model://aurora-schema.sql', 'data-model', 'inference-engine', 2)],
      conf('medium', 0.68),
    ),
  },
];
