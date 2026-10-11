import { describe, expect, it } from 'vitest';
import {
  buildReviewDecision,
  validateConflictObject,
  validateSourceReferences,
  type BuildReviewDecisionInput,
  type CanonicalKnowledgeBundle,
  type CanonicalKnowledgeObject,
} from '@phoenix-ai/knowledge-graph';
import { computeConfidence } from '@phoenix-ai/reconciliation-engine';
import {
  applyCorrectionToObject,
  applyCorrectionsToBundle,
  buildCorrectionNodeOperation,
  CORRECTION_ATTRIBUTES,
} from '../src/propagation.js';

/**
 * P7-02 -- correction propagation. Every test here asserts one of the
 * required properties: the correction reaches the canonical model, it reaches
 * the graph write, identity is preserved, provenance and original evidence
 * remain, the corrected value is queryable, unrelated data is untouched, and
 * an unsafe correction preserves a conflict rather than inventing a fix.
 */

const AT = '2026-09-30T12:00:00.000Z';
const DECIDED_AT = '2026-09-30T11:00:00.000Z';

/** A realistic extracted container: two real provenance entries and real evidence. */
function extractedObject(
  overrides: Partial<CanonicalKnowledgeObject> = {},
): CanonicalKnowledgeObject {
  return {
    identity: {
      id: 'ctr-payments',
      systemId: 'aurora-commerce',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      schemaVersion: '1.0.0',
    },
    category: 'entity',
    kind: 'architecture.container',
    label: 'Payments Gateway Adapter',
    attributes: { technology: 'Node.js/Express', description: 'Adapts checkout to Meridian Pay.' },
    metadata: {
      provenance: [
        {
          sourceId: 'repo://aurora-commerce/services/payments-adapter',
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: '2026-08-01T00:00:00.000Z',
        },
        {
          sourceId: 'docs/architecture-2024.pdf',
          sourceType: 'technical-doc',
          derivedBy: 'inference-engine',
          derivedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      confidence: { level: 'low', score: 0.45, rationale: 'Two sources disagree.' },
    },
    evidence: [
      {
        id: 'ev-code-1',
        sourceId: 'repo://aurora-commerce/services/payments-adapter',
        excerpt: 'const app = express();',
        locator: 'src/index.js:1-3',
      },
    ],
    ...overrides,
  };
}

function decision(overrides: Partial<BuildReviewDecisionInput> = {}) {
  return buildReviewDecision({
    systemId: 'aurora-commerce',
    targetObjectId: 'ctr-payments',
    targetLabel: 'Payments Gateway Adapter',
    targetAttribute: 'technology',
    decision: 'corrected',
    previousValue: 'Node.js/Express',
    correctedValue: 'Java / Spring Boot',
    reviewerId: 'reviewer-a',
    decidedAt: DECIDED_AT,
    ...overrides,
  });
}

describe('applyCorrectionToObject (P7-02) — the correction reaches the canonical model', () => {
  it('writes the human value onto the attribute downstream consumers already read', () => {
    const result = applyCorrectionToObject(extractedObject(), decision(), { at: AT });
    expect(result.outcome).toBe('applied');
    expect(result.object?.attributes.technology).toBe('Java / Spring Boot');
  });

  it('retains the superseded extracted value on the object — nothing is silently discarded', () => {
    const result = applyCorrectionToObject(extractedObject(), decision(), { at: AT });
    expect(result.object?.attributes[CORRECTION_ATTRIBUTES.supersededValue]).toBe(
      'Node.js/Express',
    );
    expect(result.object?.attributes[CORRECTION_ATTRIBUTES.correctedAttribute]).toBe('technology');
  });

  it('preserves node identity exactly — no id is regenerated', () => {
    const before = extractedObject();
    const result = applyCorrectionToObject(before, decision(), { at: AT });
    expect(result.object?.identity.id).toBe(before.identity.id);
    expect(result.object?.identity.systemId).toBe(before.identity.systemId);
    expect(result.object?.identity.createdAt).toBe(before.identity.createdAt);
    expect(result.object?.identity.schemaVersion).toBe(before.identity.schemaVersion);
    expect(result.object?.identity.updatedAt).toBe(AT);
  });

  it('keeps the original extraction provenance AND appends the human review provenance', () => {
    const result = applyCorrectionToObject(extractedObject(), decision(), { at: AT });
    const provenance = result.object?.metadata.provenance ?? [];
    expect(provenance.map((p) => p.derivedBy)).toEqual([
      'extraction-engine',
      'inference-engine',
      'human-review',
    ]);
    expect(
      provenance.some((p) => p.sourceId === 'repo://aurora-commerce/services/payments-adapter'),
    ).toBe(true);
  });

  it('leaves the original evidence intact and traceable', () => {
    const before = extractedObject();
    const result = applyCorrectionToObject(before, decision(), { at: AT });
    expect(result.object?.evidence).toEqual(before.evidence);
    expect(result.object?.evidence[0]?.locator).toBe('src/index.js:1-3');
  });

  it('makes the human contribution distinguishable from machine extraction', () => {
    const result = applyCorrectionToObject(extractedObject(), decision(), { at: AT });
    const attributes = result.object?.attributes ?? {};
    expect(attributes[CORRECTION_ATTRIBUTES.reviewStatus]).toBe('corrected');
    expect(attributes[CORRECTION_ATTRIBUTES.reviewedBy]).toBe('reviewer-a');
    expect(attributes[CORRECTION_ATTRIBUTES.reviewedAt]).toBe(DECIDED_AT);
    expect(attributes[CORRECTION_ATTRIBUTES.decisionId]).toBe(decision().identity.id);
    expect(result.object?.lifecycle?.status).toBe('corrected');
  });

  it('scores confidence with the Phase 6 model rather than asserting "human means high"', () => {
    const result = applyCorrectionToObject(extractedObject(), decision(), { at: AT });
    // One authoritative (3), uncorroborated source superseding one prior
    // value is exactly what Phase 6's computeConfidence scores as medium/0.75.
    // Notably NOT 'high': a human correction is authoritative but alone.
    expect(result.object?.metadata.confidence.level).toBe('medium');
    expect(result.object?.metadata.confidence.score).toBe(0.75);
    expect(result.object?.metadata.confidence.rationale).toContain('Phase 6');
  });

  it('matches what Phase 6 computeConfidence returns for those inputs, not a hand-picked level', () => {
    const expected = computeConfidence({
      supportingAuthority: 3,
      supportingSources: 1,
      contradictingSources: 1,
    });
    const result = applyCorrectionToObject(extractedObject(), decision(), { at: AT });
    expect(result.object?.metadata.confidence.level).toBe(expected.level);
    expect(result.object?.metadata.confidence.score).toBe(expected.score);
  });

  it('does not touch attributes the correction did not name', () => {
    const result = applyCorrectionToObject(extractedObject(), decision(), { at: AT });
    expect(result.object?.attributes.description).toBe('Adapts checkout to Meridian Pay.');
  });

  it('records a confirmation as review state without changing any value', () => {
    const confirmed = decision({ decision: 'confirmed', correctedValue: undefined });
    const result = applyCorrectionToObject(extractedObject(), confirmed, { at: AT });
    expect(result.outcome).toBe('confirmed');
    expect(result.object?.attributes.technology).toBe('Node.js/Express');
    expect(result.object?.attributes[CORRECTION_ATTRIBUTES.reviewStatus]).toBe('confirmed');
    expect(result.object?.metadata.confidence.level).toBe('low'); // untouched
  });

  it('records an unscoped correction as an annotation without guessing which attribute to change', () => {
    const unscoped = decision({ targetAttribute: undefined });
    const result = applyCorrectionToObject(extractedObject(), unscoped, { at: AT });
    expect(result.outcome).toBe('applied');
    expect(result.object?.attributes.technology).toBe('Node.js/Express');
    expect(result.object?.attributes[CORRECTION_ATTRIBUTES.correctedValue]).toBe(
      'Java / Spring Boot',
    );
    expect(result.reason).toContain('no targetAttribute');
  });
});

describe('applyCorrectionToObject (P7-02) — unsafe corrections preserve a conflict', () => {
  it('refuses a STALE correction and retains both positions instead of resolving them', () => {
    // The object has moved on since the human reviewed it.
    const moved = extractedObject({ attributes: { technology: 'Go', description: 'x' } });
    const result = applyCorrectionToObject(moved, decision(), { at: AT });

    expect(result.outcome).toBe('conflict');
    expect(result.object).toBeUndefined(); // the object is deliberately left alone
    expect(result.reason).toContain('stale correction');

    const conflict = result.conflict;
    expect(conflict?.kind).toBe('reconciliation.conflict');
    expect(conflict?.attributes.positions).toHaveLength(2);
    expect(conflict?.attributes.positions.map((p) => p.value)).toEqual([
      'Go',
      'Java / Spring Boot',
    ]);
  });

  it('produces a conflict that passes the real Phase 6 conflict validator', () => {
    const moved = extractedObject({ attributes: { technology: 'Go' } });
    const result = applyCorrectionToObject(moved, decision(), { at: AT });
    expect(validateConflictObject(result.conflict).valid).toBe(true);
  });

  it('weighs the human position against the extracted ones using the Phase 6 authority table', () => {
    const moved = extractedObject({ attributes: { technology: 'Go' } });
    const conflict = applyCorrectionToObject(moved, decision(), { at: AT }).conflict;
    const [extracted, human] = conflict?.attributes.positions ?? [];
    // source-code is authority 3 for a structural claim; the reviewer is also 3.
    expect(extracted?.sources[0]?.authority).toBe(3);
    expect(human?.sources[0]?.authority).toBe(3);
    expect(human?.sources[0]?.sourceId).toContain('review://');
  });

  it('retains the reviewed element evidence on the conflict, so the dispute stays traceable', () => {
    const moved = extractedObject({ attributes: { technology: 'Go' } });
    const conflict = applyCorrectionToObject(moved, decision(), { at: AT }).conflict;
    expect(conflict?.evidence[0]?.id).toBe('ev-code-1');
  });

  it('refuses to apply a decision aimed at a different object', () => {
    const elsewhere = decision({ targetObjectId: 'ctr-fraud' });
    const result = applyCorrectionToObject(extractedObject(), elsewhere, { at: AT });
    expect(result.outcome).toBe('conflict');
    expect(result.reason).toContain('refusing to apply it to a different object');
  });
});

describe('applyCorrectionsToBundle (P7-02) — unrelated knowledge stays unchanged', () => {
  function bundle(): CanonicalKnowledgeBundle {
    return {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      schemaVersion: '1.0.0',
      objects: [
        extractedObject(),
        extractedObject({
          identity: {
            id: 'ctr-fraud',
            systemId: 'aurora-commerce',
            createdAt: '2026-08-01T00:00:00.000Z',
            updatedAt: '2026-08-01T00:00:00.000Z',
            schemaVersion: '1.0.0',
          },
          label: 'Fraud Detection Service',
          attributes: { technology: 'Python' },
        }),
      ],
      relationships: [],
    };
  }

  it('updates only the reviewed object and returns every other object byte-identical', () => {
    const before = bundle();
    const result = applyCorrectionsToBundle(before, [decision()], { at: AT });

    const corrected = result.bundle.objects.find((o) => o.identity.id === 'ctr-payments');
    const untouched = result.bundle.objects.find((o) => o.identity.id === 'ctr-fraud');

    expect(corrected?.attributes.technology).toBe('Java / Spring Boot');
    expect(untouched).toEqual(before.objects[1]);
  });

  it('applies decisions oldest-first so a later decision supersedes an earlier one', () => {
    const first = decision({ correctedValue: 'Java 11', decidedAt: '2026-09-30T11:00:00.000Z' });
    const second = decision({
      correctedValue: 'Java 21',
      previousValue: 'Java 11',
      decidedAt: '2026-09-30T11:30:00.000Z',
      previousStatus: 'corrected',
    });

    const result = applyCorrectionsToBundle(bundle(), [first, second], { at: AT });
    const corrected = result.bundle.objects.find((o) => o.identity.id === 'ctr-payments');
    expect(corrected?.attributes.technology).toBe('Java 21');
    expect(result.conflicts).toHaveLength(0);
  });

  it('ignores a decision whose target is not in the bundle, rather than inventing an object', () => {
    const elsewhere = decision({ targetObjectId: 'does-not-exist' });
    const result = applyCorrectionsToBundle(bundle(), [elsewhere], { at: AT });
    expect(result.bundle.objects).toEqual(bundle().objects);
    expect(result.applications).toHaveLength(0);
  });

  it('collects conflicts instead of applying unsafe corrections', () => {
    const stale = decision({ previousValue: 'Something nobody extracted' });
    const result = applyCorrectionsToBundle(bundle(), [stale], { at: AT });
    expect(result.conflicts).toHaveLength(1);
    expect(
      result.bundle.objects.find((o) => o.identity.id === 'ctr-payments')?.attributes.technology,
    ).toBe('Node.js/Express');
  });

  it("registers a stale correction's reviewer as a source, so the conflict it produced stays resolvable (P8)", () => {
    const withRegistry: CanonicalKnowledgeBundle = {
      ...bundle(),
      sources: [
        {
          id: 'repo://aurora-commerce/services/payments-adapter',
          type: 'source-code',
          label: 'payments adapter',
        },
        { id: 'docs/architecture-2024.pdf', type: 'technical-doc', label: 'architecture 2024' },
      ],
    };
    // The ONLY decision in the batch is stale: no applied correction
    // registers this reviewer on its behalf.
    const stale = decision({
      previousValue: 'Something nobody extracted',
      reviewerId: 'reviewer-z',
    });
    const result = applyCorrectionsToBundle(withRegistry, [stale], { at: AT });

    const [conflict] = result.conflicts;
    expect(conflict?.metadata.provenance.map((p) => p.sourceId)).toContain('review://reviewer-z');
    expect(result.bundle.sources?.map((s) => s.id)).toContain('review://reviewer-z');
    expect(
      validateSourceReferences({
        ...result.bundle,
        objects: [...result.bundle.objects, ...result.conflicts],
      }),
    ).toEqual({ valid: true, errors: [] });
  });
});

describe('buildCorrectionNodeOperation (P7-02) — the canonical update reaches the graph', () => {
  it('updates the EXISTING node by id with MATCH, so it can never create a duplicate', () => {
    const op = buildCorrectionNodeOperation(decision(), { at: AT });
    expect(op.cypher).toBe(
      'MATCH (n {id: $id, systemId: $systemId}) SET n += $properties RETURN n',
    );
    expect(op.cypher).not.toContain('MERGE');
    expect(op.cypher).not.toContain('CREATE');
    expect(op.params.id).toBe('ctr-payments');
  });

  it('writes the corrected value where existing graph readers already look', () => {
    const properties = buildCorrectionNodeOperation(decision(), { at: AT }).params
      .properties as Record<string, string>;
    expect(properties.attr_technology).toBe('Java / Spring Boot');
  });

  it('makes the corrected value and its supersession queryable', () => {
    const properties = buildCorrectionNodeOperation(decision(), { at: AT }).params
      .properties as Record<string, string>;
    expect(properties[CORRECTION_ATTRIBUTES.correctedValue]).toBe('Java / Spring Boot');
    expect(properties[CORRECTION_ATTRIBUTES.supersededValue]).toBe('Node.js/Express');
    expect(properties[CORRECTION_ATTRIBUTES.correctedAttribute]).toBe('technology');
    expect(properties[CORRECTION_ATTRIBUTES.decisionId]).toBe(decision().identity.id);
  });

  it('sets only review-related properties for a confirmation, changing no extracted value', () => {
    const confirmed = decision({ decision: 'confirmed', correctedValue: undefined });
    const properties = buildCorrectionNodeOperation(confirmed, { at: AT }).params
      .properties as Record<string, string>;
    expect(properties[CORRECTION_ATTRIBUTES.reviewStatus]).toBe('confirmed');
    expect(properties.attr_technology).toBeUndefined();
    expect(properties[CORRECTION_ATTRIBUTES.correctedValue]).toBeUndefined();
  });

  it('never writes an extracted attribute when the decision named no attribute', () => {
    const unscoped = decision({ targetAttribute: undefined });
    const properties = buildCorrectionNodeOperation(unscoped, { at: AT }).params
      .properties as Record<string, string>;
    expect(Object.keys(properties).some((k) => k.startsWith('attr_'))).toBe(false);
    expect(properties[CORRECTION_ATTRIBUTES.correctedValue]).toBe('Java / Spring Boot');
  });

  it('touches only the named node — no property outside the supplied set is in the write', () => {
    const properties = buildCorrectionNodeOperation(decision(), { at: AT }).params
      .properties as Record<string, string>;
    expect(Object.keys(properties).sort()).toEqual(
      [
        'attr_technology',
        CORRECTION_ATTRIBUTES.correctedAttribute,
        CORRECTION_ATTRIBUTES.correctedValue,
        CORRECTION_ATTRIBUTES.decisionId,
        CORRECTION_ATTRIBUTES.reviewStatus,
        CORRECTION_ATTRIBUTES.reviewedAt,
        CORRECTION_ATTRIBUTES.reviewedBy,
        CORRECTION_ATTRIBUTES.supersededValue,
      ].sort(),
    );
  });
});
