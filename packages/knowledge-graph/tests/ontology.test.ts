import { describe, expect, it } from 'vitest';
import {
  RELATIONSHIP_CATEGORIES,
  STRUCTURAL_CATEGORIES,
  type RelationshipCategory,
  type StructuralCategory,
} from '../src/ontology.js';
import type { CanonicalKnowledgeBundle } from '../src/bundle.js';
import type { CanonicalKnowledgeObject } from '../src/canonical-object.js';
import type { CanonicalKnowledgeRelationship } from '../src/relationships.js';
import { validateCanonicalKnowledgeBundle } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function meta() {
  return {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce',
        sourceType: 'source-code' as const,
        derivedBy: 'extraction-engine',
        derivedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    confidence: { level: 'high' as const, score: 0.9 },
  };
}

function object(
  id: string,
  category: StructuralCategory,
  kind: string,
  label: string,
): CanonicalKnowledgeObject {
  return {
    identity: {
      id,
      systemId: 'aurora-commerce',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category,
    kind,
    label,
    attributes: {},
    metadata: meta(),
    evidence: [],
  };
}

function relationship(
  id: string,
  category: RelationshipCategory,
  kind: string,
  sourceObjectId: string,
  targetObjectId: string,
): CanonicalKnowledgeRelationship {
  return { id, category, kind, sourceObjectId, targetObjectId, metadata: meta() };
}

describe('StructuralCategory / RelationshipCategory — universal vocabulary', () => {
  it('STRUCTURAL_CATEGORIES matches the StructuralCategory union exactly', () => {
    const expected: StructuralCategory[] = ['entity', 'process', 'observation', 'other'];
    expect(STRUCTURAL_CATEGORIES).toEqual(expected);
  });

  it('RELATIONSHIP_CATEGORIES matches the RelationshipCategory union exactly', () => {
    const expected: RelationshipCategory[] = [
      'composition',
      'association',
      'interaction',
      'realization',
      'other',
    ];
    expect(RELATIONSHIP_CATEGORIES).toEqual(expected);
  });

  it('includes an "other" escape hatch on both, for extensibility beyond the defined categories', () => {
    expect(STRUCTURAL_CATEGORIES).toContain('other');
    expect(RELATIONSHIP_CATEGORIES).toContain('other');
  });
});

describe('Hierarchy — composition relationships form a traversable tree (directionality convention)', () => {
  it('lets a consumer walk System -> Container -> Aggregate purely via composition relationships', () => {
    const system = object('sys-aurora', 'entity', 'system', 'Aurora Commerce Platform');
    const checkout = object('ctr-checkout', 'entity', 'architecture.container', 'Checkout Service');
    const orderAggregate = object('agg-order', 'entity', 'domain.aggregate', 'Order');

    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [system, checkout, orderAggregate],
      relationships: [
        // Convention: source = container/parent, target = contained/child.
        relationship('rel-1', 'composition', 'contains', 'sys-aurora', 'ctr-checkout'),
        relationship('rel-2', 'composition', 'contains', 'ctr-checkout', 'agg-order'),
      ],
    };

    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });

    // Walk the hierarchy from the root using only `category: 'composition'`.
    const childrenOf = (parentId: string) =>
      bundle.relationships
        .filter((r) => r.category === 'composition' && r.sourceObjectId === parentId)
        .map((r) => r.targetObjectId);

    expect(childrenOf('sys-aurora')).toEqual(['ctr-checkout']);
    expect(childrenOf('ctr-checkout')).toEqual(['agg-order']);
    expect(childrenOf('agg-order')).toEqual([]);
  });
});

describe('Observation category — resolves the P2-01 ReviewItem/GapItem/DriftAlert gap', () => {
  it('represents a review-style observation about another object, with a lifecycle', () => {
    const disputedContainer = object(
      'ctr-payments',
      'entity',
      'architecture.container',
      'Payments Gateway Adapter',
    );
    const reviewObservation: CanonicalKnowledgeObject = {
      ...object('obs-rev-1', 'observation', 'review.disputed-attribute', 'Technology disputed'),
      lifecycle: { status: 'pending', since: '2026-08-01T00:00:00.000Z' },
    };
    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [disputedContainer, reviewObservation],
      relationships: [
        relationship('rel-observes', 'association', 'references', 'obs-rev-1', 'ctr-payments'),
      ],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });
});

describe('Extensibility — "other" accepts a not-yet-categorized future kind', () => {
  it('accepts an object and relationship tagged "other" without forcing a bad fit', () => {
    const mystery = object('obj-mystery', 'other', 'future-source.unknown-thing', 'Something new');
    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [mystery],
      relationships: [],
    };
    expect(validateCanonicalKnowledgeBundle(bundle).valid).toBe(true);
  });
});
