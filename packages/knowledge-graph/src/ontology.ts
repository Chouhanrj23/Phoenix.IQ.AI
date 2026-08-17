/**
 * P2-02 -- the domain-neutral ontology foundation.
 *
 * P2-01 gave every `CanonicalKnowledgeObject`/`CanonicalKnowledgeRelationship`
 * an open-vocabulary `kind: string` (e.g. `'architecture.container'`,
 * `'calls'`) and deferred the closed vocabulary to this step. This file adds
 * that vocabulary -- but only at the UNIVERSAL STRUCTURAL level, not the
 * domain-specific one:
 *
 *   UNIVERSAL STRUCTURAL CONCEPT        DOMAIN-SPECIFIC INFORMATION
 *   ------------------------------      ------------------------------------
 *   `category: 'entity'`                `kind: 'architecture.container'`,
 *                                        `kind: 'domain.aggregate'`,
 *                                        `kind: 'persona.persona'`, ...
 *   `category: 'composition'`           `kind: 'contains'`, `kind: 'deployedTo'`
 *   (relationship)                      (the FRD's actual verb)
 *
 * `category` is the small, closed, domain-neutral classification every
 * `kind` value falls under, regardless of which business domain produced it.
 * The `kind` string itself stays open -- naming the full domain-specific
 * vocabulary (Container, Aggregate, Persona, Integration, and so on) is
 * P2-03 through P2-06's job, not this file's. See
 * `docs/architecture/adr/0004-domain-neutral-ontology.md` for the full
 * rationale and the FRD-verb-to-category mapping.
 */

/**
 * The universal structural role a `CanonicalKnowledgeObject` plays,
 * independent of business domain. Every future `kind` (architecture,
 * domain/entity, persona/journey, integration, or any other future source)
 * must classify under exactly one of these.
 *
 * - `entity` -- a discrete, persistent "thing" with identity and attributes
 *   (a container, a domain, an aggregate, a persona, an integration, a
 *   deployment unit, a requirement -- the default/most common category).
 * - `process` -- an ordered sequence of steps/stages that unfolds over time
 *   (a flow, a journey, a workflow). Its steps are ordered by array
 *   position in `attributes`, not by relationships (see ADR 0004).
 * - `observation` -- a meta-statement ABOUT other knowledge objects, not a
 *   primary fact itself (a review item surfacing a disputed value, a gap
 *   noting an absence of knowledge, a drift alert noting a change). See the
 *   ADR 0003 gap this resolves: `ReviewItem`/`GapItem`/`DriftAlert` don't
 *   fit as ordinary entities.
 * - `other` -- explicit escape hatch. A future source's `kind` may not have
 *   an obvious home yet; tag it `other` rather than forcing a bad fit, and
 *   revisit categorization as real sources arrive.
 */
export type StructuralCategory = 'entity' | 'process' | 'observation' | 'other';

export const STRUCTURAL_CATEGORIES: readonly StructuralCategory[] = [
  'entity',
  'process',
  'observation',
  'other',
];

/**
 * The universal structural role a `CanonicalKnowledgeRelationship` plays.
 * Every future relationship `kind` (contains, calls, triggers, deployedTo,
 * implements, realizes, references, ...) must classify under exactly one.
 *
 * Directionality convention (applies to all four): a relationship reads as
 * "source `kind` target" -- `sourceObjectId` is the object performing/
 * initiating the relationship, `targetObjectId` is the one on the receiving
 * end. E.g. "Container contains Component": source=Container,
 * target=Component. "Story realizes Feature": source=Story, target=Feature.
 *
 * - `composition` -- structural containment / hierarchy ("X contains Y",
 *   "X belongs to Y" read with X as source, "X deployedTo Y", "X runsIn Y").
 *   This is the universal concept behind "hierarchy".
 * - `association` -- a loose reference between two objects with no
 *   ownership implied ("X references Y"). This is the universal concept
 *   behind "references" -- e.g. an NFR's `appliesTo` or a `ReviewItem`
 *   pointing at the object it disputes, once resolved to a real object id.
 * - `interaction` -- an exchange of data or control ("X calls Y",
 *   "X triggers Y", "X reads/writes Y", "X carries data to Y").
 * - `realization` -- X fulfills or implements the intent of Y
 *   ("X implements Y", "X realizes Y", "X satisfies Y").
 * - `other` -- explicit escape hatch, same rationale as `StructuralCategory`.
 */
export type RelationshipCategory =
  'composition' | 'association' | 'interaction' | 'realization' | 'other';

export const RELATIONSHIP_CATEGORIES: readonly RelationshipCategory[] = [
  'composition',
  'association',
  'interaction',
  'realization',
  'other',
];

/**
 * Optional lifecycle/state tracking for a `CanonicalKnowledgeObject`.
 * "Where appropriate" per P2-02's design principles -- most `entity`
 * objects won't need this (a container doesn't have a "status"), but
 * `observation` objects typically will (a review item's pending/confirmed/
 * corrected status; a gap's open/resolved status).
 *
 * `status` is an open string, consistent with `kind` -- the closed status
 * vocabulary per observation type is domain-specific work (P2-03+), not
 * universal.
 */
export interface LifecycleState {
  status: string;
  /** ISO-8601 timestamp this status was entered. */
  since: string;
  /** The status this object was in immediately before, if any. */
  previousStatus?: string;
}
