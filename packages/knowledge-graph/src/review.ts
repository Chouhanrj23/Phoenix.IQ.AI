/**
 * P7-01 -- the Human Review model: the seventh domain-specific `kind`
 * vocabulary (after P2-03..06's four, P6-04's Work Item, and P6-05's
 * Reconciliation), and the SECOND to use `category: 'observation'` -- the
 * structural category P2-02 reserved for "a meta-statement ABOUT other
 * knowledge objects". `ontology.ts`'s `LifecycleState` doc comment named
 * this exact use case from the start ("a review item's pending/confirmed/
 * corrected status"); this file is what finally fills it.
 *
 * Implements the FRD's 3.10 "Human Review & Correction Loop" module's
 * FR-REV-02/FR-REV-03: "Reviewers shall be able to confirm, edit, or reject
 * any element" / "Corrections shall be persisted and applied as
 * authoritative truth on subsequent runs."
 *
 * Three deliberate design decisions, each load-bearing:
 *
 * 1. A decision is an ADDITIVE, APPEND-ONLY record that POINTS AT its
 *    target (`attributes.targetObjectId`); it never rewrites the reviewed
 *    object. The extracted value, its provenance, and its evidence survive
 *    a correction untouched -- which is what makes "extracted" vs
 *    "human-corrected" distinguishable at all, keeps the audit trail
 *    honest, and means a later extraction run cannot silently clobber a
 *    human's decision (nor the decision the run's findings).
 *
 * 2. The review vocabulary is Phoenix's EXISTING one -- `pending` /
 *    `confirmed` / `corrected`, exactly as `ReviewItem.status`
 *    (`@phoenix-ai/shared`, Phase 1) already defines it. No second status
 *    enum, no renaming.
 *
 * 3. `metadata.confidence` on a decision describes confidence in THE
 *    DECISION RECORD ITSELF (a human said this -- directly observed),
 *    never the reviewed element's confidence. Review status and confidence
 *    are separate signals and this model keeps them separate.
 *
 * Model only, exactly like every prior domain file: no storage, no
 * transitions orchestration, no API, no overlay logic -- that is
 * `packages/review-loop`'s job, the same "model here, behaviour
 * downstream" split P6-04/P6-05 established.
 */

import type { CanonicalKnowledgeObject } from './canonical-object.js';
import type { Evidence } from './evidence.js';
import type { KnowledgeValue } from './identity.js';
import {
  isIsoTimestamp,
  isNonEmptyString,
  isPlainObject,
  validateCanonicalKnowledgeObject,
  type ValidationResult,
} from './validation.js';

// ---------------------------------------------------------------------------
// Object kinds
// ---------------------------------------------------------------------------

export const REVIEW_OBJECT_KINDS = ['review.decision'] as const;
export type ReviewObjectKind = (typeof REVIEW_OBJECT_KINDS)[number];

/** The single `kind` this file defines, as a value -- avoids stringly-typed call sites. */
export const REVIEW_DECISION_KIND: ReviewObjectKind = 'review.decision';

// ---------------------------------------------------------------------------
// Review vocabulary -- Phase 1's, reused verbatim
// ---------------------------------------------------------------------------

/**
 * Phoenix's existing review lifecycle, identical to `ReviewItem.status`
 * (`@phoenix-ai/shared`). `pending` = "Awaiting Human Review",
 * `confirmed` = "Human Reviewed / Validated", `corrected` = "Human
 * Corrected". Declared here as a value array so both this package and
 * `review-loop` can validate against it without importing a UI label map.
 */
export const REVIEW_STATUSES = ['pending', 'confirmed', 'corrected', 'rejected'] as const;
export type ReviewLifecycleStatus = (typeof REVIEW_STATUSES)[number];

/**
 * The statuses a human DECISION can put an element into -- FR-REV-02's
 * "confirm, edit, or reject". `pending` is deliberately absent: it is the
 * ABSENCE of a decision, never the result of one, so no decision object can
 * ever claim to move an element back to un-reviewed.
 *
 * `rejected` means "the extracted value is wrong and I am NOT supplying a
 * replacement" -- distinct from `corrected`, which supplies one. A rejection
 * therefore carries no `correctedValue` and changes no value; it records that
 * a human contradicted the extraction.
 */
export const REVIEW_DECISIONS = ['confirmed', 'corrected', 'rejected'] as const;
export type ReviewDecisionKind = (typeof REVIEW_DECISIONS)[number];

// ---------------------------------------------------------------------------
// Typed attribute bag
// ---------------------------------------------------------------------------

/**
 * What a review decision records. `targetObjectId` is the load-bearing
 * field: the canonical id of the reviewed object/node/edge, so a decision
 * is bound to a specific extracted element rather than to a display name.
 */
export interface ReviewDecisionAttributes {
  [key: string]: KnowledgeValue;
  /** Canonical `identity.id` of the reviewed element -- the binding. */
  targetObjectId: string;
  /** Which attribute of the target was reviewed, when the decision is narrower than the whole object. */
  targetAttribute?: string;
  decision: ReviewDecisionKind;
  /**
   * The value as the pipeline extracted/inferred it, retained verbatim so a
   * correction never destroys what was originally claimed -- the auditability
   * requirement. Recorded for `confirmed` decisions too: "the human agreed
   * with THIS value" is only meaningful if the value is on the record.
   */
  previousValue: string;
  /** The human's replacement value. Present only for `corrected`. */
  correctedValue?: string;
  reviewerId: string;
  /**
   * Whether the reviewer's identity was established by an authentication
   * system. Always `false` today: Phoenix has no auth, so `reviewerId` is
   * self-declared. Recorded explicitly rather than left implicit, so no
   * downstream consumer mistakes a self-declared name for a verified one.
   */
  reviewerVerified: boolean;
  rationale?: string;
  /** The decision this one replaces, when an element is re-reviewed. Prior decisions are never mutated or deleted. */
  supersedesDecisionId?: string;
}

/** A human review decision as a first-class canonical knowledge object. */
export type ReviewDecisionObject = CanonicalKnowledgeObject<ReviewDecisionAttributes>;

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------

/**
 * FNV-1a over a string -- a tiny, dependency-free, deterministic fingerprint.
 * Not cryptographic and not used for anything security-bearing: it exists
 * only to distinguish two DIFFERENT decisions recorded in the same
 * millisecond.
 */
function fingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Deterministic, CONTENT-ADDRESSED decision id.
 *
 * Keyed on the reviewed element, the attribute, the instant, AND what was
 * actually decided. Two consequences, both deliberate:
 *
 *  - a genuine retry (an identical submission resent after a dropped
 *    response) produces the identical id and `MERGE`s onto the same node,
 *    so retries cannot duplicate a decision; and
 *  - two DIFFERENT decisions recorded in the same millisecond -- a confirm
 *    immediately followed by a correction, which a timestamp alone cannot
 *    separate -- get different ids, so the earlier one is preserved as
 *    history instead of being silently overwritten.
 *
 * The timestamp alone was not enough: `Date.toISOString()` has millisecond
 * resolution, and two API calls can land inside the same millisecond.
 */
export function reviewDecisionId(input: {
  targetObjectId: string;
  targetAttribute?: string;
  decidedAt: string;
  decision: ReviewDecisionKind;
  previousValue: string;
  correctedValue?: string;
  reviewerId: string;
}): string {
  const content = [
    input.decision,
    input.previousValue,
    input.correctedValue ?? '',
    input.reviewerId,
  ].join(' ');
  return [
    'review-decision',
    input.targetObjectId,
    input.targetAttribute ?? '*',
    input.decidedAt,
    fingerprint(content),
  ].join(':');
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

export interface BuildReviewDecisionInput {
  systemId: string;
  targetObjectId: string;
  /** Human-readable name of the reviewed element, used only for the decision's own display label. */
  targetLabel: string;
  targetAttribute?: string;
  decision: ReviewDecisionKind;
  previousValue: string;
  correctedValue?: string;
  reviewerId: string;
  rationale?: string;
  /**
   * The evidence the reviewed element was derived from, carried onto the
   * decision so the reviewer's judgement stays traceable to what they saw.
   * COPIED, never moved: the target keeps its own evidence.
   */
  evidence?: readonly Evidence[];
  /** The element's status immediately before this decision. Defaults to `pending`. */
  previousStatus?: ReviewLifecycleStatus;
  supersedesDecisionId?: string;
  /** ISO-8601. Supplied by the caller (the API) rather than read from the clock here, so this stays pure and deterministically testable. */
  decidedAt: string;
  schemaVersion?: string;
}

/**
 * Builds a review decision object. Pure: no clock, no I/O, no storage.
 *
 * `metadata.confidence` is `high` because the decision RECORD is directly
 * observed (a human really did say this) -- it is not a statement about how
 * confident anyone is in the reviewed element, and no numeric score is
 * invented for it.
 */
export function buildReviewDecision(input: BuildReviewDecisionInput): ReviewDecisionObject {
  const id = reviewDecisionId(input);

  const attributes: ReviewDecisionAttributes = {
    targetObjectId: input.targetObjectId,
    decision: input.decision,
    previousValue: input.previousValue,
    reviewerId: input.reviewerId,
    reviewerVerified: false,
    ...(input.targetAttribute === undefined ? {} : { targetAttribute: input.targetAttribute }),
    ...(input.correctedValue === undefined ? {} : { correctedValue: input.correctedValue }),
    ...(input.rationale === undefined ? {} : { rationale: input.rationale }),
    ...(input.supersedesDecisionId === undefined
      ? {}
      : { supersedesDecisionId: input.supersedesDecisionId }),
  };

  return {
    identity: {
      id,
      systemId: input.systemId,
      createdAt: input.decidedAt,
      updatedAt: input.decidedAt,
      schemaVersion: input.schemaVersion ?? '1.0.0',
    },
    category: 'observation',
    kind: REVIEW_DECISION_KIND,
    label:
      input.targetAttribute === undefined
        ? `Review of ${input.targetLabel}`
        : `Review of ${input.targetLabel} — ${input.targetAttribute}`,
    attributes,
    metadata: {
      provenance: [
        {
          sourceId: `review://${input.reviewerId}`,
          sourceType: 'other',
          derivedBy: 'human-review',
          derivedAt: input.decidedAt,
        },
      ],
      confidence: {
        level: 'high',
        rationale:
          'Recorded directly from a human reviewer. Describes confidence in the decision record itself, not in the reviewed element.',
      },
    },
    evidence: [...(input.evidence ?? [])],
    lifecycle: {
      status: input.decision,
      since: input.decidedAt,
      previousStatus: input.previousStatus ?? 'pending',
    },
    confidenceDetail: {
      basis: 'observed',
      calculation: { method: 'manual-review', calculatedAt: input.decidedAt },
    },
  };
}

// ---------------------------------------------------------------------------
// Transitions
// ---------------------------------------------------------------------------

/**
 * Whether a human may move an element from `from` to `to`.
 *
 * Any known status may be re-reviewed (a later decision supersedes an
 * earlier one -- it does not mutate it), but nothing may transition TO
 * `pending`: un-reviewing is not a decision a human can record, it is only
 * the state of never having been reviewed. Unknown statuses are rejected
 * rather than assumed legal.
 */
export function isLegalReviewTransition(from: string, to: string): boolean {
  const knownFrom = (REVIEW_STATUSES as readonly string[]).includes(from);
  const knownTo = (REVIEW_DECISIONS as readonly string[]).includes(to);
  return knownFrom && knownTo;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a review decision object: every `CanonicalKnowledgeObject` rule
 * (delegated, never re-implemented) plus this kind's own invariants.
 */
export function validateReviewDecisionObject(candidate: unknown): ValidationResult {
  const base = validateCanonicalKnowledgeObject(candidate);
  if (!base.valid) return base;

  const object = candidate as ReviewDecisionObject;
  const errors: string[] = [];

  if (object.kind !== REVIEW_DECISION_KIND) {
    errors.push(`kind must be "${REVIEW_DECISION_KIND}"`);
  }
  if (object.category !== 'observation') {
    errors.push(
      'category must be "observation" -- a review decision is a statement about another object',
    );
  }

  const attributes: unknown = object.attributes;
  if (!isPlainObject(attributes)) {
    errors.push('attributes must be an object');
    return { valid: errors.length === 0, errors };
  }

  if (!isNonEmptyString(attributes.targetObjectId)) {
    errors.push(
      'attributes.targetObjectId is required -- a decision must name the element it reviewed',
    );
  }
  if (!isNonEmptyString(attributes.reviewerId)) {
    errors.push('attributes.reviewerId is required');
  }
  if (attributes.reviewerVerified !== false && attributes.reviewerVerified !== true) {
    errors.push('attributes.reviewerVerified must be a boolean');
  }
  if (typeof attributes.previousValue !== 'string') {
    errors.push(
      'attributes.previousValue is required -- the extracted value must stay on the record',
    );
  }

  const decision = attributes.decision;
  if (!(REVIEW_DECISIONS as readonly unknown[]).includes(decision)) {
    errors.push(`attributes.decision must be one of: ${REVIEW_DECISIONS.join(', ')}`);
  } else if (decision === 'corrected') {
    if (!isNonEmptyString(attributes.correctedValue)) {
      errors.push('attributes.correctedValue is required when decision is "corrected"');
    }
  } else if (attributes.correctedValue !== undefined) {
    // `confirmed` accepts the existing value; `rejected` contradicts it without
    // replacing it. Neither may carry a replacement value.
    errors.push(`attributes.correctedValue must be absent when decision is "${decision}"`);
  }

  const lifecycle = object.lifecycle;
  if (lifecycle === undefined) {
    errors.push('lifecycle is required -- it carries the review status');
  } else {
    if (lifecycle.status !== decision) {
      errors.push('lifecycle.status must equal attributes.decision');
    }
    if (!isIsoTimestamp(lifecycle.since)) {
      errors.push('lifecycle.since must be an ISO-8601 timestamp');
    }
    if (
      lifecycle.previousStatus !== undefined &&
      !(REVIEW_STATUSES as readonly string[]).includes(lifecycle.previousStatus)
    ) {
      errors.push(`lifecycle.previousStatus must be one of: ${REVIEW_STATUSES.join(', ')}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
