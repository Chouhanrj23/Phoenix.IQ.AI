/**
 * P2-01 introduced Evidence; P2-09 rounds it out into the full
 * evidence/reference model -- standardizing how Phoenix stores supporting
 * material for a claim, distinct from `Provenance` (`@phoenix-ai/shared`)
 * by what each answers:
 *
 *   Provenance -- "Where did this knowledge originate?"
 *   Evidence   -- "What specifically supports this knowledge?"
 *
 * Provenance names a source (`sourceId`/`sourceType`), who derived the
 * claim (`derivedBy`), and when (`derivedAt`) -- one fact about the
 * derivation event itself. Evidence is the concrete material examined --
 * an excerpt, a location within the source, when it was captured, and
 * which revision of the source it came from -- and a claim can have zero,
 * one, or many pieces of it. `Evidence.sourceId` is the join key back to a
 * `Source` (`provenance.ts`, P2-07) or a `Provenance.sourceId`, so the two
 * models connect without either duplicating the other's fields (no
 * `sourceType`/`label` here -- resolve those from `Source` by `sourceId`,
 * see ADR 0011 decision 1).
 *
 * "Relationship to the canonical knowledge item" (the objective's own
 * phrasing) is containment, not a foreign key: Evidence lives inside the
 * `evidence[]` array of the specific `CanonicalKnowledgeObject`/
 * `CanonicalKnowledgeRelationship` it supports (`canonical-object.ts`,
 * `relationships.ts`) -- the array membership *is* the relationship. A
 * separate `supportsObjectId` back-pointer would only duplicate what the
 * array already expresses.
 */
export interface Evidence {
  /** Stable identifier for this specific piece of evidence -- "evidence identity". */
  id: string;
  /** Ties back to a `Provenance.sourceId` / `Source.id` (`provenance.ts`, P2-07) -- "source/reference". */
  sourceId: string;
  /** The actual supporting text/snippet, when captured -- "supporting content/context where appropriate". */
  excerpt?: string;
  /** Where within the source this was found (line range, section heading, comment id, etc) -- "location". */
  locator?: string;
  /**
   * ISO-8601 timestamp this specific excerpt was captured -- "timestamp
   * where applicable". Distinct from `Provenance.derivedAt` (when the
   * *claim* was derived): the same evidence can be referenced by claims
   * derived at different times, and evidence captured in one extraction
   * run can still be cited by a later differential run.
   */
  capturedAt?: string;
  /**
   * Version/revision of the source THIS evidence was captured from --
   * "version where applicable". Distinct from `Source.version` (P2-07,
   * `provenance.ts`): `Source.version` is the registry's current known
   * version for that source id; this pins the specific snapshot this one
   * excerpt came from, which matters once a source is re-scanned and its
   * registry entry moves on to a newer version while older evidence,
   * captured under an earlier one, remains valid and citable. Free-text,
   * same reasoning as `Source.version` (ADR 0009 alternatives considered)
   * -- no real source has been read yet to know what version formats
   * matter.
   */
  sourceVersion?: string;
}
