/**
 * P6-05 -- FR-REC-03: "The confidence of a composite element shall be
 * bounded by its least-certain constituent." A separate, self-contained
 * concern from claim reconciliation (`reconcile.ts`): this is about
 * aggregating confidence across a COMPOSITION hierarchy (e.g. a Container's
 * confidence given its Components' confidences, `contains` edges), not
 * about comparing claims from different sources.
 */

import type { Confidence, ConfidenceLevel } from '@phoenix-ai/shared';

/**
 * `'inferred'` is Phase 1's legacy conflated level (ADR 0010/P2-08: the
 * FACT-vs-INFERRED distinction now lives in `confidenceDetail.basis`, not
 * `level`) -- ranked weakest here as the conservative reading of a value
 * that predates `level` meaning "strength alone".
 */
const LEVEL_RANK: Record<ConfidenceLevel, number> = { inferred: 0, low: 1, medium: 2, high: 3 };

/**
 * Returns the least-certain of `constituents`, VERBATIM -- a composite is
 * exactly as certain as its weakest part, not a blended average. Ties on
 * `level` are broken by the lower `score` (an absent `score` is treated as
 * 1, i.e. not a tiebreak winner, since "no score recorded" is not evidence
 * of low confidence).
 */
export function boundCompositeConfidence(constituents: readonly Confidence[]): Confidence {
  const [first, ...rest] = constituents;
  if (first === undefined) {
    throw new Error('boundCompositeConfidence requires at least one constituent confidence');
  }

  return rest.reduce((weakest, candidate) => {
    const rankDiff = LEVEL_RANK[candidate.level] - LEVEL_RANK[weakest.level];
    if (rankDiff < 0) return candidate;
    if (rankDiff > 0) return weakest;
    return (candidate.score ?? 1) < (weakest.score ?? 1) ? candidate : weakest;
  }, first);
}
