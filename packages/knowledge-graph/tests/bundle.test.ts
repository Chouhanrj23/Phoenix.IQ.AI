import { describe, expect, it } from 'vitest';
import type { CanonicalKnowledgeBundle } from '../src/bundle.js';
import type { CanonicalKnowledgeObject } from '../src/canonical-object.js';
import type { CanonicalKnowledgeRelationship } from '../src/relationships.js';
import { validateCanonicalKnowledgeBundle } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function makeObject(
  id: string,
  kind: string,
  label: string,
  category: CanonicalKnowledgeObject['category'] = 'entity',
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
    metadata: {
      provenance: [
        {
          sourceId: 'repo://aurora-commerce',
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      confidence: { level: 'high', score: 0.9 },
    },
    evidence: [],
  };
}

function makeRelationship(
  id: string,
  kind: string,
  sourceObjectId: string,
  targetObjectId: string,
  category: CanonicalKnowledgeRelationship['category'] = 'interaction',
): CanonicalKnowledgeRelationship {
  return {
    id,
    category,
    kind,
    sourceObjectId,
    targetObjectId,
    metadata: {
      provenance: [
        {
          sourceId: 'repo://aurora-commerce',
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      confidence: { level: 'high', score: 0.9 },
    },
  };
}

describe('CanonicalKnowledgeBundle — composition', () => {
  it('accepts a bundle whose relationships reference real objects', () => {
    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [
        makeObject('obj-checkout', 'architecture.container', 'Checkout Service'),
        makeObject('obj-payments', 'architecture.container', 'Payments Gateway Adapter'),
      ],
      relationships: [makeRelationship('rel-1', 'calls', 'obj-checkout', 'obj-payments')],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('accepts a bundle with no relationships (objects-only)', () => {
    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [makeObject('obj-checkout', 'architecture.container', 'Checkout Service')],
      relationships: [],
    };
    expect(validateCanonicalKnowledgeBundle(bundle).valid).toBe(true);
  });

  it('rejects a relationship pointing at an object not present in the bundle', () => {
    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [makeObject('obj-checkout', 'architecture.container', 'Checkout Service')],
      relationships: [makeRelationship('rel-1', 'calls', 'obj-checkout', 'obj-does-not-exist')],
    };
    const result = validateCanonicalKnowledgeBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not reference a known object'))).toBe(true);
  });

  it('rejects duplicate object ids within a bundle', () => {
    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [
        makeObject('obj-checkout', 'architecture.container', 'Checkout Service'),
        makeObject('obj-checkout', 'architecture.container', 'Checkout Service (dup)'),
      ],
      relationships: [],
    };
    const result = validateCanonicalKnowledgeBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate object id'))).toBe(true);
  });

  it('rejects duplicate relationship ids within a bundle (P8)', () => {
    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [
        makeObject('obj-checkout', 'architecture.container', 'Checkout Service'),
        makeObject('obj-payments', 'architecture.container', 'Payments Service'),
      ],
      relationships: [
        makeRelationship('rel-1', 'calls', 'obj-checkout', 'obj-payments'),
        makeRelationship('rel-1', 'calls', 'obj-payments', 'obj-checkout'),
      ],
    };
    const result = validateCanonicalKnowledgeBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('relationships[1]: duplicate relationship id "rel-1"');
  });

  it('accepts distinct relationship ids between the same pair of objects', () => {
    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [
        makeObject('obj-checkout', 'architecture.container', 'Checkout Service'),
        makeObject('obj-payments', 'architecture.container', 'Payments Service'),
      ],
      relationships: [
        makeRelationship('rel-1', 'calls', 'obj-checkout', 'obj-payments'),
        makeRelationship('rel-2', 'calls', 'obj-payments', 'obj-checkout'),
      ],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a bundle missing systemId/generatedAt', () => {
    const bundle = { objects: [], relationships: [] };
    const result = validateCanonicalKnowledgeBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('systemId is required');
    expect(result.errors).toContain('generatedAt must be an ISO-8601 timestamp');
  });
});

describe('CanonicalKnowledgeBundle — invalid structures', () => {
  it('rejects null and non-object candidates', () => {
    expect(validateCanonicalKnowledgeBundle(null).valid).toBe(false);
    expect(validateCanonicalKnowledgeBundle('bundle').valid).toBe(false);
  });

  it('rejects non-array objects/relationships', () => {
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: 'not-an-array',
      relationships: 'not-an-array',
    };
    const result = validateCanonicalKnowledgeBundle(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('objects must be an array');
    expect(result.errors).toContain('relationships must be an array');
  });
});
