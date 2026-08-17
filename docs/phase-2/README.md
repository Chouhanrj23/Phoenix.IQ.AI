# Phoenix Phase 2 — Canonical Knowledge Model

Living status record for Phase 2 ("Canonical Knowledge Model"), the architectural checkpoint
before the first real repository connector. Mirrors the convention established in
[`docs/phase-1/README.md`](../phase-1/README.md).

Design rationale for P2-01 is recorded separately in
[`docs/architecture/adr/0003-canonical-knowledge-model.md`](../architecture/adr/0003-canonical-knowledge-model.md);
this document is the narrative status record, not a duplicate of that ADR.

## P2-01 — Canonical Knowledge Model

**Status: Complete.**

Implemented in `packages/knowledge-graph/src/` (previously an untouched placeholder scaffold —
see ADR 0003 for why that package, not a new one). Six files, one per model layer:

- `identity.ts` — `KnowledgeObjectIdentity`, `KnowledgeValue`, `CANONICAL_SCHEMA_VERSION` (Metadata layer)
- `evidence.ts` — `Evidence` (Evidence layer)
- `relationships.ts` — `CanonicalKnowledgeRelationship` (Relationships layer)
- `canonical-object.ts` — `CanonicalKnowledgeObject` (Core knowledge envelope; Source/Provenance
  and Confidence layers via the reused `GraphElementMetadata`)
- `bundle.ts` — `CanonicalKnowledgeBundle` (top-level objects+relationships container)
- `validation.ts` — plain structural validators, no new dependency

`Provenance`/`Confidence`/`GraphElementMetadata` are reused from `@phoenix-ai/shared` as-is, not
redefined — see ADR 0003 decision 2.

**What P2-01 deliberately does NOT include** (all explicitly deferred):

- A closed ontology vocabulary — `kind` on both objects and relationships is an open string.
  P2-02's job.
- Typed per-domain attribute extensions (a container's `technology`, a persona's `goals`, etc.) —
  these live in the free-form `attributes` bag for now. P2-03 onward's job.
- Any persistence/storage layer, database, or Neo4j.
- Any real extraction source (Git, Jira, or otherwise) — P2-01 is a type-level/schema-level
  exercise only; nothing produces a real `CanonicalKnowledgeBundle` from real analysis yet.
- Wiring `apps/api` or `apps/web` to actually use this model — `apps/api` has declared a
  dependency on `@phoenix-ai/knowledge-graph` since Phase 1's original scaffold but still doesn't
  import from it; that remains true after P2-01 too. Phase 1's six API areas keep using their own
  independent contracts in `packages/shared/src/contracts.ts`, untouched.

## P2-02 — Domain-Neutral Ontology

**Status: Complete.**

Extends P2-01 (no competing model) in the same `packages/knowledge-graph/src/`. Design
rationale: [`docs/architecture/adr/0004-domain-neutral-ontology.md`](../architecture/adr/0004-domain-neutral-ontology.md).

- **`ontology.ts`** (new) — `StructuralCategory` (`entity | process | observation | other`) and
  `RelationshipCategory` (`composition | association | interaction | realization | other`): the
  small, closed, UNIVERSAL classification every future domain-specific `kind` falls under,
  regardless of business domain. Plus `LifecycleState` (optional status/since/previousStatus).
- **`canonical-object.ts`** (modified) — added required `category: StructuralCategory` and
  optional `lifecycle?: LifecycleState`.
- **`relationships.ts`** (modified) — added required `category: RelationshipCategory`, plus a
  documented directionality convention ("source `kind` target") so hierarchy is walkable purely
  via `composition`-categorized relationships.
- **`validation.ts`** (modified) — validates `category` against the closed set and `lifecycle`'s
  shape when present.
- **`identity.ts`** (modified) — `CANONICAL_SCHEMA_VERSION` bumped to `2026-08-p2-02`.

**What P2-02 deliberately does NOT include** (all explicitly deferred to P2-03 through P2-06):

- The closed vocabulary of domain-specific `kind` values themselves (`Container`, `Aggregate`,
  `Persona`, `Integration`, and so on, per `docs/ontology/README.md`'s FRD list) — `kind` stays
  an open string; only the coarser `category` above is closed.
- Detailed architecture, domain/entity, persona/journey, and integration ontologies.
- Typed per-domain attribute extensions.
- Any persistence layer or real extraction source — still none, same as P2-01.

## P2-03 — Architecture Model

**Status: Complete.**

Extends P2-01/P2-02 (no competing model) with the first domain-specific `kind` vocabulary.
Design rationale, full UI mapping, and limitations:
[`docs/architecture/adr/0005-architecture-model.md`](../architecture/adr/0005-architecture-model.md).

- **`architecture.ts`** (new) — `SystemObject`/`ContainerObject`/`ComponentObject` (typed
  `CanonicalKnowledgeObject<TAttributes>` narrowings for `category: 'entity'`), each with a
  literal `kind` (`architecture.system`/`architecture.container`/`architecture.component`);
  `SystemAttributes`/`ContainerAttributes`/`ComponentAttributes` (`responsibility` required on
  Container/Component, `technology`/`runtime`/`description` optional); `ArchitectureRelationship`
  (`contains` = composition, `communicatesWith` = interaction — technology-agnostic, no protocol
  or vendor names); `validateSystemObject`/`validateContainerObject`/`validateComponentObject`/
  `validateArchitectureObject`/`validateArchitectureRelationship`.
- **`canonical-object.ts`** (modified) — `CanonicalKnowledgeObject` made generic over
  `TAttributes` (default-preserving, so every P2-01/P2-02 usage keeps working unchanged) so
  domain areas can give `attributes` a real, compile-time-checked shape.
- **`relationships.ts`** (modified) — added optional `attributes?: Record<string, KnowledgeValue>`,
  mirroring what objects already had, so a closed `kind` vocabulary doesn't lose Phase 1's
  free-text edge labels (e.g. `"authorizes payment"`).
- **`validation.ts`** (modified) — exported its internal helpers
  (`isNonEmptyString`/`isIsoTimestamp`/`isPlainObject`) for reuse by domain-specific validators,
  and validates the new optional relationship `attributes`.
- No `CANONICAL_SCHEMA_VERSION` bump — both changes are additive/backward-compatible.

Proven against real Phase 1 data: `packages/knowledge-graph/tests/architecture.test.ts` adapts
the actual Aurora `ctx-aurora` system node, `ctr-checkout` container node, and a real
container-level edge into this model and validates them.

**What P2-03 deliberately does NOT include:**

- Domain/entity, persona/journey, and integration ontologies (P2-04 through P2-06).
- Architecture discovery, repository scanning, Java parsing, or Neo4j — model only.
- A canonical `kind` for external actors (Customer, Meridian Pay, etc.) — see ADR 0005 Limitations.
- Wiring `apps/api`/`apps/web` to this model — still none, same as P2-01/P2-02.

## P2-04 — Domain/Entity Model

**Status: Complete.**

Extends P2-01/P2-02/P2-03 (no competing model), following the exact pattern `architecture.ts`
established. Design rationale, full UI mapping, and limitations:
[`docs/architecture/adr/0006-domain-entity-model.md`](../architecture/adr/0006-domain-entity-model.md).

- **`domain.ts`** (new) — `DomainObject`/`EntityObject`/`AggregateObject`/`EntityStateObject`
  (typed `CanonicalKnowledgeObject<TAttributes>` narrowings), each with a literal `kind`
  (`domain.domain`/`domain.entity`/`domain.aggregate`/`domain.entity-state`);
  `AttributeDefinition` (`name`, `type?`, `required?` — a lightweight embedded struct, not a
  `CanonicalKnowledgeObject`, per the requirements listing fewer fields for it than every other
  concept); `DomainRelationship` (`contains`/`aggregateRoot`/`aggregateMember` = composition,
  `hasState`/`relatesTo` = association, `transitionsTo` = interaction);
  `validateDomainObject`/`validateEntityObject`/`validateAggregateObject`/
  `validateEntityStateObject`/`validateDomainModelObject`/`validateDomainRelationship`.
- No changes to `canonical-object.ts`/`relationships.ts` — P2-03's generic `TAttributes` and
  optional relationship `attributes` already cover what P2-04 needed.
- No `CANONICAL_SCHEMA_VERSION` bump — purely additive.

Proven against real Phase 1 data: `packages/knowledge-graph/tests/domain.test.ts` adapts the
actual Aurora `dom-ordering` domain and `agg-order` aggregate into this model and validates them.
Also **documents an honest gap**: Phase 1's `Aggregate.entities` is `string[]` (plain names, no
identity) — there is no real Phase 1 data to map into `EntityObject`, so that mapping is
demonstrated with a clearly-labeled hand-built example instead of a real one.

**What P2-04 deliberately does NOT include:**

- Persona/journey and integration ontologies (P2-05 through P2-06).
- Domain inference, schema discovery, or any real extraction source — model only.
- Business semantics for entity-to-entity relationships beyond the generic `relatesTo` — per
  "do not invent business semantics".
- Wiring `apps/api`/`apps/web` to this model — still none, same as P2-01 through P2-03.

## P2-05 — Persona/Journey/State Model

**Status: Complete.**

Extends P2-01 through P2-04 (no competing model), following the same pattern. Design rationale,
full UI mapping, and limitations:
[`docs/architecture/adr/0007-persona-journey-state-model.md`](../architecture/adr/0007-persona-journey-state-model.md).

- **`journey.ts`** (new) — `PersonaObject` (`category: 'entity'`; requires at least one of
  `attributes.description`/`attributes.role`, enforced at runtime); `JourneyObject`/`FlowObject`
  (`category: 'process'`); `ActionObject` (`category: 'entity'`); `JourneyRelationship`
  (`contains` = composition, with `attributes.order` for step sequencing; `hasPersona`/
  `readsEntity`/`writesEntity`/`triggersTransition` = association/interaction; `supports` =
  realization, Flow → Journey per the FRD's documented direction);
  `validatePersonaObject`/`validateJourneyObject`/`validateFlowObject`/`validateActionObject`/
  `validateJourneyModelObject`/`validateJourneyRelationship`.
- **Extends, does not redefine, P2-04's `EntityStateObject`** (`domain.ts` untouched) — the new
  `triggersTransition` relationship kind connects an `Action` to an existing `EntityStateObject`,
  satisfying "triggering action/event where supported".
- **Actions are first-class objects** linked via ordered `contains` relationships, not embedded
  in an array — this refines P2-02's original speculative note about `process`-category objects,
  justified by real Phase 1 `FlowStep`s each carrying independent provenance/confidence (proven
  preserved, not lost, in the test suite).
- No changes to `canonical-object.ts`/`relationships.ts` or `CANONICAL_SCHEMA_VERSION` — purely
  additive, same as P2-04.

Proven against real Phase 1 data (unlike P2-04's Entity gap, Phase 1 has rich real data here):
`packages/knowledge-graph/tests/journey.test.ts` adapts the actual Aurora
`persona-returning-shopper`, `journey-browse-to-purchase`, and `flow-checkout` (with its real
`step-1`/`step-2`, each keeping its own real per-step metadata) into this model and validates
them. Also documents a real gap: no Phase 1 page renders anything resembling Entity State or a
triggering action at all — purely forward-looking.

**What P2-05 deliberately does NOT include:**

- The integration ontology (P2-06).
- Journey extraction, AI inference, or any real extraction source — model only.
- Business behavior/semantics beyond what the requirements explicitly asked for.
- Wiring `apps/api`/`apps/web` to this model — still none, same as P2-01 through P2-04.

## P2-06 — Integration/API Model

**Status: Complete.**

Extends P2-01/P2-02 (no competing model), the fourth and last domain area planned for Phase 2.
Design rationale, full UI mapping, and limitations:
[`docs/architecture/adr/0008-integration-api-model.md`](../architecture/adr/0008-integration-api-model.md).

- **`integration.ts`** (new) — `ApiObject`/`InterfaceObject`/`IntegrationObject`/`DataFlowObject`
  (typed `CanonicalKnowledgeObject<TAttributes>` narrowings for `category: 'entity'`), each with a
  literal `kind` (`integration.api`/`integration.interface`/`integration.integration`/
  `integration.dataflow`); `ApiAttributes` (`description?`, `operations?: OperationDefinition[]`);
  `InterfaceAttributes` (`description?`, `protocol?`); `IntegrationAttributes`
  (`interactionType` required — reuses Phase 1's exact `IntegrationDirection` union, `protocol?`,
  `counterpartDescription?`); `DataFlowAttributes` (`data?`, `direction?`);
  `OperationDefinition` (`name`, `description?` — a lightweight embedded struct, same pattern as
  P2-04's `AttributeDefinition`); `IntegrationRelationship` (`hasIntegration` = association,
  `carries` = composition, `exposes`/`consumes` = interaction, `realizes` = realization);
  `validateApiObject`/`validateInterfaceObject`/`validateIntegrationObject`/
  `validateDataFlowObject`/`validateIntegrationModelObject`/`validateIntegrationRelationship`.
- No changes to `canonical-object.ts`/`relationships.ts` — P2-03's generic `TAttributes` and
  optional relationship `attributes` already cover what P2-06 needed, the third domain area in a
  row to require zero base-model changes.
- No `CANONICAL_SCHEMA_VERSION` bump — purely additive.

Proven against real Phase 1 data: `packages/knowledge-graph/tests/integration.test.ts` adapts the
actual Aurora `int-meridian-pay` ("Meridian Pay") and bidirectional `int-warehouse-3pl`
("Warehouse & 3PL System") integrations into this model and validates them, including a
cross-domain composability test connecting a real P2-03 `ContainerObject` to an Integration whose
API realizes an Interface. Also **documents a real, pre-existing gap**: Phase 1 has no API or
Interface concept at all (no route, no contract, no UI) — there is no real data to map for those
two object kinds, so their compatibility is demonstrated as an honestly-labeled absence, not
invented data.

**What P2-06 deliberately does NOT include:**

- Real API discovery, repository scanning, or Jira/Git connectors — model only.
- A canonical "external system" object kind for an integration's counterpart — the same open gap
  ADR 0005 already flagged, not closed here; see ADR 0008 decision 4.
- Wiring `apps/api`/`apps/web` to this model — still none, same as P2-01 through P2-05.

## P2-07 — Provenance Model

**Status: Complete.**

A cross-cutting model, not a new domain area — how any canonical knowledge item identifies where
it came from. Design rationale and alternatives considered:
[`docs/architecture/adr/0009-provenance-model.md`](../architecture/adr/0009-provenance-model.md).

- **`provenance.ts`** (new) — `Source` (`id`, `type: SourceType` — reused directly from
  `@phoenix-ai/shared`, `label`, `locator?`, `version?`): a structured, resolvable description of
  an origin artifact, NOT a `CanonicalKnowledgeObject` (no "Source" node in the FRD's own node-type
  list — same non-object precedent P2-01's `Evidence` already set); `validateSource`/
  `validateSources`; `validateSourceReferences` — cross-checks a bundle's optional `sources`
  registry against every `metadata.provenance[].sourceId`/`evidence[].sourceId` referenced by its
  objects/relationships, the "relationship between knowledge and its source" requirement made
  concretely traceable rather than an unverified floating string.
- **`bundle.ts`** (modified) — `CanonicalKnowledgeBundle` gains an optional `sources?: Source[]`
  registry. Additive: a bundle assembled without one remains valid.
- **`validation.ts`** (modified) — `validateCanonicalKnowledgeObject`/
  `validateCanonicalKnowledgeRelationship` now validate each `Provenance` entry's shape
  (`sourceId`/`sourceType`/`derivedBy` non-empty, `derivedAt` a valid ISO-8601 timestamp), not just
  that the array is non-empty — closing a real "provenance as an unstructured, unchecked blob" gap.
  Added to the base file (not a domain-specific one) since `Provenance` is foundational, like
  `identity`/`evidence`/`ontology`.
- **`Provenance`/`Confidence`/`GraphElementMetadata` in `@phoenix-ai/shared` are completely
  untouched** — no Phase 1 contract change, per the requirement.

Proven with `packages/knowledge-graph/tests/provenance.test.ts` (29 tests): source creation
(including every future-source example from the objective — repository, documentation,
project/issue system, configuration, inference engine — mapped onto the existing `SourceType`
vocabulary with no new enum needed), source-reference resolution, timestamp validation, optional
version/revision, and invalid-provenance rejection. All 126 previously-passing tests across the
other 9 files still pass unmodified — the stricter validation introduced no regressions, since
every existing fixture already used well-formed `Provenance` entries.

**What P2-07 deliberately does NOT include:**

- Real source connectors (repository, documentation, project/issue system, configuration, or
  inference-engine integrations) — model only.
- A structured version/revision scheme (e.g. distinguishing a git SHA from a doc revision) —
  `Source.version` is a single free-text optional field; see ADR 0009 alternatives considered.
- Making `sources` mandatory on a bundle — opt-in, since no real extraction source populates one
  yet.

## P2-08 — Confidence Model

**Status: Complete.**

A cross-cutting model, not a new domain area — how strongly Phoenix trusts a piece of knowledge,
kept structurally independent from P2-07's provenance model. Design rationale, the documented
score-range interpretation, and alternatives considered:
[`docs/architecture/adr/0010-confidence-model.md`](../architecture/adr/0010-confidence-model.md).

- **`confidence.ts`** (new) — `ConfidenceBasis` (`'observed' | 'derived'`, closed two-value type):
  the FACT/DIRECTLY-OBSERVED vs DERIVED/INFERRED distinction, orthogonal to confidence _strength_
  (`metadata.confidence.level`/`score`, `@phoenix-ai/shared`, untouched) — Phase 1's own
  `level: 'inferred'` conflated both into one scale, and real fixture data confirms it (every
  `'inferred'` entry also happens to carry a low score); `ConfidenceCalculation` (`method`,
  `calculatedAt`, `inputs?`) — optional, free-text metadata about how a score was produced, NOT a
  calculation engine; `ConfidenceDetail` (`basis` + optional `calculation`) — `basis` is required
  whenever `ConfidenceDetail` is present at all, so a claim can never carry a confidence strength
  without declaring which kind of claim it is.
- **`canonical-object.ts`/`relationships.ts`** (modified) — both gain a new optional
  `confidenceDetail?: ConfidenceDetail` sibling field (alongside `metadata`, mirroring P2-01's
  `evidence: Evidence[]` pattern), not folded into or competing with `metadata.confidence`.
- **`validation.ts`** (modified) — validates `confidenceDetail` inline in the base object/
  relationship validators, the same pattern already used for `lifecycle?: LifecycleState` (P2-02).
- **`Confidence`/`ConfidenceLevel`/`GraphElementMetadata` in `@phoenix-ai/shared` are completely
  untouched** — no Phase 1 contract change, per the requirement.

Proven with `packages/knowledge-graph/tests/confidence.test.ts` (21 tests): valid/invalid
combinations, independence from provenance, and — grounded in real Aurora/Fintech fixture score
ranges — both a high-confidence inference and a low-confidence direct observation, the two
combinations Phase 1's single-axis `level` enum could never cleanly express. All 155
previously-passing tests across the other 11 files still pass unmodified.

**What P2-08 deliberately does NOT include:**

- Any confidence calculation engine or AI inference — `ConfidenceCalculation` is a structured
  place to record what a future engine did, not that engine.
- A closed vocabulary for `ConfidenceCalculation.method`, or a hard validation rule tying `score`
  ranges to `level` values — see ADR 0010 alternatives considered.
- Any reference from `ConfidenceDetail` back to a specific `Provenance`/`Source` entry — deliberate,
  per "confidence must remain independent from provenance."

## P2-09 — Evidence/Reference Model

**Status: Complete.**

A cross-cutting model, not a new domain area — rounds out P2-01's `Evidence` into the full
evidence/reference model, kept distinguishable from provenance ("where did this knowledge
originate?") and connected to (but not duplicating) confidence. Design rationale and alternatives
considered:
[`docs/architecture/adr/0011-evidence-reference-model.md`](../architecture/adr/0011-evidence-reference-model.md).

- **`evidence.ts`** (modified) — `Evidence` gains two new optional fields: `capturedAt`
  (ISO-8601, when this specific excerpt was captured — distinct from `Provenance.derivedAt`) and
  `sourceVersion` (free-text, which revision of the source this excerpt came from — distinct from
  P2-07's `Source.version`, the registry's current known version, since older evidence can stay
  validly pinned to an earlier one). `id`/`sourceId`/`excerpt`/`locator` (P2-01) unchanged.
- **`relationships.ts`** (modified) — `CanonicalKnowledgeRelationship` gains a new optional
  `evidence?: Evidence[]` field, mirroring the object's field — a relationship is itself a claim
  and can have its own supporting material (same reasoning P2-08 already applied to
  `confidenceDetail`).
- **`validation.ts`** (modified) — new `validateEvidenceEntries` validates each entry's shape
  (`id`/`sourceId` required, other fields checked if present), wired into both base validators —
  closing the same "array-only, no per-entry check" gap P2-07 already fixed for
  `metadata.provenance[]`.
- **No new source-type vocabulary needed** — future source-artifact kinds (source file,
  documentation, API definition, configuration, issue/project record) all resolve through
  `Evidence.sourceId` to a `Source.type` (P2-07), already fully mapped in ADR 0009.
- **"Relationship to the canonical knowledge item" is containment, not a foreign key** —
  `Evidence` lives inside the `evidence[]` array of the object/relationship it supports; no
  `supportsObjectId` back-pointer, which would only duplicate what the array already expresses.

Proven with `packages/knowledge-graph/tests/evidence.test.ts` (22 tests): evidence references,
source locations, multiple evidence items, missing/invalid references, evidence distinguished
from provenance (shared provenance, different excerpts; independently-pinned `sourceVersion`),
every future source-artifact kind from the objective, and evidence connected to confidence via
`ConfidenceCalculation.inputs` without new schema. All 176 previously-passing tests across the
other 12 files still pass unmodified.

**What P2-09 deliberately does NOT include:**

- Real source-artifact integrations (repository, documentation, API-spec, configuration, or
  issue/project-system connectors) — reference shape only.
- `sourceType`/`label` fields directly on `Evidence` — resolved via `Source` (P2-07) instead, to
  avoid duplication.
- A structural, mandatory link from confidence to specific evidence ids — see ADR 0011 decision 6
  and alternatives considered.

## P2-10 — OKF (Open Knowledge Format) YAML Schema

**Status: Complete.**

Not a new model — the finalized, deterministic, versionable YAML serialization of everything
P2-01 through P2-09 already defined. The contract Phase 3 connectors will eventually target.
Design rationale, the full Step 1–6 decision record, and alternatives considered:
[`docs/architecture/adr/0012-okf-yaml-schema.md`](../architecture/adr/0012-okf-yaml-schema.md).
Authoritative field-level contract, full worked YAML example, and conventions:
[`docs/okf/README.md`](../okf/README.md).

- **`bundle.ts`** (modified) — `CanonicalKnowledgeBundle` gains one new optional field,
  `okfVersion?: string`.
- **`okf.ts`** (new) — `OkfDocument` (`CanonicalKnowledgeBundle` with `okfVersion` required, not a
  competing type); `toOkfDocument` (stamps `okfVersion`, defaulting to
  `CANONICAL_SCHEMA_VERSION` — one version axis, not two); `serializeOkfYaml`/`parseOkfYaml`
  (deterministic key order via a hand-authored `FIELD_ORDER` priority list, applied through the
  `yaml` package's `sortMapEntries`); `validateOkfDocument` (thin — delegates entirely to
  `validateCanonicalKnowledgeBundle` and `validateSourceReferences`, no new validation logic);
  `parseAndValidateOkfYaml` (one non-throwing entry point for malformed YAML syntax and
  structurally invalid documents alike).
- **`package.json`** (modified) — adds `yaml` as a direct dependency; it was already present in
  the monorepo's resolved dependency graph before this ticket (transitively, via existing
  tooling), confirmed via the lockfile — "using the project's existing technology," per the
  objective.
- **`docs/okf/README.md`** (new) — the authoritative OKF contract: full worked YAML example,
  naming conventions, required/optional field tables, ID/relationship/timestamp/enumeration/
  reference/versioning/extensibility rules, and a Phase 1 compatibility summary linking each
  already-documented ADR mapping (0005–0008) rather than re-deriving them.

Proven with `packages/knowledge-graph/tests/okf.test.ts` (20 tests): a single reconciled bundle
spanning every prior domain area (Architecture, Domain/Entity, Persona, Integration/API) plus
Source/confidenceDetail/evidence validating as one coherent document; lossless round-trip
(`parse(serialize(document))` deep-equals the original); determinism (identical output on repeat
serialization, and regardless of the source object's own key insertion order); readable field
ordering; and rejection of every required Step 4 category — missing required fields, invalid ids,
invalid types, dangling relationship references, invalid provenance timestamps, invalid
confidence, invalid/missing evidence references, unresolved source references, and malformed YAML
syntax. All 198 previously-passing tests across the other 13 files still pass unmodified.

**What P2-10 deliberately does NOT include:**

- Git/repository connectors, Java parsing, repository ingestion, Neo4j node creation, a Jira
  connector, or an inference engine — explicitly excluded by the objective.
- File-system read/write helpers — `okf.ts` operates on in-memory strings/objects only.
- A second, independently-incrementing format-version counter distinct from
  `CANONICAL_SCHEMA_VERSION` — see ADR 0012 decision 2 and "Open questions."
- Any change to `packages/shared/src/contracts.ts` or any Phase 1 route/UI file.

## P2-11 — Sample Phoenix OKF

**Status: Complete.**

A representative sample OKF document (not production repository extraction) proving the P2-10
schema can express a meaningful cross-section of Phoenix knowledge — every concept the objective
listed, in one coherent, valid document. What the sample represents, what it intentionally does
not, and how future connectors should follow it: [`docs/okf/sample.md`](../okf/sample.md).

- **`samples/aurora-commerce.sample.okf.yaml`** (new) — 18 objects across every domain area
  (Architecture, Domain/Entity, Persona/Journey/State, Integration/API) plus a Flow (the
  structural link Action/Journey require), 22 relationships, 8 registered `Source`s. Grounded in
  the real Aurora Commerce fixtures already used by `architecture.test.ts`/`domain.test.ts`/
  `journey.test.ts`/`integration.test.ts` wherever Phase 1 has real data (System, both
  Containers, Domain, Persona, Journey, Flow, both Actions, Integration, DataFlow); clearly
  labeled `"(illustrative)"` where it doesn't (Component, Entity, EntityState ids, API,
  Interface — matching ADR 0006/0008's own already-documented gaps). Includes a genuinely real
  low-confidence, multi-source, disputed-technology example (`ctr-payments`), not a staged one.
- **`samples/generate-sample.ts`** (new) — the generator, and the worked template for "how future
  connectors should produce equivalent structures": build typed objects → `toOkfDocument` →
  `validateOkfDocument` (hard stop on any error) → `serializeOkfYaml`. A dev utility only — not
  exported from `src/index.ts`, not part of `tsc -b`'s build; run via
  `pnpm --filter @phoenix-ai/knowledge-graph generate:sample`. This is the one place file-system
  I/O exists in this package, and it's confined to this opt-in script — `okf.ts`'s own runtime API
  (P2-10) still operates on in-memory strings/objects only, unchanged.
- **`package.json`** (modified) — adds `tsx` as a devDependency (already present in the monorepo's
  resolved dependency graph beforehand, via `apps/api`'s identical `dev` script pattern) and a
  `generate:sample` script.
- Every `Provenance.derivedBy` in the sample is `'phoenix-sample-author'`, never
  `'extraction-engine'`/`'inference-engine'` — honest about how the file was actually produced
  (hand-authored, not run through any real pipeline), regardless of how well-grounded the
  underlying facts are. This is the concrete mechanism satisfying "clearly identify sample/demo
  values."

Proven with `packages/knowledge-graph/tests/okf-sample.test.ts` (26 tests): the checked-in sample
validates cleanly against the real `parseAndValidateOkfYaml`/`validateOkfDocument` (not a
re-implementation); every concept from the objective's list is present; provenance/evidence/source
references all resolve; both `high`/`low` confidence levels and both `observed`/`derived`
confidence bases are represented; illustrative content is clearly labeled; and no provenance entry
falsely claims real extraction. No schema weakening was needed — the sample validated cleanly on
first generation after one `FIELD_ORDER` ordering fix in `okf.ts` itself (`id` was sorting after
`systemId` in `identity`, contradicting the documented convention — corrected, not worked around).
All 218 previously-passing tests across the other 14 files still pass unmodified.

**What P2-11 deliberately does NOT include:**

- Real repository/documentation/ticket extraction — explicitly excluded by the objective; every
  fact was hand-authored, informed by already-established Phase 1 fixtures.
- A complete Aurora Commerce model — a small, connected, representative slice, not full coverage
  of every real container/domain/persona/integration.
- Any Phase 3 connector implementation — `generate-sample.ts` is a template to follow, not a
  connector itself.

## P2-12 — Validate OKF Against Existing Phoenix UI

**Status: Complete.**

A compatibility/coverage exercise, not a UI redesign and not a model extension — proves whether
the canonical model and OKF schema can represent what the six Phase 1 UI areas actually require
(read directly from `apps/web/src/pages/*.tsx`). Full coverage table, model gaps, OKF gaps,
recommended changes (not implemented), and Phase 3 dependencies:
[`docs/okf/ui-validation.md`](../okf/ui-validation.md).

- **Areas 1–4 (System Summary, Architecture, Domain Model, Integrations)**: complete or
  representable for every field the UI actually renders, with six specific, itemized exceptions
  (`tags`, `lastAnalyzedAt`, `Component.technology`, no direct Domain→Aggregate relationship kind,
  and two dashboard-aggregate fields correctly identified as _not_ canonical-model data at all —
  `coverageScore`/`totalElements`/`pendingReviewCount`/`driftAlertCount` are computed rollups over
  a bundle, not facts stored in one).
- **Areas 5–6 (Deployment/NFR, Review/Gaps/Drift)**: confirmed, not newly discovered, to have zero
  canonical model representation — `docs/ontology/README.md` already listed `Node`/`DeploymentUnit`/
  `Environment` as "not yet formalized" since P2-05; this ticket made that concrete with passing
  negative-assertion tests against the real closed `kind` vocabularies, and additionally found that
  NFR isn't even in the FRD §4.1 node-type list, and that P2-02's `StructuralCategory.observation`
  was already reserved for Review/Gap/Drift but never given a `kind` vocabulary.
- **No UI changes** — per the objective, every finding either confirms full coverage or names a
  model/OKF gap; nothing was worked around by changing what the UI displays.
- **No model changes** — six concrete recommendations are documented (new Deployment/NFR/
  Review-Gap-Drift `kind` vocabularies, a `hasAggregate` relationship kind, `ComponentAttributes.technology`,
  `SystemAttributes.tags`) but deliberately not implemented; this ticket validates, it doesn't extend.

Proven with `packages/knowledge-graph/tests/ui-coverage.test.ts` (20 tests): re-validates the
P2-11 sample against `validateOkfDocument`, then one block per UI area asserting the coverage
table's claims field-by-field — including every gap, via explicit negative assertions against the
sample document and the real closed `kind` vocabularies, not left as unverified prose. All 244
previously-passing tests across the other 15 files still pass unmodified.

**What P2-12 deliberately does NOT include:**

- Any new canonical model `kind` vocabulary (Deployment, NFR, Review/Gap/Drift) — recommended,
  not built; that's future Phase 2/3 work.
- Any UI modification — explicitly out of scope per the objective.
- Phase 3 connector work of any kind.

## Remaining Phase 2 work

Phase 2 (P2-01 through P2-12) is complete per this prompt sequence. Any further domain-area
model work (Deployment/NFR, Review/Gaps/Drift, per P2-12's recommendations) or Phase 3 connector
work is new, separately-scoped work, not a "remaining Phase 2 ticket" in the P2-01–P2-12 sequence
this document has tracked.

## Phase 1 status

Unaffected. Phase 1 (P1-01 through P1-12) is closed — see `docs/phase-1/README.md`. Phase 2's
work (P2-01 through P2-12) added new, unused-by-anything-yet package content and documentation; it
did not modify any Phase 1 file, confirmed via `git status` after every ticket.
