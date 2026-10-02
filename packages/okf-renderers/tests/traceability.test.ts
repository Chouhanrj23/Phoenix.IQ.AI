import { describe, expect, it } from 'vitest';
import {
  buildReviewDecision,
  serializeOkfYaml,
  validateOkfDocument,
  type CanonicalKnowledgeBundle,
  type CanonicalKnowledgeObject,
  type ReviewDecisionObject,
} from '@phoenix-ai/knowledge-graph';
import {
  buildCorrectionNodeOperation,
  buildReviewAuditTrail,
  buildReviewOfRelationship,
  CORRECTION_ATTRIBUTES,
  createInMemoryReviewDecisionStore,
  recordReviewDecision,
  reviewStatusFor,
} from '@phoenix-ai/review-loop';
import { okfRegenerationState, regenerateOkfDocument } from '../src/index.js';

/**
 * P7-06 -- Phase 7 traceability validation.
 *
 * Chain 1 (Persona -> Journey -> Step -> Entity -> Entity State -> Service ->
 * API -> Source Evidence) is NOT re-tested here: it lives at the canonical
 * layer and is already implemented and covered by Phase 5
 * (`packages/inference-engine/tests/traceability.test.ts` -- `explainTraceability`
 * walks an entity-state object back to its real `ApiObject` and source
 * location, and every inferred state carries real provenance/evidence).
 * Duplicating it here would add no coverage.
 *
 * What IS Phase 7's own remit, and what this file validates link by link:
 *   chain 2  Business Object -> Review Status -> Human Correction ->
 *            Canonical Object -> Knowledge Graph -> OKF/Documentation
 *   chain 3  Object -> Evidence -> Provenance -> Confidence -> Human Review
 */

const EXTRACTED_AT = '2026-09-01T00:00:00.000Z';
const DECIDED_AT = '2026-09-30T11:00:00.000Z';
const REGENERATED_AT = '2026-09-30T12:00:00.000Z';

const SOURCE_ID = 'repo://aurora-commerce/services/payments-adapter';

function reviewedObject(): CanonicalKnowledgeObject {
  return {
    identity: {
      id: 'ctr-payments',
      systemId: 'aurora-commerce',
      createdAt: EXTRACTED_AT,
      updatedAt: EXTRACTED_AT,
      schemaVersion: '1.0.0',
    },
    category: 'entity',
    kind: 'architecture.container',
    label: 'Payments Gateway Adapter',
    attributes: { technology: 'Node.js/Express' },
    metadata: {
      provenance: [
        {
          sourceId: SOURCE_ID,
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: EXTRACTED_AT,
        },
      ],
      confidence: { level: 'low', score: 0.45, rationale: 'Two sources disagree.' },
    },
    evidence: [
      {
        id: 'ev-payments-1',
        sourceId: SOURCE_ID,
        excerpt: 'const app = express();',
        locator: 'src/index.js:1-3',
        capturedAt: EXTRACTED_AT,
      },
    ],
  };
}

function unrelatedObject(): CanonicalKnowledgeObject {
  return {
    ...reviewedObject(),
    identity: { ...reviewedObject().identity, id: 'ctr-inventory' },
    label: 'Inventory Service',
    attributes: { technology: 'Go' },
    metadata: {
      provenance: [
        {
          sourceId: 'repo://aurora-commerce/services/inventory',
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: EXTRACTED_AT,
        },
      ],
      confidence: { level: 'high', score: 0.93 },
    },
    evidence: [],
  };
}

function bundle(): CanonicalKnowledgeBundle {
  return {
    systemId: 'aurora-commerce',
    generatedAt: EXTRACTED_AT,
    objects: [reviewedObject(), unrelatedObject()],
    relationships: [],
    // A realistic bundle declares its sources registry, which is what makes
    // `validateSourceReferences` enforce that every provenance sourceId resolves.
    sources: [
      { id: SOURCE_ID, type: 'source-code', label: 'payments-adapter', version: 'abc123' },
      {
        id: 'repo://aurora-commerce/services/inventory',
        type: 'source-code',
        label: 'inventory',
        version: 'def456',
      },
    ],
  };
}

function correction(): ReviewDecisionObject {
  return buildReviewDecision({
    systemId: 'aurora-commerce',
    targetObjectId: 'ctr-payments',
    targetLabel: 'Payments Gateway Adapter',
    targetAttribute: 'technology',
    decision: 'corrected',
    previousValue: 'Node.js/Express',
    correctedValue: 'Java / Spring Boot',
    reviewerId: 'reviewer-a',
    rationale: 'Rewritten in 2025.',
    decidedAt: DECIDED_AT,
    evidence: reviewedObject().evidence,
  });
}

// ---------------------------------------------------------------------------
// Chain 2
// ---------------------------------------------------------------------------

describe('P7-06 chain 2: Business Object → Review Status → Correction → Canonical → Graph → OKF', () => {
  it('link 1 — Business Object → Review Status: an unreviewed object reads pending, never "validated"', async () => {
    const store = createInMemoryReviewDecisionStore();

    // Nothing recorded yet, so the object's status is the absence of a
    // decision — not a claim that anything was validated.
    expect(await store.listForTarget('ctr-payments')).toEqual([]);
    expect(reviewStatusFor([], 'ctr-payments')).toBe('pending');

    // ...and the object carries no review markers at all.
    expect(reviewedObject().attributes[CORRECTION_ATTRIBUTES.reviewStatus]).toBeUndefined();
    expect(reviewedObject().lifecycle).toBeUndefined();
  });

  it('link 2 — Review Status → Human Correction: the decision names the exact object reviewed', async () => {
    const store = createInMemoryReviewDecisionStore();
    const { decision } = await recordReviewDecision(store, {
      systemId: 'aurora-commerce',
      targetObjectId: 'ctr-payments',
      targetLabel: 'Payments Gateway Adapter',
      targetAttribute: 'technology',
      decision: 'corrected',
      previousValue: 'Node.js/Express',
      correctedValue: 'Java / Spring Boot',
      reviewerId: 'reviewer-a',
      decidedAt: DECIDED_AT,
    });

    // Correct object identity — bound by canonical id, not by display name.
    expect(decision.attributes.targetObjectId).toBe('ctr-payments');
    expect(decision.attributes.targetAttribute).toBe('technology');
    // Correct relationship kind linking decision → object.
    const edge = buildReviewOfRelationship(decision);
    expect(edge.type).toBe('REVIEW_OF');
    expect(edge.sourceId).toBe(decision.identity.id);
    expect(edge.targetId).toBe('ctr-payments');
  });

  it('link 3 — Human Correction → Canonical Object: identity preserved, no object added or removed', () => {
    const before = bundle();
    const result = regenerateOkfDocument(before, [correction()], { at: REGENERATED_AT });

    // No duplicate nodes: same count, same ids, all unique.
    expect(result.document.objects).toHaveLength(before.objects.length);
    const ids = result.document.objects.map((o) => o.identity.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.sort()).toEqual(['ctr-inventory', 'ctr-payments']);

    // Correct object identity — nothing regenerated.
    const corrected = result.document.objects.find((o) => o.identity.id === 'ctr-payments')!;
    expect(corrected.identity).toMatchObject({
      id: 'ctr-payments',
      systemId: 'aurora-commerce',
      createdAt: EXTRACTED_AT,
      schemaVersion: '1.0.0',
    });
    expect(corrected.attributes.technology).toBe('Java / Spring Boot');
  });

  it('link 3b — no fabricated relationship is introduced by a correction', () => {
    const before = bundle();
    const result = regenerateOkfDocument(before, [correction()], { at: REGENERATED_AT });
    expect(result.document.relationships).toEqual(before.relationships);
    expect(result.document.relationships).toHaveLength(0);
  });

  it('link 4 — Canonical Object → Knowledge Graph: the same value, written to the same id, never creating a node', () => {
    const decision = correction();
    const canonical = regenerateOkfDocument(bundle(), [decision], {
      at: REGENERATED_AT,
    }).document.objects.find((o) => o.identity.id === 'ctr-payments')!;

    const op = buildCorrectionNodeOperation(decision, { at: REGENERATED_AT });
    const properties = op.params.properties as Record<string, string>;

    expect(op.params.id).toBe(canonical.identity.id);
    expect(properties.attr_technology).toBe(canonical.attributes.technology);
    // MATCH, not MERGE/CREATE: a correction can never mint a duplicate node.
    expect(op.cypher).toContain('MATCH (n {id: $id})');
    expect(op.cypher).not.toMatch(/MERGE|CREATE/);
  });

  it('link 5 — Knowledge Graph → OKF: the document serialises, validates, and shows the corrected value', () => {
    const result = regenerateOkfDocument(bundle(), [correction()], { at: REGENERATED_AT });
    const validation = validateOkfDocument(result.document);
    expect(validation.errors).toEqual([]);
    expect(validation.valid).toBe(true);

    const yaml = serializeOkfYaml(result.document);
    expect(yaml).toContain('Java / Spring Boot');
    // ...and the superseded extracted value is still in the document.
    expect(yaml).toContain('Node.js/Express');
  });

  it('link 5b — the human-review source is registered, so provenance still resolves after regeneration', () => {
    const before = bundle();
    const result = regenerateOkfDocument(before, [correction()], { at: REGENERATED_AT });

    const humanSourceId = 'review://reviewer-a';
    // The appended provenance entry...
    const corrected = result.document.objects.find((o) => o.identity.id === 'ctr-payments')!;
    expect(corrected.metadata.provenance.some((p) => p.sourceId === humanSourceId)).toBe(true);
    // ...resolves against the registry, which the correction extended.
    expect(result.document.sources?.some((s) => s.id === humanSourceId)).toBe(true);
    // Pre-existing sources are untouched.
    expect(result.document.sources?.slice(0, 2)).toEqual(before.sources);
  });

  it('link 5c — no sources registry is invented when the bundle never declared one', () => {
    const withoutRegistry = { ...bundle() };
    delete withoutRegistry.sources;
    const result = regenerateOkfDocument(withoutRegistry, [correction()], { at: REGENERATED_AT });
    expect(result.document.sources).toBeUndefined();
    expect(validateOkfDocument(result.document).valid).toBe(true);
  });

  it('link 6 — the whole chain leaves the unrelated object byte-identical', () => {
    const before = bundle();
    const result = regenerateOkfDocument(before, [correction()], { at: REGENERATED_AT });
    expect(result.document.objects.find((o) => o.identity.id === 'ctr-inventory')).toEqual(
      before.objects[1],
    );
  });

  it('regeneration state is visible at every point in the chain, never assumed', () => {
    const decision = correction();
    expect(okfRegenerationState(bundle(), [decision]).stale).toBe(true);
    const regenerated = regenerateOkfDocument(bundle(), [decision], {
      at: REGENERATED_AT,
    }).document;
    expect(okfRegenerationState(regenerated, [decision]).stale).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Chain 3
// ---------------------------------------------------------------------------

describe('P7-06 chain 3: Object → Evidence → Provenance → Confidence → Human Review', () => {
  it('link 1 — Object → Evidence: evidence is present and locates the claim in its source', () => {
    const object = reviewedObject();
    expect(object.evidence).toHaveLength(1);
    expect(object.evidence[0]?.locator).toBe('src/index.js:1-3');
    expect(object.evidence[0]?.excerpt).toBe('const app = express();');
  });

  it('link 2 — Evidence → Provenance: they join on sourceId, and that id resolves in the bundle sources', () => {
    const object = reviewedObject();
    const evidenceSourceId = object.evidence[0]!.sourceId;

    // The documented join key: Evidence.sourceId === Provenance.sourceId === Source.id.
    expect(object.metadata.provenance.some((p) => p.sourceId === evidenceSourceId)).toBe(true);
    expect(bundle().sources?.some((s) => s.id === evidenceSourceId)).toBe(true);
  });

  it('link 3 — Provenance → Confidence: both present, and confidence is not derived from review', () => {
    const object = reviewedObject();
    expect(object.metadata.provenance[0]?.derivedBy).toBe('extraction-engine');
    expect(object.metadata.confidence.level).toBe('low');
    expect(object.metadata.confidence.score).toBe(0.45);
  });

  it('link 4 — Confidence → Human Review: review status is SEPARATE from confidence', () => {
    const result = regenerateOkfDocument(bundle(), [correction()], { at: REGENERATED_AT });
    const corrected = result.document.objects.find((o) => o.identity.id === 'ctr-payments')!;

    // Two independent signals living in two different places.
    expect(corrected.attributes[CORRECTION_ATTRIBUTES.reviewStatus]).toBe('corrected');
    expect(corrected.lifecycle?.status).toBe('corrected');
    expect(corrected.metadata.confidence.level).toBe('medium'); // Phase 6 scoring, not "reviewed = high"
    // Review status is not stored as a confidence level, and vice versa.
    expect(corrected.metadata.confidence.level).not.toBe(
      corrected.attributes[CORRECTION_ATTRIBUTES.reviewStatus],
    );

    // The unrelated object is high confidence with NO review at all — proving
    // the two axes move independently.
    const unrelated = result.document.objects.find((o) => o.identity.id === 'ctr-inventory')!;
    expect(unrelated.metadata.confidence.level).toBe('high');
    expect(unrelated.attributes[CORRECTION_ATTRIBUTES.reviewStatus]).toBeUndefined();
  });

  it('evidence and provenance remain available AFTER the human review, not replaced by it', () => {
    const result = regenerateOkfDocument(bundle(), [correction()], { at: REGENERATED_AT });
    const corrected = result.document.objects.find((o) => o.identity.id === 'ctr-payments')!;

    // Original evidence intact and still locating the original claim.
    expect(corrected.evidence).toEqual(reviewedObject().evidence);
    // Original extraction provenance retained; human review appended alongside.
    expect(corrected.metadata.provenance.map((p) => p.derivedBy)).toEqual([
      'extraction-engine',
      'human-review',
    ]);
    // The evidence→provenance join still holds after the correction.
    expect(
      corrected.metadata.provenance.some((p) => p.sourceId === corrected.evidence[0]?.sourceId),
    ).toBe(true);
  });

  it('the object points back to the decision, and the decision points back to the object', async () => {
    const store = createInMemoryReviewDecisionStore();
    const { decision } = await recordReviewDecision(store, {
      systemId: 'aurora-commerce',
      targetObjectId: 'ctr-payments',
      targetLabel: 'Payments Gateway Adapter',
      targetAttribute: 'technology',
      decision: 'corrected',
      previousValue: 'Node.js/Express',
      correctedValue: 'Java / Spring Boot',
      reviewerId: 'reviewer-a',
      decidedAt: DECIDED_AT,
    });

    const corrected = regenerateOkfDocument(bundle(), [decision], {
      at: REGENERATED_AT,
    }).document.objects.find((o) => o.identity.id === 'ctr-payments')!;

    // Object → decision.
    expect(corrected.attributes[CORRECTION_ATTRIBUTES.decisionId]).toBe(decision.identity.id);
    // Decision → object. Both directions resolve: navigation works either way.
    expect(decision.attributes.targetObjectId).toBe(corrected.identity.id);
  });

  it('review status stays navigable via the audit trail, with the evidence that backed it', async () => {
    const store = createInMemoryReviewDecisionStore();
    await recordReviewDecision(store, {
      systemId: 'aurora-commerce',
      targetObjectId: 'ctr-payments',
      targetLabel: 'Payments Gateway Adapter',
      targetAttribute: 'technology',
      decision: 'corrected',
      previousValue: 'Node.js/Express',
      correctedValue: 'Java / Spring Boot',
      reviewerId: 'reviewer-a',
      decidedAt: DECIDED_AT,
      evidence: reviewedObject().evidence,
    });

    const trail = buildReviewAuditTrail('ctr-payments', await store.listForTarget('ctr-payments'), {
      currentValue: 'Java / Spring Boot',
    });

    expect(trail.currentStatus).toBe('corrected');
    expect(trail.currentValue).toBe('Java / Spring Boot');
    // The evidence the reviewer saw is still reachable from the trail entry.
    expect(trail.entries[0]?.evidence[0]?.locator).toBe('src/index.js:1-3');
    expect(trail.entries[0]?.provenance[0]?.derivedBy).toBe('human-review');
  });
});
