import { describe, expect, it } from 'vitest';
import type { ReviewItem } from '@phoenix-ai/shared';
import { buildReviewDecision, type BuildReviewDecisionInput } from '@phoenix-ai/knowledge-graph';
import {
  applyDecisionsToReviewItems,
  createInMemoryReviewDecisionStore,
  latestDecisionFor,
  recordReviewDecision,
  reviewStatusFor,
  targetIdForReviewItem,
  InvalidReviewDecisionError,
  InvalidReviewTransitionError,
  type ReviewDecisionStore,
} from '../src/index.js';

const AT_10 = '2026-09-27T10:00:00.000Z';
const AT_11 = '2026-09-27T11:00:00.000Z';

function input(overrides: Partial<BuildReviewDecisionInput> = {}): BuildReviewDecisionInput {
  return {
    systemId: 'aurora-commerce',
    targetObjectId: 'ctr-payments',
    targetLabel: 'Payments Gateway Adapter',
    decision: 'confirmed',
    previousValue: 'Node.js/Express (from source code)',
    reviewerId: 'reviewer-a',
    decidedAt: AT_10,
    ...overrides,
  };
}

function reviewItem(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    id: 'rev-1',
    elementType: 'Container',
    elementId: 'ctr-payments',
    elementName: 'Payments Gateway Adapter — technology',
    currentValue: 'Node.js/Express (from source code)',
    metadata: { provenance: [], confidence: { level: 'low' } },
    status: 'pending',
    ...overrides,
  };
}

describe('recordReviewDecision (P7-01) — create / confirm / correct', () => {
  it('creates and persists a confirmation against the reviewed element', async () => {
    const store = createInMemoryReviewDecisionStore();
    const result = await recordReviewDecision(store, input());

    expect(result.durability).toBe('memory');
    expect(result.decision.attributes.decision).toBe('confirmed');
    expect(await store.listForTarget('ctr-payments')).toHaveLength(1);
  });

  it('creates and persists a correction, retaining the extracted value alongside the human value', async () => {
    const store = createInMemoryReviewDecisionStore();
    const { decision } = await recordReviewDecision(
      store,
      input({ decision: 'corrected', correctedValue: 'Java / Spring Boot' }),
    );

    expect(decision.attributes.previousValue).toBe('Node.js/Express (from source code)');
    expect(decision.attributes.correctedValue).toBe('Java / Spring Boot');
  });

  it('rejects an illegal transition WITHOUT writing anything', async () => {
    const store = createInMemoryReviewDecisionStore();
    await expect(
      recordReviewDecision(store, { ...input(), decision: 'pending' as never }),
    ).rejects.toBeInstanceOf(InvalidReviewTransitionError);
    expect(await store.listAll()).toHaveLength(0);
  });

  it('rejects a structurally invalid decision WITHOUT writing anything', async () => {
    const store = createInMemoryReviewDecisionStore();
    // 'corrected' with no corrected value — well-formed transition, invalid decision.
    await expect(
      recordReviewDecision(store, input({ decision: 'corrected' })),
    ).rejects.toBeInstanceOf(InvalidReviewDecisionError);
    expect(await store.listAll()).toHaveLength(0);
  });

  it('surfaces a persistence failure instead of reporting a false success', async () => {
    const failing: ReviewDecisionStore = {
      durability: 'graph',
      save: () => Promise.reject(new Error('Neo4j unavailable')),
      listForTarget: () => Promise.resolve([]),
      listAll: () => Promise.resolve([]),
    };
    await expect(recordReviewDecision(failing, input())).rejects.toThrow('Neo4j unavailable');
  });

  it('is idempotent — the same decision submitted twice converges to one record', async () => {
    const store = createInMemoryReviewDecisionStore();
    await recordReviewDecision(store, input());
    await recordReviewDecision(store, input());
    expect(await store.listAll()).toHaveLength(1);
  });
});

describe('retrieving persisted decisions (P7-01) — the refresh path', () => {
  it('returns decisions for a target, oldest first, so the newest decision wins', async () => {
    const store = createInMemoryReviewDecisionStore();
    await recordReviewDecision(store, input());
    await recordReviewDecision(
      store,
      input({
        decidedAt: AT_11,
        decision: 'corrected',
        correctedValue: 'Java',
        previousStatus: 'confirmed',
      }),
    );

    const decisions = await store.listForTarget('ctr-payments');
    expect(decisions.map((d) => d.attributes.decision)).toEqual(['confirmed', 'corrected']);
    expect(latestDecisionFor(decisions, 'ctr-payments')?.attributes.correctedValue).toBe('Java');
  });

  it('keeps the earlier decision as history rather than overwriting it — auditability', async () => {
    const store = createInMemoryReviewDecisionStore();
    await recordReviewDecision(store, input());
    await recordReviewDecision(
      store,
      input({
        decidedAt: AT_11,
        decision: 'corrected',
        correctedValue: 'Java',
        previousStatus: 'confirmed',
      }),
    );
    expect(await store.listAll()).toHaveLength(2);
  });

  it('reports pending for an element that has never been reviewed — never a false "validated"', () => {
    expect(reviewStatusFor([], 'ctr-payments')).toBe('pending');
  });

  it('does not leak one element decisions onto another', async () => {
    const store = createInMemoryReviewDecisionStore();
    await recordReviewDecision(store, input());
    expect(await store.listForTarget('ctr-fraud')).toHaveLength(0);
  });
});

describe('applyDecisionsToReviewItems (P7-01) — what a client sees after a reload', () => {
  it('leaves the queue untouched when nothing has been reviewed', () => {
    const items = [reviewItem()];
    expect(applyDecisionsToReviewItems(items, [])).toEqual(items);
  });

  it('projects a confirmation onto the item status without changing its value', () => {
    const decision = buildReviewDecision(input());
    const [item] = applyDecisionsToReviewItems([reviewItem()], [decision]);
    expect(item?.status).toBe('confirmed');
    expect(item?.currentValue).toBe('Node.js/Express (from source code)');
  });

  it('projects a correction onto both status and value', () => {
    const decision = buildReviewDecision(
      input({ decision: 'corrected', correctedValue: 'Java / Spring Boot' }),
    );
    const [item] = applyDecisionsToReviewItems([reviewItem()], [decision]);
    expect(item?.status).toBe('corrected');
    expect(item?.currentValue).toBe('Java / Spring Boot');
  });

  it('matches on the canonical element id, and falls back to the item id when there is none', () => {
    expect(targetIdForReviewItem(reviewItem())).toBe('ctr-payments');
    const withoutElementId = reviewItem();
    delete withoutElementId.elementId;
    expect(targetIdForReviewItem(withoutElementId)).toBe('rev-1');
  });

  it('a confirmation AFTER a correction keeps the corrected value — it does not revert to the extracted one', () => {
    // Regression: gating the value override on the LATEST decision being
    // 'corrected' made this revert to the original extracted value the moment
    // a reviewer confirmed the correction. Found in the P7 runtime pass.
    const corrected = buildReviewDecision(
      input({ decision: 'corrected', correctedValue: 'Java / Spring Boot' }),
    );
    const confirmedAfter = buildReviewDecision(
      input({
        decision: 'confirmed',
        previousValue: 'Java / Spring Boot',
        decidedAt: AT_11,
        previousStatus: 'corrected',
      }),
    );

    const [item] = applyDecisionsToReviewItems([reviewItem()], [corrected, confirmedAfter]);
    expect(item?.status).toBe('confirmed');
    expect(item?.currentValue).toBe('Java / Spring Boot');
  });

  it('uses the most recent correction when several were made', () => {
    const first = buildReviewDecision(input({ decision: 'corrected', correctedValue: 'Java 11' }));
    const second = buildReviewDecision(
      input({
        decision: 'corrected',
        correctedValue: 'Java 21',
        previousValue: 'Java 11',
        decidedAt: AT_11,
        previousStatus: 'corrected',
      }),
    );

    const [item] = applyDecisionsToReviewItems([reviewItem()], [first, second]);
    expect(item?.currentValue).toBe('Java 21');
  });

  it('ignores decisions recorded against a different element', () => {
    const other = buildReviewDecision(input({ targetObjectId: 'ctr-fraud' }));
    const [item] = applyDecisionsToReviewItems([reviewItem()], [other]);
    expect(item?.status).toBe('pending');
  });
});

describe('in-memory store durability (P7-01)', () => {
  it('declares itself non-durable, so no caller can mistake it for graph persistence', () => {
    expect(createInMemoryReviewDecisionStore().durability).toBe('memory');
  });

  it('can be seeded, so a caller can reconstruct state it already holds', async () => {
    const seeded = createInMemoryReviewDecisionStore([buildReviewDecision(input())]);
    expect(await seeded.listAll()).toHaveLength(1);
  });
});
