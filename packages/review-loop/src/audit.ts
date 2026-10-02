/**
 * P7-03 -- the review audit trail.
 *
 * This file adds NO storage, NO new model, and NO second source of truth. The
 * append-only `review.decision` objects P7-01 already persists are the audit
 * record; everything here is a pure PROJECTION over them, assembled to answer
 * the nine questions an auditor actually asks:
 *
 *   what object was reviewed        -> `targetObjectId` (+ `targetLabel`)
 *   what was its previous value     -> `entries[].previousValue`
 *   what decision was made          -> `entries[].decision`
 *   validated or corrected          -> the same field ('confirmed' | 'corrected')
 *   what correction was made        -> `entries[].correctedValue`
 *   who performed it                -> `entries[].reviewerId` (+ `reviewerVerified`)
 *   when                            -> `entries[].at`
 *   what evidence supported it      -> `entries[].evidence` / `entries[].provenance`
 *   current canonical value         -> `currentValue`
 *
 * Chronology and non-destruction are properties of the STORE, not of this
 * projection: decisions are only ever appended, ids are content-addressed, and
 * `listForTarget` returns them oldest-first. A later correction therefore
 * cannot erase an earlier one -- it is simply a further entry that names its
 * predecessor via `supersedesDecisionId`.
 */

import type { Provenance } from '@phoenix-ai/shared';
import type {
  Evidence,
  ReviewDecisionKind,
  ReviewDecisionObject,
  ReviewLifecycleStatus,
} from '@phoenix-ai/knowledge-graph';
import { latestDecisionFor, reviewStatusFor } from './service.js';

/** One review action, exactly as it was recorded. Nothing here is recomputed or normalised away. */
export interface ReviewAuditEntry {
  readonly decisionId: string;
  /** ISO-8601 — when the human made this decision (`lifecycle.since`). */
  readonly at: string;
  readonly reviewerId: string;
  /** False wherever Phoenix has no authentication to establish identity — carried through rather than implied. */
  readonly reviewerVerified: boolean;
  readonly decision: ReviewDecisionKind;
  /** The status this decision moved the element out of. */
  readonly previousStatus: ReviewLifecycleStatus;
  /** The value as it stood before this decision. */
  readonly previousValue: string;
  /** Present only for a correction. */
  readonly correctedValue?: string;
  /** Which attribute was reviewed, when the decision was attribute-scoped. */
  readonly targetAttribute?: string;
  /** The earlier decision this one supersedes — the chain link. Absent on the first review of an element. */
  readonly supersedesDecisionId?: string;
  readonly rationale?: string;
  /** Evidence the reviewer's judgement rests on, carried from the reviewed element. */
  readonly evidence: readonly Evidence[];
  /** Where this decision itself came from — `derivedBy: 'human-review'`. */
  readonly provenance: readonly Provenance[];
}

export interface ReviewAuditTrail {
  /** The canonical id of the reviewed element — what keeps this trail attached to the object. */
  readonly targetObjectId: string;
  readonly targetLabel?: string;
  /** Every review action against this element, oldest first. Never pruned. */
  readonly entries: readonly ReviewAuditEntry[];
  /** Derived from the latest entry; `pending` when the element has never been reviewed. */
  readonly currentStatus: ReviewLifecycleStatus;
  /** The id of the decision currently in force, if any. */
  readonly currentDecisionId?: string;
  /**
   * The value the application currently treats as canonical. Supplied by the
   * caller (which knows the canonical source — the graph node or the review
   * queue), not guessed at here. Absent when the caller could not determine
   * it, rather than defaulted to something plausible.
   */
  readonly currentValue?: string;
}

function toEntry(decision: ReviewDecisionObject): ReviewAuditEntry {
  const attributes = decision.attributes;
  const correctedValue = attributes.correctedValue;
  const targetAttribute = attributes.targetAttribute;
  const supersedes = attributes.supersedesDecisionId;
  const rationale = attributes.rationale;

  return {
    decisionId: decision.identity.id,
    at: decision.lifecycle?.since ?? decision.identity.createdAt,
    reviewerId: String(attributes.reviewerId),
    reviewerVerified: attributes.reviewerVerified === true,
    decision: attributes.decision,
    previousStatus: (decision.lifecycle?.previousStatus ?? 'pending') as ReviewLifecycleStatus,
    previousValue: String(attributes.previousValue ?? ''),
    ...(typeof correctedValue === 'string' ? { correctedValue } : {}),
    ...(typeof targetAttribute === 'string' ? { targetAttribute } : {}),
    ...(typeof supersedes === 'string' ? { supersedesDecisionId: supersedes } : {}),
    ...(typeof rationale === 'string' ? { rationale } : {}),
    evidence: decision.evidence,
    provenance: decision.metadata.provenance,
  };
}

/**
 * Assembles the audit trail for one element from its already-persisted
 * decisions.
 *
 * `decisions` may contain decisions for other elements; they are filtered out
 * by `targetObjectId` rather than assumed pre-filtered. Order in equals order
 * out, so pass them in the chronological order the store returns.
 */
export function buildReviewAuditTrail(
  targetObjectId: string,
  decisions: readonly ReviewDecisionObject[],
  options: { targetLabel?: string; currentValue?: string } = {},
): ReviewAuditTrail {
  const forTarget = decisions.filter((d) => d.attributes.targetObjectId === targetObjectId);
  const latest = latestDecisionFor(decisions, targetObjectId);

  return {
    targetObjectId,
    entries: forTarget.map(toEntry),
    currentStatus: reviewStatusFor(decisions, targetObjectId),
    ...(options.targetLabel === undefined ? {} : { targetLabel: options.targetLabel }),
    ...(latest === undefined ? {} : { currentDecisionId: latest.identity.id }),
    ...(options.currentValue === undefined ? {} : { currentValue: options.currentValue }),
  };
}

/**
 * Walks the `supersedesDecisionId` chain backwards from the decision
 * currently in force, newest first.
 *
 * Returns the same set as `entries` reversed whenever the chain is intact --
 * the point is that it is derived by FOLLOWING THE LINKS, so a broken or
 * missing link is visible rather than papered over by sort order. Stops on an
 * unknown id and cannot loop on a cyclic chain.
 */
export function walkSupersessionChain(trail: ReviewAuditTrail): readonly ReviewAuditEntry[] {
  const byId = new Map(trail.entries.map((e) => [e.decisionId, e]));
  const chain: ReviewAuditEntry[] = [];
  const seen = new Set<string>();

  let currentId = trail.currentDecisionId;
  while (currentId !== undefined && !seen.has(currentId)) {
    seen.add(currentId);
    const entry = byId.get(currentId);
    if (entry === undefined) break;
    chain.push(entry);
    currentId = entry.supersedesDecisionId;
  }

  return chain;
}
