import { describe, expect, it } from 'vitest';
import type { CanonicalKnowledgeObject } from '../src/canonical-object.js';
import { validateCanonicalKnowledgeObject } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function baseObject(): CanonicalKnowledgeObject {
  return {
    identity: {
      id: 'obj-checkout-service',
      systemId: 'aurora-commerce',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'architecture.container',
    label: 'Checkout Service',
    attributes: { technology: 'Node.js' },
    metadata: {
      provenance: [
        {
          sourceId: 'repo://aurora-commerce/services/checkout',
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      confidence: { level: 'high', score: 0.92 },
    },
    evidence: [],
  };
}

describe('CanonicalKnowledgeObject — required fields', () => {
  it('accepts a fully-populated valid object', () => {
    const result = validateCanonicalKnowledgeObject(baseObject());
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects a missing identity', () => {
    const object = baseObject() as unknown as Record<string, unknown>;
    delete object.identity;
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('identity is required');
  });

  it('rejects an empty kind/label', () => {
    const object = { ...baseObject(), kind: '', label: '' };
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('kind is required');
    expect(result.errors).toContain('label is required');
  });

  it('rejects an object with no provenance (every canonical object must trace to a source)', () => {
    const object = baseObject();
    object.metadata = { ...object.metadata, provenance: [] };
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('provenance'))).toBe(true);
  });

  it('rejects a non-object attributes bag', () => {
    const object = { ...baseObject(), attributes: 'not-an-object' };
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attributes must be an object (may be empty)');
  });
});

describe('CanonicalKnowledgeObject — optional fields', () => {
  it('accepts an empty attributes bag and empty evidence array', () => {
    const object = { ...baseObject(), attributes: {}, evidence: [] };
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });

  it('accepts confidence without score/rationale (both optional per @phoenix-ai/shared)', () => {
    const object = baseObject();
    object.metadata = { ...object.metadata, confidence: { level: 'inferred' } };
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });

  it('accepts evidence entries without excerpt/locator', () => {
    const object = baseObject();
    object.evidence = [{ id: 'ev-1', sourceId: 'repo://aurora-commerce/services/checkout' }];
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });

  it('accepts evidence entries with excerpt and locator populated', () => {
    const object = baseObject();
    object.evidence = [
      {
        id: 'ev-1',
        sourceId: 'repo://aurora-commerce/services/checkout',
        excerpt: 'export class CheckoutService { ... }',
        locator: 'src/checkout.ts:1-40',
      },
    ];
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });
});

describe('CanonicalKnowledgeObject — invalid structures', () => {
  it('rejects null and non-object candidates', () => {
    expect(validateCanonicalKnowledgeObject(null).valid).toBe(false);
    expect(validateCanonicalKnowledgeObject('a string').valid).toBe(false);
    expect(validateCanonicalKnowledgeObject(42).valid).toBe(false);
    expect(validateCanonicalKnowledgeObject(undefined).valid).toBe(false);
  });

  it('rejects a non-ISO createdAt/updatedAt', () => {
    const object = baseObject();
    object.identity = { ...object.identity, createdAt: 'not-a-date' };
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('identity.createdAt must be an ISO-8601 timestamp');
  });

  it('rejects a missing or unrecognized category (P2-02)', () => {
    const missing = baseObject() as unknown as Record<string, unknown>;
    delete missing.category;
    expect(validateCanonicalKnowledgeObject(missing).valid).toBe(false);

    const bogus = { ...baseObject(), category: 'bogus-category' };
    const result = validateCanonicalKnowledgeObject(bogus);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('category must be one of: entity, process, observation, other');
  });
});

describe('CanonicalKnowledgeObject — lifecycle (P2-02, "where appropriate")', () => {
  it('accepts an object with no lifecycle at all — most entity objects will not have one', () => {
    const object = baseObject();
    expect('lifecycle' in object).toBe(false);
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });

  it('accepts an observation object with a valid lifecycle', () => {
    const object = {
      ...baseObject(),
      category: 'observation' as const,
      kind: 'review.review-item',
      lifecycle: { status: 'pending', since: '2026-08-01T00:00:00.000Z' },
    };
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });

  it('accepts a lifecycle with previousStatus populated (a state transition)', () => {
    const object = {
      ...baseObject(),
      category: 'observation' as const,
      lifecycle: {
        status: 'confirmed',
        since: '2026-08-02T00:00:00.000Z',
        previousStatus: 'pending',
      },
    };
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });

  it('rejects a lifecycle missing status or an invalid since timestamp', () => {
    const missingStatus = { ...baseObject(), lifecycle: { since: '2026-08-01T00:00:00.000Z' } };
    const result1 = validateCanonicalKnowledgeObject(missingStatus);
    expect(result1.valid).toBe(false);
    expect(result1.errors).toContain('lifecycle.status is required when lifecycle is present');

    const badSince = { ...baseObject(), lifecycle: { status: 'pending', since: 'not-a-date' } };
    const result2 = validateCanonicalKnowledgeObject(badSince);
    expect(result2.valid).toBe(false);
    expect(result2.errors).toContain(
      'lifecycle.since must be an ISO-8601 timestamp when lifecycle is present',
    );
  });
});
