import { describe, expect, it } from 'vitest';
import type { CanonicalKnowledgeBundle } from '../src/bundle.js';
import type { CanonicalKnowledgeObject } from '../src/canonical-object.js';
import type { CanonicalKnowledgeRelationship } from '../src/relationships.js';
import type { Source } from '../src/provenance.js';
import { validateSource, validateSourceReferences, validateSources } from '../src/provenance.js';
import {
  validateCanonicalKnowledgeBundle,
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
} from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function provenanceEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    sourceId: 'repo://aurora-commerce/services/checkout',
    sourceType: 'source-code' as const,
    derivedBy: 'extraction-engine',
    derivedAt: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

function baseObject(overrides: Partial<Record<string, unknown>> = {}): CanonicalKnowledgeObject {
  return {
    identity: {
      id: 'obj-checkout',
      systemId: 'aurora-commerce',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'architecture.container',
    label: 'Checkout Service',
    attributes: {},
    metadata: {
      provenance: [provenanceEntry()],
      confidence: { level: 'high', score: 0.9 },
    },
    evidence: [],
    ...overrides,
  } as CanonicalKnowledgeObject;
}

function baseRelationship(
  overrides: Partial<Record<string, unknown>> = {},
): CanonicalKnowledgeRelationship {
  return {
    id: 'rel-1',
    category: 'interaction',
    kind: 'calls',
    sourceObjectId: 'obj-checkout',
    targetObjectId: 'obj-payments',
    metadata: {
      provenance: [provenanceEntry()],
      confidence: { level: 'high', score: 0.9 },
    },
    ...overrides,
  } as CanonicalKnowledgeRelationship;
}

const checkoutRepoSource: Source = {
  id: 'repo://aurora-commerce/services/checkout',
  type: 'source-code',
  label: 'aurora-commerce/services/checkout',
  locator: 'https://git.internal/aurora-commerce/services/checkout',
  version: 'a1b2c3d',
};

// ---------------------------------------------------------------------------
// Source -- creation and validation
// ---------------------------------------------------------------------------

describe('Source — creation and validation', () => {
  it('accepts a fully-populated valid source, including version/revision', () => {
    expect(validateSource(checkoutRepoSource)).toEqual({ valid: true, errors: [] });
  });

  it('accepts a source with no version/revision (optional)', () => {
    const withoutVersion: Source = { ...checkoutRepoSource };
    delete withoutVersion.version;
    expect(validateSource(withoutVersion)).toEqual({ valid: true, errors: [] });
  });

  it('accepts a source with no locator (optional)', () => {
    const withoutLocator: Source = { ...checkoutRepoSource };
    delete withoutLocator.locator;
    expect(validateSource(withoutLocator)).toEqual({ valid: true, errors: [] });
  });

  it('accepts every future-source example from the objective, via the existing SourceType vocabulary', () => {
    const futureSources: Source[] = [
      { id: 'src-repo', type: 'source-code', label: 'source repository example' },
      { id: 'src-doc', type: 'technical-doc', label: 'documentation example' },
      { id: 'src-ticket', type: 'ticket', label: 'project/issue system example' },
      { id: 'src-config', type: 'data-model', label: 'configuration example' },
      { id: 'src-inference', type: 'other', label: 'future inference engine example' },
    ];
    for (const source of futureSources) {
      expect(validateSource(source).valid).toBe(true);
    }
  });

  it('rejects a source missing id/type/label', () => {
    const result = validateSource({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id is required');
    expect(result.errors).toContain('type is required');
    expect(result.errors).toContain('label is required');
  });

  it('rejects a non-string version', () => {
    const result = validateSource({ ...checkoutRepoSource, version: 12345 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('version, if present, must be a non-empty string');
  });

  it('rejects a non-string locator', () => {
    const result = validateSource({ ...checkoutRepoSource, locator: 12345 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('locator, if present, must be a non-empty string');
  });

  it('rejects null and non-object candidates', () => {
    expect(validateSource(null).valid).toBe(false);
    expect(validateSource('source').valid).toBe(false);
  });
});

describe('Source[] — validateSources', () => {
  it('accepts a list of distinct valid sources', () => {
    const warehouseSource: Source = {
      id: 'repo://aurora-commerce/services/warehouse',
      type: 'source-code',
      label: 'warehouse service',
    };
    expect(validateSources([checkoutRepoSource, warehouseSource])).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects duplicate source ids', () => {
    const result = validateSources([
      checkoutRepoSource,
      { ...checkoutRepoSource, label: 'duplicate' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate source id'))).toBe(true);
  });

  it('rejects a non-array candidate', () => {
    expect(validateSources({}).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Provenance entries -- timestamps, invalid provenance (folded into the
// base object/relationship validators, see validation.ts)
// ---------------------------------------------------------------------------

describe('Provenance entries — timestamps and required fields', () => {
  it('accepts an object whose provenance entry has a valid ISO-8601 derivedAt', () => {
    expect(validateCanonicalKnowledgeObject(baseObject()).valid).toBe(true);
  });

  it('rejects a provenance entry with an invalid derivedAt timestamp', () => {
    const object = baseObject({
      metadata: {
        provenance: [provenanceEntry({ derivedAt: 'not-a-timestamp' })],
        confidence: { level: 'high' },
      },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'metadata.provenance[0].derivedAt must be an ISO-8601 timestamp',
    );
  });

  it('rejects a provenance entry missing sourceId', () => {
    const object = baseObject({
      metadata: {
        provenance: [provenanceEntry({ sourceId: '' })],
        confidence: { level: 'high' },
      },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('metadata.provenance[0].sourceId is required');
  });

  it('rejects a provenance entry missing sourceType', () => {
    const object = baseObject({
      metadata: {
        provenance: [provenanceEntry({ sourceType: '' })],
        confidence: { level: 'high' },
      },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('metadata.provenance[0].sourceType is required');
  });

  it('rejects a provenance entry missing derivedBy (extraction/derivation information)', () => {
    const object = baseObject({
      metadata: {
        provenance: [provenanceEntry({ derivedBy: '' })],
        confidence: { level: 'high' },
      },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('metadata.provenance[0].derivedBy is required');
  });

  it('rejects a non-object provenance entry', () => {
    const object = baseObject({
      metadata: { provenance: ['not-an-object'], confidence: { level: 'high' } },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('metadata.provenance[0] must be an object');
  });

  it('reports every malformed provenance entry, indexed, when there are several', () => {
    const object = baseObject({
      metadata: {
        provenance: [provenanceEntry(), provenanceEntry({ derivedAt: 'bogus' })],
        confidence: { level: 'high' },
      },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'metadata.provenance[1].derivedAt must be an ISO-8601 timestamp',
    );
    expect(result.errors.some((e) => e.startsWith('metadata.provenance[0]'))).toBe(false);
  });

  it('applies the same per-entry checks to relationship provenance', () => {
    const relationship = baseRelationship({
      metadata: {
        provenance: [provenanceEntry({ derivedAt: 'not-a-timestamp' })],
        confidence: { level: 'high' },
      },
    });
    const result = validateCanonicalKnowledgeRelationship(relationship);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'metadata.provenance[0].derivedAt must be an ISO-8601 timestamp',
    );
  });
});

// ---------------------------------------------------------------------------
// Bundle-level source references -- the "relationship between knowledge and
// its source", made traceable and deterministic
// ---------------------------------------------------------------------------

describe('validateSourceReferences — bundle-level traceability', () => {
  function bundleWith(overrides: Partial<CanonicalKnowledgeBundle> = {}): CanonicalKnowledgeBundle {
    return {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [baseObject()],
      relationships: [],
      ...overrides,
    };
  }

  it('is valid with no sources registry at all (optional layer)', () => {
    const result = validateSourceReferences(bundleWith());
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('resolves every object/relationship sourceId against a provided sources registry', () => {
    const bundle = bundleWith({
      objects: [
        baseObject(),
        baseObject({ identity: { ...baseObject().identity, id: 'obj-payments' } }),
      ],
      relationships: [baseRelationship()],
      sources: [checkoutRepoSource],
    });
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('resolves evidence sourceId against the sources registry too', () => {
    const object = baseObject({
      evidence: [
        { id: 'ev-1', sourceId: checkoutRepoSource.id, excerpt: 'export function checkout() {}' },
      ],
    });
    const bundle = bundleWith({ objects: [object], sources: [checkoutRepoSource] });
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a provenance sourceId that does not resolve against a non-empty sources registry', () => {
    const bundle = bundleWith({
      sources: [{ id: 'some-other-source', type: 'ticket', label: 'unrelated' }],
    });
    const result = validateSourceReferences(bundle);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some(
        (e) =>
          e ===
          'objects[0].metadata.provenance[0].sourceId "repo://aurora-commerce/services/checkout" does not reference a known source',
      ),
    ).toBe(true);
  });

  it('rejects an evidence sourceId that does not resolve', () => {
    const object = baseObject({ evidence: [{ id: 'ev-1', sourceId: 'ghost-source' }] });
    const bundle = bundleWith({ objects: [object], sources: [checkoutRepoSource] });
    const result = validateSourceReferences(bundle);
    expect(result.valid).toBe(false);
    expect(
      result.errors.some((e) =>
        e.includes('evidence[0].sourceId "ghost-source" does not reference a known source'),
      ),
    ).toBe(true);
  });

  it('rejects an empty sources registry when an object references a sourceId (registry is authoritative once provided)', () => {
    const result = validateSourceReferences(bundleWith({ sources: [] }));
    expect(result.valid).toBe(false);
  });

  it('propagates duplicate-source-id errors from the sources registry itself', () => {
    const bundle = bundleWith({
      sources: [checkoutRepoSource, { ...checkoutRepoSource, label: 'dup' }],
    });
    const result = validateSourceReferences(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate source id'))).toBe(true);
  });

  it('rejects a non-object candidate', () => {
    expect(validateSourceReferences(null).valid).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: Source + Provenance + Evidence composed on a real bundle,
// still validating cleanly against the base bundle validator too
// ---------------------------------------------------------------------------

describe('Provenance model composed end to end', () => {
  it('a fully-populated bundle with a sources registry is valid against both validators', () => {
    const object = baseObject({
      evidence: [
        {
          id: 'ev-1',
          sourceId: checkoutRepoSource.id,
          excerpt: 'router.post("/checkout", handler)',
          locator: 'src/routes/checkout.ts:14',
        },
      ],
    });
    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [object],
      relationships: [],
      sources: [checkoutRepoSource],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('a later differential run can reference a new version/revision of the same source id without changing its identity', () => {
    const v1: Source = { ...checkoutRepoSource, version: 'a1b2c3d' };
    const v2: Source = { ...checkoutRepoSource, version: 'f9e8d7c' };
    expect(v1.id).toBe(v2.id);
    expect(validateSource(v1).valid).toBe(true);
    expect(validateSource(v2).valid).toBe(true);
  });
});
