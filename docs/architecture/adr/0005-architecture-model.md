# ADR 0005: Architecture model (P2-03)

- **Status:** Accepted
- **Date:** 2026-08-16
- **Owners:** Platform maintainers

## Context

P2-02 (ADR 0004) established `StructuralCategory`/`RelationshipCategory` as the universal
classification every future domain-specific `kind` falls under, deliberately without naming any
domain-specific `kind` values. P2-03 is the first of four planned domain areas (Architecture,
then P2-04 Domain/entity, P2-05 Persona/journey/state, P2-06 Integration/API) that formalize
that vocabulary, one area at a time, per explicit instruction.

Phase 1 (`packages/shared/src/contracts.ts`, P1-02) already has a working `C4Node`/`C4Edge`
contract consumed by `apps/web`'s Architecture page. P2-03 must model System/Container/Component
without competing with or duplicating that contract — and must prove it can represent the same
real data Phase 1 already serves.

## Decision

1. **`CanonicalKnowledgeObject` becomes generic** (`packages/knowledge-graph/src/canonical-object.ts`):
   `CanonicalKnowledgeObject<TAttributes extends Record<string, KnowledgeValue> = Record<string, KnowledgeValue>>`.
   The default type parameter means every existing P2-01/P2-02 usage (bare `CanonicalKnowledgeObject`)
   keeps working unchanged — confirmed by the full P2-01/P2-02 test suite passing without
   modification. This is what lets P2-03 give System/Container/Component _real, compile-time-checked_
   attribute shapes instead of the untyped bag, without redesigning the envelope.
2. **Three typed objects** (`architecture.ts`): `SystemObject`, `ContainerObject`,
   `ComponentObject`, each `CanonicalKnowledgeObject<XAttributes>` narrowed to a literal
   `category: 'entity'` and a literal `kind`. `ArchitectureObject` is their union.
3. **Attribute shapes, deliberately minimal:**
   - `SystemAttributes { description?: string }` — optional, matching "purpose/description
     _where supported_" from the requirements; not every future source will know a system's
     purpose.
   - `ContainerAttributes { responsibility: string; technology?: string; runtime?: string }` —
     `responsibility` is **required** (unlike `description`), because the requirements list it
     as a first-class expectation, not qualified with "where available"; low-confidence is
     expressed via `metadata.confidence`, not by omitting the field. `technology`/`runtime` stay
     optional per "where available".
   - `ComponentAttributes { responsibility: string }` — same `responsibility` rationale;
     Component has no `technology`/`runtime` fields, matching what the requirements ask for
     (only Container gets those) and what Phase 1 has no data for at Component granularity
     anyway (see Limitations).
4. **Two relationship kinds, deliberately minimal and technology-agnostic**
   (`ARCHITECTURE_RELATIONSHIP_KINDS`): `contains` (composition; System→Container,
   Container→Component, source=parent/target=child per P2-02's convention) and
   `communicatesWith` (interaction; any runtime exchange regardless of mechanism). No protocol
   names, no vendor names — exactly what "without hardcoding assumptions about a specific
   technology" requires. `dependsOn`/other verbs were considered and deliberately left out: no
   Phase 1 fixture data motivates them yet (see Alternatives).
5. **`CanonicalKnowledgeRelationship` gains an optional `attributes?: Record<string, KnowledgeValue>`**
   (`relationships.ts`), mirroring what objects already had. This is what lets `kind` stay a
   small, closed, technology-agnostic vocabulary while still capturing Phase 1's free-text edge
   labels (e.g. `"authorizes payment"`) as `attributes.description`, losslessly. Optional, so
   every P2-01/P2-02 relationship fixture remains valid unchanged.
6. **No `CANONICAL_SCHEMA_VERSION` bump.** Both changes above are additive and backward
   compatible (a new optional field; a generic type parameter with a behavior-preserving
   default) — no existing valid object or relationship becomes invalid. The version stays
   `2026-08-p2-02`.
7. **Validators layered, not merged into `validation.ts`.** `validateSystemObject`/
   `validateContainerObject`/`validateComponentObject`/`validateArchitectureRelationship` live
   in `architecture.ts`, built on top of the exported (now public)
   `validateCanonicalKnowledgeObject`/`validateCanonicalKnowledgeRelationship`/`isNonEmptyString`/
   `isPlainObject` from `validation.ts`, rather than growing the universal validator with
   architecture-specific branches. Keeps `validation.ts` domain-neutral, as P2-02 established.

## UI compatibility mapping

| Phase 1 UI field (`ArchitecturePage.tsx` via `C4Node`/`C4Edge`) | Canonical model field                                                                     | Status                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node.name`                                                     | `SystemObject\|ContainerObject\|ComponentObject.label`                                    | Represented                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `node.description`                                              | `SystemAttributes.description` / `Container\|ComponentAttributes.responsibility`          | Represented (renamed per requirements — Phase 1 calls it `description` for all levels; P2-03 calls it `responsibility` for Container/Component specifically, `description` for System)                                                                                                                                                                                                                                          |
| `node.technology`                                               | `ContainerAttributes.technology`                                                          | Represented (Container only, matching the requirements — Component has no `technology` field, and Phase 1 never populates it for Component either)                                                                                                                                                                                                                                                                              |
| `node.metadata` (provenance + confidence)                       | `CanonicalKnowledgeObject.metadata`                                                       | Represented — direct reuse, unchanged since P2-01                                                                                                                                                                                                                                                                                                                                                                               |
| `node.level` (`'context' \| 'container' \| 'component'`)        | `object.kind` (`architecture.system \| architecture.container \| architecture.component`) | Partially represented — see Limitations: Phase 1's `'context'` level conflates the system-under-analysis with external actors                                                                                                                                                                                                                                                                                                   |
| `node.parentId`                                                 | _(none)_                                                                                  | **Missing / currently unused** — declared in `C4Node` (`packages/shared/src/contracts.ts`) but never populated in `apps/api`'s seed data and never read by `ArchitecturePage.tsx`. Not modeled in P2-03; composition relationships (`contains`) are the canonical model's mechanism for this instead.                                                                                                                           |
| `edge.label`                                                    | `ArchitectureRelationship.attributes.description`                                         | Represented, moved — `kind` is now the closed `communicatesWith`/`contains` vocabulary; the free-text label lives in `attributes` instead (see decision 5)                                                                                                                                                                                                                                                                      |
| `edge.metadata`                                                 | `ArchitectureRelationship.metadata`                                                       | Represented — direct reuse                                                                                                                                                                                                                                                                                                                                                                                                      |
| _(none — new in the canonical model)_                           | `ContainerAttributes.runtime`                                                             | **Not currently sourced by the Architecture UI.** Phase 1 has a `runtime` concept, but it lives on `DeploymentNode` (the separate Deployment/NFR API area, P1-07), describing a _deployed instance's_ runtime, not a container's own declared one. Included here because the requirements ask for it ("technology/runtime where available"); reconciling it with `DeploymentNode.runtime` is P2-04+ territory, not solved here. |

All mappings above are proven, not asserted: see
`packages/knowledge-graph/tests/architecture.test.ts`'s "Phase 1 C4Node/C4Edge compatibility"
suite, which adapts real Aurora fixture values (the actual `ctx-aurora` system node, the actual
`ctr-checkout` container node, and a real container-level edge) into `SystemObject`/
`ContainerObject`/`ArchitectureRelationship` and validates them.

## Limitations (explicitly not solved by P2-03)

- **External actors have no canonical `kind` yet.** Phase 1's `'context'`-level C4 nodes include
  both the system-under-analysis (one node, e.g. `ctx-aurora`) and external actors/systems it
  talks to (`Customer`, `Meridian Pay`, `RiskShield ML API`, `Warehouse & 3PL`, `Legacy ERP`,
  `Email/SMS Provider` — six more nodes, same `level: 'context'`). P2-03 only formalizes the one
  system node as `SystemObject`; the external actors don't yet have a home in this model. Likely
  candidates for a later step: their own `kind` (e.g. `architecture.external-system`) or folding
  into the Integration ontology (P2-06), since they're really "the other side" of an integration.
  Not decided here.
- **No real Phase 1 data exists at Component granularity.** `apps/api`'s
  `architecture.service.ts` and `apps/web`'s mock provider both explicitly fall back to the
  Container view when `level=component` is requested — the Gap Analysis page even calls this out
  as a known gap ("Component-level architecture... No ingested source was granular enough").
  `ComponentObject`'s compatibility test therefore uses a hand-built example, not a real Phase 1
  mapping — an honest limitation, not a gap introduced by P2-03.

## Alternatives considered

- **A `dependsOn` relationship kind**, alongside `contains`/`communicatesWith` — rejected for
  now: no Phase 1 fixture data (all real container edges represent active runtime calls/data
  exchange, i.e. `communicatesWith`) motivates a separate "structural but not active" dependency
  concept yet. Easy to add later without a breaking change (it's just one more literal in an
  open-ended-in-practice, closed-in-type union) once a real source needs it.
- **Modeling external context-level actors as `SystemObject`s too** — rejected: conflates "the
  system under analysis" (what Phoenix reconstructs knowledge about) with "systems Phoenix knows
  about only because they were mentioned" (a fundamentally different epistemic status). Left
  unresolved rather than force-fit; see Limitations.
- **A closed union for `ArchitectureObject['attributes']`'s nested fields** (e.g. structured
  `technology: { language: string; framework?: string }`) — rejected: Phase 1's real data is
  always a single free-text string ("Node.js", "ECS Fargate (scheduled task)"); structuring it
  further isn't motivated by any real source yet.
