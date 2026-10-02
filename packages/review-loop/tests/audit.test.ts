import { describe, expect, it } from 'vitest';
import type { BuildReviewDecisionInput } from '@phoenix-ai/knowledge-graph';
import {
  buildReviewAuditTrail,
  createInMemoryReviewDecisionStore,
  recordReviewDecision,
  walkSupersessionChain,
  type ReviewDecisionStore,
} from '../src/index.js';

/**
 * P7-03 -- the audit trail over MULTIPLE sequential reviews of the same
 * element. Every test drives the real `recordReviewDecision` path (not
 * hand-built decisions) so the chain, the derived prior status, and the
 * chronology are the ones the application would actually produce.
 */

const TARGET = 'ctr-payments';

function submission(overrides: Partial<BuildReviewDecisionInput> = {}): BuildReviewDecisionInput {
  return {
    systemId: 'aurora-commerce',
    targetObjectId: TARGET,
    targetLabel: 'Payments Gateway Adapter',
    targetAttribute: 'technology',
    decision: 'confirmed',
    previousValue: 'Node.js/Express',
    reviewerId: 'reviewer-a',
    decidedAt: '2026-09-30T10:00:00.000Z',
    ...overrides,
  };
}

/** Three real, sequential reviews of one element: confirm -> correct -> correct again. */
async function threeSequentialReviews(): Promise<ReviewDecisionStore> {
  const store = createInMemoryReviewDecisionStore();

  await recordReviewDecision(
    store,
    submission({
      decision: 'confirmed',
      previousValue: 'Node.js/Express',
      reviewerId: 'reviewer-a',
      decidedAt: '2026-09-30T10:00:00.000Z',
      evidence: [{ id: 'ev-code-1', sourceId: 'repo://aurora-commerce/services/payments-adapter' }],
    }),
  );

  await recordReviewDecision(
    store,
    submission({
      decision: 'corrected',
      previousValue: 'Node.js/Express',
      correctedValue: 'Java / Spring Boot',
      reviewerId: 'reviewer-b',
      rationale: 'The 2024 architecture doc is right; the service was rewritten.',
      decidedAt: '2026-09-30T11:00:00.000Z',
    }),
  );

  await recordReviewDecision(
    store,
    submission({
      decision: 'corrected',
      previousValue: 'Java / Spring Boot',
      correctedValue: 'Java 21 / Spring Boot 3',
      reviewerId: 'reviewer-c',
      decidedAt: '2026-09-30T12:00:00.000Z',
    }),
  );

  return store;
}

describe('review audit trail (P7-03) — multiple sequential reviews of one object', () => {
  it('preserves every review action in chronological order', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));

    expect(trail.entries).toHaveLength(3);
    expect(trail.entries.map((e) => e.at)).toEqual([
      '2026-09-30T10:00:00.000Z',
      '2026-09-30T11:00:00.000Z',
      '2026-09-30T12:00:00.000Z',
    ]);
    expect(trail.entries.map((e) => e.decision)).toEqual(['confirmed', 'corrected', 'corrected']);
  });

  it('a later correction does not erase or rewrite any earlier decision', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));

    // The very first decision is still present, untouched, with its own reviewer.
    const first = trail.entries[0];
    expect(first?.decision).toBe('confirmed');
    expect(first?.reviewerId).toBe('reviewer-a');
    expect(first?.previousValue).toBe('Node.js/Express');
    expect(first?.correctedValue).toBeUndefined();
  });

  it('answers "what was the previous value" independently for each step', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));

    expect(trail.entries.map((e) => e.previousValue)).toEqual([
      'Node.js/Express',
      'Node.js/Express',
      'Java / Spring Boot',
    ]);
    expect(trail.entries.map((e) => e.correctedValue)).toEqual([
      undefined,
      'Java / Spring Boot',
      'Java 21 / Spring Boot 3',
    ]);
  });

  it('records who acted and when, and that the identity is unverified', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));

    expect(trail.entries.map((e) => e.reviewerId)).toEqual([
      'reviewer-a',
      'reviewer-b',
      'reviewer-c',
    ]);
    for (const entry of trail.entries) {
      expect(entry.reviewerVerified).toBe(false);
      expect(entry.at).toMatch(/^2026-09-30T/);
    }
  });

  it('derives each step previous STATUS from what was actually stored, not from the caller', async () => {
    const store = createInMemoryReviewDecisionStore();
    // The caller lies about the prior status on every call.
    await recordReviewDecision(store, submission({ previousStatus: 'corrected' }));
    await recordReviewDecision(
      store,
      submission({
        decision: 'corrected',
        correctedValue: 'Java',
        decidedAt: '2026-09-30T11:00:00.000Z',
        previousStatus: 'pending',
      }),
    );

    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));
    // First: nothing was stored before it, so 'pending'. Second: the stored
    // predecessor was a confirmation, so 'confirmed'.
    expect(trail.entries.map((e) => e.previousStatus)).toEqual(['pending', 'confirmed']);
  });

  it('links each decision to the one it supersedes, leaving the first unlinked', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));
    const [first, second, third] = trail.entries;

    expect(first?.supersedesDecisionId).toBeUndefined();
    expect(second?.supersedesDecisionId).toBe(first?.decisionId);
    expect(third?.supersedesDecisionId).toBe(second?.decisionId);
  });

  it('makes the current state trivially derivable', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET), {
      currentValue: 'Java 21 / Spring Boot 3',
    });

    expect(trail.currentStatus).toBe('corrected');
    expect(trail.currentDecisionId).toBe(trail.entries[2]?.decisionId);
    expect(trail.currentValue).toBe('Java 21 / Spring Boot 3');
  });

  it('stays linked to the canonical object by id', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET), {
      targetLabel: 'Payments Gateway Adapter',
    });

    expect(trail.targetObjectId).toBe('ctr-payments');
    expect(trail.targetLabel).toBe('Payments Gateway Adapter');
  });

  it('keeps evidence and provenance navigable on every entry', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));

    expect(trail.entries[0]?.evidence[0]?.sourceId).toBe(
      'repo://aurora-commerce/services/payments-adapter',
    );
    for (const entry of trail.entries) {
      expect(entry.provenance[0]?.derivedBy).toBe('human-review');
      expect(entry.provenance[0]?.sourceId).toContain('review://');
    }
  });

  it('carries the reviewer rationale where one was given', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));
    expect(trail.entries[1]?.rationale).toContain('architecture doc');
    expect(trail.entries[0]?.rationale).toBeUndefined();
  });
});

describe('walkSupersessionChain (P7-03)', () => {
  it('walks back from the decision in force through every predecessor', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));

    const chain = walkSupersessionChain(trail);
    expect(chain).toHaveLength(3);
    // Newest first, and the reverse of chronological order.
    expect(chain.map((e) => e.reviewerId)).toEqual(['reviewer-c', 'reviewer-b', 'reviewer-a']);
  });

  it('returns nothing for an element that has never been reviewed', () => {
    const trail = buildReviewAuditTrail('ctr-never-reviewed', []);
    expect(trail.entries).toEqual([]);
    expect(trail.currentStatus).toBe('pending');
    expect(trail.currentDecisionId).toBeUndefined();
    expect(walkSupersessionChain(trail)).toEqual([]);
  });

  it('cannot loop forever on a cyclic chain', async () => {
    const store = await threeSequentialReviews();
    const trail = buildReviewAuditTrail(TARGET, await store.listForTarget(TARGET));
    const entries = trail.entries;

    // Force a cycle: the oldest entry claims to supersede the newest.
    const cyclic = {
      ...trail,
      entries: [
        { ...entries[0]!, supersedesDecisionId: entries[2]!.decisionId },
        entries[1]!,
        entries[2]!,
      ],
    };

    expect(walkSupersessionChain(cyclic)).toHaveLength(3);
  });
});

describe('review audit trail (P7-03) — isolation between elements', () => {
  it('never mixes another element decisions into a trail', async () => {
    const store = createInMemoryReviewDecisionStore();
    await recordReviewDecision(store, submission());
    await recordReviewDecision(
      store,
      submission({ targetObjectId: 'ctr-fraud', targetLabel: 'Fraud Detection Service' }),
    );

    const trail = buildReviewAuditTrail(TARGET, await store.listAll());
    expect(trail.entries).toHaveLength(1);
    expect(trail.entries[0]?.decisionId).toContain('ctr-payments');
  });

  it('tracks a separate supersession chain per element', async () => {
    const store = createInMemoryReviewDecisionStore();
    await recordReviewDecision(store, submission());
    await recordReviewDecision(store, submission({ targetObjectId: 'ctr-fraud' }));
    await recordReviewDecision(
      store,
      submission({
        decision: 'corrected',
        correctedValue: 'Java',
        decidedAt: '2026-09-30T13:00:00.000Z',
      }),
    );

    const payments = buildReviewAuditTrail(TARGET, await store.listAll());
    const fraud = buildReviewAuditTrail('ctr-fraud', await store.listAll());

    // The payments correction supersedes the payments confirmation, NOT the
    // fraud decision that happened to be recorded in between.
    expect(payments.entries[1]?.supersedesDecisionId).toBe(payments.entries[0]?.decisionId);
    expect(fraud.entries).toHaveLength(1);
    expect(fraud.entries[0]?.supersedesDecisionId).toBeUndefined();
  });
});
