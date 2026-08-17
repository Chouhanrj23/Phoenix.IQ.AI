import { describe, expect, it } from 'vitest';
import type { CanonicalKnowledgeRelationship } from '../src/relationships.js';
import { validateCanonicalKnowledgeRelationship } from '../src/validation.js';

function baseRelationship(): CanonicalKnowledgeRelationship {
  return {
    id: 'rel-1',
    category: 'interaction',
    kind: 'calls',
    sourceObjectId: 'obj-checkout-service',
    targetObjectId: 'obj-payments-adapter',
    metadata: {
      provenance: [
        {
          sourceId: 'repo://aurora-commerce',
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      confidence: { level: 'high', score: 0.88 },
    },
  };
}

describe('CanonicalKnowledgeRelationship — required fields', () => {
  it('accepts a fully-populated valid relationship', () => {
    expect(validateCanonicalKnowledgeRelationship(baseRelationship())).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects a missing kind', () => {
    const relationship = { ...baseRelationship(), kind: '' };
    const result = validateCanonicalKnowledgeRelationship(relationship);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('kind is required');
  });

  it('rejects a self-referencing relationship', () => {
    const relationship = {
      ...baseRelationship(),
      targetObjectId: baseRelationship().sourceObjectId,
    };
    const result = validateCanonicalKnowledgeRelationship(relationship);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) => e.includes('sourceObjectId and targetObjectId must differ')),
    ).toBe(true);
  });

  it('rejects a relationship with no provenance', () => {
    const relationship = baseRelationship();
    relationship.metadata = { ...relationship.metadata, provenance: [] };
    expect(validateCanonicalKnowledgeRelationship(relationship).valid).toBe(false);
  });
});

describe('CanonicalKnowledgeRelationship — invalid structures', () => {
  it('rejects null and non-object candidates', () => {
    expect(validateCanonicalKnowledgeRelationship(null).valid).toBe(false);
    expect(validateCanonicalKnowledgeRelationship([]).valid).toBe(false);
  });

  it('rejects a relationship missing metadata entirely', () => {
    const relationship = baseRelationship() as unknown as Record<string, unknown>;
    delete relationship.metadata;
    const result = validateCanonicalKnowledgeRelationship(relationship);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('metadata is required');
  });
});

describe('CanonicalKnowledgeRelationship — category (P2-02)', () => {
  it('accepts every defined relationship category', () => {
    for (const category of [
      'composition',
      'association',
      'interaction',
      'realization',
      'other',
    ] as const) {
      const relationship = { ...baseRelationship(), category };
      expect(validateCanonicalKnowledgeRelationship(relationship).valid).toBe(true);
    }
  });

  it('rejects a missing or unrecognized category', () => {
    const missing = baseRelationship() as unknown as Record<string, unknown>;
    delete missing.category;
    expect(validateCanonicalKnowledgeRelationship(missing).valid).toBe(false);

    const bogus = { ...baseRelationship(), category: 'bogus' };
    const result = validateCanonicalKnowledgeRelationship(bogus);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'category must be one of: composition, association, interaction, realization, other',
    );
  });
});
