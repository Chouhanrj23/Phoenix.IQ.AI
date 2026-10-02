/**
 * P7-05 -- OKF regeneration after a human correction.
 *
 * Phoenix has NO orchestrator (`packages/orchestration` is still a scaffold),
 * so nothing regenerates documentation on its own. Rather than implying that
 * a correction silently refreshes every output, this module provides:
 *
 *   1. `okfRegenerationState` -- the VISIBLE state: given when a document was
 *      generated and which decisions have landed since, which artifacts are
 *      now stale and why. This is what stops a stale export from being
 *      mistaken for a current one.
 *   2. `regenerateOkfDocument` -- the EXPLICIT operation that produces a
 *      fresh, validated `OkfDocument` with corrections applied.
 *
 * Both reuse existing machinery rather than re-deriving anything:
 * `applyCorrectionsToBundle` (`@phoenix-ai/review-loop`, P7-02) does the
 * canonical update, and `toOkfDocument`/`validateOkfDocument`/
 * `serializeOkfYaml` (`@phoenix-ai/knowledge-graph`, P2-10) do the OKF
 * envelope, ordering and validation. No second serializer, no second
 * correction path, no business description or relationship invented here --
 * this module only projects what the canonical model already says.
 */

import {
  toOkfDocument,
  validateOkfDocument,
  type CanonicalKnowledgeBundle,
  type ConflictObject,
  type OkfDocument,
  type ReviewDecisionObject,
} from '@phoenix-ai/knowledge-graph';
import { applyCorrectionsToBundle, type CorrectionApplication } from '@phoenix-ai/review-loop';
import { artifactsForObjectKind, type OkfArtifactId } from './artifacts.js';

/** One reviewed object and the artifacts its correction affects. */
export interface AffectedObject {
  readonly objectId: string;
  readonly kind: string;
  readonly artifacts: readonly OkfArtifactId[];
}

/**
 * Which objects in `bundle` the given decisions touch, and which artifacts
 * each one feeds.
 *
 * A decision naming an object that is not in the bundle contributes nothing --
 * it cannot make an artifact stale, because no artifact rendered from this
 * bundle contains it.
 */
export function affectedByDecisions(
  bundle: CanonicalKnowledgeBundle,
  decisions: readonly ReviewDecisionObject[],
): readonly AffectedObject[] {
  const byId = new Map(bundle.objects.map((o) => [o.identity.id, o]));
  const seen = new Map<string, AffectedObject>();

  for (const decision of decisions) {
    const targetId = String(decision.attributes.targetObjectId);
    if (seen.has(targetId)) continue;
    const object = byId.get(targetId);
    if (object === undefined) continue;
    seen.set(targetId, {
      objectId: targetId,
      kind: object.kind,
      artifacts: artifactsForObjectKind(object.kind),
    });
  }

  return [...seen.values()];
}

/** The distinct artifacts affected, de-duplicated across every affected object. */
export function affectedArtifacts(
  bundle: CanonicalKnowledgeBundle,
  decisions: readonly ReviewDecisionObject[],
): readonly OkfArtifactId[] {
  const ids = new Set<OkfArtifactId>();
  for (const affected of affectedByDecisions(bundle, decisions)) {
    for (const id of affected.artifacts) ids.add(id);
  }
  return [...ids];
}

export interface OkfRegenerationState {
  /** True when at least one decision landed after the document was generated AND affects an object in it. */
  readonly stale: boolean;
  /** When the document currently in hand was generated. */
  readonly documentGeneratedAt: string;
  /** Decisions recorded after that moment, oldest first. */
  readonly pendingDecisionIds: readonly string[];
  /** Objects in the document those decisions change. */
  readonly affectedObjects: readonly AffectedObject[];
  /** Artifacts that must be re-rendered, de-duplicated. */
  readonly staleArtifacts: readonly OkfArtifactId[];
  /** One line a caller can show verbatim. */
  readonly summary: string;
}

/**
 * P7-05 requirement 8 -- makes regeneration state VISIBLE.
 *
 * A decision counts as pending only if it was decided strictly after the
 * document was generated AND it targets an object the document contains.
 * A decision already reflected in the document, or about something the
 * document never included, does not make it stale.
 */
export function okfRegenerationState(
  document: OkfDocument | CanonicalKnowledgeBundle,
  decisions: readonly ReviewDecisionObject[],
): OkfRegenerationState {
  const generatedAt = document.generatedAt;
  const objectIds = new Set(document.objects.map((o) => o.identity.id));

  const pending = decisions.filter((decision) => {
    const decidedAt = decision.lifecycle?.since ?? decision.identity.createdAt;
    if (decidedAt <= generatedAt) return false;
    return objectIds.has(String(decision.attributes.targetObjectId));
  });

  const affectedObjects = affectedByDecisions(document, pending);
  const staleArtifacts = affectedArtifacts(document, pending);

  return {
    stale: pending.length > 0,
    documentGeneratedAt: generatedAt,
    pendingDecisionIds: pending.map((d) => d.identity.id),
    affectedObjects,
    staleArtifacts,
    summary:
      pending.length === 0
        ? `Up to date: no review decisions recorded after ${generatedAt} affect this document.`
        : `Stale: ${pending.length} review decision(s) recorded after ${generatedAt} affect ${affectedObjects.length} object(s). Regeneration required for: ${staleArtifacts.length === 0 ? 'no currently-modelled artifact' : staleArtifacts.join(', ')}.`,
  };
}

export interface OkfRegenerationResult {
  /** The regenerated document, with corrections applied and a fresh `generatedAt`. */
  readonly document: OkfDocument;
  /** Whether the regenerated document passes the real OKF validator. */
  readonly valid: boolean;
  readonly errors: readonly string[];
  /** Objects a correction changed, with the artifacts each affects. */
  readonly affectedObjects: readonly AffectedObject[];
  /** Artifacts that needed re-rendering — requirement 2's "don't touch unrelated artifacts" list. */
  readonly regeneratedArtifacts: readonly OkfArtifactId[];
  /** Object ids the regeneration left byte-identical. */
  readonly unchangedObjectIds: readonly string[];
  /** Corrections that could NOT be applied and were retained as conflicts instead (P6-05). */
  readonly conflicts: readonly ConflictObject[];
  /** Per-decision outcomes, in order, so a caller can report exactly what happened. */
  readonly applications: readonly CorrectionApplication[];
}

/**
 * The explicit regeneration operation.
 *
 * Applies every applicable decision to the bundle, stamps the result as an
 * OKF document, and validates it with the real validator. Provenance,
 * evidence, review/attestation metadata and object identity are all carried
 * through by `applyCorrectionsToBundle` -- nothing is stripped here, and
 * nothing is added that the canonical model did not already say.
 */
export function regenerateOkfDocument(
  bundle: CanonicalKnowledgeBundle,
  decisions: readonly ReviewDecisionObject[],
  options: { at: string; okfVersion?: string },
): OkfRegenerationResult {
  const before = new Map(bundle.objects.map((o) => [o.identity.id, o]));
  const affectedObjects = affectedByDecisions(bundle, decisions);

  const applied = applyCorrectionsToBundle(bundle, decisions, { at: options.at });

  // `generatedAt` moves because this IS a new rendering of the bundle; that is
  // also what makes a later staleness check meaningful.
  const document = toOkfDocument(
    { ...applied.bundle, generatedAt: options.at },
    options.okfVersion,
  );
  const validation = validateOkfDocument(document);

  const unchangedObjectIds = document.objects
    .filter((object) => before.get(object.identity.id) === object)
    .map((object) => object.identity.id);

  return {
    document,
    valid: validation.valid,
    errors: validation.errors,
    affectedObjects,
    regeneratedArtifacts: affectedArtifacts(bundle, decisions),
    unchangedObjectIds,
    conflicts: applied.conflicts,
    applications: applied.applications,
  };
}
