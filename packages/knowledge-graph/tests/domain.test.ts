import { describe, expect, it } from 'vitest';
import type { Aggregate, Domain } from '@phoenix-ai/shared';
import type {
  AggregateObject,
  DomainObject,
  DomainRelationship,
  EntityObject,
  EntityStateObject,
} from '../src/domain.js';
import {
  validateAggregateObject,
  validateDomainModelObject,
  validateDomainObject,
  validateDomainRelationship,
  validateEntityObject,
  validateEntityStateObject,
} from '../src/domain.js';
import { validateCanonicalKnowledgeBundle } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function meta() {
  return {
    provenance: [
      {
        sourceId: 'data-model://aurora-schema.sql',
        sourceType: 'data-model' as const,
        derivedBy: 'extraction-engine',
        derivedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    confidence: { level: 'high' as const, score: 0.9 },
  };
}

function baseIdentity(id: string) {
  return {
    id,
    systemId: 'aurora-commerce',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  };
}

function domainObject(): DomainObject {
  return {
    identity: baseIdentity('dom-ordering'),
    category: 'entity',
    kind: 'domain.domain',
    label: 'Ordering',
    attributes: { description: 'Shopping cart through order placement and lifecycle state.' },
    metadata: meta(),
    evidence: [],
  };
}

function entityObject(): EntityObject {
  return {
    identity: baseIdentity('ent-order'),
    category: 'entity',
    kind: 'domain.entity',
    label: 'Order',
    attributes: {
      description: 'A placed customer order.',
      fields: [
        { name: 'id', type: 'uuid', required: true },
        { name: 'status', type: 'string', required: true },
        { name: 'total', type: 'decimal', required: true },
        { name: 'discountCode', type: 'string', required: false },
      ],
    },
    metadata: meta(),
    evidence: [],
  };
}

function aggregateObject(): AggregateObject {
  return {
    identity: baseIdentity('agg-order'),
    category: 'entity',
    kind: 'domain.aggregate',
    label: 'Order',
    attributes: {},
    metadata: meta(),
    evidence: [],
  };
}

function entityStateObject(id: string, label: string): EntityStateObject {
  return {
    identity: baseIdentity(id),
    category: 'entity',
    kind: 'domain.entity-state',
    label,
    attributes: {},
    metadata: meta(),
    evidence: [],
  };
}

describe('DomainObject', () => {
  it('accepts a valid Domain with a description', () => {
    expect(validateDomainObject(domainObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a Domain with no description at all', () => {
    const domain = domainObject();
    domain.attributes = {};
    expect(validateDomainObject(domain).valid).toBe(true);
  });

  it('rejects the wrong kind or category', () => {
    expect(validateDomainObject({ ...domainObject(), kind: 'domain.entity' }).valid).toBe(false);
    expect(validateDomainObject({ ...domainObject(), category: 'process' }).valid).toBe(false);
  });
});

describe('EntityObject', () => {
  it('accepts a valid Entity with field-level schema', () => {
    expect(validateEntityObject(entityObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts an Entity with no fields at all ("where known")', () => {
    const entity = entityObject();
    entity.attributes = { description: 'A placed customer order.' };
    expect(validateEntityObject(entity).valid).toBe(true);
  });

  it('accepts field definitions with type/required omitted ("where known")', () => {
    const entity = entityObject();
    entity.attributes = { fields: [{ name: 'id' }] };
    expect(validateEntityObject(entity).valid).toBe(true);
  });

  it('rejects a field definition missing name', () => {
    const entity = entityObject();
    entity.attributes = { fields: [{ type: 'string' }] } as EntityObject['attributes'];
    const result = validateEntityObject(entity);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attributes.fields[0].name is required');
  });

  it('rejects a non-boolean "required" on a field definition', () => {
    const entity = entityObject();
    entity.attributes = {
      fields: [{ name: 'id', required: 'yes' as unknown as boolean }],
    };
    const result = validateEntityObject(entity);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attributes.fields[0].required, if present, must be a boolean');
  });
});

describe('AggregateObject', () => {
  it('accepts a valid Aggregate (root/members are relationships, not fields)', () => {
    expect(validateAggregateObject(aggregateObject())).toEqual({ valid: true, errors: [] });
  });
});

describe('EntityStateObject', () => {
  it('accepts a valid Entity State', () => {
    expect(validateEntityStateObject(entityStateObject('st-pending', 'Pending'))).toEqual({
      valid: true,
      errors: [],
    });
  });
});

describe('validateDomainModelObject — dispatch by kind', () => {
  it('dispatches Domain/Entity/Aggregate/EntityState to the right validator', () => {
    expect(validateDomainModelObject(domainObject()).valid).toBe(true);
    expect(validateDomainModelObject(entityObject()).valid).toBe(true);
    expect(validateDomainModelObject(aggregateObject()).valid).toBe(true);
    expect(validateDomainModelObject(entityStateObject('st-pending', 'Pending')).valid).toBe(true);
  });

  it('rejects an unrecognized kind', () => {
    const result = validateDomainModelObject({ ...domainObject(), kind: 'domain.mystery' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('kind must be one of');
  });
});

describe('DomainRelationship', () => {
  function contains(): DomainRelationship {
    return {
      id: 'rel-contains',
      category: 'composition',
      kind: 'contains',
      sourceObjectId: 'dom-ordering',
      targetObjectId: 'ent-order',
      metadata: meta(),
    };
  }

  it('accepts all six relationship kinds with their correct category', () => {
    const cases: Array<[DomainRelationship['kind'], DomainRelationship['category']]> = [
      ['contains', 'composition'],
      ['aggregateRoot', 'composition'],
      ['aggregateMember', 'composition'],
      ['hasState', 'association'],
      ['transitionsTo', 'interaction'],
      ['relatesTo', 'association'],
    ];
    for (const [kind, category] of cases) {
      const relationship = { ...contains(), kind, category };
      expect(validateDomainRelationship(relationship)).toEqual({ valid: true, errors: [] });
    }
  });

  it('rejects an unrecognized kind', () => {
    const result = validateDomainRelationship({ ...contains(), kind: 'ownedBy' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('kind must be one of');
  });

  it('rejects a category/kind mismatch (e.g. "aggregateRoot" tagged as association)', () => {
    const result = validateDomainRelationship({
      ...contains(),
      kind: 'aggregateRoot',
      category: 'association',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'category must be "composition" for relationship kind "aggregateRoot"',
    );
  });
});

describe('Phase 1 Domain/Aggregate compatibility (real Aurora fixture shapes)', () => {
  // Real values from apps/api/src/data/seed.ts's `domains` export (the
  // "Ordering" domain and its "Order" aggregate) -- not imported directly
  // (packages must not depend on apps), but structurally identical.
  const orderingDomain: Domain = {
    id: 'dom-ordering',
    name: 'Ordering',
    description: 'Shopping cart through order placement and lifecycle state.',
    metadata: meta(),
    aggregates: [
      {
        id: 'agg-order',
        name: 'Order',
        entities: ['Order', 'OrderLine', 'OrderStatusHistory'],
        metadata: meta(),
      },
    ],
  };

  function domainToObject(domain: Domain): DomainObject {
    return {
      identity: baseIdentity(domain.id),
      category: 'entity',
      kind: 'domain.domain',
      label: domain.name,
      attributes: { description: domain.description },
      metadata: domain.metadata,
      evidence: [],
    };
  }

  function aggregateToObject(aggregate: Aggregate): AggregateObject {
    return {
      identity: baseIdentity(aggregate.id),
      category: 'entity',
      kind: 'domain.aggregate',
      label: aggregate.name,
      attributes: {},
      metadata: aggregate.metadata,
      evidence: [],
    };
  }

  it('maps the real "Ordering" domain onto a valid DomainObject', () => {
    const domain = domainToObject(orderingDomain);
    expect(validateDomainObject(domain)).toEqual({ valid: true, errors: [] });
    expect(domain.metadata).toEqual(orderingDomain.metadata);
  });

  it('maps the real "Order" aggregate onto a valid AggregateObject', () => {
    const aggregate = aggregateToObject(orderingDomain.aggregates[0]!);
    expect(validateAggregateObject(aggregate)).toEqual({ valid: true, errors: [] });
  });

  it('assembles Domain + Aggregate + "contains" relationship into a valid bundle', () => {
    const domain = domainToObject(orderingDomain);
    const aggregate = aggregateToObject(orderingDomain.aggregates[0]!);
    const contains: DomainRelationship = {
      id: 'rel-dom-contains-agg',
      category: 'composition',
      kind: 'contains',
      sourceObjectId: domain.identity.id,
      targetObjectId: aggregate.identity.id,
      metadata: meta(),
    };
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [domain, aggregate],
      relationships: [contains],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('has NO Phase 1 equivalent for individual entities within an aggregate -- documents a real gap', () => {
    // Phase 1's Aggregate.entities is `string[]` (plain names: "Order",
    // "OrderLine", "OrderStatusHistory") -- no id, no attributes, no
    // provenance/confidence of its own, and the Domain Model UI
    // (DomainModelPage.tsx) renders them as plain badges. There is no real
    // Phase 1 data to adapt into an `EntityObject` (with real identity and
    // field-level `attributes.fields`) or an `aggregateRoot`/
    // `aggregateMember` relationship -- this is an explicit, documented
    // limitation (see docs/architecture/adr/0006-domain-entity-model.md),
    // not solved by mapping fake data.
    expect(orderingDomain.aggregates[0]!.entities).toEqual([
      'Order',
      'OrderLine',
      'OrderStatusHistory',
    ]);
    expect(typeof orderingDomain.aggregates[0]!.entities[0]).toBe('string');
  });

  it('demonstrates the full canonical shape (hand-built) an EntityObject+aggregateRoot relationship would take, once a real source populates one', () => {
    const domain = domainToObject(orderingDomain);
    const aggregate = aggregateToObject(orderingDomain.aggregates[0]!);
    const orderEntity = entityObject(); // 'ent-order', matching aggregate's first listed entity name "Order"
    const domainContainsEntity: DomainRelationship = {
      id: 'rel-dom-contains-entity',
      category: 'composition',
      kind: 'contains',
      sourceObjectId: domain.identity.id,
      targetObjectId: orderEntity.identity.id,
      metadata: meta(),
    };
    const aggregateRootsEntity: DomainRelationship = {
      id: 'rel-agg-root-entity',
      category: 'composition',
      kind: 'aggregateRoot',
      sourceObjectId: aggregate.identity.id,
      targetObjectId: orderEntity.identity.id,
      metadata: meta(),
    };
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [domain, aggregate, orderEntity],
      relationships: [domainContainsEntity, aggregateRootsEntity],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });
});
