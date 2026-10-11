/**
 * P7-02 -- correction propagation: carrying a persisted human decision into
 * the canonical knowledge representation and then into the graph.
 *
 * The governing rule is ADDITIVE UPDATE, never destructive overwrite. When a
 * human corrects an attribute, the object ends up carrying BOTH values:
 *
 *   attributes[attr]                      <- the human's corrected value (what
 *                                            downstream consumers now read)
 *   attributes.humanSupersededExtractedValue
 *                                         <- the value the pipeline extracted
 *   attributes.humanCorrectedAttribute    <- which attribute was corrected
 *   attributes.humanReviewDecisionId      <- the decision that did it
 *   attributes.humanReviewStatus/By/At    <- who, when, and what they decided
 *
 * plus an APPENDED `Provenance` entry (`derivedBy: 'human-review'`) alongside
 * the original extraction provenance, which is never removed. Evidence is
 * likewise only ever appended to. So at every layer:
 *
 *   - the original extracted value and evidence remain present and traceable;
 *   - the human contribution is distinguishable by provenance, by its own
 *     reserved attributes, and by the linked `:ReviewDecision` node;
 *   - nothing about the object's identity changes, so no duplicate node can
 *     be created and no stable id is regenerated.
 *
 * Two situations are deliberately NOT resolved automatically:
 *
 *   1. A STALE correction -- the decision's `previousValue` no longer matches
 *      what the object currently says, meaning the extraction moved on (or a
 *      different correction landed first). Applying it would silently discard
 *      whichever value the human never saw, so a `reconciliation.conflict`
 *      (P6-05) is produced instead, retaining both positions.
 *   2. An UNSCOPED correction -- the decision names no `targetAttribute`, so
 *      which attribute to change is genuinely unknown. The corrected value is
 *      recorded on the object as an annotation, but no extracted attribute is
 *      guessed at.
 *
 * Confidence follows Phase 6 exactly: `computeConfidence`
 * (`@phoenix-ai/reconciliation-engine`) is called with the human as an
 * authoritative (authority 3) source, and the superseded sources counted as
 * contradicting. No bespoke scoring, and no hand-assigned "human means
 * high" -- an uncorroborated authoritative source scores `medium` under
 * Phase 6's rules, and that is what it gets here too.
 */

import type { Provenance } from '@phoenix-ai/shared';
import type {
  CanonicalKnowledgeBundle,
  CanonicalKnowledgeObject,
  ConflictObject,
  ConflictPosition,
  KnowledgeValue,
  ReviewDecisionObject,
  Source,
} from '@phoenix-ai/knowledge-graph';
import {
  authorityOf,
  computeConfidence,
  type ClaimCategory,
} from '@phoenix-ai/reconciliation-engine';
import type { NodeWriteOperation } from '@phoenix-ai/graph-persistence';

/**
 * Reserved attribute keys a propagated correction writes. Namespaced so they
 * can never collide with a real extracted attribute, and stable so a Cypher
 * query or a downstream consumer can rely on them.
 */
export const CORRECTION_ATTRIBUTES = {
  reviewStatus: 'humanReviewStatus',
  decisionId: 'humanReviewDecisionId',
  reviewedBy: 'humanReviewedBy',
  reviewedAt: 'humanReviewedAt',
  correctedAttribute: 'humanCorrectedAttribute',
  correctedValue: 'humanCorrectedValue',
  supersededValue: 'humanSupersededExtractedValue',
} as const;

/** How the human source is weighed. A reviewer attesting to an attribute they reviewed is an authoritative source, the same `3` Phase 6 gives source code for structural claims. */
const HUMAN_AUTHORITY = 3 as const;
const HUMAN_SOURCE_TYPE = 'other';

export type CorrectionOutcome =
  /** The correction was applied to the canonical object. */
  | 'applied'
  /** A confirmation: review state recorded, no value changed. */
  | 'confirmed'
  /** A rejection: the contradiction is recorded, but no replacement value exists to write. */
  | 'rejected'
  /** Could not be applied safely; a conflict was produced instead. */
  | 'conflict';

export interface CorrectionApplication {
  readonly outcome: CorrectionOutcome;
  /** The updated canonical object. Present for `applied`/`confirmed`; absent for `conflict`, where the object is deliberately left alone. */
  readonly object?: CanonicalKnowledgeObject;
  /** A real P6-05 conflict retaining both positions. Present only for `conflict`. */
  readonly conflict?: ConflictObject;
  /** Why, in one line — surfaced to callers rather than hidden. */
  readonly reason: string;
}

function humanProvenance(decision: ReviewDecisionObject): Provenance {
  // Reuses the decision's own provenance rather than minting a second,
  // differently-shaped record of the same act.
  const existing = decision.metadata.provenance[0];
  return (
    existing ?? {
      sourceId: `review://${String(decision.attributes.reviewerId)}`,
      sourceType: 'other',
      derivedBy: 'human-review',
      derivedAt: decision.identity.createdAt,
    }
  );
}

/** Provenance entries that are NOT the human review — i.e. what the pipeline extracted. */
function extractionProvenance(object: CanonicalKnowledgeObject): readonly Provenance[] {
  return object.metadata.provenance.filter((p) => p.derivedBy !== 'human-review');
}

function asDisplayString(value: KnowledgeValue | undefined): string {
  if (value === undefined || value === null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/**
 * Builds the P6-05 conflict for a correction that cannot be applied safely,
 * retaining the extracted position and the human position side by side.
 */
export function buildCorrectionConflict(
  object: CanonicalKnowledgeObject,
  decision: ReviewDecisionObject,
  options: { at: string; attribute: string; claimCategory?: ClaimCategory },
): ConflictObject {
  const claimCategory: ClaimCategory = options.claimCategory ?? 'structure';
  const extracted = extractionProvenance(object);
  const human = humanProvenance(decision);

  const extractedPosition: ConflictPosition = {
    value: object.attributes[options.attribute] ?? null,
    sources: extracted.map((p) => ({
      sourceId: p.sourceId,
      sourceType: p.sourceType,
      authority: authorityOf(claimCategory, p.sourceType),
    })),
  };

  const humanPosition: ConflictPosition = {
    value: String(decision.attributes.correctedValue ?? ''),
    sources: [
      { sourceId: human.sourceId, sourceType: HUMAN_SOURCE_TYPE, authority: HUMAN_AUTHORITY },
    ],
  };

  // A conflict needs at least two positions (P6-05). When the object carries
  // no extraction provenance at all there is no second *sourced* position to
  // retain, so the extracted position is recorded against the object itself
  // rather than dropped -- retaining the disagreement is the point.
  if (extractedPosition.sources.length === 0) {
    extractedPosition.sources = [
      { sourceId: object.identity.id, sourceType: 'other', authority: 1 },
    ];
  }

  return {
    identity: {
      id: `reconciliation.conflict:${object.identity.id}:${options.attribute}:${options.at}`,
      systemId: object.identity.systemId,
      createdAt: options.at,
      updatedAt: options.at,
      schemaVersion: object.identity.schemaVersion,
    },
    category: 'observation',
    kind: 'reconciliation.conflict',
    label: `Disputed ${options.attribute} on ${object.label}`,
    attributes: {
      subjectId: object.identity.id,
      attribute: options.attribute,
      claimCategory,
      positions: [extractedPosition, humanPosition],
    },
    metadata: {
      provenance: [...extracted, human],
      confidence: {
        level: 'high',
        rationale:
          'The conflict itself is directly observed: a human correction disagreed with the value currently on the object, and was not applied.',
      },
    },
    evidence: [...object.evidence],
  };
}

/**
 * Applies one persisted decision to one canonical object.
 *
 * Pure: no clock, no I/O. The caller supplies `at` so the result is
 * deterministic and testable.
 */
export function applyCorrectionToObject(
  object: CanonicalKnowledgeObject,
  decision: ReviewDecisionObject,
  options: { at: string; claimCategory?: ClaimCategory },
): CorrectionApplication {
  if (decision.attributes.targetObjectId !== object.identity.id) {
    return {
      outcome: 'conflict',
      reason: `decision targets "${String(decision.attributes.targetObjectId)}", not "${object.identity.id}" -- refusing to apply it to a different object`,
      conflict: buildCorrectionConflict(object, decision, {
        at: options.at,
        attribute: String(decision.attributes.targetAttribute ?? 'unknown'),
        ...(options.claimCategory === undefined ? {} : { claimCategory: options.claimCategory }),
      }),
    };
  }

  const human = humanProvenance(decision);
  const decidedAt = decision.lifecycle?.since ?? decision.identity.createdAt;
  const reviewerId = String(decision.attributes.reviewerId);

  /** Identity is carried through untouched: same id, same systemId, same schemaVersion. Only `updatedAt` moves. */
  const identity = { ...object.identity, updatedAt: options.at };

  const reviewMarkers: Record<string, KnowledgeValue> = {
    [CORRECTION_ATTRIBUTES.reviewStatus]: String(decision.attributes.decision),
    [CORRECTION_ATTRIBUTES.decisionId]: decision.identity.id,
    [CORRECTION_ATTRIBUTES.reviewedBy]: reviewerId,
    [CORRECTION_ATTRIBUTES.reviewedAt]: decidedAt,
  };

  // --- Rejection: the human contradicted the value but supplied no -------
  // replacement, so there is nothing to write in its place. Recording the
  // rejection is the whole update; inventing a substitute value, or silently
  // recomputing confidence as though a replacement existed, would both be
  // fabrications. Review status and confidence stay separate axes.
  if (decision.attributes.decision === 'rejected') {
    return {
      outcome: 'rejected',
      reason:
        'human rejected the extracted value without supplying a replacement; the rejection is recorded and no value or confidence was changed',
      object: {
        ...object,
        identity,
        attributes: { ...object.attributes, ...reviewMarkers },
        metadata: {
          ...object.metadata,
          provenance: [...object.metadata.provenance, human],
        },
        lifecycle: {
          status: 'rejected',
          since: decidedAt,
          ...(object.lifecycle === undefined ? {} : { previousStatus: object.lifecycle.status }),
        },
      },
    };
  }

  // --- Confirmation: review state recorded, no value touched ---------------
  if (decision.attributes.decision === 'confirmed') {
    return {
      outcome: 'confirmed',
      reason: 'human confirmed the extracted value; review state recorded, no value changed',
      object: {
        ...object,
        identity,
        attributes: { ...object.attributes, ...reviewMarkers },
        metadata: {
          ...object.metadata,
          provenance: [...object.metadata.provenance, human],
        },
        lifecycle: {
          status: 'confirmed',
          since: decidedAt,
          ...(object.lifecycle === undefined ? {} : { previousStatus: object.lifecycle.status }),
        },
      },
    };
  }

  // --- Correction ----------------------------------------------------------
  const correctedValue = String(decision.attributes.correctedValue ?? '');
  const attribute = decision.attributes.targetAttribute;
  const supersededExpected = String(decision.attributes.previousValue ?? '');

  /**
   * Phase 6 inputs, chosen to assert only what is actually knowable:
   *
   *  - `supportingSources: 1` -- the reviewer. A correction is, by nature,
   *    a single uncorroborated authoritative statement.
   *  - `contradictingSources: 1` -- the ONE position the correction
   *    superseded. Deliberately not the count of the object's provenance
   *    entries: provenance records where the object came from, NOT which
   *    source claimed which attribute value, so "two sources therefore two
   *    contradictions" would be an invented fact. In Aurora's real data it
   *    would also be plainly wrong -- the architecture doc is the source
   *    that AGREES with a human correcting the technology to Java.
   *
   * With those inputs Phase 6 yields `medium`, which is the honest reading:
   * an authoritative but uncorroborated statement that displaced another.
   */
  const confidence = computeConfidence({
    supportingAuthority: HUMAN_AUTHORITY,
    supportingSources: 1,
    contradictingSources: 1,
  });

  const correctedMetadata = {
    ...object.metadata,
    provenance: [...object.metadata.provenance, human],
    confidence: {
      level: confidence.level,
      score: confidence.score,
      rationale: `Human-corrected by ${reviewerId} on ${decidedAt}; scored by the Phase 6 confidence model as one authoritative, uncorroborated source superseding one prior value.`,
    },
  };

  const correctedLifecycle = {
    status: 'corrected',
    since: decidedAt,
    ...(object.lifecycle === undefined ? {} : { previousStatus: object.lifecycle.status }),
  };

  // Unscoped: the decision names no attribute, so which one to change is
  // genuinely unknown. Record the correction, guess nothing.
  if (typeof attribute !== 'string' || attribute.length === 0) {
    return {
      outcome: 'applied',
      reason:
        'decision names no targetAttribute, so the corrected value is recorded on the object as an annotation without changing any extracted attribute',
      object: {
        ...object,
        identity,
        attributes: {
          ...object.attributes,
          ...reviewMarkers,
          [CORRECTION_ATTRIBUTES.correctedValue]: correctedValue,
          [CORRECTION_ATTRIBUTES.supersededValue]: supersededExpected,
        },
        metadata: correctedMetadata,
        lifecycle: correctedLifecycle,
      },
    };
  }

  // Stale: what the human saw is not what the object says now. Preserve the
  // disagreement instead of discarding a value nobody reviewed.
  const currentValue = asDisplayString(object.attributes[attribute]);
  if (currentValue !== supersededExpected) {
    return {
      outcome: 'conflict',
      reason: `stale correction: the decision superseded "${supersededExpected}" but "${attribute}" currently reads "${currentValue}" -- conflict retained rather than resolved`,
      conflict: buildCorrectionConflict(object, decision, {
        at: options.at,
        attribute,
        ...(options.claimCategory === undefined ? {} : { claimCategory: options.claimCategory }),
      }),
    };
  }

  return {
    outcome: 'applied',
    reason: `human correction applied to "${attribute}"; the extracted value is retained on ${CORRECTION_ATTRIBUTES.supersededValue}`,
    object: {
      ...object,
      identity,
      attributes: {
        ...object.attributes,
        [attribute]: correctedValue,
        ...reviewMarkers,
        [CORRECTION_ATTRIBUTES.correctedAttribute]: attribute,
        [CORRECTION_ATTRIBUTES.correctedValue]: correctedValue,
        [CORRECTION_ATTRIBUTES.supersededValue]: supersededExpected,
      },
      metadata: correctedMetadata,
      lifecycle: correctedLifecycle,
    },
  };
}

export interface BundlePropagationResult {
  /** The bundle with every applicable decision applied. Objects with no decision are returned byte-identical. */
  readonly bundle: CanonicalKnowledgeBundle;
  /** Conflicts produced for decisions that could not be applied safely — retained, never resolved. */
  readonly conflicts: readonly ConflictObject[];
  /** One line per decision, in order, so a caller can report exactly what happened. */
  readonly applications: readonly CorrectionApplication[];
}

/**
 * Applies decisions to a whole bundle, oldest decision first so a later
 * decision supersedes an earlier one on the same object.
 *
 * Objects no decision refers to are passed through untouched -- unrelated
 * knowledge is never rewritten.
 */
export function applyCorrectionsToBundle(
  bundle: CanonicalKnowledgeBundle,
  decisions: readonly ReviewDecisionObject[],
  options: { at: string; claimCategory?: ClaimCategory },
): BundlePropagationResult {
  const byId = new Map(bundle.objects.map((o) => [o.identity.id, o]));
  const conflicts: ConflictObject[] = [];
  const applications: CorrectionApplication[] = [];
  const humanSources: Provenance[] = [];

  for (const decision of decisions) {
    const targetId = String(decision.attributes.targetObjectId);
    const current = byId.get(targetId);
    if (current === undefined) continue; // nothing in this bundle to update

    const application = applyCorrectionToObject(current, decision, options);
    applications.push(application);
    // P8: a conflict carries the reviewer's provenance too (its human
    // position), so the reviewer's source must be registered either way.
    // Registering it only for APPLIED corrections left a stale correction's
    // conflict citing an unregistered source whenever that reviewer had no
    // applied correction in the same batch -- the updated bundle then failed
    // `validateSourceReferences` and could not be published.
    if (application.conflict !== undefined) {
      conflicts.push(application.conflict);
      humanSources.push(humanProvenance(decision));
    }
    if (application.object !== undefined) {
      byId.set(targetId, application.object);
      humanSources.push(humanProvenance(decision));
    }
  }

  return {
    bundle: {
      ...bundle,
      objects: [...byId.values()],
      ...registerHumanReviewSources(bundle.sources, humanSources),
    },
    conflicts,
    applications,
  };
}

/**
 * Registers the human-review sources a correction introduced, so the bundle's
 * `sources` registry still resolves every `Provenance.sourceId` it contains.
 *
 * Applying a correction appends provenance with a `review://<reviewer>`
 * sourceId. `validateSourceReferences` (P2-07) requires every referenced
 * sourceId to be present in `sources` WHENEVER a registry is declared -- so
 * without this, regenerating a real OKF document (which does declare its
 * sources) turned a valid document into an invalid one. Caught by the P7-06
 * traceability pass.
 *
 * When the bundle declares NO registry, none is invented: the validator skips
 * the check entirely in that case, and adding a registry would change the
 * document's shape beyond what the correction asked for.
 */
function registerHumanReviewSources(
  existing: readonly Source[] | undefined,
  humanProvenanceEntries: readonly Provenance[],
): { sources?: Source[] } {
  if (existing === undefined) return {};

  const known = new Set(existing.map((source) => source.id));
  const additions: Source[] = [];
  for (const entry of humanProvenanceEntries) {
    if (known.has(entry.sourceId)) continue;
    known.add(entry.sourceId);
    additions.push({
      id: entry.sourceId,
      type: entry.sourceType,
      // Factual, derived from the entry itself — not an invented description.
      label: `Human review (${entry.derivedBy})`,
    });
  }

  return additions.length === 0
    ? { sources: [...existing] }
    : { sources: [...existing, ...additions] };
}

/**
 * The graph write that carries a decision onto the EXISTING node of the
 * reviewed element.
 *
 * Uses `MATCH`, never `MERGE`: a correction must only ever update an element
 * that already exists. `MERGE` would need a label (which a decision does not
 * carry) and could therefore create a SECOND node sharing the same id under a
 * different label. `MATCH (n {id}) SET n += $properties` cannot create
 * anything, only touches the named node, and only sets the keys supplied --
 * so no other property, node, or relationship is affected.
 *
 * A missing target yields zero rows, which `ingestGraphWriteOperations`
 * reports as a failed node write rather than inventing a node.
 */
export function buildCorrectionNodeOperation(
  decision: ReviewDecisionObject,
  options: { at: string },
): NodeWriteOperation {
  const targetId = String(decision.attributes.targetObjectId);
  const attribute = decision.attributes.targetAttribute;
  const isCorrection = decision.attributes.decision === 'corrected';

  const properties: Record<string, string> = {
    [CORRECTION_ATTRIBUTES.reviewStatus]: String(decision.attributes.decision),
    [CORRECTION_ATTRIBUTES.decisionId]: decision.identity.id,
    [CORRECTION_ATTRIBUTES.reviewedBy]: String(decision.attributes.reviewerId),
    [CORRECTION_ATTRIBUTES.reviewedAt]: decision.lifecycle?.since ?? options.at,
  };

  if (isCorrection) {
    properties[CORRECTION_ATTRIBUTES.correctedValue] = String(
      decision.attributes.correctedValue ?? '',
    );
    properties[CORRECTION_ATTRIBUTES.supersededValue] = String(
      decision.attributes.previousValue ?? '',
    );
    if (typeof attribute === 'string' && attribute.length > 0) {
      properties[CORRECTION_ATTRIBUTES.correctedAttribute] = attribute;
      // The corrected value also lands on the attribute the pipeline wrote,
      // so existing readers see it without knowing about review at all. The
      // extracted value is still recoverable from `humanSupersededExtractedValue`
      // above and from the linked :ReviewDecision node.
      properties[`attr_${attribute}`] = String(decision.attributes.correctedValue ?? '');
    }
  }

  // P8 -- FR-ORC-04: a correction only ever touches the node of the
  // decision's OWN system. Matched on id alone, a decision recorded for one
  // tenant updated every tenant's node that shared the content-derived id.
  const systemId = decision.identity.systemId;
  return {
    id: targetId,
    label: '(existing)',
    cypher: 'MATCH (n {id: $id, systemId: $systemId}) SET n += $properties RETURN n',
    params: { id: targetId, systemId, properties },
  };
}
