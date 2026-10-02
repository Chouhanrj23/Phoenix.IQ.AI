import { describe, expect, it } from 'vitest';
import type { ReviewItem } from '@phoenix-ai/shared';
import { buildReviewDecision, type BuildReviewDecisionInput } from '@phoenix-ai/knowledge-graph';
import { authorityOf, reconcileClaims, type Claim } from '@phoenix-ai/reconciliation-engine';
import {
  computeReviewMetrics,
  decisionToClaim,
  decisionsToClaims,
  degreeCentrality,
  inverseConfidence,
  rankReviewQueue,
  HUMAN_CLAIM_AUTHORITY,
} from '../src/index.js';

/**
 * P7-08 -- the three FRD §3.10 requirements that were still open:
 *   FR-REV-01  queue ranked by element leverage (centrality) x inverse confidence
 *   FR-REV-03  corrections applied as AUTHORITATIVE truth on subsequent runs
 *   FR-REV-04  correction rate as a quality metric
 */

function item(
  id: string,
  elementId: string,
  level: 'high' | 'medium' | 'low' | 'inferred',
  score?: number,
): ReviewItem {
  return {
    id,
    elementId,
    elementType: 'Container',
    elementName: `${elementId} — technology`,
    currentValue: 'x',
    metadata: {
      provenance: [],
      confidence: { level, ...(score === undefined ? {} : { score }) },
    },
    status: 'pending',
  };
}

const OPTS = { systemId: 'aurora-commerce', generatedAt: '2026-10-03T14:00:00.000Z' };

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
    decidedAt: '2026-10-03T10:00:00.000Z',
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// FR-REV-01
// ---------------------------------------------------------------------------

describe('FR-REV-01 — queue ordered by element leverage (centrality) and inverse confidence', () => {
  const relationships = [
    // ctr-payments is a hub: 3 relationships touch it.
    { sourceObjectId: 'ctr-payments', targetObjectId: 'ctr-db' },
    { sourceObjectId: 'ctr-checkout', targetObjectId: 'ctr-payments' },
    { sourceObjectId: 'ctr-payments', targetObjectId: 'ctr-eventbus' },
    // ctr-lonely has exactly one.
    { sourceObjectId: 'ctr-lonely', targetObjectId: 'ctr-db' },
  ];

  it('computes real degree centrality from the relationship list', () => {
    const degree = degreeCentrality(relationships);
    expect(degree.get('ctr-payments')).toBe(3);
    expect(degree.get('ctr-db')).toBe(2);
    expect(degree.get('ctr-lonely')).toBe(1);
    expect(degree.get('ctr-not-in-graph')).toBeUndefined();
  });

  it('inverts confidence, preferring the real score over the level when present', () => {
    expect(inverseConfidence(item('a', 'a', 'high', 0.9))).toBeCloseTo(0.1, 5);
    expect(inverseConfidence(item('b', 'b', 'high'))).toBe(0.2);
    expect(inverseConfidence(item('c', 'c', 'inferred'))).toBe(1);
  });

  it('ranks a high-leverage uncertain element above a low-leverage uncertain one', () => {
    const ranking = rankReviewQueue(
      [item('rev-lonely', 'ctr-lonely', 'low'), item('rev-hub', 'ctr-payments', 'low')],
      relationships,
    );
    expect(ranking.items.map((r) => r.item.id)).toEqual(['rev-hub', 'rev-lonely']);
    expect(ranking.items[0]?.leverage).toBe(3);
    expect(ranking.leverageAvailable).toBe(true);
  });

  it('ranks a certain hub BELOW an uncertain hub — both axes matter, not just centrality', () => {
    const ranking = rankReviewQueue(
      [item('rev-certain', 'ctr-payments', 'high', 0.98), item('rev-unsure', 'ctr-db', 'inferred')],
      relationships,
    );
    expect(ranking.items[0]?.item.id).toBe('rev-unsure');
  });

  it('degrades to inverse-confidence-only when no relationships are available, and SAYS so', () => {
    const ranking = rankReviewQueue([
      item('rev-high', 'ctr-payments', 'high', 0.95),
      item('rev-low', 'ctr-lonely', 'inferred'),
    ]);
    expect(ranking.leverageAvailable).toBe(false);
    expect(ranking.summary).toContain('inverse confidence only');
    expect(ranking.items.map((r) => r.item.id)).toEqual(['rev-low', 'rev-high']);
    expect(ranking.items.every((r) => r.leverage === 0)).toBe(true);
  });

  it('is deterministic — identical input yields identical order', () => {
    const once = rankReviewQueue(
      [item('b', 'ctr-db', 'low'), item('a', 'ctr-db', 'low')],
      relationships,
    );
    const twice = rankReviewQueue(
      [item('b', 'ctr-db', 'low'), item('a', 'ctr-db', 'low')],
      relationships,
    );
    expect(once.items.map((r) => r.item.id)).toEqual(twice.items.map((r) => r.item.id));
    expect(once.items.map((r) => r.item.id)).toEqual(['a', 'b']); // id tie-break
  });

  it('accepts QueriedRelationship-style endpoint names too', () => {
    expect(degreeCentrality([{ sourceId: 'x', targetId: 'y' }]).get('x')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// FR-REV-03 (authority half)
// ---------------------------------------------------------------------------

describe('FR-REV-03 — a correction is authoritative on subsequent runs', () => {
  it('turns a correction into a Claim carrying authority 3', () => {
    const claim = decisionToClaim(decision());
    expect(claim?.subjectId).toBe('ctr-payments');
    expect(claim?.attribute).toBe('technology');
    expect(claim?.value).toBe('Java / Spring Boot');
    expect(claim?.authority).toBe(HUMAN_CLAIM_AUTHORITY);
    expect(claim?.derivedBy).toBe('human-review');
  });

  it('turns a confirmation into a Claim asserting the value the human affirmed', () => {
    const claim = decisionToClaim(decision({ decision: 'confirmed', correctedValue: undefined }));
    expect(claim?.value).toBe('Node.js/Express');
    expect(claim?.authority).toBe(3);
  });

  it('produces NO claim for a rejection — it asserts no replacement value', () => {
    expect(
      decisionToClaim(decision({ decision: 'rejected', correctedValue: undefined })),
    ).toBeUndefined();
  });

  it('produces no claim when the decision names no attribute — nothing to key a claim on', () => {
    expect(decisionToClaim(decision({ targetAttribute: undefined }))).toBeUndefined();
  });

  it('the authority override makes the human claim outrank an authoritative source-code claim', () => {
    const extracted: Claim = {
      subjectId: 'ctr-payments',
      attribute: 'technology',
      value: 'Node.js/Express',
      claimCategory: 'structure',
      sourceId: 'repo://aurora-commerce/services/payments-adapter',
      sourceType: 'source-code',
      derivedBy: 'extraction-engine',
      derivedAt: '2026-09-01T00:00:00.000Z',
      evidence: [],
    };
    const human = decisionToClaim(decision())!;

    // Phase 6 gives source-code authority 3 for a structural claim; the human
    // claim must at least match it, so a correction is never outranked.
    expect(authorityOf('structure', 'source-code')).toBe(3);
    expect(authorityOf('structure', human.sourceType, human.authority)).toBe(3);
    // Without the override, the same claim would weigh 1 (sourceType 'other').
    expect(authorityOf('structure', human.sourceType)).toBe(1);

    const result = reconcileClaims([extracted, human], OPTS);
    // They disagree, so Phase 6 retains a conflict rather than agreeing.
    expect(result.conflicts).toHaveLength(1);
    const winning = result.conflicts[0]!.attributes.positions.find(
      (p) => p.value === 'Java / Spring Boot',
    );
    expect(winning?.sources[0]?.authority).toBe(3);
  });

  it('reconciliation RETAINS the disagreement rather than erasing the extracted position', () => {
    const extracted: Claim = {
      subjectId: 'ctr-payments',
      attribute: 'technology',
      value: 'Node.js/Express',
      claimCategory: 'structure',
      sourceId: 'repo://x',
      sourceType: 'source-code',
      derivedBy: 'extraction-engine',
      derivedAt: '2026-09-01T00:00:00.000Z',
      evidence: [],
    };
    const { conflicts } = reconcileClaims([extracted, decisionToClaim(decision())!], OPTS);
    const positions = conflicts[0]?.attributes.positions ?? [];
    expect(positions.length).toBeGreaterThanOrEqual(2);
    const values = positions.map((p) => p.value);
    expect(values).toContain('Node.js/Express');
    expect(values).toContain('Java / Spring Boot');
  });

  it('omitting authority leaves pre-P7 weighting untouched', () => {
    expect(authorityOf('intent', 'ticket')).toBe(3);
    expect(authorityOf('intent', 'ticket', undefined)).toBe(3);
    expect(authorityOf('structure', 'log')).toBe(1);
  });

  it('decisionsToClaims skips what asserts nothing', () => {
    const claims = decisionsToClaims([
      decision(),
      decision({
        decision: 'rejected',
        correctedValue: undefined,
        decidedAt: '2026-10-03T11:00:00.000Z',
      }),
    ]);
    expect(claims).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// FR-REV-04
// ---------------------------------------------------------------------------

describe('FR-REV-04 — correction rate as a quality metric', () => {
  const decisions = [
    decision({ decidedAt: '2026-10-03T10:00:00.000Z' }),
    decision({
      decision: 'confirmed',
      correctedValue: undefined,
      targetObjectId: 'ctr-fraud',
      decidedAt: '2026-10-03T11:00:00.000Z',
    }),
    decision({
      decision: 'rejected',
      correctedValue: undefined,
      targetObjectId: 'ctr-erp',
      decidedAt: '2026-10-03T12:00:00.000Z',
    }),
    decision({
      targetObjectId: 'ctr-notify',
      decidedAt: '2026-10-03T13:00:00.000Z',
    }),
  ];

  it('counts real decisions and computes the correction rate exactly', () => {
    const m = computeReviewMetrics(decisions);
    expect(m.decisions).toBe(4);
    expect(m.elementsReviewed).toBe(4);
    expect(m.corrected).toBe(2);
    expect(m.confirmed).toBe(1);
    expect(m.rejected).toBe(1);
    expect(m.correctionRate).toBe(0.5);
    expect(m.disagreementRate).toBe(0.75); // corrected + rejected
  });

  it('returns null — never 0 — when nothing was reviewed, so a quiet window cannot read as perfect', () => {
    const m = computeReviewMetrics([]);
    expect(m.correctionRate).toBeNull();
    expect(m.disagreementRate).toBeNull();
    expect(m.summary).toContain('no correction rate has been measured');
  });

  it('honours an explicit window', () => {
    const m = computeReviewMetrics(decisions, {
      from: '2026-10-03T11:00:00.000Z',
      to: '2026-10-03T12:00:00.000Z',
    });
    expect(m.decisions).toBe(2);
    expect(m.corrected).toBe(0);
    expect(m.correctionRate).toBe(0);
  });

  it('states plainly that it is not run-scoped while no orchestrator exists', () => {
    expect(computeReviewMetrics(decisions).runScoped).toBe(false);
    expect(computeReviewMetrics(decisions).summary).toContain('Not run-scoped');
    // ...and takes a real run boundary the moment one is supplied.
    expect(computeReviewMetrics(decisions, { runScoped: true }).runScoped).toBe(true);
  });
});
