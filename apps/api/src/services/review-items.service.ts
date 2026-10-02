import type { ReviewItem } from '@phoenix-ai/shared';
import {
  applyDecisionsToReviewItems,
  rankReviewQueue,
  type ReviewQueueRanking,
} from '@phoenix-ai/review-loop';
import { reviewItems } from '../data/seed.js';
import { getReviewDecisionStore, getGraphRelationships } from './review-decisions.service.js';

/**
 * The review queue, with any persisted human decisions projected on top.
 *
 * P7-01: the seed queue is still the source of WHICH elements need review;
 * persisted decisions are layered over it at read time so a reviewer's
 * confirm/correct is still there after a page refresh. The seed itself is
 * never mutated — extracted data and human decisions stay separable, which
 * is what keeps "what the pipeline found" auditable after a correction.
 */
export async function getReviewItems(): Promise<ReviewItem[]> {
  const store = await getReviewDecisionStore();
  return applyDecisionsToReviewItems(reviewItems, await store.listAll());
}

/**
 * FR-REV-01 -- the queue ordered by element leverage (degree centrality) and
 * inverse confidence.
 *
 * Relationships come from the real graph when it is reachable. When it is not,
 * `rankReviewQueue` falls back to inverse confidence alone and says so via
 * `leverageAvailable`, which this response passes through -- so a
 * confidence-only ordering is never presented as though centrality had been
 * applied.
 */
export async function getRankedReviewQueue(): Promise<ReviewQueueRanking> {
  const store = await getReviewDecisionStore();
  const items = applyDecisionsToReviewItems(reviewItems, await store.listAll());
  return rankReviewQueue(items, await getGraphRelationships());
}
