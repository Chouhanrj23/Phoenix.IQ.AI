/**
 * P7-01 -- recording a human review decision, and projecting recorded
 * decisions back onto the review queue.
 *
 * This is the module's behaviour layer: the canonical shape lives in
 * `@phoenix-ai/knowledge-graph`'s `review.ts`, storage behind
 * `ReviewDecisionStore`, and neither knows about the other. Everything here
 * is deliberately transport-agnostic -- `apps/api` supplies the clock and
 * the store, so this stays deterministic and testable without HTTP or a
 * database.
 *
 * The projection direction matters: decisions are applied ON TOP OF review
 * items at read time. The underlying extracted data is never rewritten, so
 * "what the pipeline found" and "what a human decided" remain separately
 * readable, and re-running extraction cannot silently erase a decision.
 */

import type { ReviewItem } from '@phoenix-ai/shared';
import {
  buildReviewDecision,
  isLegalReviewTransition,
  validateReviewDecisionObject,
  type BuildReviewDecisionInput,
  type ReviewDecisionObject,
  type ReviewLifecycleStatus,
} from '@phoenix-ai/knowledge-graph';
import type { ReviewDecisionStore, ReviewStoreDurability } from './store.js';

/** The submitted decision is not a legal move from the element's current status (e.g. trying to set it back to `pending`). */
export class InvalidReviewTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`illegal review transition: "${from}" -> "${to}"`);
    this.name = 'InvalidReviewTransitionError';
  }
}

/** The decision is structurally invalid (e.g. `corrected` with no corrected value). */
export class InvalidReviewDecisionError extends Error {
  readonly errors: readonly string[];
  constructor(errors: readonly string[]) {
    super(`invalid review decision: ${errors.join('; ')}`);
    this.name = 'InvalidReviewDecisionError';
    this.errors = errors;
  }
}

export interface RecordReviewDecisionResult {
  readonly decision: ReviewDecisionObject;
  /** What kind of persistence actually happened -- surfaced all the way to the reviewer, never assumed. */
  readonly durability: ReviewStoreDurability;
}

/**
 * Validates and persists one decision.
 *
 * Order is deliberate: transition legality, then structural validity, then
 * the write. Nothing reaches the store unless both checks pass, so an
 * invalid submission can never leave a partial record behind.
 *
 * P7-03 -- the prior state is derived from what is actually STORED, not from
 * what the client claimed. A caller's `previousStatus` can be stale (the page
 * was open while someone else reviewed the same element), and recording a
 * stale value would make the audit trail assert a transition that never
 * happened. The stored predecessor also gives the new decision its
 * `supersedesDecisionId`, which is what turns a flat list of decisions into a
 * navigable chain -- without deleting or rewriting the earlier decision.
 */
export async function recordReviewDecision(
  store: ReviewDecisionStore,
  input: BuildReviewDecisionInput,
): Promise<RecordReviewDecisionResult> {
  const priorDecisions = await store.listForTarget(input.targetObjectId);
  const predecessor = priorDecisions[priorDecisions.length - 1];
  const from: ReviewLifecycleStatus =
    predecessor === undefined ? 'pending' : predecessor.attributes.decision;

  if (!isLegalReviewTransition(from, input.decision)) {
    throw new InvalidReviewTransitionError(from, input.decision);
  }

  const decision = buildReviewDecision({
    ...input,
    previousStatus: from,
    ...(predecessor === undefined ? {} : { supersedesDecisionId: predecessor.identity.id }),
  });
  const validation = validateReviewDecisionObject(decision);
  if (!validation.valid) {
    throw new InvalidReviewDecisionError(validation.errors);
  }

  await store.save(decision);
  return { decision, durability: store.durability };
}

/** The most recent decision recorded against one element, or `undefined` if it has never been reviewed. */
export function latestDecisionFor(
  decisions: readonly ReviewDecisionObject[],
  targetObjectId: string,
): ReviewDecisionObject | undefined {
  const forTarget = decisions.filter((d) => d.attributes.targetObjectId === targetObjectId);
  return forTarget.length === 0 ? undefined : forTarget[forTarget.length - 1];
}

/**
 * An element's current review status. `pending` when no decision exists --
 * the absence of a decision, never a claim that anything was validated.
 */
export function reviewStatusFor(
  decisions: readonly ReviewDecisionObject[],
  targetObjectId: string,
): ReviewLifecycleStatus {
  const latest = latestDecisionFor(decisions, targetObjectId);
  return latest === undefined ? 'pending' : latest.attributes.decision;
}

/** The id a decision is recorded against for a given review item: its canonical element id where one is known, else the item's own stable id. */
export function targetIdForReviewItem(item: ReviewItem): string {
  return item.elementId ?? item.id;
}

/**
 * Projects recorded decisions onto the review queue: status reflects the
 * latest decision, and a corrected item shows the human's value.
 *
 * `currentValue` is replaced only for a `corrected` decision, and the
 * original extracted value remains on the decision record
 * (`attributes.previousValue`) -- so nothing is lost, it is layered.
 */
export function applyDecisionsToReviewItems(
  items: readonly ReviewItem[],
  decisions: readonly ReviewDecisionObject[],
): ReviewItem[] {
  return items.map((item) => {
    const targetId = targetIdForReviewItem(item);
    const latest = latestDecisionFor(decisions, targetId);
    if (latest === undefined) return item;

    /**
     * The value in force is the most recent CORRECTION, not the most recent
     * decision. A later confirmation affirms whatever value currently stands;
     * it does not revert it. Gating the override on the latest decision being
     * `corrected` made a confirm-after-correct silently fall back to the
     * original extracted value -- caught in the P7 runtime verification, where
     * a corrected "Java / Spring Boot" reverted to "Node.js/Express" the
     * moment a reviewer confirmed it.
     */
    const latestCorrection = correctionsFor(decisions, targetId).at(-1);
    const correctedValue = latestCorrection?.attributes.correctedValue;

    return {
      ...item,
      status: latest.attributes.decision,
      ...(typeof correctedValue === 'string' ? { currentValue: correctedValue } : {}),
    };
  });
}

/** Every `corrected` decision recorded against one element, oldest first. */
function correctionsFor(
  decisions: readonly ReviewDecisionObject[],
  targetObjectId: string,
): readonly ReviewDecisionObject[] {
  return decisions.filter(
    (d) => d.attributes.targetObjectId === targetObjectId && d.attributes.decision === 'corrected',
  );
}
