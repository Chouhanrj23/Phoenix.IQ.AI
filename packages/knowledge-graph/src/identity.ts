/**
 * Common metadata shared by every canonical knowledge object -- identifiers,
 * timestamps, and schema versioning. Deliberately separate from `metadata`
 * (provenance/confidence, see @phoenix-ai/shared) -- this is *who/when this
 * record is*, not *how we know it*.
 */

/**
 * Canonical model schema version. A plain string tag (not semver-enforced)
 * so future sources can evolve the shape without a breaking migration --
 * consumers can branch on it if a shape ever changes incompatibly.
 *
 * Bumped in P2-02: `CanonicalKnowledgeObject.category` and
 * `CanonicalKnowledgeRelationship.category` became required fields (see
 * `ontology.ts`). No Phase 1 consumer exists yet, so this is not a breaking
 * migration for anything real -- just an honest version marker.
 */
export const CANONICAL_SCHEMA_VERSION = '2026-08-p2-02' as const;

export interface KnowledgeObjectIdentity {
  /** Stable identifier, unique within the owning bundle/system. */
  id: string;
  /** Which analyzed system this object belongs to (e.g. 'aurora-commerce'). */
  systemId: string;
  /** ISO-8601 timestamp this object was first captured. */
  createdAt: string;
  /** ISO-8601 timestamp this object was last updated (e.g. a later differential run). */
  updatedAt: string;
  /** Canonical model schema version this object conforms to. */
  schemaVersion: string;
}

/**
 * A JSON-like scalar/structure value. Domain-neutral attribute values must
 * be representable as this so the canonical model stays source- and
 * domain-agnostic -- typed, named attributes belong to the ontology work
 * (P2-02 onward), not here.
 */
export type KnowledgeValue =
  string | number | boolean | null | KnowledgeValue[] | { [key: string]: KnowledgeValue };
