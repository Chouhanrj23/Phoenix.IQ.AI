import type { Domain, GraphElementMetadata } from '../data/index.js';

/**
 * Fabricated (not extracted) field-level schema for the entity names that
 * appear in `Domain.aggregates[].entities` — Phase 1's `Aggregate.entities`
 * is only a flat `string[]` (see `packages/knowledge-graph/src/domain.ts`'s
 * documented gap: "Phase 1 has no real per-entity data, only aggregate-level
 * entity name strings"). This module invents a plausible field list and
 * foreign-key relationship per entity so the Domain Model page can render a
 * real ER diagram, not just name badges — clearly labelled as illustrative
 * in the UI, not presented as extracted fact.
 */

export interface ErField {
  name: string;
  type: string;
  pk?: boolean;
  /** Name of the entity this field is a foreign key into, if any. */
  fk?: string;
}

interface ErFieldSpec {
  name: string;
  type: string;
}

interface ErRelationSpec {
  from: string;
  to: string;
  field: string;
  label: string;
}

const ENTITY_FIELDS: Record<string, ErFieldSpec[]> = {
  // Aurora Commerce -----------------------------------------------------
  Product: [
    { name: 'sku', type: 'string' },
    { name: 'name', type: 'string' },
    { name: 'basePrice', type: 'decimal' },
    { name: 'status', type: 'enum(draft|active|archived)' },
  ],
  ProductVariant: [
    { name: 'variantSku', type: 'string' },
    { name: 'size', type: 'string' },
    { name: 'priceDelta', type: 'decimal' },
  ],
  Category: [
    { name: 'name', type: 'string' },
    { name: 'slug', type: 'string' },
  ],
  PriceList: [
    { name: 'name', type: 'string' },
    { name: 'currency', type: 'string' },
    { name: 'effectiveFrom', type: 'datetime' },
  ],
  PriceRule: [{ name: 'discountPct', type: 'number' }],
  Cart: [
    { name: 'status', type: 'enum(open|abandoned|converted)' },
    { name: 'createdAt', type: 'datetime' },
  ],
  CartLine: [{ name: 'quantity', type: 'number' }],
  Order: [
    { name: 'status', type: 'enum(pending|confirmed|shipped|cancelled)' },
    { name: 'totalAmount', type: 'decimal' },
    { name: 'currency', type: 'string' },
    { name: 'createdAt', type: 'datetime' },
  ],
  OrderLine: [
    { name: 'quantity', type: 'number' },
    { name: 'unitPrice', type: 'decimal' },
  ],
  OrderStatusHistory: [
    { name: 'status', type: 'string' },
    { name: 'changedAt', type: 'datetime' },
  ],
  Payment: [
    { name: 'amount', type: 'decimal' },
    { name: 'currency', type: 'string' },
    { name: 'status', type: 'enum(authorized|captured|failed)' },
  ],
  PaymentAttempt: [
    { name: 'attemptNumber', type: 'number' },
    { name: 'result', type: 'string' },
    { name: 'attemptedAt', type: 'datetime' },
  ],
  Refund: [
    { name: 'amount', type: 'decimal' },
    { name: 'reason', type: 'string' },
    { name: 'issuedAt', type: 'datetime' },
  ],
  RiskCase: [
    { name: 'riskScore', type: 'number' },
    { name: 'status', type: 'enum(open|cleared|escalated)' },
  ],
  RiskSignal: [
    { name: 'signalType', type: 'string' },
    { name: 'weight', type: 'number' },
  ],
  DeviceFingerprint: [
    { name: 'fingerprintHash', type: 'string' },
    { name: 'firstSeenAt', type: 'datetime' },
  ],
  Shipment: [
    { name: 'carrier', type: 'string' },
    { name: 'status', type: 'enum(pending|in_transit|delivered)' },
  ],
  ShipmentLine: [{ name: 'quantity', type: 'number' }],
  TrackingEvent: [
    { name: 'eventType', type: 'string' },
    { name: 'occurredAt', type: 'datetime' },
  ],
  WarehouseAllocation: [
    { name: 'warehouseCode', type: 'string' },
    { name: 'quantityReserved', type: 'number' },
  ],
  CustomerProfile: [
    { name: 'email', type: 'string' },
    { name: 'fullName', type: 'string' },
    { name: 'createdAt', type: 'datetime' },
  ],
  Address: [
    { name: 'line1', type: 'string' },
    { name: 'city', type: 'string' },
    { name: 'postalCode', type: 'string' },
  ],
  LoyaltyAccount: [
    { name: 'pointsBalance', type: 'number' },
    { name: 'tier', type: 'string' },
  ],
  LoyaltyLedgerEntry: [
    { name: 'delta', type: 'number' },
    { name: 'reason', type: 'string' },
    { name: 'recordedAt', type: 'datetime' },
  ],

  // Fintech - Banking System ---------------------------------------------
  Applicant: [
    { name: 'fullName', type: 'string' },
    { name: 'email', type: 'string' },
    { name: 'status', type: 'enum(pending|verified|rejected)' },
  ],
  ApplicantDocument: [
    { name: 'docType', type: 'string' },
    { name: 'uploadedAt', type: 'datetime' },
  ],
  VerificationCheck: [
    { name: 'checkType', type: 'string' },
    { name: 'result', type: 'enum(pass|fail|review)' },
    { name: 'checkedAt', type: 'datetime' },
  ],
  Account: [
    { name: 'accountType', type: 'enum(checking|savings)' },
    { name: 'status', type: 'string' },
    { name: 'openedAt', type: 'datetime' },
  ],
  AccountHolder: [
    { name: 'legalName', type: 'string' },
    { name: 'taxId', type: 'string' },
  ],
  BalanceSnapshot: [
    { name: 'balance', type: 'decimal' },
    { name: 'asOf', type: 'datetime' },
  ],
  Transfer: [
    { name: 'amount', type: 'decimal' },
    { name: 'status', type: 'enum(pending|settled|failed)' },
  ],
  TransferLeg: [
    { name: 'legType', type: 'enum(debit|credit)' },
    { name: 'amount', type: 'decimal' },
  ],
  Payee: [
    { name: 'nickname', type: 'string' },
    { name: 'routingNumber', type: 'string' },
  ],
  Card: [
    { name: 'last4', type: 'string' },
    { name: 'status', type: 'enum(active|frozen|closed)' },
  ],
  CardControl: [
    { name: 'controlType', type: 'string' },
    { name: 'enabled', type: 'boolean' },
  ],
  CardAuthorization: [
    { name: 'amount', type: 'decimal' },
    { name: 'merchant', type: 'string' },
    { name: 'authorizedAt', type: 'datetime' },
  ],
  ComplianceCase: [
    { name: 'riskScore', type: 'number' },
    { name: 'status', type: 'enum(open|cleared|escalated)' },
  ],
  WatchlistMatch: [
    { name: 'listName', type: 'string' },
    { name: 'matchScore', type: 'number' },
  ],
  CreditLine: [
    { name: 'limitAmount', type: 'decimal' },
    { name: 'apr', type: 'number' },
    { name: 'status', type: 'string' },
  ],
  CreditLimitChange: [
    { name: 'previousLimit', type: 'decimal' },
    { name: 'newLimit', type: 'decimal' },
    { name: 'changedAt', type: 'datetime' },
  ],
  BureauPull: [
    { name: 'bureau', type: 'string' },
    { name: 'score', type: 'number' },
    { name: 'pulledAt', type: 'datetime' },
  ],
};

/**
 * Foreign-key relationships. Listed per-company; disambiguated at build time
 * by checking both endpoints actually exist in the active company's data
 * (e.g. `RiskSignal` relates to `RiskCase` in Aurora and to `ComplianceCase`
 * in Fintech — both entries are listed, only the matching one ever renders).
 */
const RELATIONS: ErRelationSpec[] = [
  // Aurora Commerce -----------------------------------------------------
  { from: 'ProductVariant', to: 'Product', field: 'productId', label: 'variant of' },
  { from: 'Product', to: 'Category', field: 'categoryId', label: 'categorized under' },
  { from: 'Category', to: 'Category', field: 'parentCategoryId', label: 'subcategory of' },
  { from: 'PriceRule', to: 'PriceList', field: 'priceListId', label: 'part of' },
  { from: 'PriceRule', to: 'Product', field: 'productId', label: 'discounts' },
  { from: 'Cart', to: 'CustomerProfile', field: 'customerProfileId', label: 'belongs to' },
  { from: 'CartLine', to: 'Cart', field: 'cartId', label: 'line of' },
  { from: 'CartLine', to: 'Product', field: 'productId', label: 'references' },
  { from: 'Order', to: 'CustomerProfile', field: 'customerProfileId', label: 'placed by' },
  { from: 'OrderLine', to: 'Order', field: 'orderId', label: 'line of' },
  { from: 'OrderLine', to: 'Product', field: 'productId', label: 'references' },
  { from: 'OrderStatusHistory', to: 'Order', field: 'orderId', label: 'history of' },
  { from: 'Payment', to: 'Order', field: 'orderId', label: 'for' },
  { from: 'PaymentAttempt', to: 'Payment', field: 'paymentId', label: 'attempt of' },
  { from: 'Refund', to: 'Payment', field: 'paymentId', label: 'reverses' },
  { from: 'RiskCase', to: 'Order', field: 'orderId', label: 'assessed on' },
  { from: 'RiskSignal', to: 'RiskCase', field: 'riskCaseId', label: 'signal for' },
  {
    from: 'DeviceFingerprint',
    to: 'CustomerProfile',
    field: 'customerProfileId',
    label: 'observed for',
  },
  { from: 'Shipment', to: 'Order', field: 'orderId', label: 'fulfills' },
  { from: 'ShipmentLine', to: 'Shipment', field: 'shipmentId', label: 'line of' },
  { from: 'ShipmentLine', to: 'OrderLine', field: 'orderLineId', label: 'fulfills' },
  { from: 'TrackingEvent', to: 'Shipment', field: 'shipmentId', label: 'event for' },
  { from: 'WarehouseAllocation', to: 'OrderLine', field: 'orderLineId', label: 'reserved for' },
  { from: 'Address', to: 'CustomerProfile', field: 'customerProfileId', label: 'belongs to' },
  {
    from: 'LoyaltyAccount',
    to: 'CustomerProfile',
    field: 'customerProfileId',
    label: 'belongs to',
  },
  {
    from: 'LoyaltyLedgerEntry',
    to: 'LoyaltyAccount',
    field: 'loyaltyAccountId',
    label: 'entry for',
  },

  // Fintech - Banking System ---------------------------------------------
  { from: 'ApplicantDocument', to: 'Applicant', field: 'applicantId', label: 'document for' },
  { from: 'VerificationCheck', to: 'Applicant', field: 'applicantId', label: 'checks' },
  { from: 'AccountHolder', to: 'Applicant', field: 'applicantId', label: 'onboarded from' },
  { from: 'Account', to: 'AccountHolder', field: 'accountHolderId', label: 'owned by' },
  { from: 'BalanceSnapshot', to: 'Account', field: 'accountId', label: 'snapshot of' },
  { from: 'Transfer', to: 'Account', field: 'sourceAccountId', label: 'debits' },
  { from: 'Transfer', to: 'Payee', field: 'payeeId', label: 'pays' },
  { from: 'TransferLeg', to: 'Transfer', field: 'transferId', label: 'leg of' },
  { from: 'Payee', to: 'AccountHolder', field: 'accountHolderId', label: 'added by' },
  { from: 'Card', to: 'Account', field: 'accountId', label: 'issued for' },
  { from: 'CardControl', to: 'Card', field: 'cardId', label: 'control for' },
  { from: 'CardAuthorization', to: 'Card', field: 'cardId', label: 'authorized on' },
  { from: 'ComplianceCase', to: 'Applicant', field: 'applicantId', label: 'assessed on' },
  { from: 'RiskSignal', to: 'ComplianceCase', field: 'complianceCaseId', label: 'signal for' },
  { from: 'WatchlistMatch', to: 'ComplianceCase', field: 'complianceCaseId', label: 'match for' },
  { from: 'CreditLine', to: 'AccountHolder', field: 'accountHolderId', label: 'granted to' },
  { from: 'CreditLimitChange', to: 'CreditLine', field: 'creditLineId', label: 'change to' },
  { from: 'BureauPull', to: 'AccountHolder', field: 'accountHolderId', label: 'pulled for' },
];

export interface ErEntityNode {
  id: string;
  name: string;
  aggregateId: string;
  aggregateName: string;
  isAggregateRoot: boolean;
  fields: ErField[];
  metadata: GraphElementMetadata;
  /** External entities this one references but that live outside the active domain. */
  externalRefs: { entity: string; domainName: string; field: string; label: string }[];
}

export interface ErExternalNode {
  id: string;
  entity: string;
  domainName: string;
}

export interface ErEdge {
  id: string;
  source: string;
  target: string;
  label: string;
}

export interface ErDomainModel {
  entities: ErEntityNode[];
  externals: ErExternalNode[];
  edges: ErEdge[];
}

/**
 * Builds an illustrative ER model for one domain, resolving cross-domain
 * foreign keys against `allDomains` so a reference to an entity that lives
 * in another domain renders as a small external node instead of silently
 * dropping (or, worse, misattributing the field to the wrong company —
 * see `RiskSignal`'s two possible parents above).
 */
export function buildDomainErModel(activeDomain: Domain, allDomains: Domain[]): ErDomainModel {
  const location = new Map<
    string,
    { domainId: string; domainName: string; aggregateId: string; aggregateName: string }
  >();
  for (const domain of allDomains) {
    for (const aggregate of domain.aggregates) {
      for (const entity of aggregate.entities) {
        location.set(entity, {
          domainId: domain.id,
          domainName: domain.name,
          aggregateId: aggregate.id,
          aggregateName: aggregate.name,
        });
      }
    }
  }
  const knownEntityNames = new Set(location.keys());

  const entities: ErEntityNode[] = [];
  const externalsByEntity = new Map<string, ErExternalNode>();
  const edges: ErEdge[] = [];

  for (const aggregate of activeDomain.aggregates) {
    aggregate.entities.forEach((entityName, index) => {
      const relevant = RELATIONS.filter((r) => r.from === entityName && knownEntityNames.has(r.to));
      const externalRefs: ErEntityNode['externalRefs'] = [];
      const fkFields: ErField[] = relevant.map((r) => {
        const target = location.get(r.to);
        const inActiveDomain = target?.domainId === activeDomain.id;
        if (!inActiveDomain && target) {
          externalRefs.push({
            entity: r.to,
            domainName: target.domainName,
            field: r.field,
            label: r.label,
          });
          const externalId = `external:${r.to}`;
          if (!externalsByEntity.has(externalId)) {
            externalsByEntity.set(externalId, {
              id: externalId,
              entity: r.to,
              domainName: target.domainName,
            });
          }
          edges.push({
            id: `edge:${entityName}:${r.field}`,
            source: `entity:${entityName}`,
            target: externalId,
            label: r.label,
          });
        } else {
          edges.push({
            id: `edge:${entityName}:${r.field}`,
            source: `entity:${entityName}`,
            target: `entity:${r.to}`,
            label: r.label,
          });
        }
        return { name: r.field, type: 'uuid', fk: r.to };
      });

      entities.push({
        id: `entity:${entityName}`,
        name: entityName,
        aggregateId: aggregate.id,
        aggregateName: aggregate.name,
        isAggregateRoot: index === 0,
        metadata: aggregate.metadata,
        externalRefs,
        fields: [
          { name: 'id', type: 'uuid', pk: true },
          ...(ENTITY_FIELDS[entityName] ?? []),
          ...fkFields,
        ],
      });
    });
  }

  return { entities, externals: [...externalsByEntity.values()], edges };
}
