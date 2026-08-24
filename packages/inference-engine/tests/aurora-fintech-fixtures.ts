/**
 * P5-10 -- technical-evidence fixtures for the Aurora (e-commerce) and
 * fintech validation domains.
 *
 * REAL DATA PRINCIPLE disclosure: neither fixture is a real repository
 * extraction. No OKF-level (Phase 3/4) technical evidence exists for either
 * an e-commerce or a fintech domain in this repository today -- Phase 3's
 * only REAL extracted OKF (`packages/extraction-engine/samples/
 * spring-petclinic.okf.yaml`) is a veterinary-clinic domain, not
 * e-commerce or fintech (see `docs/phase-4/README.md`). Per this ticket's
 * own "REAL DATA PRINCIPLE" ("if a real fintech repository is not
 * available, clearly document that limitation and use a representative
 * controlled fixture"), both fixtures below are REPRESENTATIVE, hand-built
 * technical evidence -- but neither is invented for this task: both reuse
 * REAL, ALREADY-ESTABLISHED PROJECT VOCABULARY, not fabricated nouns:
 *
 *  - Aurora: entity names and source paths (`Order`, `Payment`, `repo://
 *    aurora-commerce/services/order-orchestrator`, `repo://aurora-commerce/
 *    services/checkout`) are taken directly from the existing,
 *    already-committed P2-11 sample
 *    (`packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml`);
 *    ONE real operation name (`authorizePayment`) is also taken directly
 *    from that sample. The REST of each controller's operation LIST is
 *    hand-constructed to give the pipeline a realistic CRUD sequence to
 *    infer a journey/states from -- honestly disclosed here as constructed,
 *    not claimed as literally present in the real sample.
 *  - Fintech: entity names, source paths, and several real journey-step
 *    names (`Account`, `Transfer`, `Card`, `ComplianceCase`, `repo://
 *    nimbus-financial/services/...`, "Activate Account", "Open Compliance
 *    Case") are taken directly from the existing, already-committed fintech
 *    demo dataset (`apps/web/src/data/mock/fintech/fixtures.ts`) -- a
 *    genuinely different digital-banking domain (onboarding/KYC, accounts,
 *    card issuing, payments/transfers, fraud/AML), not e-commerce with
 *    renamed fields. As with Aurora, the specific REST/Java-method
 *    operation names are hand-constructed to match this real vocabulary,
 *    not literally present in the source fixture (which models
 *    architecture/journey-step level detail, not controller-method level).
 *
 * `AURORA_REST_OBJECTS`/`FINTECH_REST_OBJECTS` below (Blocker 4) go one step
 * further: real Spring-MVC REST-style operation names (HTTP method + path,
 * e.g. `"POST /orders"`, `"GET /accounts/{id}"`) -- the ACTUAL shape Phase
 * 3's real (and only) producer, `bridgeSpringController`, emits (verified
 * directly against `packages/extraction-engine/samples/
 * spring-petclinic.okf.yaml`), added ALONGSIDE `AURORA_OBJECTS`/
 * `FINTECH_OBJECTS` above, never replacing them.
 *
 * These are TECHNICAL EVIDENCE fixtures (OKF `ApiObject`/`EntityObject`
 * shapes) for the inference PIPELINE to run over -- distinct from the
 * EXPECTED TEST OUTPUT asserted in `aurora-fintech-validation.test.ts`,
 * which is a separate, clearly-labeled set of assertions about what the
 * pipeline should infer, not something baked into the pipeline itself.
 */

import {
  CANONICAL_SCHEMA_VERSION,
  type ApiObject,
  type CanonicalKnowledgeObject,
  type EntityObject,
} from '@phoenix-ai/knowledge-graph';

export const GENERATED_AT = '2026-08-22T00:00:00.000Z';

// ---------------------------------------------------------------------------
// Aurora (e-commerce) -- grounded in packages/knowledge-graph/samples/
// aurora-commerce.sample.okf.yaml
// ---------------------------------------------------------------------------

export const AURORA_SYSTEM_ID = 'aurora-commerce';

function auroraProvenance(sourceId: string) {
  return [
    {
      sourceId,
      sourceType: 'source-code' as const,
      derivedBy: 'extraction-engine',
      derivedAt: GENERATED_AT,
    },
  ];
}

const ORDER_ENTITY: EntityObject = {
  identity: {
    id: 'entity-order',
    systemId: AURORA_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'domain.entity',
  label: 'Order',
  attributes: {
    fields: [
      { name: 'id', type: 'uuid', required: true },
      { name: 'status', type: 'string', required: true },
    ],
  },
  metadata: {
    provenance: auroraProvenance('data-model://aurora-schema.sql'),
    confidence: { level: 'high' },
  },
  evidence: [
    {
      id: 'ev-order',
      sourceId: 'data-model://aurora-schema.sql',
      locator: 'aurora-schema.sql#orders',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

const ORDER_ORCHESTRATOR_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-order-orchestrator',
    systemId: AURORA_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'OrderOrchestratorController',
  attributes: {
    operations: [
      { name: 'createOrder', description: 'Places a new order.' },
      { name: 'getOrder', description: 'Reads an order.' },
      {
        name: 'confirmOrder',
        description: 'Confirms an order after payment authorization and stock reservation.',
      },
      { name: 'shipOrder', description: 'Marks an order as shipped.' },
      { name: 'cancelOrder', description: 'Cancels an order.' },
    ],
  },
  metadata: {
    provenance: auroraProvenance('repo://aurora-commerce/services/order-orchestrator'),
    confidence: { level: 'high' },
  },
  evidence: [
    {
      id: 'ev-order-orchestrator',
      sourceId: 'repo://aurora-commerce/services/order-orchestrator',
      locator: 'OrderOrchestratorController.java#L1',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

const PAYMENT_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-payments',
    systemId: AURORA_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'PaymentController',
  attributes: {
    operations: [
      { name: 'createPayment', description: 'Initiates a payment for an order.' },
      {
        name: 'authorizePayment',
        description: 'Authorizes a payment (real Aurora sample operation).',
      },
      { name: 'confirmPayment', description: 'Confirms a payment as settled.' },
    ],
  },
  metadata: {
    provenance: auroraProvenance('repo://aurora-commerce/services/checkout'),
    confidence: { level: 'high' },
  },
  evidence: [
    {
      id: 'ev-payments',
      sourceId: 'repo://aurora-commerce/services/checkout',
      locator: 'PaymentController.java#L1',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

/** Co-located with `PAYMENT_CONTROLLER` under the same source module (`services/checkout`) -- real Aurora terminology (the project's own system description: "storefront, checkout, payments, fraud, fulfillment") -- so capability inference has 2 concepts to cluster there. */
const CART_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-cart',
    systemId: AURORA_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'CartController',
  attributes: {
    operations: [
      { name: 'createCart', description: 'Creates a new shopping cart.' },
      { name: 'getCart', description: 'Reads a cart.' },
    ],
  },
  metadata: {
    provenance: auroraProvenance('repo://aurora-commerce/services/checkout'),
    confidence: { level: 'high' },
  },
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

export const AURORA_OBJECTS: CanonicalKnowledgeObject[] = [
  ORDER_ENTITY,
  ORDER_ORCHESTRATOR_CONTROLLER,
  PAYMENT_CONTROLLER,
  CART_CONTROLLER,
];

// ---------------------------------------------------------------------------
// Fintech (digital banking) -- grounded in apps/web/src/data/mock/fintech/
// fixtures.ts's "nimbus-financial" dataset. Genuinely different business
// concepts/flows -- onboarding/KYC, accounts, card issuing, transfers,
// compliance -- not e-commerce with renamed fields.
// ---------------------------------------------------------------------------

export const FINTECH_SYSTEM_ID = 'nimbus-financial';

function fintechProvenance(sourceId: string) {
  return [
    {
      sourceId,
      sourceType: 'source-code' as const,
      derivedBy: 'extraction-engine',
      derivedAt: GENERATED_AT,
    },
  ];
}

const ACCOUNT_ENTITY: EntityObject = {
  identity: {
    id: 'entity-account',
    systemId: FINTECH_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'domain.entity',
  label: 'Account',
  attributes: {
    fields: [
      { name: 'id', type: 'uuid', required: true },
      { name: 'status', type: 'string', required: true },
    ],
  },
  metadata: {
    provenance: fintechProvenance('data-model://nimbus-schema.sql'),
    confidence: { level: 'high' },
  },
  evidence: [
    {
      id: 'ev-account',
      sourceId: 'data-model://nimbus-schema.sql',
      locator: 'nimbus-schema.sql#accounts',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

const ONBOARDING_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-onboarding',
    systemId: FINTECH_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'OnboardingController',
  attributes: {
    operations: [
      { name: 'createAccount', description: 'Opens a new account for an applicant.' },
      { name: 'getAccount', description: 'Reads an account.' },
      { name: 'activateAccount', description: 'Activates an account after identity verification.' },
      { name: 'suspendAccount', description: 'Suspends an account pending compliance review.' },
      { name: 'closeAccount', description: 'Closes an account.' },
    ],
  },
  metadata: {
    provenance: fintechProvenance('repo://nimbus-financial/services/onboarding'),
    confidence: { level: 'high' },
  },
  evidence: [
    {
      id: 'ev-onboarding',
      sourceId: 'repo://nimbus-financial/services/onboarding',
      locator: 'OnboardingController.java#L1',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

const TRANSFER_ENTITY: EntityObject = {
  identity: {
    id: 'entity-transfer',
    systemId: FINTECH_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'domain.entity',
  label: 'Transfer',
  attributes: { fields: [{ name: 'id', type: 'uuid', required: true }] },
  metadata: {
    provenance: fintechProvenance('data-model://nimbus-schema.sql'),
    confidence: { level: 'high' },
  },
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

const PAYMENTS_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-payments-transfers',
    systemId: FINTECH_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'PaymentsController',
  attributes: {
    operations: [
      { name: 'createTransfer', description: 'Initiates a P2P or ACH transfer.' },
      { name: 'getTransfer', description: 'Reads a transfer.' },
      { name: 'processTransfer', description: 'Posts a transfer to the core ledger.' },
      { name: 'cancelTransfer', description: 'Cancels a pending transfer.' },
    ],
  },
  metadata: {
    provenance: fintechProvenance('repo://nimbus-financial/services/payments'),
    confidence: { level: 'high' },
  },
  evidence: [
    {
      id: 'ev-payments-transfers',
      sourceId: 'repo://nimbus-financial/services/payments',
      locator: 'PaymentsController.java#L1',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

const CARD_ISSUING_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-card-issuing',
    systemId: FINTECH_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'CardIssuingController',
  attributes: {
    operations: [
      { name: 'createCard', description: 'Issues a new virtual or physical card.' },
      { name: 'activateCard', description: 'Activates an issued card.' },
      { name: 'suspendCard', description: 'Suspends a card suspected of fraud.' },
    ],
  },
  metadata: {
    provenance: fintechProvenance('repo://nimbus-financial/services/card-issuing'),
    confidence: { level: 'high' },
  },
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

const FRAUD_AML_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-fraud-aml',
    systemId: FINTECH_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'FraudAmlController',
  attributes: {
    operations: [
      {
        name: 'createComplianceCase',
        description: 'Opens a compliance case for a flagged transaction.',
      },
      { name: 'getComplianceCase', description: 'Reads a compliance case.' },
    ],
  },
  metadata: {
    provenance: fintechProvenance('repo://nimbus-financial/services/fraud-aml'),
    confidence: { level: 'medium', score: 0.65 },
  },
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

export const FINTECH_OBJECTS: CanonicalKnowledgeObject[] = [
  ACCOUNT_ENTITY,
  ONBOARDING_CONTROLLER,
  TRANSFER_ENTITY,
  PAYMENTS_CONTROLLER,
  CARD_ISSUING_CONTROLLER,
  FRAUD_AML_CONTROLLER,
];

// ---------------------------------------------------------------------------
// Blocker 4 -- REALISTIC REST-style evidence, ADDED ALONGSIDE the curated
// Java-verbNoun fixtures above (never replacing them). These use real
// Spring-MVC-style REST operation names (HTTP method + path, e.g.
// "POST /orders", "GET /orders/{id}") -- the ACTUAL shape Phase 3's real
// (and only) producer, `bridgeSpringController`, emits (verified directly
// against `packages/extraction-engine/samples/spring-petclinic.okf.yaml`,
// e.g. `"GET /owners/new"`), as opposed to the hand-picked Java-method-style
// operation names the curated fixtures above use. Real entity names and
// source paths are reused from the SAME real, already-committed samples the
// curated fixtures above are grounded in (`aurora-commerce.sample.okf.yaml`
// for Order; the "nimbus-financial" fixtures for Account) -- only the
// OPERATION NAMING CONVENTION differs, so this proves the pipeline
// generalizes to Phase 3's real evidence shape, not just to evidence
// hand-tuned for pipeline success.
// ---------------------------------------------------------------------------

const AURORA_ORDER_REST_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-order-rest',
    systemId: AURORA_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'OrderController',
  attributes: {
    operations: [
      { name: 'POST /orders', description: 'Places a new order.' },
      { name: 'GET /orders/{id}', description: 'Reads an order.' },
      { name: 'PUT /orders/{id}', description: 'Updates an order.' },
      { name: 'DELETE /orders/{id}', description: 'Cancels an order.' },
    ],
  },
  metadata: {
    provenance: auroraProvenance('repo://aurora-commerce/services/order-orchestrator'),
    confidence: { level: 'high' },
  },
  evidence: [
    {
      id: 'ev-order-rest',
      sourceId: 'repo://aurora-commerce/services/order-orchestrator',
      locator: 'src/main/java/com/aurora/orders/OrderController.java#L1-L40',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

export const AURORA_REST_OBJECTS: CanonicalKnowledgeObject[] = [
  ORDER_ENTITY,
  AURORA_ORDER_REST_CONTROLLER,
];

const FINTECH_ACCOUNT_REST_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-account-rest',
    systemId: FINTECH_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'AccountController',
  attributes: {
    operations: [
      { name: 'POST /accounts', description: 'Opens a new account.' },
      { name: 'GET /accounts/{id}', description: 'Reads an account.' },
      { name: 'PATCH /accounts/{id}', description: 'Updates an account.' },
      { name: 'DELETE /accounts/{id}', description: 'Closes an account.' },
    ],
  },
  metadata: {
    provenance: fintechProvenance('repo://nimbus-financial/services/onboarding'),
    confidence: { level: 'high' },
  },
  evidence: [
    {
      id: 'ev-account-rest',
      sourceId: 'repo://nimbus-financial/services/onboarding',
      locator: 'src/main/java/com/nimbus/accounts/AccountController.java#L1-L40',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

export const FINTECH_REST_OBJECTS: CanonicalKnowledgeObject[] = [
  ACCOUNT_ENTITY,
  FINTECH_ACCOUNT_REST_CONTROLLER,
];
