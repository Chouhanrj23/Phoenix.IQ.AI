/**
 * P6-08 -- evidence aggregation: collecting the concrete supporting
 * material (`@phoenix-ai/knowledge-graph`'s `Evidence`, P2-09) behind a
 * `Claim` or group of claims into one clean, deduplicated list.
 *
 * A gap this closes: `reconcile.ts` (P6-05/P6-06) never aggregated evidence
 * at all -- a `ReconciledClaim` carried only `claims: readonly Claim[]`,
 * leaving every caller to manually `flatMap` each claim's own `.evidence`
 * (and re-derive deduplication) themselves; `ConflictObject.evidence` was a
 * raw, UNDEDUPLICATED `flatMap` across every claim in the group, with no
 * way to tell which piece of evidence backs which retained position. This
 * file is the one place that logic now lives, reused by both paths.
 *
 * Deduplication trusts `Evidence.id` -- "a stable identifier for this
 * specific piece of evidence" per its own doc comment (`evidence.ts`) -- the
 * same "an id is the trust boundary, never re-derived from content" pattern
 * `deterministicId`/`objectIdByKey`-style lookups already use everywhere
 * else in this codebase. Two evidence entries with the same `id` are the
 * SAME piece of evidence, cited by more than one claim; keeping only the
 * first occurrence is not data loss.
 */

import type { Evidence } from '@phoenix-ai/knowledge-graph';
import type { Claim } from './claim.js';

/**
 * Deduplicates a flat list of evidence entries by `id`, preserving
 * first-occurrence order (itself deterministic, since callers always pass
 * evidence in a stable, input-derived order -- never re-sorted here).
 */
export function aggregateEvidence(entries: readonly Evidence[]): Evidence[] {
  const seen = new Set<string>();
  const aggregated: Evidence[] = [];
  for (const entry of entries) {
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    aggregated.push(entry);
  }
  return aggregated;
}

/** Aggregates every piece of evidence behind a set of claims -- `aggregateEvidence` over their combined `.evidence` arrays. */
export function evidenceForClaims(claims: readonly Claim[]): Evidence[] {
  return aggregateEvidence(claims.flatMap((claim) => claim.evidence));
}
