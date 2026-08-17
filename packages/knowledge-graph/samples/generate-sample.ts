/**
 * P2-11 -- generates `aurora-commerce.sample.okf.yaml`.
 *
 * This is a dev utility, not part of the package's runtime API (not
 * exported from `src/index.ts`, not part of `tsc -b`'s build). Run it via
 * `pnpm --filter @phoenix-ai/knowledge-graph generate:sample`.
 *
 * Its second purpose is to BE the answer to "how should future connectors
 * produce equivalent structures": build typed objects using the real
 * P2-03 through P2-09 interfaces, wrap with `toOkfDocument`, validate with
 * `validateOkfDocument`, and serialize with `serializeOkfYaml` -- the same
 * four steps any real repository/documentation/ticket connector will
 * eventually need to perform. See `docs/okf/sample.md` for what this
 * sample represents, what it intentionally does not, and this script's
 * role as a worked template.
 *
 * NOT production repository extraction: every `Provenance.derivedBy` here
 * is `'phoenix-sample-author'`, never `'extraction-engine'`/
 * `'inference-engine'` -- honest about how this file was actually
 * produced (hand-authored for this ticket, informed by the real Aurora
 * Commerce fixtures already used throughout Phase 2's tests), even where
 * the underlying facts (system/container/domain/persona/journey/flow/
 * integration names, descriptions, and confidence values) are grounded in
 * `apps/web/src/data/mock/aurora/*`, not invented.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';
import type { CanonicalKnowledgeBundle } from '../src/bundle.js';
import type { Source } from '../src/provenance.js';
import type {
  SystemObject,
  ContainerObject,
  ComponentObject,
  ArchitectureRelationship,
} from '../src/architecture.js';
import type {
  DomainObject,
  AggregateObject,
  EntityObject,
  EntityStateObject,
  DomainRelationship,
} from '../src/domain.js';
import type {
  PersonaObject,
  JourneyObject,
  FlowObject,
  ActionObject,
  JourneyRelationship,
} from '../src/journey.js';
import type {
  ApiObject,
  InterfaceObject,
  IntegrationObject,
  DataFlowObject,
  IntegrationRelationship,
} from '../src/integration.js';
import type { GraphElementMetadata } from '@phoenix-ai/shared';
import type { Evidence } from '../src/evidence.js';
import { toOkfDocument, serializeOkfYaml, validateOkfDocument } from '../src/okf.js';

const GENERATED_AT = '2026-08-17T00:00:00.000Z';
const SYSTEM_ID = 'aurora-commerce';
/** Honest about this file's own origin -- see the file header comment. */
const DERIVED_BY = 'phoenix-sample-author';

function identity(id: string) {
  return {
    id,
    systemId: SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  };
}

function meta(
  sourceId: string,
  sourceType: 'source-code' | 'data-model' | 'technical-doc' | 'business-doc',
  level: 'high' | 'medium' | 'low' | 'inferred',
  score: number,
  rationale?: string,
): GraphElementMetadata {
  return {
    provenance: [{ sourceId, sourceType, derivedBy: DERIVED_BY, derivedAt: GENERATED_AT }],
    confidence: rationale !== undefined ? { level, score, rationale } : { level, score },
  };
}

function multiMeta(
  entries: {
    sourceId: string;
    sourceType: 'source-code' | 'data-model' | 'technical-doc' | 'business-doc';
  }[],
  level: 'high' | 'medium' | 'low' | 'inferred',
  score: number,
  rationale?: string,
): GraphElementMetadata {
  return {
    provenance: entries.map((e) => ({ ...e, derivedBy: DERIVED_BY, derivedAt: GENERATED_AT })),
    confidence: rationale !== undefined ? { level, score, rationale } : { level, score },
  };
}

function evidence(id: string, sourceId: string, excerpt: string, locator: string): Evidence[] {
  return [{ id, sourceId, excerpt, locator }];
}

// ---------------------------------------------------------------------------
// Sources (P2-07) -- every sourceId referenced below by any object,
// relationship, or evidence entry resolves to exactly one of these.
// ---------------------------------------------------------------------------

const sources: Source[] = [
  { id: 'repo://aurora-commerce', type: 'source-code', label: 'aurora-commerce (root repo)' },
  {
    id: 'repo://aurora-commerce/services/checkout',
    type: 'source-code',
    label: 'aurora-commerce/services/checkout',
  },
  {
    id: 'repo://aurora-commerce/services/payments-adapter',
    type: 'source-code',
    label: 'aurora-commerce/services/payments-adapter',
  },
  {
    id: 'repo://aurora-commerce/services/order-orchestrator',
    type: 'source-code',
    label: 'aurora-commerce/services/order-orchestrator',
  },
  { id: 'docs/architecture-2024.pdf', type: 'technical-doc', label: '2024 architecture document' },
  { id: 'data-model://aurora-schema.sql', type: 'data-model', label: 'Aurora primary schema' },
  { id: 'docs/personas.md', type: 'business-doc', label: 'Persona research doc' },
  {
    id: 'openapi://aurora-commerce/payments-authorization.yaml',
    type: 'data-model',
    label:
      'Illustrative Payments Authorization API definition (no real Phase 1 equivalent -- see docs/okf/sample.md)',
  },
];

// ---------------------------------------------------------------------------
// Architecture (P2-03) -- System/Container real (apps/web/src/data/mock/
// aurora/fixtures.ts); Component illustrative (Phase 1 has no
// component-level data -- see docs/okf/sample.md).
// ---------------------------------------------------------------------------

const system: SystemObject = {
  identity: identity('ctx-aurora'),
  category: 'entity',
  kind: 'architecture.system',
  label: 'Aurora Commerce Platform',
  attributes: {
    description: 'The system under analysis: storefront, checkout, payments, fraud, fulfillment.',
  },
  metadata: meta('repo://aurora-commerce', 'source-code', 'high', 0.97),
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

const checkoutContainer: ContainerObject = {
  identity: identity('ctr-checkout'),
  category: 'entity',
  kind: 'architecture.container',
  label: 'Checkout Service',
  attributes: {
    responsibility: 'Orchestrates cart validation, order creation, and payment/fraud calls.',
    technology: 'Node.js',
  },
  metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 'high', 0.92),
  evidence: evidence(
    'ev-checkout-entrypoint',
    'repo://aurora-commerce/services/checkout',
    'export const app = createCheckoutServer()',
    'src/index.ts:1',
  ),
  confidenceDetail: { basis: 'observed' },
};

const paymentsContainer: ContainerObject = {
  identity: identity('ctr-payments'),
  category: 'entity',
  kind: 'architecture.container',
  label: 'Payments Gateway Adapter',
  attributes: {
    responsibility: 'Adapts checkout requests to the Meridian Pay API.',
    technology: 'Node.js/Express (disputed)',
  },
  metadata: multiMeta(
    [
      { sourceId: 'repo://aurora-commerce/services/payments-adapter', sourceType: 'source-code' },
      { sourceId: 'docs/architecture-2024.pdf', sourceType: 'technical-doc' },
    ],
    'low',
    0.45,
    'Source code shows Node.js/Express; the 2024 architecture doc describes it as a Java/Spring service. Not yet reconciled -- a real, unresolved disagreement carried over from Phase 1 fixture data, not invented for this sample.',
  ),
  evidence: [
    ...evidence(
      'ev-payments-package-json',
      'repo://aurora-commerce/services/payments-adapter',
      '"express": "^4.19.0"',
      'package.json',
    ),
    ...evidence(
      'ev-payments-arch-doc',
      'docs/architecture-2024.pdf',
      'Payments Gateway Adapter: Java/Spring Boot service',
      'section 3.2',
    ),
  ],
  confidenceDetail: {
    basis: 'derived',
    calculation: {
      method: 'source-conflict-flagging',
      calculatedAt: GENERATED_AT,
      inputs: { conflictingSources: 2 },
    },
  },
};

const cartValidatorComponent: ComponentObject = {
  identity: identity('cmp-cart-validator'),
  category: 'entity',
  kind: 'architecture.component',
  label: 'Cart Validator',
  attributes: {
    responsibility: 'Checks stock and price consistency before order creation.',
  },
  metadata: meta(
    'repo://aurora-commerce/services/checkout',
    'source-code',
    'inferred',
    0.35,
    'Illustrative component-level decomposition of Checkout Service for this sample; Phase 1 has no real component-level extraction to draw from (see docs/okf/sample.md).',
  ),
  evidence: [],
  confidenceDetail: { basis: 'derived' },
};

const architectureRelationships: ArchitectureRelationship[] = [
  {
    id: 'rel-system-contains-checkout',
    category: 'composition',
    kind: 'contains',
    sourceObjectId: 'ctx-aurora',
    targetObjectId: 'ctr-checkout',
    metadata: meta('repo://aurora-commerce', 'source-code', 'high', 0.95),
  },
  {
    id: 'rel-system-contains-payments',
    category: 'composition',
    kind: 'contains',
    sourceObjectId: 'ctx-aurora',
    targetObjectId: 'ctr-payments',
    metadata: meta('repo://aurora-commerce', 'source-code', 'high', 0.95),
  },
  {
    id: 'rel-checkout-contains-cart-validator',
    category: 'composition',
    kind: 'contains',
    sourceObjectId: 'ctr-checkout',
    targetObjectId: 'cmp-cart-validator',
    metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 'inferred', 0.35),
  },
  {
    id: 'rel-checkout-communicates-payments',
    category: 'interaction',
    kind: 'communicatesWith',
    sourceObjectId: 'ctr-checkout',
    targetObjectId: 'ctr-payments',
    attributes: { description: 'authorize payment' },
    metadata: meta(
      'repo://aurora-commerce',
      'source-code',
      'high',
      0.88,
      'Simplified for this sample: the real Aurora fixtures route this call through an Order Orchestrator container, omitted here for brevity.',
    ),
    evidence: evidence(
      'ev-checkout-calls-payments',
      'repo://aurora-commerce/services/checkout',
      'await paymentsAdapter.authorize(order)',
      'src/checkout/finalize.ts:42',
    ),
  },
];

// ---------------------------------------------------------------------------
// Domain/Entity (P2-04) -- Domain/Aggregate real; Entity/EntityState
// illustrative but grounded in real flow-step text (see docs/okf/sample.md).
// ---------------------------------------------------------------------------

const orderingDomain: DomainObject = {
  identity: identity('dom-ordering'),
  category: 'entity',
  kind: 'domain.domain',
  label: 'Ordering',
  attributes: { description: 'Shopping cart through order placement and lifecycle state.' },
  metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 'high', 0.91),
  evidence: [],
  confidenceDetail: {
    basis: 'derived',
    calculation: {
      method: 'boundary-heuristic',
      calculatedAt: GENERATED_AT,
      inputs: { relatedContainers: 1 },
    },
  },
};

const orderAggregate: AggregateObject = {
  identity: identity('agg-order'),
  category: 'entity',
  kind: 'domain.aggregate',
  label: 'Order',
  attributes: { description: 'The order aggregate: Order, OrderLine, OrderStatusHistory.' },
  metadata: meta('data-model://aurora-schema.sql', 'data-model', 'high', 0.96),
  evidence: [],
};

const orderEntity: EntityObject = {
  identity: identity('ent-order'),
  category: 'entity',
  kind: 'domain.entity',
  label: 'Order',
  attributes: {
    description: 'A placed order and its lifecycle state.',
    fields: [
      { name: 'id', type: 'uuid', required: true },
      { name: 'status', type: 'string', required: true },
    ],
  },
  metadata: meta(
    'data-model://aurora-schema.sql',
    'data-model',
    'medium',
    0.6,
    'Illustrative field-level detail for this sample -- Phase 1 only records aggregate-level entity name strings, never per-field schema (see docs/okf/sample.md and ADR 0006).',
  ),
  evidence: [],
};

const orderPendingState: EntityStateObject = {
  identity: identity('state-order-pending'),
  category: 'entity',
  kind: 'domain.entity-state',
  label: 'Pending',
  attributes: { description: 'A newly created order, not yet confirmed.' },
  metadata: meta(
    'repo://aurora-commerce/services/order-orchestrator',
    'source-code',
    'high',
    0.9,
    'Grounded in real Aurora flow-step text: "Persists a new Order in PENDING status."',
  ),
  evidence: [],
};

const orderConfirmedState: EntityStateObject = {
  identity: identity('state-order-confirmed'),
  category: 'entity',
  kind: 'domain.entity-state',
  label: 'Confirmed',
  attributes: {
    description: 'An order that has completed payment authorization and stock reservation.',
  },
  metadata: meta(
    'repo://aurora-commerce/services/order-orchestrator',
    'source-code',
    'high',
    0.9,
    'Grounded in real Aurora flow-step text: "Marks the order CONFIRMED and publishes OrderPlaced."',
  ),
  evidence: [],
};

const domainRelationships: DomainRelationship[] = [
  {
    id: 'rel-ordering-contains-order-entity',
    category: 'composition',
    kind: 'contains',
    sourceObjectId: 'dom-ordering',
    targetObjectId: 'ent-order',
    metadata: meta('data-model://aurora-schema.sql', 'data-model', 'medium', 0.6),
  },
  {
    id: 'rel-order-aggregate-root',
    category: 'composition',
    kind: 'aggregateRoot',
    sourceObjectId: 'agg-order',
    targetObjectId: 'ent-order',
    metadata: meta('data-model://aurora-schema.sql', 'data-model', 'high', 0.96),
  },
  {
    id: 'rel-order-has-state-pending',
    category: 'association',
    kind: 'hasState',
    sourceObjectId: 'ent-order',
    targetObjectId: 'state-order-pending',
    metadata: meta(
      'repo://aurora-commerce/services/order-orchestrator',
      'source-code',
      'high',
      0.9,
    ),
  },
  {
    id: 'rel-order-has-state-confirmed',
    category: 'association',
    kind: 'hasState',
    sourceObjectId: 'ent-order',
    targetObjectId: 'state-order-confirmed',
    metadata: meta(
      'repo://aurora-commerce/services/order-orchestrator',
      'source-code',
      'high',
      0.9,
    ),
  },
  {
    id: 'rel-order-pending-to-confirmed',
    category: 'interaction',
    kind: 'transitionsTo',
    sourceObjectId: 'state-order-pending',
    targetObjectId: 'state-order-confirmed',
    metadata: meta(
      'repo://aurora-commerce/services/order-orchestrator',
      'source-code',
      'high',
      0.88,
    ),
  },
];

// ---------------------------------------------------------------------------
// Persona/Journey/State (P2-05) -- all real (apps/web/src/data/mock/
// aurora/personas.ts, fixtures.ts).
// ---------------------------------------------------------------------------

const returningShopperPersona: PersonaObject = {
  identity: identity('persona-returning-shopper'),
  category: 'entity',
  kind: 'journey.persona',
  label: 'Returning Shopper',
  attributes: {
    role: 'Customer',
    goals: ['Reorder favourite items quickly', 'Track shipment status without contacting support'],
    painPoints: [
      'Checkout occasionally times out during payment authorization',
      'Return policy is not clearly surfaced before purchase',
    ],
  },
  metadata: meta(
    'docs/personas.md',
    'business-doc',
    'medium',
    0.65,
    'Persona synthesised from a personas doc plus patterns in support tickets; not verified with real users.',
  ),
  evidence: [],
  confidenceDetail: { basis: 'derived' },
};

const browseToPurchaseJourney: JourneyObject = {
  identity: identity('journey-browse-to-purchase'),
  category: 'process',
  kind: 'journey.journey',
  label: 'Browse to Purchase',
  attributes: {
    purpose:
      'From landing on the storefront through a confirmed order -- the primary revenue-generating journey.',
  },
  metadata: meta('repo://aurora-commerce', 'source-code', 'high', 0.84),
  evidence: [],
};

const checkoutFlow: FlowObject = {
  identity: identity('flow-checkout'),
  category: 'process',
  kind: 'journey.flow',
  label: 'Checkout & Payment Flow',
  attributes: {
    description: 'From cart submission through order confirmation.',
    triggerScreen: 'Checkout Screen',
  },
  metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 'high', 0.87),
  evidence: [],
};

const createOrderAction: ActionObject = {
  identity: identity('step-2'),
  category: 'entity',
  kind: 'journey.action',
  label: 'Create Order',
  attributes: { description: 'Persists a new Order in PENDING status.' },
  metadata: meta('repo://aurora-commerce/services/order-orchestrator', 'source-code', 'high', 0.92),
  evidence: evidence(
    'ev-step2-create-order',
    'repo://aurora-commerce/services/order-orchestrator',
    'const order = await Order.create({ status: "PENDING", ...cart })',
    'src/orders/create.ts:18',
  ),
};

const confirmOrderAction: ActionObject = {
  identity: identity('step-6'),
  category: 'entity',
  kind: 'journey.action',
  label: 'Confirm Order',
  attributes: { description: 'Marks the order CONFIRMED and publishes OrderPlaced.' },
  metadata: meta('repo://aurora-commerce/services/order-orchestrator', 'source-code', 'high', 0.9),
  evidence: evidence(
    'ev-step6-confirm-order',
    'repo://aurora-commerce/services/order-orchestrator',
    'await order.update({ status: "CONFIRMED" }); eventBus.publish("OrderPlaced", order)',
    'src/orders/confirm.ts:9',
  ),
};

const journeyRelationships: JourneyRelationship[] = [
  {
    id: 'rel-journey-has-persona',
    category: 'association',
    kind: 'hasPersona',
    sourceObjectId: 'journey-browse-to-purchase',
    targetObjectId: 'persona-returning-shopper',
    metadata: meta('repo://aurora-commerce', 'source-code', 'high', 0.84),
  },
  {
    id: 'rel-flow-supports-journey',
    category: 'realization',
    kind: 'supports',
    sourceObjectId: 'flow-checkout',
    targetObjectId: 'journey-browse-to-purchase',
    metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 'high', 0.87),
  },
  {
    id: 'rel-flow-contains-step2',
    category: 'composition',
    kind: 'contains',
    sourceObjectId: 'flow-checkout',
    targetObjectId: 'step-2',
    attributes: { order: 2 },
    metadata: meta(
      'repo://aurora-commerce/services/order-orchestrator',
      'source-code',
      'high',
      0.92,
    ),
  },
  {
    id: 'rel-flow-contains-step6',
    category: 'composition',
    kind: 'contains',
    sourceObjectId: 'flow-checkout',
    targetObjectId: 'step-6',
    attributes: { order: 6 },
    metadata: meta(
      'repo://aurora-commerce/services/order-orchestrator',
      'source-code',
      'high',
      0.9,
    ),
  },
  {
    id: 'rel-step2-writes-order',
    category: 'interaction',
    kind: 'writesEntity',
    sourceObjectId: 'step-2',
    targetObjectId: 'ent-order',
    metadata: meta(
      'repo://aurora-commerce/services/order-orchestrator',
      'source-code',
      'high',
      0.92,
    ),
  },
  {
    id: 'rel-step6-writes-order',
    category: 'interaction',
    kind: 'writesEntity',
    sourceObjectId: 'step-6',
    targetObjectId: 'ent-order',
    metadata: meta(
      'repo://aurora-commerce/services/order-orchestrator',
      'source-code',
      'high',
      0.9,
    ),
  },
  {
    id: 'rel-step2-triggers-pending',
    category: 'interaction',
    kind: 'triggersTransition',
    sourceObjectId: 'step-2',
    targetObjectId: 'state-order-pending',
    metadata: meta(
      'repo://aurora-commerce/services/order-orchestrator',
      'source-code',
      'high',
      0.9,
    ),
  },
  {
    id: 'rel-step6-triggers-confirmed',
    category: 'interaction',
    kind: 'triggersTransition',
    sourceObjectId: 'step-6',
    targetObjectId: 'state-order-confirmed',
    metadata: meta(
      'repo://aurora-commerce/services/order-orchestrator',
      'source-code',
      'high',
      0.88,
    ),
  },
];

// ---------------------------------------------------------------------------
// Integration/API (P2-06) -- Integration/DataFlow real (apps/web/src/data/
// mock/aurora/integrations.ts); API/Interface illustrative (Phase 1 has no
// API/Interface concept at all -- see ADR 0008 and docs/okf/sample.md).
// ---------------------------------------------------------------------------

const meridianPayIntegration: IntegrationObject = {
  identity: identity('int-meridian-pay'),
  category: 'entity',
  kind: 'integration.integration',
  label: 'Meridian Pay',
  attributes: {
    interactionType: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    counterpartDescription: 'External payment processor',
  },
  metadata: meta('repo://aurora-commerce/services/payments-adapter', 'source-code', 'high', 0.9),
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

const meridianAuthDataFlow: DataFlowObject = {
  identity: identity('dataflow-meridian-authorization'),
  category: 'entity',
  kind: 'integration.dataflow',
  label: 'Authorization Request/Response',
  attributes: {
    data: 'Card token, amount, currency, order reference -> authorization/capture result',
    direction: 'outbound',
  },
  metadata: meta('repo://aurora-commerce/services/payments-adapter', 'source-code', 'high', 0.9),
  evidence: [],
};

const paymentsAuthApi: ApiObject = {
  identity: identity('api-payments-auth'),
  category: 'entity',
  kind: 'integration.api',
  label: 'Payments Authorization API (illustrative)',
  attributes: {
    description:
      'Illustrative internal API through which Checkout Service calls Payments Gateway Adapter -- no real Phase 1 equivalent (see docs/okf/sample.md).',
    operations: [
      { name: 'authorizePayment', description: 'Authorizes a card payment for an order.' },
    ],
  },
  metadata: meta(
    'openapi://aurora-commerce/payments-authorization.yaml',
    'data-model',
    'inferred',
    0.3,
    'Illustrative: Phase 1 has no API concept at all (see ADR 0008); modeled here only to demonstrate the OKF schema, not asserted as a real, documented API.',
  ),
  evidence: [],
  confidenceDetail: { basis: 'derived' },
};

const paymentsAuthInterface: InterfaceObject = {
  identity: identity('iface-payments-auth'),
  category: 'entity',
  kind: 'integration.interface',
  label: 'Payment Authorization Interface (illustrative)',
  attributes: {
    description:
      'The contract Payments Gateway Adapter exposes and Checkout Service consumes to authorize a payment.',
    protocol: 'REST/HTTPS (synchronous)',
  },
  metadata: meta(
    'openapi://aurora-commerce/payments-authorization.yaml',
    'data-model',
    'inferred',
    0.3,
    'Illustrative, same rationale as the API it realizes.',
  ),
  evidence: [],
  confidenceDetail: { basis: 'derived' },
};

const integrationRelationships: IntegrationRelationship[] = [
  {
    id: 'rel-payments-has-integration',
    category: 'association',
    kind: 'hasIntegration',
    sourceObjectId: 'ctr-payments',
    targetObjectId: 'int-meridian-pay',
    metadata: meta('repo://aurora-commerce/services/payments-adapter', 'source-code', 'high', 0.9),
  },
  {
    id: 'rel-integration-carries-dataflow',
    category: 'composition',
    kind: 'carries',
    sourceObjectId: 'int-meridian-pay',
    targetObjectId: 'dataflow-meridian-authorization',
    metadata: meta('repo://aurora-commerce/services/payments-adapter', 'source-code', 'high', 0.9),
  },
  {
    id: 'rel-api-realizes-interface',
    category: 'realization',
    kind: 'realizes',
    sourceObjectId: 'api-payments-auth',
    targetObjectId: 'iface-payments-auth',
    metadata: meta(
      'openapi://aurora-commerce/payments-authorization.yaml',
      'data-model',
      'inferred',
      0.3,
    ),
  },
  {
    id: 'rel-payments-exposes-interface',
    category: 'interaction',
    kind: 'exposes',
    sourceObjectId: 'ctr-payments',
    targetObjectId: 'iface-payments-auth',
    metadata: meta(
      'openapi://aurora-commerce/payments-authorization.yaml',
      'data-model',
      'inferred',
      0.3,
    ),
  },
  {
    id: 'rel-checkout-consumes-interface',
    category: 'interaction',
    kind: 'consumes',
    sourceObjectId: 'ctr-checkout',
    targetObjectId: 'iface-payments-auth',
    metadata: meta(
      'openapi://aurora-commerce/payments-authorization.yaml',
      'data-model',
      'inferred',
      0.3,
    ),
  },
];

// ---------------------------------------------------------------------------
// Assemble, validate, write
// ---------------------------------------------------------------------------

const bundle: CanonicalKnowledgeBundle = {
  systemId: SYSTEM_ID,
  generatedAt: GENERATED_AT,
  sources,
  objects: [
    system,
    checkoutContainer,
    paymentsContainer,
    cartValidatorComponent,
    orderingDomain,
    orderAggregate,
    orderEntity,
    orderPendingState,
    orderConfirmedState,
    returningShopperPersona,
    browseToPurchaseJourney,
    checkoutFlow,
    createOrderAction,
    confirmOrderAction,
    meridianPayIntegration,
    meridianAuthDataFlow,
    paymentsAuthApi,
    paymentsAuthInterface,
  ],
  relationships: [
    ...architectureRelationships,
    ...domainRelationships,
    ...journeyRelationships,
    ...integrationRelationships,
  ],
};

const document = toOkfDocument(bundle);
const result = validateOkfDocument(document);

if (!result.valid) {
  console.error('Sample OKF document failed validation:');
  for (const error of result.errors) console.error(`  - ${error}`);
  process.exit(1);
}

const yamlText = serializeOkfYaml(document);
const outputPath = fileURLToPath(new URL('./aurora-commerce.sample.okf.yaml', import.meta.url));
writeFileSync(outputPath, yamlText, 'utf-8');
console.error(
  `Wrote valid OKF sample (${document.objects.length} objects, ${document.relationships.length} relationships) to ${outputPath}`,
);
