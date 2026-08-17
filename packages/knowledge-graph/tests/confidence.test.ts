import { describe, expect, it } from 'vitest';
import type { CanonicalKnowledgeObject } from '../src/canonical-object.js';
import type { CanonicalKnowledgeRelationship } from '../src/relationships.js';
import type { ConfidenceDetail } from '../src/confidence.js';
import {
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
} from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

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
      provenance: [
        {
          sourceId: 'repo://aurora-commerce/services/checkout',
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
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
    ...overrides,
  } as CanonicalKnowledgeRelationship;
}

// ---------------------------------------------------------------------------
// ConfidenceDetail — valid combinations
// ---------------------------------------------------------------------------

describe('ConfidenceDetail — valid combinations', () => {
  it('accepts an object with no confidenceDetail at all (fully optional, backward-compatible with P2-01–P2-07)', () => {
    expect(validateCanonicalKnowledgeObject(baseObject()).valid).toBe(true);
  });

  it('accepts basis "observed" with no calculation', () => {
    const object = baseObject({
      confidenceDetail: { basis: 'observed' } satisfies ConfidenceDetail,
    });
    expect(validateCanonicalKnowledgeObject(object)).toEqual({ valid: true, errors: [] });
  });

  it('accepts basis "derived" with no calculation', () => {
    const object = baseObject({
      confidenceDetail: { basis: 'derived' } satisfies ConfidenceDetail,
    });
    expect(validateCanonicalKnowledgeObject(object)).toEqual({ valid: true, errors: [] });
  });

  it('accepts basis "derived" with full calculation metadata', () => {
    const confidenceDetail: ConfidenceDetail = {
      basis: 'derived',
      calculation: {
        method: 'reconciliation-engine',
        calculatedAt: '2026-08-01T00:00:00.000Z',
        inputs: { corroboratingSources: 2, heuristic: 'log-pattern-match' },
      },
    };
    const object = baseObject({ confidenceDetail });
    expect(validateCanonicalKnowledgeObject(object)).toEqual({ valid: true, errors: [] });
  });

  it('accepts calculation with no inputs (optional)', () => {
    const confidenceDetail: ConfidenceDetail = {
      basis: 'derived',
      calculation: { method: 'manual-review', calculatedAt: '2026-08-01T00:00:00.000Z' },
    };
    expect(validateCanonicalKnowledgeObject(baseObject({ confidenceDetail })).valid).toBe(true);
  });

  it('applies identically to relationships (a relationship is itself a claim)', () => {
    const confidenceDetail: ConfidenceDetail = { basis: 'observed' };
    expect(
      validateCanonicalKnowledgeRelationship(baseRelationship({ confidenceDetail })).valid,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// ConfidenceDetail — invalid values
// ---------------------------------------------------------------------------

describe('ConfidenceDetail — invalid values', () => {
  it('rejects a missing basis', () => {
    const object = baseObject({ confidenceDetail: {} });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('confidenceDetail.basis must be one of: observed, derived');
  });

  it('rejects an unrecognized basis value', () => {
    const object = baseObject({ confidenceDetail: { basis: 'assumed' } });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('confidenceDetail.basis must be one of: observed, derived');
  });

  it('rejects a non-object confidenceDetail', () => {
    const object = baseObject({ confidenceDetail: 'derived' });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('confidenceDetail, if present, must be an object');
  });

  it('rejects a calculation missing method', () => {
    const object = baseObject({
      confidenceDetail: {
        basis: 'derived',
        calculation: { calculatedAt: '2026-08-01T00:00:00.000Z' },
      },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'confidenceDetail.calculation.method is required when calculation is present',
    );
  });

  it('rejects a calculation with an invalid calculatedAt timestamp', () => {
    const object = baseObject({
      confidenceDetail: {
        basis: 'derived',
        calculation: { method: 'reconciliation-engine', calculatedAt: 'not-a-timestamp' },
      },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'confidenceDetail.calculation.calculatedAt must be an ISO-8601 timestamp when calculation is present',
    );
  });

  it('rejects a non-object calculation', () => {
    const object = baseObject({ confidenceDetail: { basis: 'derived', calculation: 'yesterday' } });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('confidenceDetail.calculation, if present, must be an object');
  });

  it('rejects a non-object calculation.inputs', () => {
    const object = baseObject({
      confidenceDetail: {
        basis: 'derived',
        calculation: {
          method: 'heuristic',
          calculatedAt: '2026-08-01T00:00:00.000Z',
          inputs: 'a lot',
        },
      },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'confidenceDetail.calculation.inputs, if present, must be an object',
    );
  });

  it('rejects a null confidenceDetail explicitly set', () => {
    const object = baseObject({ confidenceDetail: null });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
  });

  it('applies the same rejection rules to relationships', () => {
    const relationship = baseRelationship({ confidenceDetail: { basis: 'unknown-basis' } });
    const result = validateCanonicalKnowledgeRelationship(relationship);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('confidenceDetail.basis must be one of: observed, derived');
  });
});

// ---------------------------------------------------------------------------
// Confidence remains independent from provenance
// ---------------------------------------------------------------------------

describe('Confidence independence from provenance', () => {
  it('a valid confidenceDetail requires no reference to any Provenance/Source field', () => {
    const confidenceDetail: ConfidenceDetail = { basis: 'observed' };
    expect(Object.keys(confidenceDetail)).not.toContain('sourceId');
    expect(Object.keys(confidenceDetail)).not.toContain('sourceType');
    expect(validateCanonicalKnowledgeObject(baseObject({ confidenceDetail })).valid).toBe(true);
  });

  it('two objects can share identical provenance but carry different confidence bases', () => {
    const sharedProvenance = baseObject().metadata.provenance;
    const observedObject = baseObject({
      identity: { ...baseObject().identity, id: 'obj-a' },
      metadata: { provenance: sharedProvenance, confidence: { level: 'high', score: 0.9 } },
      confidenceDetail: { basis: 'observed' } satisfies ConfidenceDetail,
    });
    const derivedObject = baseObject({
      identity: { ...baseObject().identity, id: 'obj-b' },
      metadata: { provenance: sharedProvenance, confidence: { level: 'high', score: 0.9 } },
      confidenceDetail: { basis: 'derived' } satisfies ConfidenceDetail,
    });
    expect(validateCanonicalKnowledgeObject(observedObject).valid).toBe(true);
    expect(validateCanonicalKnowledgeObject(derivedObject).valid).toBe(true);
    expect(observedObject.confidenceDetail?.basis).not.toBe(derivedObject.confidenceDetail?.basis);
  });
});

// ---------------------------------------------------------------------------
// FACT/DIRECTLY OBSERVED vs DERIVED/INFERRED — the real Phase 1 gap this
// closes. Real score ranges taken from apps/web/src/data/mock (aurora):
// high observed ~0.9, medium ~0.6-0.68, Phase 1's level:'inferred' entries
// always carry a LOW score (0.25-0.32) -- Phase 1 has no way to represent
// a *confident* inference, because 'inferred' spends its one dimension on
// both "not observed" and "not very sure" at once.
// ---------------------------------------------------------------------------

describe('FACT/DIRECTLY OBSERVED vs DERIVED/INFERRED — real-world-grounded scenarios', () => {
  it('represents a directly-observed, high-confidence fact (real Aurora range: level high, score ~0.9)', () => {
    const object = baseObject({
      metadata: {
        provenance: baseObject().metadata.provenance,
        confidence: { level: 'high', score: 0.9 },
      },
      confidenceDetail: { basis: 'observed' } satisfies ConfidenceDetail,
    });
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });

  it('represents a low-confidence inference, matching how Phase 1 used level:"inferred" (real Aurora range: score ~0.25-0.32)', () => {
    const object = baseObject({
      metadata: {
        provenance: baseObject().metadata.provenance,
        confidence: { level: 'inferred', score: 0.28 },
      },
      confidenceDetail: { basis: 'derived' } satisfies ConfidenceDetail,
    });
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });

  it('represents a HIGH-confidence inference — a combination Phase 1\'s single level enum could never express, since "inferred" already occupies the low-trust slot', () => {
    const object = baseObject({
      metadata: {
        provenance: baseObject().metadata.provenance,
        confidence: {
          level: 'high',
          score: 0.85,
          rationale: 'Corroborated by three independent log sources',
        },
      },
      confidenceDetail: {
        basis: 'derived',
        calculation: {
          method: 'corroboration-count',
          calculatedAt: '2026-08-01T00:00:00.000Z',
          inputs: { corroboratingSources: 3 },
        },
      } satisfies ConfidenceDetail,
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result).toEqual({ valid: true, errors: [] });
    expect(object.metadata.confidence.level).toBe('high');
    expect(object.confidenceDetail?.basis).toBe('derived');
  });

  it('represents a low-confidence DIRECT observation — the other combination the old single-axis model could not cleanly express either', () => {
    const object = baseObject({
      metadata: {
        provenance: baseObject().metadata.provenance,
        confidence: {
          level: 'low',
          score: 0.4,
          rationale: 'Observed once in a stale log snapshot',
        },
      },
      confidenceDetail: { basis: 'observed' } satisfies ConfidenceDetail,
    });
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
    expect(object.confidenceDetail?.basis).toBe('observed');
  });
});
