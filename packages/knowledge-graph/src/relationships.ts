import type { GraphElementMetadata } from '@phoenix-ai/shared';
import type { KnowledgeValue } from './identity.js';
import type { RelationshipCategory } from './ontology.js';
import type { ConfidenceDetail } from './confidence.js';
import type { Evidence } from './evidence.js';

/**
 * A typed edge between two canonical knowledge objects (the "Relationships"
 * layer -- how knowledge objects relate to each other).
 *
 * `kind` is an open string (the FRD's actual verbs: contains, calls,
 * triggers, deployedTo, realizes, ...) -- naming that full domain-specific
 * vocabulary is P2-03 through P2-06's job. `category` (P2-02, `ontology.ts`)
 * is the small, closed, UNIVERSAL classification every `kind` falls under --
 * see `docs/architecture/adr/0004-domain-neutral-ontology.md` for the
 * FRD-verb-to-category mapping and the directionality convention.
 */
export interface CanonicalKnowledgeRelationship {
  id: string;
  /** Universal structural role (P2-02) -- see `RelationshipCategory`. */
  category: RelationshipCategory;
  /** Open-vocabulary domain-specific verb (P2-03 onward). */
  kind: string;
  sourceObjectId: string;
  targetObjectId: string;
  /**
   * A relationship is itself a claim, not just a pointer -- it carries its
   * own provenance/confidence, independent of the two objects it connects
   * (e.g. "Checkout calls Payments" may be less certain than either service
   * existing on its own).
   */
  metadata: GraphElementMetadata;
  /**
   * Optional free-form detail (P2-03), mirroring objects' `attributes`.
   * Lets `kind` stay a small, technology-agnostic vocabulary (e.g.
   * `'communicatesWith'`) while still capturing source-specific detail
   * (e.g. `{ description: 'authorizes payment' }`) without inventing a
   * new `kind` per protocol/mechanism.
   */
  attributes?: Record<string, KnowledgeValue>;
  /**
   * Fact/directly-observed vs derived/inferred, plus optional score
   * calculation metadata (P2-08) -- a sibling to `metadata.confidence`
   * (`@phoenix-ai/shared`, untouched). A relationship is itself a claim
   * (e.g. "Checkout calls Payments" observed via a code call vs inferred
   * from a naming heuristic), so it gets the same optional field objects
   * do -- see `confidence.ts`.
   */
  confidenceDetail?: ConfidenceDetail;
  /**
   * Concrete supporting material for this relationship (P2-09) -- a
   * sibling to `CanonicalKnowledgeObject.evidence` (P2-01), added here for
   * the same reason `confidenceDetail` was: a relationship is itself a
   * claim and can have its own evidence, independent of either object it
   * connects (e.g. a code excerpt showing the actual call site for
   * "Checkout calls Payments"). Optional, unlike the object's always-
   * present `evidence: Evidence[]` -- added after relationships already
   * existed without it, so it stays optional rather than forcing every
   * existing relationship fixture to add an empty array.
   */
  evidence?: Evidence[];
}
