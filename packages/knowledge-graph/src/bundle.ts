import type { CanonicalKnowledgeObject } from './canonical-object.js';
import type { CanonicalKnowledgeRelationship } from './relationships.js';
import type { Source } from './provenance.js';

/**
 * One full extraction/analysis run's output for a single system -- the
 * canonical model's top-level container.
 *
 * Deliberately shaped as objects + relationships (nodes + edges): the same
 * shape any graph store or the future OKF bundle (P2-10/P2-11) will need,
 * so adopting either later doesn't require redesigning this. No storage or
 * persistence is implied by this type -- it is a plain, in-memory/transport
 * representation only (see ADR 0003).
 */
export interface CanonicalKnowledgeBundle {
  systemId: string;
  /** ISO-8601 timestamp this bundle was assembled. */
  generatedAt: string;
  objects: CanonicalKnowledgeObject[];
  relationships: CanonicalKnowledgeRelationship[];
  /**
   * The distinct origin artifacts referenced by any `metadata.provenance[].sourceId`
   * or `evidence[].sourceId` in this bundle (P2-07, `provenance.ts`) -- optional
   * and additive: a bundle assembled before any `Source` registry existed, or one
   * with sources not yet resolved, remains valid without it.
   */
  sources?: Source[];
  /**
   * The OKF format/schema version this document conforms to (P2-10,
   * `okf.ts`) -- optional here so every P2-01 through P2-09 bundle fixture
   * remains valid unchanged; `OkfDocument` (`okf.ts`) narrows this to
   * required for anything actually serialized as an OKF YAML document. Not
   * a second version counter alongside `identity.schemaVersion` -- both are
   * expected to carry the same `CANONICAL_SCHEMA_VERSION` value; see
   * `docs/architecture/adr/0012-okf-yaml-schema.md` decision 1.
   */
  okfVersion?: string;
}
