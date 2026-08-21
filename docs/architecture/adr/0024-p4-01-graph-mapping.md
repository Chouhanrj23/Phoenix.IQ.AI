# ADR 0024: P4-01 — OKF → graph model mapping

- **Status:** Accepted
- **Date:** 2026-08-21
- **Owners:** Platform maintainers

## Context

P4-01's objective: "Map canonical OKF concepts to graph nodes and relationships." The Phase 2 canonical
OKF (`@phoenix-ai/knowledge-graph`) remains the sole knowledge representation; Neo4j is a persistence/
query projection of it, not a second model.

**Correction to ADR 0023 / `docs/phase-4/README.md`:** both previously said the OKF has "12 object
kinds." Re-counting directly against the actual source (`ARCHITECTURE_OBJECT_KINDS`,
`DOMAIN_OBJECT_KINDS`, `JOURNEY_OBJECT_KINDS`, `INTEGRATION_OBJECT_KINDS`) during this ticket found
**15**: architecture (3: system/container/component) + domain (4: domain/entity/aggregate/
entity-state) + journey (4: persona/journey/flow/action) + integration (4: api/interface/integration/
dataflow). The earlier "12" conflated the P4-01 tracker requirement's illustrative list (which names
"attribute" as if it were a 13th object kind, and omits aggregate/entity-state/flow) with the real
schema. `AttributeDefinition`/`OperationDefinition` are confirmed, by direct inspection of `domain.ts`/
`integration.ts`, to be embedded, non-object descriptors (inside `EntityAttributes.fields`/
`ApiAttributes.operations`) — never a first-class `CanonicalKnowledgeObject`, so they have no node
mapping of their own (see decision 2). This ADR and its accompanying code use the corrected count; the
`docs/phase-4/README.md` producer-coverage numbers below are restated accordingly (still 2 kinds with
real producers, now correctly out of 15, not 12).

## Decision

### 1. Scope and non-goals

Implemented in `packages/graph-persistence/src/graph-mapping.ts` — a pure, synchronous module. It does
**not** import `neo4j-driver`, open a session, run Cypher, expose an API route, or touch
`apps/web`. Its only job: `CanonicalKnowledgeObject`/`CanonicalKnowledgeRelationship` →
`GraphNodeMapping`/`GraphRelationshipMapping`, an in-memory value shaped for a **later** ticket
(P4-02/03/04) to actually persist. It assumes its input bundle is already valid per
`validateCanonicalKnowledgeBundle`/`validateSourceReferences` — re-validating referential integrity
here would duplicate, not compose with, P2's own validators.

### 2. Node mapping — every real OKF object kind

| OKF Kind                  | Neo4j Label   | Stable ID     | Required properties                                                                                         | Optional properties                                                                            |
| ------------------------- | ------------- | ------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `architecture.system`     | `System`      | `identity.id` | `id`, `kind`, `category`, `label`, `systemId`, `createdAt`, `updatedAt`, `schemaVersion`, `confidenceLevel` | `attr_description`, `confidenceScore`, `confidenceRationale`, `confidenceBasis`, lifecycle*    |
| `architecture.container`  | `Container`   | `identity.id` | same base + `attr_responsibility`                                                                           | `attr_technology`, `attr_runtime`                                                              |
| `architecture.component`  | `Component`   | `identity.id` | same base + `attr_responsibility`                                                                           | —                                                                                              |
| `domain.domain`           | `Domain`      | `identity.id` | same base                                                                                                   | `attr_description`                                                                             |
| `domain.entity`           | `Entity`      | `identity.id` | same base                                                                                                   | `attr_description`, `attr_fields_json` (JSON-stringified `AttributeDefinition[]`)              |
| `domain.aggregate`        | `Aggregate`   | `identity.id` | same base                                                                                                   | `attr_description`                                                                             |
| `domain.entity-state`     | `EntityState` | `identity.id` | same base (the state name is `label`, not an attribute)                                                     | `attr_description`                                                                             |
| `journey.persona`         | `Persona`     | `identity.id` | same base                                                                                                   | `attr_description`, `attr_role`, `attr_goals` (string array), `attr_painPoints` (string array) |
| `journey.journey`         | `Journey`     | `identity.id` | same base + `attr_purpose`                                                                                  | —                                                                                              |
| `journey.flow`            | `Flow`        | `identity.id` | same base                                                                                                   | `attr_description`, `attr_triggerScreen`                                                       |
| `journey.action`          | `Action`      | `identity.id` | same base + `attr_description`                                                                              | —                                                                                              |
| `integration.api`         | `Api`         | `identity.id` | same base                                                                                                   | `attr_description`, `attr_operations_json` (JSON-stringified `OperationDefinition[]`)          |
| `integration.interface`   | `Interface`   | `identity.id` | same base                                                                                                   | `attr_description`, `attr_protocol`                                                            |
| `integration.integration` | `Integration` | `identity.id` | same base + `attr_interactionType`                                                                          | `attr_protocol`, `attr_counterpartDescription`                                                 |
| `integration.dataflow`    | `DataFlow`    | `identity.id` | same base                                                                                                   | `attr_data`, `attr_direction`                                                                  |

*Lifecycle (`lifecycleStatus`/`lifecycleSince`/`lifecyclePreviousStatus`) is present only when the
source object carries `lifecycle` — most `entity`-category objects won't (P2-02's own design; see
`ontology.ts`).

`attributes` is deliberately **not** hand-mapped field-by-field per kind in code — `flattenAttributesInto`
(a single, generic function) flattens any scalar/homogeneous-scalar-array attribute directly and
JSON-stringifies anything else (nested objects, arrays of objects). Hand-writing 15 per-kind property
extractors would re-encode typing Phase 2's own domain files already own — exactly the "second domain
model" this ticket was told not to create. The table above documents the _expected_ shape per kind (for
a reader), not a second implementation of it.

**No node mapping for `AttributeDefinition`/`OperationDefinition`** — confirmed by inspection these are
not `CanonicalKnowledgeObject`s (no `identity`, no independent provenance); they stay embedded, JSON-
flattened data on their owning `Entity`/`Api` node (`attr_fields_json`/`attr_operations_json`), not a
separate node type. Exploding them into first-class `(:Field)`/`(:Operation)` nodes is a design option
left to P4-03, not decided here — doing so now would be persistence-layer work, out of P4-01's scope.

### 3. Relationship mapping

| OKF Relationship                                                               | Neo4j Relationship    | Source              | Target                   | Coverage                                     |
| ------------------------------------------------------------------------------ | --------------------- | ------------------- | ------------------------ | -------------------------------------------- |
| `contains` (System→Container, Container→Component, Domain→Entity, Flow→Action) | `CONTAINS`            | varies by domain    | varies by domain         | SUPPORTED BY SCHEMA                          |
| `communicatesWith`                                                             | `COMMUNICATES_WITH`   | Container/Component | Container/Component      | SUPPORTED BY SCHEMA                          |
| `aggregateRoot`                                                                | `AGGREGATE_ROOT`      | Aggregate           | Entity                   | SUPPORTED BY SCHEMA                          |
| `aggregateMember`                                                              | `AGGREGATE_MEMBER`    | Aggregate           | Entity                   | SUPPORTED BY SCHEMA                          |
| `hasState`                                                                     | `HAS_STATE`           | Entity              | EntityState              | SUPPORTED BY SCHEMA                          |
| `transitionsTo`                                                                | `TRANSITIONS_TO`      | EntityState         | EntityState              | SUPPORTED BY SCHEMA                          |
| `relatesTo`                                                                    | `RELATES_TO`          | Entity              | Entity                   | SUPPORTED BY SCHEMA                          |
| `hasPersona`                                                                   | `HAS_PERSONA`         | Journey             | Persona                  | SUPPORTED BY SCHEMA                          |
| `supports`                                                                     | `SUPPORTS`            | Flow                | Journey                  | SUPPORTED BY SCHEMA                          |
| `readsEntity`                                                                  | `READS_ENTITY`        | Action              | Entity                   | SUPPORTED BY SCHEMA                          |
| `writesEntity`                                                                 | `WRITES_ENTITY`       | Action              | Entity                   | SUPPORTED BY SCHEMA                          |
| `triggersTransition`                                                           | `TRIGGERS_TRANSITION` | Action              | EntityState              | SUPPORTED BY SCHEMA                          |
| `hasIntegration`                                                               | `HAS_INTEGRATION`     | any internal object | Integration              | SUPPORTED BY SCHEMA                          |
| `carries`                                                                      | `CARRIES`             | Integration         | DataFlow                 | SUPPORTED BY SCHEMA                          |
| `exposes`                                                                      | `EXPOSES`             | any internal object | Interface                | SUPPORTED BY SCHEMA                          |
| `consumes`                                                                     | `CONSUMES`            | any internal object | Interface                | SUPPORTED BY SCHEMA                          |
| `realizes`                                                                     | `REALIZES`            | Api                 | Interface                | SUPPORTED BY SCHEMA                          |
| `dependsOn`                                                                    | `DEPENDS_ON`          | Api                 | Entity (observed so far) | **CURRENTLY PRODUCED BY PHASE 3** (ADR 0023) |
| `hasAssociation`                                                               | `HAS_ASSOCIATION`     | Entity              | Entity                   | **CURRENTLY PRODUCED BY PHASE 3** (ADR 0023) |

19 total relationship kinds mapped: 17 schema-supported (the closed, per-domain vocabularies —
`contains` is one table entry despite appearing in three domain files with identical meaning, per
`RelationshipCategory`'s own documented convention), plus the 2 additive kinds `bridge-relationships.ts`
mints using P2-01/02's deliberately open `kind` string. No relationship kind was invented for this
ticket — every entry traces to either a real `*_RELATIONSHIP_KINDS` constant or a real, already-shipped
bridge function.

### 4. Identity strategy

**Reuse, not regeneration.** `GraphNodeMapping.id` = `CanonicalKnowledgeObject.identity.id`, verbatim.
`GraphRelationshipMapping.id` = `CanonicalKnowledgeRelationship.id`, verbatim. This module generates no
id of its own — P3-06/07's `deterministicId` (`bridge-shared.ts`, `sha256(prefix + systemId +
qualifiedName)`) and `bridge-relationships.ts`'s equivalent for relationships are already deterministic,
already stable across repeated ingestion of identical input, and already independent of display names
(`label` is never part of the hash). Minting a second id scheme on top would itself be a second identity
model — the same "no second domain model" principle applied to identity specifically. An object/
relationship with an empty id is rejected as a `GraphMappingIssue`, never assigned a random one (Step 4's
explicit "do not use random UUID generation" requirement).

**Known limitation, not fixed here (out of scope — would require modifying Phase 3's bridges, which
this ticket was told not to do "unless absolutely required to consume the existing OKF"):**
`deterministicId`'s inputs are `(prefix, systemId, qualifiedName)` — it does **not** include the source/
repository id. Two different repositories ingested under the same `systemId` whose code happens to
share a fully-qualified class name (e.g. two independent services each defining
`com.aurora.commerce.Order`) would collide onto the same graph node id. This is a real gap for "compatible
with multiple repositories," documented here for P4-03's ingestion design to account for (e.g. scoping
Neo4j's `MERGE` key by `(sourceId, id)` instead of `id` alone, or a future Phase 3 ticket adding `sourceId`
into the hash) — not silently hidden, not fixed in this ticket.

### 5. Provenance

`metadata.provenance` (an array — an object can have more than one) is preserved as its own structured
field, `GraphNodeMapping.provenance`/`GraphRelationshipMapping.provenance`, **not** flattened onto scalar
properties. Flattening would silently drop every entry past the first, which the actual OKF schema
explicitly allows (`validateProvenanceEntries` requires a non-empty array, not exactly one). Available
fields (all real, `Provenance` from `@phoenix-ai/shared`, none invented): `sourceId` (repository/source),
`sourceType`, `derivedBy` (extraction metadata: which module produced this), `derivedAt`. File/path/line
location is not a `Provenance` field — it lives on `Evidence.locator` (decision 6), which is where Phase
3's bridges already put it (`evidenceFor()`, `bridge-shared.ts`). A later ticket (P4-05) turns this
array into `(:Object)-[:DERIVED_FROM {derivedBy, derivedAt, sourceType}]->(:Source)` edges, one per entry,
against OKF's own `sources[]` registry (P2-07) — not implemented here; this module only guarantees the
data survives losslessly to that point.

### 6. Confidence and evidence

No new confidence score is calculated anywhere in this module — it only relocates existing values.
`metadata.confidence` (singular: `level`, optional `score`/`rationale`) and `confidenceDetail`
(`basis: 'observed'|'derived'`, optional `calculation`) flatten safely onto scalar node/relationship
properties (`confidenceLevel`, `confidenceScore`, `confidenceRationale`, `confidenceBasis`,
`confidenceCalculationMethod`, `confidenceCalculatedAt`, `confidenceCalculationInputsJson` — the last
JSON-stringified since `calculation.inputs` is an arbitrary nested map Neo4j properties cannot hold
directly). `evidence[]` is preserved as its own structured, unflattened array (same reasoning as
provenance — it is an array, and each entry already carries its own stable `id`); P4-05 is expected to
explode it into `(:Evidence)` nodes, not this ticket.

### 7. UI adapter boundary

```
Canonical OKF (@phoenix-ai/knowledge-graph)
  -> Graph Mapping            (this module -- P4-01, done)
  -> Neo4j representation     (P4-02/03/04 -- not yet implemented)
  -> Graph API contract       (P4-07 -- not yet implemented)
  -> UI GraphNode / GraphEdge (apps/web/src/data/types.ts -- unmodified)
```

Re-verified directly against `apps/web/src/data/types.ts`/`GraphExplorerPage.tsx` (not assumed from a
prior conversation): `GraphNode.kind: string` and `GraphExplorerPage.tsx`'s own `KIND_ORDER` constant use
exactly these ten Title-Case values today — `System`, `Container`, `Domain`, `Aggregate`, `Persona`,
`Journey`, `Flow`, `Epic`, `Feature`, `Story` — none of which match this module's `OBJECT_KIND_TO_LABEL`
output (`System`, `Container`, `Component`, `Domain`, `Entity`, `Aggregate`, `EntityState`, `Persona`,
`Journey`, `Flow`, `Action`, `Api`, `Interface`, `Integration`, `DataFlow`) letter-for-letter, though
several coincide by spelling (`System`, `Container`, `Domain`, `Aggregate`, `Persona`, `Journey`, `Flow`).
`Epic`/`Feature`/`Story` have no OKF equivalent at all (Phase 2 never modeled a backlog ontology);
`Component`/`Entity`/`EntityState`/`Action`/`Api`/`Interface`/`Integration`/`DataFlow` have no UI
equivalent yet. `GraphEdge { id, source, target, label? }` has no typed `kind` field at all — the future
graph API (P4-07) will need to either add a typed field to `GraphEdge` or fold this module's `type`/
`properties.kind` into the free-text `label`, or the OKF relationship's kind/category information is lost
on the way to the UI. **Yes, an adapter is required** — it belongs in the future graph API response layer
(P4-07), translating this module's `label`/`type` output into the UI's existing vocabulary (or extending
that vocabulary, a P4-08 decision). Not implemented here, per explicit instruction; `apps/web` was not
touched.

### 8. Current Phase 3 producer coverage (restated with the corrected 15-kind count)

|                                               | Object kinds                           | Relationship kinds                    |
| --------------------------------------------- | -------------------------------------- | ------------------------------------- |
| Total in OKF schema                           | 15                                     | 17 schema-supported + 2 additive = 19 |
| Currently produced by real Phase 3 extraction | 2 (`integration.api`, `domain.entity`) | 2 (`dependsOn`, `hasAssociation`)     |

Unchanged from ADR 0023 — expanding producer coverage remains explicitly out of this ticket's scope.

## Consequences

- `packages/graph-persistence` now has two independent concerns: the Neo4j connection boundary
  (prerequisite fix, ADR 0023) and the OKF→graph mapping (this ticket). Neither depends on the other;
  `graph-mapping.ts` does not import `neo4j-client.ts` or `neo4j-driver` at all.
- `@phoenix-ai/knowledge-graph` is now a direct dependency of `@phoenix-ai/graph-persistence`
  (`package.json`) — the first real cross-package consumer of the canonical model outside
  `extraction-engine`.
- Every future P4-0X ticket that needs to know "what Neo4j label does this OKF kind become" or "what
  relationship type does this OKF relationship kind become" should import `OBJECT_KIND_TO_LABEL`/
  `RELATIONSHIP_KIND_TO_TYPE` from this module rather than re-deriving the mapping.
- `apps/api`, `apps/web`, and Phase 3's `extraction-engine` source were **not modified** by this ticket.

## Alternatives considered

- **Hand-writing a typed property extractor per OKF kind** (15 functions, one per `*Attributes`
  interface) — rejected. Would require re-typing what `architecture.ts`/`domain.ts`/`journey.ts`/
  `integration.ts` already type, which is precisely the "second domain model" this ticket forbids
  creating. The generic `flattenAttributesInto` achieves the same Neo4j-safety losslessly without it.
- **Flattening `provenance[]`/`evidence[]` onto scalar properties now, deferring the `(:Source)`/
  `(:Evidence)` node design to later** — rejected. Both are arrays by schema design (an object can have
  more than one provenance entry); flattening either would silently drop data the moment a real object
  has two, which several already do in the P2-11 sample.
- **Reading `packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml` directly in this
  ticket's tests via a cross-package relative path** — rejected in favor of hand-constructing one real,
  validated, typed instance of every kind in the test file itself: equally grounded in the actual Phase
  2 types (every fixture object is checked against `validateCanonicalKnowledgeObject` before any mapping
  assertion runs), without a fragile `../../knowledge-graph/samples/...` filesystem dependency between
  packages.
