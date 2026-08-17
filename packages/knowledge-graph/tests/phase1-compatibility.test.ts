import { describe, expect, it } from 'vitest';
import type { C4Edge, C4Node, Domain } from '@phoenix-ai/shared';
import type { CanonicalKnowledgeObject } from '../src/canonical-object.js';
import type { CanonicalKnowledgeRelationship } from '../src/relationships.js';
import { validateCanonicalKnowledgeBundle } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

/**
 * P2-01 must be able to represent real Phase 1 contract data (P1-02,
 * @phoenix-ai/shared/src/contracts.ts) without modifying those types. These
 * fixtures are shaped exactly like apps/api's real Aurora seed data
 * (apps/api/src/data/seed.ts) -- not imported directly, since packages must
 * not depend on apps, but structurally identical.
 */

const checkoutContainer: C4Node = {
  id: 'ctr-checkout',
  level: 'container',
  name: 'Checkout Service',
  technology: 'Node.js',
  description: 'Orchestrates cart validation, order creation, and payment/fraud calls.',
  metadata: {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce/services/checkout',
        sourceType: 'source-code',
        derivedBy: 'extraction-engine',
        derivedAt: '2026-07-30T00:00:00.000Z',
      },
    ],
    confidence: { level: 'high', score: 0.92 },
  },
};

const paymentsContainer: C4Node = {
  id: 'ctr-payments',
  level: 'container',
  name: 'Payments Gateway Adapter',
  description: 'Adapts checkout requests to the Meridian Pay API.',
  metadata: {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce/services/payments-adapter',
        sourceType: 'source-code',
        derivedBy: 'extraction-engine',
        derivedAt: '2026-07-30T00:00:00.000Z',
      },
    ],
    confidence: { level: 'low', score: 0.45, rationale: 'Source disputed by an architecture doc.' },
  },
};

const authorizeEdge: C4Edge = {
  id: 'e-3',
  source: 'ctr-checkout',
  target: 'ctr-payments',
  label: 'authorize payment',
  level: 'container',
  metadata: {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce',
        sourceType: 'source-code',
        derivedBy: 'extraction-engine',
        derivedAt: '2026-07-30T00:00:00.000Z',
      },
    ],
    confidence: { level: 'high', score: 0.88 },
  },
};

const orderingDomain: Domain = {
  id: 'dom-ordering',
  name: 'Ordering',
  description: 'Shopping cart through order placement and lifecycle state.',
  metadata: {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce/services/checkout',
        sourceType: 'source-code',
        derivedBy: 'inference-engine',
        derivedAt: '2026-07-29T00:00:00.000Z',
      },
    ],
    confidence: { level: 'high', score: 0.91 },
  },
  aggregates: [
    {
      id: 'agg-order',
      name: 'Order',
      entities: ['Order', 'OrderLine', 'OrderStatusHistory'],
      metadata: {
        provenance: [
          {
            sourceId: 'data-model://aurora-schema.sql',
            sourceType: 'data-model',
            derivedBy: 'extraction-engine',
            derivedAt: '2026-07-30T00:00:00.000Z',
          },
        ],
        confidence: { level: 'high', score: 0.96 },
      },
    },
  ],
};

function c4NodeToCanonicalObject(node: C4Node): CanonicalKnowledgeObject {
  return {
    identity: {
      id: node.id,
      systemId: 'aurora-commerce',
      createdAt: node.metadata.provenance[0]?.derivedAt ?? new Date(0).toISOString(),
      updatedAt: node.metadata.provenance[0]?.derivedAt ?? new Date(0).toISOString(),
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: `architecture.${node.level}`,
    label: node.name,
    attributes: {
      description: node.description,
      ...(node.technology ? { technology: node.technology } : {}),
    },
    metadata: node.metadata,
    evidence: [],
  };
}

function c4EdgeToCanonicalRelationship(edge: C4Edge): CanonicalKnowledgeRelationship {
  return {
    id: edge.id,
    // C4 container edges represent runtime calls/data exchange, not
    // structural containment — the "interaction" category (P2-02).
    category: 'interaction',
    kind: edge.label,
    sourceObjectId: edge.source,
    targetObjectId: edge.target,
    metadata: edge.metadata,
  };
}

function domainToCanonicalObjects(domain: Domain): CanonicalKnowledgeObject[] {
  const domainObject: CanonicalKnowledgeObject = {
    identity: {
      id: domain.id,
      systemId: 'aurora-commerce',
      createdAt: domain.metadata.provenance[0]?.derivedAt ?? new Date(0).toISOString(),
      updatedAt: domain.metadata.provenance[0]?.derivedAt ?? new Date(0).toISOString(),
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'domain.domain',
    label: domain.name,
    attributes: { description: domain.description },
    metadata: domain.metadata,
    evidence: [],
  };
  const aggregateObjects: CanonicalKnowledgeObject[] = domain.aggregates.map((aggregate) => ({
    identity: {
      id: aggregate.id,
      systemId: 'aurora-commerce',
      createdAt: aggregate.metadata.provenance[0]?.derivedAt ?? new Date(0).toISOString(),
      updatedAt: aggregate.metadata.provenance[0]?.derivedAt ?? new Date(0).toISOString(),
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'domain.aggregate',
    label: aggregate.name,
    attributes: { entities: aggregate.entities },
    metadata: aggregate.metadata,
    evidence: [],
  }));
  return [domainObject, ...aggregateObjects];
}

describe('Phase 1 contract compatibility', () => {
  it('represents real C4Node/C4Edge (Architecture, P1-04) shapes as a valid canonical bundle', () => {
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [checkoutContainer, paymentsContainer].map(c4NodeToCanonicalObject),
      relationships: [c4EdgeToCanonicalRelationship(authorizeEdge)],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('represents a real Domain/Aggregate (Domain Model, P1-05) shape as a valid canonical bundle, with a "contains" relationship added', () => {
    const objects = domainToCanonicalObjects(orderingDomain);
    const containsRelationship: CanonicalKnowledgeRelationship = {
      id: 'rel-dom-ordering-contains-agg-order',
      // Domain -> Aggregate is structural containment/hierarchy — the
      // "composition" category (P2-02). Directionality convention: source
      // is the container (domain), target is the contained (aggregate).
      category: 'composition',
      kind: 'contains',
      sourceObjectId: 'dom-ordering',
      targetObjectId: 'agg-order',
      metadata: orderingDomain.metadata,
    };
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects,
      relationships: [containsRelationship],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('preserves confidence and provenance exactly (no lossy conversion) when adapting a C4Node', () => {
    const canonical = c4NodeToCanonicalObject(paymentsContainer);
    expect(canonical.metadata).toEqual(paymentsContainer.metadata);
    expect(canonical.metadata.confidence.level).toBe('low');
    expect(canonical.metadata.confidence.rationale).toBe('Source disputed by an architecture doc.');
  });
});
