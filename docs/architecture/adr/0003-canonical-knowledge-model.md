# ADR 0003: Canonical knowledge model (P2-01)

- **Status:** Accepted
- **Date:** 2026-08-15
- **Owners:** Platform maintainers

## Context

Phase 1 built real backend APIs for six functional areas (System Summary, Architecture, Domain
Model, Integrations, Deployment/NFR, Review/Gaps/Drift), each with its own independent
TypeScript contract in `packages/shared/src/contracts.ts` (`SystemSummary`, `C4Node`/`C4Edge`,
`Domain`/`Aggregate`, `Integration`, `DeploymentNode`, `NonFunctionalRequirement`, `ReviewItem`,
`GapItem`, `DriftAlert`/`DriftRun`). These are flat, per-area, and independently seeded
(`apps/api/src/data/seed.ts`) — there is no shape that unifies them into one graph, and no
package represents "a piece of Phoenix knowledge" in general.

Phase 2's objective is the canonical knowledge model: the common representation that future
extraction/inference sources (repository connectors, Jira, and others — none built yet) will
produce, and that the future OKF renderers and knowledge graph storage will consume. Building
real sources or storage before this common shape exists would mean redesigning them the moment
it lands — so P2-01 defines the shape first, deliberately before any of that exists.

`packages/knowledge-graph` was scaffolded in the initial repository setup as "the single source
of truth from which all OKF outputs are projected; stores every element with provenance" but,
per Phase 1's own audit, was never implemented or imported by anything — a pure placeholder
(`MODULE_NAME`/`placeholder()`) despite `apps/api` already declaring a dependency on it. It is
the natural, purpose-built, non-duplicative home for this work.

## Decision

1. **Location.** The canonical model lives in `packages/knowledge-graph/src/`, replacing its
   placeholder scaffold. This gives that package its first real content and finally uses the
   dependency `apps/api` already declared on it (though `apps/api` does not yet import from it —
   see Deferred, below).
2. **Reuse, don't duplicate, Phase 1's primitives.** `Provenance`, `Confidence`, and
   `GraphElementMetadata` (`packages/shared/src/provenance.ts`) are imported and reused as-is for
   the model's Source/Provenance and Confidence layers — they were already domain-neutral and
   already used consistently across every Phase 1 contract type. Re-deriving them here would be
   exactly the duplication Phase 1's own instructions warned against.
3. **Six layers**, each a small, focused file:
   - **`identity.ts`** — `KnowledgeObjectIdentity` (id, systemId, createdAt, updatedAt,
     schemaVersion) and `KnowledgeValue` (a JSON-like value type for domain-neutral attributes).
     The **Metadata** layer.
   - **`evidence.ts`** — `Evidence` (sourceId + optional excerpt/locator). The **Evidence**
     layer — distinct from Provenance: provenance says _where a claim came from_, evidence
     captures _what was actually observed there_.
   - **`relationships.ts`** — `CanonicalKnowledgeRelationship` (typed edge between two objects,
     itself carrying `metadata: GraphElementMetadata`). The **Relationships** layer.
   - **`canonical-object.ts`** — `CanonicalKnowledgeObject` (the envelope: `identity`, `kind`,
     `label`, `attributes`, `metadata`, `evidence`). The **Core knowledge** layer's container —
     not the facts themselves; see design principle 2 below.
   - **`bundle.ts`** — `CanonicalKnowledgeBundle` (`systemId`, `generatedAt`, `objects[]`,
     `relationships[]`) — the top-level container for one analysis run's output.
   - **`validation.ts`** — plain, zero-dependency structural validators
     (`validateCanonicalKnowledgeObject`/`Relationship`/`Bundle`), mirroring how `apps/api`
     validates without a new library (Fastify's native JSON-schema, not zod/ajv).
4. **`kind` is an open string, not a closed union**, on both `CanonicalKnowledgeObject` and
   `CanonicalKnowledgeRelationship`. `docs/ontology/README.md` already lists the FRD's
   provisional node/relationship vocabulary (`System`, `Container`, `Aggregate`, `Persona`,
   `contains`, `calls`, `deployedTo`, ...) — formalizing that into a closed, validated vocabulary
   is explicitly P2-02's job, not P2-01's. Closing it prematurely here would mean redesigning it
   again once the ontology work lands.
5. **Objects + relationships (nodes + edges), not embedded relationships.** A
   `CanonicalKnowledgeObject` does not carry its own relationships inline; `CanonicalKnowledgeBundle`
   holds both arrays separately. This is the same shape any graph store or the future OKF bundle
   (P2-10/P2-11) will need, so adopting either later doesn't require reshaping this.
6. **No persistence layer.** `CanonicalKnowledgeBundle` is a plain, in-memory/transport type.
   Nothing in this change adds a database, Neo4j, or any storage mechanism — per explicit
   instruction, that remains out of scope until a later phase.
7. **Free-form `attributes` bag, not typed per-domain fields.** A container's `technology`, a
   persona's `goals`, and so on are not modeled as named fields on `CanonicalKnowledgeObject` —
   they go in `attributes: Record<string, KnowledgeValue>`. Typed extensions per ontology kind are
   P2-03 onward's job (Architecture model, Domain/entity model, etc.).

## Consequences

Future work (P2-02 ontology, P2-03+ per-area typed models, and eventually real extraction
sources) has one common shape to target instead of inventing its own each time. Phase 1's six
API areas are proven representable in this shape without modifying their contracts (see the
compatibility tests in `packages/knowledge-graph/tests/phase1-compatibility.test.ts`), so
adopting the canonical model later will not require breaking API changes to `apps/api`.

The cost: `attributes`/`kind` being untyped/open means TypeScript cannot catch a mistyped
attribute name or an unrecognized relationship kind yet — that safety net only arrives with
P2-02's closed vocabulary. This is an accepted, deliberate gap for P2-01's scope, not an
oversight.

## UI-to-canonical-model mapping

| Existing Phase 1 UI concept                | Canonical knowledge concept                                                                                                                                                                      | Notes / gaps identified                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SystemSummary.{id,name,description,tags}` | `CanonicalKnowledgeObject` with `kind: 'system'` (a root/hub object)                                                                                                                             | `SystemSummary`'s aggregate stats (`coverageScore`, `totalElements`, `pendingReviewCount`, `driftAlertCount`) are **derived metrics computed over a bundle**, not primary facts — they don't map to an object's `attributes`. Deferred: a `CanonicalKnowledgeBundle` summary/stats concept, not designed here.                                                                           |
| `C4Node` (Architecture)                    | `CanonicalKnowledgeObject` with `kind: 'architecture.<level>'`                                                                                                                                   | Direct, lossless mapping — proven in the compatibility tests. `level`/`technology`/`description` become `attributes`.                                                                                                                                                                                                                                                                    |
| `C4Edge` (Architecture)                    | `CanonicalKnowledgeRelationship` with `kind: <edge.label>`                                                                                                                                       | `label` is currently free English text ("authorizes payment"); P2-02 will need to decide whether relationship `kind` becomes a closed verb vocabulary (e.g. `calls`) with the label kept as a separate human-readable field, or left as-is. Not decided here.                                                                                                                            |
| `Domain` / `Aggregate` (Domain Model)      | Two `CanonicalKnowledgeObject`s (`kind: 'domain.domain'`, `kind: 'domain.aggregate'`) + a `contains` `CanonicalKnowledgeRelationship`                                                            | Domain Model's nesting (domain → aggregates → entities) is 3 levels deep; `Aggregate.entities: string[]` is currently a plain string list with no provenance/confidence of its own — a gap if entities ever need independent tracking.                                                                                                                                                   |
| `Integration`                              | `CanonicalKnowledgeObject` with `kind: 'integration.integration'`                                                                                                                                | `direction`/`protocol`/`dataExchanged` become `attributes`. Straightforward.                                                                                                                                                                                                                                                                                                             |
| `DeploymentNode` (Deployment/NFR)          | `CanonicalKnowledgeObject` with `kind: 'deployment.environment'` or `'deployment.instance'`, + a `deployedTo`/`runsIn` `CanonicalKnowledgeRelationship` from the container's architecture object | `environmentId`/`containerId` (currently plain id strings on the object) become relationship endpoints instead — a structural change deferred to whenever real deployment ingestion is built.                                                                                                                                                                                            |
| `NonFunctionalRequirement`                 | `CanonicalKnowledgeObject` with `kind: 'nfr.requirement'`, + relationships to the containers/objects in `appliesTo`                                                                              | `appliesTo: string[]` is currently a list of free-text names, not object ids — a gap: it can't be turned into real relationships without a name-to-id resolution step not built yet.                                                                                                                                                                                                     |
| `ReviewItem` (Review/Gaps/Drift)           | **Not a `CanonicalKnowledgeObject`** — a _view_ over one, surfacing disputed values                                                                                                              | `ReviewItem.conflict: ConflictingValue[]` is more naturally multiple `Evidence`/`Provenance` entries disagreeing about the same object's attribute than a first-class object of its own. Modeling this properly is deferred — flagged as a real design question for P2-02+, not solved here.                                                                                             |
| `GapItem`                                  | **Not a `CanonicalKnowledgeObject`** — represents an _absence_ of knowledge                                                                                                                      | Doesn't fit the "envelope wraps a known fact" model at all, since there is no fact yet. Likely needs its own first-class type in a later phase (not P2-01).                                                                                                                                                                                                                              |
| `DriftAlert` / `DriftRun`                  | Related to `identity.updatedAt` / future version history                                                                                                                                         | A single `CanonicalKnowledgeObject` has one `updatedAt`, not a history of prior versions — representing "what changed between runs" needs either an explicit version-chain concept or an external diff mechanism. Not designed here; explicitly deferred (drift _detection_ itself is out of scope for all of Phase 2 per instruction, but the _data shape_ gap is worth recording now). |

## Alternatives considered

- **Embed relationships inside `CanonicalKnowledgeObject`** (like `C4Edge` living inside a node) —
  rejected: harder to query/traverse both directions, and diverges from the nodes+edges shape
  every graph representation (including the eventual OKF bundle) will want.
- **Closed `kind` union now**, hand-enumerating the FRD's ontology list immediately — rejected:
  P2-01's explicit scope is the model's boundaries, not the ontology; closing it prematurely
  would mean revisiting every existing usage once P2-02 lands anyway.
- **Put the canonical model in `packages/shared`** — rejected: `shared`'s own README states it's
  "the only package every other package may depend on directly" and stays a thin, foundational
  layer (logger, config, provenance/confidence primitives); a rich domain model belongs in the
  package the architecture already designates for it (`knowledge-graph`), not the shared utility
  package.
- **Add zod/ajv for schema validation** — rejected, consistent with Phase 1's precedent: no new
  dependency was needed; plain TypeScript type guards suffice for P2-01's structural checks.
