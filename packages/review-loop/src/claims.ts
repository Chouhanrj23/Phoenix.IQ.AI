/**
 * P7-08 -- FR-REV-03's second half: "Corrections shall be persisted AND
 * APPLIED AS AUTHORITATIVE TRUTH ON SUBSEQUENT RUNS."
 *
 * Persistence is P7-01. This file supplies the "authoritative" half, and does
 * it by feeding human decisions into the EXISTING Phase 6 reconciliation
 * engine as ordinary `Claim`s carrying `authority: 3` -- not by inventing a
 * precedence mechanism that sits outside it.
 *
 * That matters on a re-run: extraction re-asserts whatever it finds, the
 * reviewer's claim is present alongside it, and `reconcileClaims` (P6-05)
 * resolves them by authority while RETAINING the disagreement as a
 * `ConflictObject`. A human correction therefore wins without the losing
 * position being erased -- which is what "surface disagreements transparently"
 * has meant since Phase 6, applied consistently to humans.
 *
 * A `rejected` decision produces NO claim: rejecting a value asserts nothing
 * to put in its place, and a claim with no value would be a fabrication.
 */

import type { Claim, ClaimCategory } from '@phoenix-ai/reconciliation-engine';
import type { ReviewDecisionObject } from '@phoenix-ai/knowledge-graph';

/** The authority a human attestation carries — the same `3` Phase 6 gives source code for a structural claim. */
export const HUMAN_CLAIM_AUTHORITY = 3 as const;

/**
 * Turns one decision into the claim it asserts, or `undefined` when it asserts
 * no value (a rejection, or a confirmation with nothing recorded to confirm).
 *
 * `subjectId` is the reviewed element's canonical id and `attribute` is the
 * attribute reviewed -- the same correlation keys the rest of the pipeline
 * uses, so a human claim lines up with extracted claims about the same subject
 * without any bespoke matching.
 */
export function decisionToClaim(
  decision: ReviewDecisionObject,
  options: { claimCategory?: ClaimCategory } = {},
): Claim | undefined {
  const kind = decision.attributes.decision;
  const attribute = decision.attributes.targetAttribute;
  if (typeof attribute !== 'string' || attribute.length === 0) return undefined;

  // The value the human asserts: their correction, or -- for a confirmation --
  // the value they affirmed. A rejection asserts nothing.
  const asserted =
    kind === 'corrected'
      ? decision.attributes.correctedValue
      : kind === 'confirmed'
        ? decision.attributes.previousValue
        : undefined;
  if (typeof asserted !== 'string') return undefined;

  const provenance = decision.metadata.provenance[0];
  const decidedAt = decision.lifecycle?.since ?? decision.identity.createdAt;

  return {
    subjectId: String(decision.attributes.targetObjectId),
    attribute,
    value: asserted,
    claimCategory: options.claimCategory ?? 'structure',
    sourceId: provenance?.sourceId ?? `review://${String(decision.attributes.reviewerId)}`,
    sourceType: provenance?.sourceType ?? 'other',
    derivedBy: provenance?.derivedBy ?? 'human-review',
    derivedAt: provenance?.derivedAt ?? decidedAt,
    evidence: [...decision.evidence],
    // The point of this file: a reviewed attribute is authoritative.
    authority: HUMAN_CLAIM_AUTHORITY,
  };
}

/**
 * Every claim a set of decisions asserts, oldest first. Decisions that assert
 * nothing (rejections, unscoped decisions) contribute nothing rather than an
 * empty-valued claim.
 */
export function decisionsToClaims(
  decisions: readonly ReviewDecisionObject[],
  options: { claimCategory?: ClaimCategory } = {},
): readonly Claim[] {
  const claims: Claim[] = [];
  for (const decision of decisions) {
    const claim = decisionToClaim(decision, options);
    if (claim !== undefined) claims.push(claim);
  }
  return claims;
}
