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
import { detectSecrets } from '@phoenix-ai/redaction-hardening';
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
  return serialisedPerTarget(store, input.targetObjectId, () => recordUnserialised(store, input));
}

/**
 * In-flight writes, per store and per reviewed element.
 *
 * `recordReviewDecision` reads the stored predecessor, validates the
 * transition against it, then writes. Two submissions for the SAME element
 * arriving together could both read the same predecessor, both pass, and both
 * claim to supersede it -- forking the supersession chain the audit trail is
 * walked along (P8). Chaining same-element writes in this process closes
 * that window; writes to different elements still run concurrently.
 *
 * Scope note: this serialises writers inside ONE API process, which is how
 * Phoenix is deployed today. Multiple API replicas writing the same element
 * would need a database-side guard as well.
 */
const inFlight = new WeakMap<ReviewDecisionStore, Map<string, Promise<void>>>();

async function serialisedPerTarget<T>(
  store: ReviewDecisionStore,
  targetObjectId: string,
  work: () => Promise<T>,
): Promise<T> {
  let byTarget = inFlight.get(store);
  if (byTarget === undefined) {
    byTarget = new Map();
    inFlight.set(store, byTarget);
  }

  const previous = byTarget.get(targetObjectId) ?? Promise.resolve();
  // Runs after the previous write SETTLES, whether it succeeded or not: one
  // rejected submission must not block every later one for that element.
  const run = previous.then(work, work);
  const settled = run.then(
    () => undefined,
    () => undefined,
  );
  byTarget.set(targetObjectId, settled);
  try {
    return await run;
  } finally {
    if (byTarget.get(targetObjectId) === settled) byTarget.delete(targetObjectId);
  }
}

async function recordUnserialised(
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

  const sensitive = sensitiveFieldErrors(input);
  if (sensitive.length > 0) throw new InvalidReviewDecisionError(sensitive);

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

/** Free-text fields a reviewer types, which no pipeline stage has scanned. */
const REVIEWER_TEXT_FIELDS = [
  'previousValue',
  'correctedValue',
  'rationale',
  'targetLabel',
] as const;

/**
 * P8 -- review text passes the same redaction detectors as ingested content.
 *
 * Everything a reviewer types is persisted (Neo4j), applied to canonical
 * knowledge, rendered into OKF, and served by the API -- yet until P8 none
 * of it went through the redaction gate, so a secret pasted into a
 * correction or rationale was published everywhere the gate exists to
 * protect. A detection REJECTS the decision rather than redacting it in
 * place: silently replacing part of a human correction would record a value
 * the reviewer never entered, and the FRD's rule for redaction uncertainty
 * is to halt, not to proceed. Messages name the field and the kind of value,
 * never the value.
 *
 * `reviewerId` is not scanned: it is the reviewer's own declared identity on
 * the audit record, not content about the system.
 */
function sensitiveFieldErrors(input: BuildReviewDecisionInput): string[] {
  const errors: string[] = [];
  for (const field of REVIEWER_TEXT_FIELDS) {
    const value = input[field];
    if (typeof value !== 'string' || value.length === 0) continue;
    const kinds = [...new Set(detectSecrets(value, 'review-decision.txt').map((d) => d.kind))];
    if (kinds.length > 0) {
      errors.push(
        `${field} appears to contain ${kinds.join(', ')}; secrets and personal data are not recorded in review decisions — remove it and resubmit`,
      );
    }
  }
  return errors;
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
