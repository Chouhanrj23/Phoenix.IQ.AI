import { describe, expect, it } from 'vitest';
import {
  buildReviewDecision,
  isLegalReviewTransition,
  reviewDecisionId,
  validateReviewDecisionObject,
  REVIEW_DECISIONS,
  REVIEW_STATUSES,
  type BuildReviewDecisionInput,
} from '../src/review.js';

const DECIDED_AT = '2026-09-27T10:00:00.000Z';

function input(overrides: Partial<BuildReviewDecisionInput> = {}): BuildReviewDecisionInput {
  return {
    systemId: 'aurora-commerce',
    targetObjectId: 'ctr-payments',
    targetLabel: 'Payments Gateway Adapter',
    decision: 'confirmed',
    previousValue: 'Node.js/Express (from source code)',
    reviewerId: 'reviewer-a',
    decidedAt: DECIDED_AT,
    ...overrides,
  };
}

describe('buildReviewDecision (P7-01) — the canonical human review record', () => {
  it('binds the decision to the specific reviewed element, not to a display name', () => {
    const decision = buildReviewDecision(input());
    expect(decision.attributes.targetObjectId).toBe('ctr-payments');
    expect(decision.identity.id).toBe(reviewDecisionId(input()));
    expect(decision.identity.id).toContain('review-decision:ctr-payments:');
  });

  it('gives two DIFFERENT decisions in the same millisecond different ids, so neither overwrites the other', () => {
    const confirmed = buildReviewDecision(input());
    const corrected = buildReviewDecision(
      input({ decision: 'corrected', correctedValue: 'Java / Spring Boot' }),
    );
    expect(confirmed.identity.id).not.toBe(corrected.identity.id);
  });

  it('is an observation about another object, reusing the category P2-02 reserved', () => {
    const decision = buildReviewDecision(input());
    expect(decision.category).toBe('observation');
    expect(decision.kind).toBe('review.decision');
  });

  it('records the status transition on the existing LifecycleState, not a new status model', () => {
    const decision = buildReviewDecision(
      input({ decision: 'corrected', correctedValue: 'Java / Spring Boot' }),
    );
    expect(decision.lifecycle).toEqual({
      status: 'corrected',
      since: DECIDED_AT,
      previousStatus: 'pending',
    });
  });

  it('keeps the extracted value on the record when a human corrects it — nothing is destroyed', () => {
    const decision = buildReviewDecision(
      input({ decision: 'corrected', correctedValue: 'Java / Spring Boot' }),
    );
    expect(decision.attributes.previousValue).toBe('Node.js/Express (from source code)');
    expect(decision.attributes.correctedValue).toBe('Java / Spring Boot');
  });

  it('marks the reviewer as unverified — Phoenix has no authentication to establish identity', () => {
    const decision = buildReviewDecision(input({ reviewerId: 'someone' }));
    expect(decision.attributes.reviewerId).toBe('someone');
    expect(decision.attributes.reviewerVerified).toBe(false);
  });

  it('attributes the record to human review in provenance, distinguishing it from extraction', () => {
    const decision = buildReviewDecision(input());
    expect(decision.metadata.provenance).toEqual([
      {
        sourceId: 'review://reviewer-a',
        sourceType: 'other',
        derivedBy: 'human-review',
        derivedAt: DECIDED_AT,
      },
    ]);
    expect(decision.confidenceDetail?.basis).toBe('observed');
    expect(decision.confidenceDetail?.calculation?.method).toBe('manual-review');
  });

  it('copies the reviewed element evidence onto the decision without inventing any', () => {
    const evidence = [{ id: 'ev-1', sourceId: 'repo://aurora-commerce/services/payments-adapter' }];
    expect(buildReviewDecision(input({ evidence })).evidence).toEqual(evidence);
    expect(buildReviewDecision(input()).evidence).toEqual([]);
  });

  it('keeps review status separate from confidence — the confidence describes the record, not the element', () => {
    const decision = buildReviewDecision(input());
    expect(decision.metadata.confidence.level).toBe('high');
    expect(decision.metadata.confidence.score).toBeUndefined();
    expect(decision.metadata.confidence.rationale).toContain('not in the reviewed element');
  });

  it('produces the same id for the same target and instant, so a retry cannot duplicate a node', () => {
    expect(buildReviewDecision(input()).identity.id).toBe(buildReviewDecision(input()).identity.id);
  });

  it('distinguishes a whole-object decision from an attribute-level one in the id', () => {
    const scoped = buildReviewDecision(input({ targetAttribute: 'technology' }));
    expect(scoped.identity.id).toContain(':technology:');
    expect(scoped.label).toBe('Review of Payments Gateway Adapter — technology');
  });
});

describe('validateReviewDecisionObject (P7-01)', () => {
  it('accepts a well-formed confirm and a well-formed correction', () => {
    expect(validateReviewDecisionObject(buildReviewDecision(input())).valid).toBe(true);
    expect(
      validateReviewDecisionObject(
        buildReviewDecision(input({ decision: 'corrected', correctedValue: 'Java' })),
      ).valid,
    ).toBe(true);
  });

  it('rejects a correction with no corrected value — the whole point of a correction', () => {
    const invalid = {
      ...buildReviewDecision(input()),
      attributes: { ...buildReviewDecision(input()).attributes, decision: 'corrected' as const },
    };
    invalid.lifecycle = { status: 'corrected', since: DECIDED_AT, previousStatus: 'pending' };
    const result = validateReviewDecisionObject(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('correctedValue');
  });

  it('rejects a confirmation that also carries a corrected value', () => {
    const decision = buildReviewDecision(input());
    const invalid = {
      ...decision,
      attributes: { ...decision.attributes, correctedValue: 'something' },
    };
    expect(validateReviewDecisionObject(invalid).valid).toBe(false);
  });

  it('rejects a decision with no target — it would not be bound to any element', () => {
    const decision = buildReviewDecision(input());
    const invalid = { ...decision, attributes: { ...decision.attributes, targetObjectId: '' } };
    const result = validateReviewDecisionObject(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain('targetObjectId');
  });

  it('rejects a lifecycle status that disagrees with the decision', () => {
    const decision = buildReviewDecision(input());
    const invalid = {
      ...decision,
      lifecycle: { status: 'corrected', since: DECIDED_AT, previousStatus: 'pending' },
    };
    expect(validateReviewDecisionObject(invalid).valid).toBe(false);
  });

  it('rejects a non-object outright rather than throwing', () => {
    expect(validateReviewDecisionObject(null).valid).toBe(false);
    expect(validateReviewDecisionObject('review').valid).toBe(false);
  });
});

describe('isLegalReviewTransition (P7-01) — invalid review states', () => {
  it('allows every real decision from every known status, since a later decision supersedes an earlier one', () => {
    for (const from of REVIEW_STATUSES) {
      for (const to of REVIEW_DECISIONS) {
        expect(isLegalReviewTransition(from, to)).toBe(true);
      }
    }
  });

  it('refuses to un-review an element — nothing may transition back to pending', () => {
    expect(isLegalReviewTransition('confirmed', 'pending')).toBe(false);
    expect(isLegalReviewTransition('pending', 'pending')).toBe(false);
  });

  it('refuses unknown statuses rather than assuming they are legal', () => {
    expect(isLegalReviewTransition('archived', 'confirmed')).toBe(false);
    expect(isLegalReviewTransition('pending', 'deferred')).toBe(false);
  });

  it('allows rejection from any known status — FR-REV-02 third action', () => {
    for (const from of REVIEW_STATUSES) {
      expect(isLegalReviewTransition(from, 'rejected')).toBe(true);
    }
  });
});
