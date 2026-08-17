# ADR 0004: Domain-neutral ontology foundation (P2-02)

- **Status:** Accepted
- **Date:** 2026-08-15
- **Owners:** Platform maintainers

## Context

P2-01 (ADR 0003) gave every `CanonicalKnowledgeObject` and `CanonicalKnowledgeRelationship` an
open-vocabulary `kind: string` field and deliberately deferred the closed ontology vocabulary.
`docs/ontology/README.md` already lists the FRD's provisional node types (`System`, `Container`,
`Component`, `Aggregate`, `Entity`, `Screen`, `Flow`, `FlowStep`, `Interface`, `Integration`,
`DataFlow`, `Epic`, `Feature`, `Story`, `AcceptanceCriterion`, `Node`, `DeploymentUnit`,
`Environment`, `Journey`, `Persona`) and relationships (`contains`, `implements`, `triggers`,
`has`, `reads/writes`, `carries`, `exposes/consumes`, `realizes`, `belongs to`, `satisfies`,
`deployedTo`, `runsIn`, `supports`).

P2-02's objective is not to formalize that full list yet (that's P2-03 through P2-06, one
functional area at a time) but to define the **common foundation** those areas will build on:
the small set of structural patterns that show up in _every_ one of those domain-specific
vocabularies, regardless of business domain.

## Decision

1. **Two small, closed enums**, added to a new `packages/knowledge-graph/src/ontology.ts`:
   - `StructuralCategory` (for objects): `'entity' | 'process' | 'observation' | 'other'`
   - `RelationshipCategory` (for relationships): `'composition' | 'association' | 'interaction' | 'realization' | 'other'`

   Each existing/future FRD `kind` value falls under exactly one category — see the mapping
   table below. This is UNIVERSAL STRUCTURAL CONCEPTS; the FRD's actual verbs/nouns
   (`Container`, `contains`, `Persona`, `realizes`, ...) remain DOMAIN-SPECIFIC INFORMATION,
   carried in the still-open `kind` string, not decided here.

2. **`category` becomes a required field** on both `CanonicalKnowledgeObject` and
   `CanonicalKnowledgeRelationship`, alongside the still-open `kind`. Every future producer must
   classify what it emits at the universal level from day one, even before P2-03+ names the
   domain-specific `kind` vocabulary precisely.

3. **A directionality convention** for relationships, stated once and applying to all four
   non-`other` categories: a relationship reads as "source `kind` target" — `sourceObjectId` is
   the object initiating/performing the relationship, `targetObjectId` is the one on the
   receiving end. For `composition` specifically: source = container/parent, target =
   contained/child (e.g. "System contains Container": source=System, target=Container). This
   makes the object graph's hierarchy walkable purely by filtering
   `relationships.filter(r => r.category === 'composition' && r.sourceObjectId === X)` — proven
   in `packages/knowledge-graph/tests/ontology.test.ts`.

4. **Optional `LifecycleState`** (`status`, `since`, `previousStatus?`) added to
   `CanonicalKnowledgeObject` as `lifecycle?: LifecycleState` — "where appropriate" per the
   instructions, so most `entity` objects (a container, an integration) simply omit it, while
   `observation` objects (a review item, a gap) typically populate it. `status` stays an open
   string — the closed status vocabulary per observation type is P2-03+ work, not universal.

5. **`observation` resolves a P2-01 gap.** ADR 0003 flagged that `ReviewItem`/`GapItem`/
   `DriftAlert` don't fit the canonical object envelope as ordinary facts — they're meta-
   statements about other knowledge, not primary knowledge themselves. `observation` is the
   structural category that acknowledges this directly, rather than forcing them into `entity`.

6. **An explicit `'other'` escape hatch** on both enums. A future source (repository extraction,
   an issue tracker, documentation, or anything not yet built) may produce a `kind` that doesn't
   obviously fit `entity`/`process`/`observation` yet — tagging it `other` keeps the data valid
   and capturable without forcing a premature, possibly-wrong categorization, and without a
   breaking schema change to add a fifth category later.

7. **Schema version bumped** (`CANONICAL_SCHEMA_VERSION`, `identity.ts`) from `2026-08-p2-01` to
   `2026-08-p2-02`, since the shape gained required fields. This is not a breaking change for
   anything real — no Phase 1 code imports this package yet (see ADR 0003) — but the version
   marker exists precisely so a future real breaking change is honestly flagged.

## Universal-category-to-FRD-concept mapping

| FRD concept (`docs/ontology/README.md`)                                                                                                   | `StructuralCategory` | Notes                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `System`, `Container`, `Component`, `Aggregate`, `Entity`, `Interface`, `Integration`, `Node`, `DeploymentUnit`, `Environment`, `Persona` | `entity`             | The default/most common category — discrete, persistent things.                                                                |
| `Flow`, `FlowStep`, `Journey`                                                                                                             | `process`            | Ordered sequences of steps; step order is array position in `attributes`, not a relationship.                                  |
| `Epic`, `Feature`, `Story`, `AcceptanceCriterion`                                                                                         | `entity` (likely)    | Tentative — these are deliverable-like rather than purely structural; P2-06-adjacent work may refine this. Not finalized here. |
| Phase 1's `ReviewItem`, `GapItem`, `DriftAlert`                                                                                           | `observation`        | Meta-statements about other objects, not primary facts — see point 5 above.                                                    |

| FRD relationship verb                                                                    | `RelationshipCategory` |
| ---------------------------------------------------------------------------------------- | ---------------------- |
| `contains`, `belongs to`, `deployedTo`, `runsIn`                                         | `composition`          |
| `implements`, `realizes`, `satisfies`                                                    | `realization`          |
| `triggers`, `has` (flow→step), `reads/writes`, `carries`, `exposes/consumes`, `supports` | `interaction`          |
| (generic pointer, e.g. an NFR's `appliesTo`, a review item's disputed-object pointer)    | `association`          |

This table is illustrative, not exhaustive or final — P2-03 through P2-06 will confirm or revise
individual mappings as each domain area is formalized. Recording it now is what makes it useful:
future work has a starting point instead of re-deriving it.

## Consequences

P2-03 through P2-06 (architecture, domain/entity, persona/journey, integration ontologies) each
now have a fixed, small set of universal categories to classify their `kind` values under,
instead of inventing classification schemes independently and risking four incompatible ones.
Any tooling built against the canonical model (search, rendering, validation) can reason
generically — "show me the containment hierarchy", "show me all interactions" — without knowing
the full domain-specific vocabulary.

The cost, accepted deliberately: four categories (plus `other`) is a coarse classification.
Some FRD concepts (Epic/Feature/Story, in particular) don't map obviously and are left
tentative rather than force-fit — flagged in the table above as unresolved, not silently decided.

## Alternatives considered

- **A deeper category hierarchy** (e.g. `entity.structural` vs `entity.behavioral`) — rejected:
  adds complexity before any real source exists to prove it's needed; four flat categories were
  sufficient to classify every FRD concept found in `docs/ontology/README.md` today.
- **No categories at all, `kind` stays fully open until P2-03+** — rejected: this is exactly
  what P2-02 was asked to define ("the universal structural concepts... regardless of business
  domain"); deferring further would mean P2-02 delivered nothing beyond P2-01.
- **Closing `kind` itself now** (naming Container/Aggregate/Persona/... as literal types) —
  rejected per explicit instruction: that's P2-03 through P2-06's job, one domain area at a time.
- **A `parentObjectId` convenience field on objects**, redundant with `composition`
  relationships, for faster hierarchy lookups — rejected: two sources of truth for the same fact
  (a parent pointer and a composition edge) can disagree; the relationship array is the single
  source of truth for hierarchy, proven walkable in `ontology.test.ts`.
