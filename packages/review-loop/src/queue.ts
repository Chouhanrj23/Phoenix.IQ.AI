/**
 * P7-08 -- FR-REV-01: "The system shall present a review queue ordered by
 * element leverage (centrality) and inverse confidence."
 *
 * Leverage is DEGREE CENTRALITY: how many relationships touch the element.
 * Deliberately degree rather than betweenness/eigenvector -- degree is the
 * one centrality measure computable exactly, cheaply, and without tuning from
 * the relationship list Phoenix already has (`getFullGraph`, P4-07). Inventing
 * a weighted composite would read as precision the FRD never specified.
 *
 * Ranking is `leverage x inverse confidence`, so the queue leads with
 * elements that are BOTH heavily connected and least certain -- the ones where
 * a human's time buys the most. Ties break deterministically on id so the
 * queue never reorders between identical requests.
 *
 * Honest degradation: centrality needs relationships. When none are available
 * (the graph is unreachable, or the element has no node), every element scores
 * leverage 0 and the ranking collapses to inverse confidence alone -- exactly
 * the pre-P7 behaviour. `ReviewQueueRanking.leverageAvailable` says which
 * happened, so a caller never presents a confidence-only ordering as though
 * centrality had been applied.
 */

import type { ConfidenceLevel, ReviewItem } from '@phoenix-ai/shared';
import { targetIdForReviewItem } from './service.js';
import { compareCodeUnits } from '@phoenix-ai/shared';

/** Minimal shape this module needs from a relationship — satisfied by `QueriedRelationship` (P4-07) and by `CanonicalKnowledgeRelationship`. */
export interface RelationshipEndpoints {
  readonly sourceObjectId?: string;
  readonly targetObjectId?: string;
  /** `QueriedRelationship` names its endpoints differently; both spellings are accepted. */
  readonly sourceId?: string;
  readonly targetId?: string;
}

/**
 * Inverse confidence in [0,1] — how UNCERTAIN an element is. Uses the real
 * `score` when present (the finer signal), else derives from the closed
 * `level` vocabulary. No new confidence model: this only inverts what Phase 1
 * and Phase 6 already recorded.
 */
const UNCERTAINTY_BY_LEVEL: Record<ConfidenceLevel, number> = {
  inferred: 1,
  low: 0.8,
  medium: 0.5,
  high: 0.2,
};

export function inverseConfidence(item: ReviewItem): number {
  const { level, score } = item.metadata.confidence;
  return typeof score === 'number'
    ? 1 - Math.max(0, Math.min(1, score))
    : UNCERTAINTY_BY_LEVEL[level];
}

/** Degree centrality per object id: how many relationships touch it. Self-loops count once. */
export function degreeCentrality(
  relationships: readonly RelationshipEndpoints[],
): ReadonlyMap<string, number> {
  const degree = new Map<string, number>();
  for (const relationship of relationships) {
    const source = relationship.sourceObjectId ?? relationship.sourceId;
    const target = relationship.targetObjectId ?? relationship.targetId;
    const touched = new Set<string>();
    if (source !== undefined) touched.add(source);
    if (target !== undefined) touched.add(target);
    for (const id of touched) degree.set(id, (degree.get(id) ?? 0) + 1);
  }
  return degree;
}

export interface RankedReviewItem {
  readonly item: ReviewItem;
  /** Degree centrality of the reviewed element, 0 when unknown. */
  readonly leverage: number;
  /** 0 (certain) to 1 (wholly uncertain). */
  readonly inverseConfidence: number;
  /** The ordering score. `(1 + leverage) x inverseConfidence` — the `1 +` keeps an uncertain but unconnected element ahead of a certain one, instead of zeroing it out. */
  readonly score: number;
}

export interface ReviewQueueRanking {
  readonly items: readonly RankedReviewItem[];
  /** False when no relationship data was available, so the ordering is inverse-confidence only. */
  readonly leverageAvailable: boolean;
  readonly summary: string;
}

/**
 * Ranks a review queue by leverage x inverse confidence, highest first.
 *
 * Pure: no I/O. The caller supplies the relationships it could obtain, which
 * is what makes the degraded case explicit rather than hidden.
 */
export function rankReviewQueue(
  items: readonly ReviewItem[],
  relationships: readonly RelationshipEndpoints[] = [],
): ReviewQueueRanking {
  const degree = degreeCentrality(relationships);
  const leverageAvailable = degree.size > 0;

  const ranked: RankedReviewItem[] = items.map((item) => {
    const leverage = degree.get(targetIdForReviewItem(item)) ?? 0;
    const uncertainty = inverseConfidence(item);
    return {
      item,
      leverage,
      inverseConfidence: uncertainty,
      score: (1 + leverage) * uncertainty,
    };
  });

  ranked.sort(
    (a, b) =>
      b.score - a.score || b.leverage - a.leverage || compareCodeUnits(a.item.id, b.item.id),
  );

  return {
    items: ranked,
    leverageAvailable,
    summary: leverageAvailable
      ? `Ranked ${ranked.length} item(s) by element leverage (degree centrality) x inverse confidence.`
      : `Ranked ${ranked.length} item(s) by inverse confidence only — no relationship data was available, so element leverage could not be computed.`,
  };
}
