# ADR 0006: Domain/Entity model (P2-04)

- **Status:** Accepted
- **Date:** 2026-08-16
- **Owners:** Platform maintainers

## Context

P2-03 (ADR 0005) formalized the first domain-specific `kind` vocabulary (Architecture:
System/Container/Component) on top of P2-02's universal categories. P2-04 is the second of four
planned domain areas, covering Domain, Entity, Attribute, Relationship, Aggregate, and Entity
State — the FRD's "Domain/Entity" area.

Phase 1 already has a working `Domain`/`Aggregate` contract
(`packages/shared/src/contracts.ts`, P1-02) consumed by `apps/web`'s Domain Model page. Critically,
that contract's `Aggregate.entities` field is `string[]` — plain entity **names**, with no id, no
attributes, no provenance, no state. P2-04 must define what a real canonical `Entity` looks like
(with identity, field-level schema, and optional state) while proving Domain/Aggregate map
losslessly from Phase 1's real data, and being explicit that entities themselves currently have
no Phase 1 data to map from.

## Decision

1. **Four typed objects** (`domain.ts`, following the exact pattern `architecture.ts` established):
   `DomainObject`, `EntityObject`, `AggregateObject`, `EntityStateObject` — each
   `CanonicalKnowledgeObject<TAttributes>` narrowed to `category: 'entity'` and a literal `kind`
   (`domain.domain` / `domain.entity` / `domain.aggregate` / `domain.entity-state`).
2. **Attribute is a lightweight embedded struct, not a `CanonicalKnowledgeObject`.** The
   requirements list only `name`, `type` (where known), `required`/`optional` (where known) for
   Attribute — no identity, no independent provenance, unlike every other P2-04 concept. This is
   a deliberate signal: `AttributeDefinition { name; type?; required? }` lives in
   `EntityAttributes.fields?: AttributeDefinition[]`, not as its own canonical object. `type` and
   `required` stay optional (undefined = "not determined" — distinct from `required: false`,
   which is a positive claim that the field is optional).
3. **Domain association, aggregate root, and aggregate members are relationships, not fields.**
   Same convention P2-03 used for Container/Component belonging to a System: `Entity`'s domain
   association is a `contains` relationship (Domain→Entity); an `Aggregate`'s root and member
   entities are `aggregateRoot`/`aggregateMember` relationships (Aggregate→Entity), not fields on
   `AggregateObject` itself. Keeps hierarchy uniformly walkable via `category: 'composition'`
   relationships (P2-02), rather than each domain area inventing its own containment mechanism.
4. **`EntityStateObject` is distinct from P2-02's `LifecycleState`.** `LifecycleState` (already on
   every `CanonicalKnowledgeObject`) records what state _one specific instance_ is currently in
   (e.g. "this order's `lifecycle.status` = 'confirmed'"). `EntityStateObject` defines _a state
   that exists in the entity type's state machine at all_ (e.g. "Order entities can be in a
   'confirmed' state") — the schema, not the instance value. Both are needed and don't overlap:
   an extraction source populates `EntityStateObject`s + `transitionsTo` relationships once per
   entity _type_, and could (later, not here) set a specific order's `lifecycle.status` using one
   of those state labels.
5. **Six relationship kinds**, deliberately minimal: `contains` (composition; domain association),
   `aggregateRoot`/`aggregateMember` (composition; aggregate structure), `hasState` (association;
   entity → one of its legal states), `transitionsTo` (interaction; state → state, categorized as
   interaction because a transition is a triggered move, not a static reference), `relatesTo`
   (association; a deliberately generic, business-semantics-free entity-to-entity relationship,
   e.g. "Order relatesTo Customer" — this is what keeps arbitrary future entity relationships
   representable without inventing meaning per pair, per "do not invent business semantics").
6. **No `CANONICAL_SCHEMA_VERSION` bump.** Everything added is a new, purely additive file plus
   new optional/embedded fields — no existing valid object, relationship, or bundle from P2-01
   through P2-03 becomes invalid.
7. **Validators layered in `domain.ts`**, same as P2-03: built on the exported
   `validateCanonicalKnowledgeObject`/`validateCanonicalKnowledgeRelationship`/`isNonEmptyString`/
   `isPlainObject` from `validation.ts`, not merged into it. `validateEntityObject` additionally
   validates each `attributes.fields[]` entry's shape.

## UI compatibility mapping

| Phase 1 UI field (`DomainModelPage.tsx` via `Domain`/`Aggregate`) | Canonical model field           | Status                                     |
| ----------------------------------------------------------------- | ------------------------------- | ------------------------------------------ |
| `domain.name`                                                     | `DomainObject.label`            | Represented                                |
| `domain.description`                                              | `DomainAttributes.description`  | Represented                                |
| `domain.metadata` (provenance + confidence)                       | `DomainObject.metadata`         | Represented — direct reuse                 |
| `aggregate.name`                                                  | `AggregateObject.label`         | Represented                                |
| `aggregate.metadata`                                              | `AggregateObject.metadata`      | Represented — direct reuse                 |
| `aggregate.entities` (`string[]`, rendered as plain badges)       | _(no direct field — see below)_ | **Partially represented, with a real gap** |

`aggregate.entities` is where Phase 1's data model and P2-04's canonical model diverge most:
Phase 1 has _only_ a flat list of entity name strings with no independent identity. The canonical
model's answer is `EntityObject` (real identity, `attributes.fields`, optional state) linked to
its `Aggregate` via `aggregateRoot`/`aggregateMember` relationships — but there is **no real
Phase 1 data to map into that shape**, because Phase 1 never captured anything beyond the name.
`packages/knowledge-graph/tests/domain.test.ts` makes this explicit: one test proves
`Domain`→`DomainObject` and `Aggregate`→`AggregateObject` map losslessly from real Aurora fixture
values; a separate test documents (not solves) that entity-level mapping has nothing real to
adapt; a third demonstrates the target shape with a hand-built `EntityObject`, clearly labeled as
illustrative.

`Attribute` and `Entity State` have **no Phase 1 UI equivalent at all** — `DomainModelPage.tsx`
has never rendered field-level schema or entity state, so there is nothing to map, gap, or
preserve compatibility with; these are purely forward-looking per the P2-04 requirements.

## Consequences

A future extraction/inference source that discovers real entity-level detail (e.g. parsing a
database schema, an ORM model, or a domain event log) now has a defined target shape
(`EntityObject` + `AttributeDefinition[]` + `aggregateRoot`/`aggregateMember` relationships +
optionally `EntityStateObject`/`transitionsTo`) to produce, without Phase 1's UI or contract
needing to change first. The `apps/web` Domain Model page continues to work exactly as today,
unmodified, reading `Aggregate.entities` as plain strings — nothing here requires it to change.

## Alternatives considered

- **Attribute as a full `CanonicalKnowledgeObject`** (with its own identity/provenance/evidence)
  — rejected: the requirements explicitly list fewer fields for Attribute than every other P2-04
  concept (no "identity" listed), signaling it's meant to be lighter-weight; a full canonical
  object per field would also multiply object counts significantly for little benefit at this
  stage.
- **A `parentDomainId` convenience field on `EntityObject`**, redundant with the `contains`
  relationship — rejected, same reasoning as ADR 0004/0005: relationships are the single source
  of truth for hierarchy, not a duplicated pointer.
- **Merging `EntityStateObject` into `LifecycleState`** (reusing P2-02's instance-state field to
  also describe the type-level state machine) — rejected: conflates "what state is this instance
  in" with "what states exist for this type", which are genuinely different questions with
  different cardinality (one instance has one current `LifecycleState`; one entity type can have
  many possible `EntityStateObject`s).
- **A closed enum of common relationship kinds beyond the six listed** (e.g. `references`,
  `dependsOn`, `validates`) — rejected: `relatesTo` already covers "some domain relationship
  exists" without asserting a specific business meaning; adding more without a real source
  motivating them would risk inventing business semantics, which the requirements explicitly
  prohibit.
