# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Initial corporate-grade repository scaffold: pnpm/Turborepo monorepo, one package per FRD pipeline module (`ingestion-connectors`, `redaction-hardening`, `extraction-engine`, `inference-engine`, `knowledge-graph`, `reconciliation-engine`, `okf-renderers`, `gap-analysis`, `drift-detection`, `review-loop`, `evaluation-harness`, `orchestration`, `shared`), `apps/api` and `apps/web` stubs.
- Governance docs (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY), CI workflows, issue/PR templates, ADR template.
- Requirements documents (BRD, PRD, FRD) relocated to `docs/requirements/`.
- **Phase 1 — P1-01 (Backend/API structure):** real `@phoenix-ai/api` routes for the six Phase 1
  functional areas (System Summary, Architecture, Domain Model, Integrations, Deployment/NFR,
  Review/Gaps/Drift), organized as `routes/` → `services/` → `data/seed.ts`; a global error
  handler with a consistent `{ statusCode, error, message }` shape (`src/errors.ts`);
  environment-driven config for `PORT`/`HOST`/`CORS_ORIGIN` (`src/config.ts`); CORS support for
  `apps/web`'s dev server; and test coverage for every new route plus the error handler and
  config loader (`apps/api/tests/`). See ADR 0002.
- **Phase 1 — P1-02 (Shared API/data contracts):** `packages/shared/src/contracts.ts` — the
  response types for the six Phase 1 functional areas, shared between `@phoenix-ai/api` and
  `apps/web`. See ADR 0002.
- **Phase 2 — P2-01 (Canonical knowledge model):** `packages/knowledge-graph/src/` — the
  domain-neutral canonical knowledge model (`CanonicalKnowledgeObject`,
  `CanonicalKnowledgeRelationship`, `CanonicalKnowledgeBundle`, plus `identity`/`evidence`/
  `validation` support types), replacing that package's placeholder scaffold. Reuses
  `Provenance`/`Confidence`/`GraphElementMetadata` from `@phoenix-ai/shared` rather than
  redefining them. See ADR 0003.
- **Phase 2 — P2-02 (Domain-neutral ontology):** `packages/knowledge-graph/src/ontology.ts` —
  `StructuralCategory` and `RelationshipCategory`, the small, closed, universal classification
  every future domain-specific `kind` value falls under, plus optional `LifecycleState`. Added
  as required `category` fields on `CanonicalKnowledgeObject`/`CanonicalKnowledgeRelationship`
  (`CANONICAL_SCHEMA_VERSION` bumped to `2026-08-p2-02`). See ADR 0004.
- **Phase 2 — P2-03 (Architecture model):** `packages/knowledge-graph/src/architecture.ts` —
  `SystemObject`/`ContainerObject`/`ComponentObject` and `ArchitectureRelationship`
  (`contains`/`communicatesWith`, technology-agnostic), the first domain-specific `kind`
  vocabulary built on P2-02's categories. `CanonicalKnowledgeObject` made generic over its
  `attributes` type (default-preserving); `CanonicalKnowledgeRelationship` gained an optional
  `attributes` bag. Proven against real Phase 1 Aurora fixture data in
  `packages/knowledge-graph/tests/architecture.test.ts`. See ADR 0005.
- **Phase 2 — P2-04 (Domain/entity model):** `packages/knowledge-graph/src/domain.ts` —
  `DomainObject`/`EntityObject`/`AggregateObject`/`EntityStateObject` and `DomainRelationship`
  (`contains`/`aggregateRoot`/`aggregateMember`/`hasState`/`transitionsTo`/`relatesTo`), the
  second domain-specific `kind` vocabulary. `AttributeDefinition` (name/type/required) as a
  lightweight embedded struct on `EntityAttributes.fields`, not a separate canonical object.
  Proven against real Phase 1 Aurora domain/aggregate data in
  `packages/knowledge-graph/tests/domain.test.ts`, which also documents that Phase 1 has no
  real per-entity data to map (only aggregate-level entity name strings). See ADR 0006.
- **Phase 2 — P2-05 (Persona/journey/state model):** `packages/knowledge-graph/src/journey.ts` —
  `PersonaObject`/`JourneyObject`/`FlowObject`/`ActionObject` and `JourneyRelationship`
  (`contains` with `attributes.order` for step sequencing, `hasPersona`, `supports`,
  `readsEntity`/`writesEntity`, `triggersTransition`), the third domain-specific `kind`
  vocabulary. Actions are first-class objects linked via ordered relationships (not embedded),
  refining P2-02's original speculation once real per-step provenance data was available to
  weigh against it. Extends P2-04's `EntityStateObject` via `triggersTransition` rather than
  redefining it. Proven against real Phase 1 Aurora persona/journey/flow/step data in
  `packages/knowledge-graph/tests/journey.test.ts`, including that each mapped Action retains
  its own source step's exact metadata. See ADR 0007.
- **Phase 2 — P2-06 (Integration/API model):** `packages/knowledge-graph/src/integration.ts` —
  `ApiObject`/`InterfaceObject`/`IntegrationObject`/`DataFlowObject` and `IntegrationRelationship`
  (`hasIntegration`/`carries`/`exposes`/`consumes`/`realizes`), the fourth and last domain-specific
  `kind` vocabulary planned for Phase 2. `IntegrationAttributes.interactionType` reuses Phase 1's
  exact `IntegrationDirection` union; `OperationDefinition` embedded on `ApiAttributes.operations`
  follows the same lightweight-struct pattern P2-04 established for `AttributeDefinition`. Proven
  against real Phase 1 Aurora integration data (`int-meridian-pay`, `int-warehouse-3pl`) in
  `packages/knowledge-graph/tests/integration.test.ts`, which also documents a real, pre-existing
  gap: Phase 1 has no API or Interface concept at all. See ADR 0008.
- **Phase 2 — P2-07 (Provenance model):** `packages/knowledge-graph/src/provenance.ts` — `Source`
  (a structured, resolvable description of an origin artifact, not a graph node) plus
  `validateSource`/`validateSources`/`validateSourceReferences`; `CanonicalKnowledgeBundle` gains
  an optional `sources?: Source[]` registry (`bundle.ts`); `validateCanonicalKnowledgeObject`/
  `validateCanonicalKnowledgeRelationship` now validate each `Provenance` entry's shape, not just
  array non-emptiness (`validation.ts`). Cross-cutting, not a new domain area — reuses
  `Provenance`/`Confidence`/`GraphElementMetadata` from `@phoenix-ai/shared` completely unmodified,
  so no Phase 1 contract changes. Proven with
  `packages/knowledge-graph/tests/provenance.test.ts` (29 tests): source creation, source-reference
  resolution, timestamp validation, optional version/revision, and invalid-provenance rejection.
  See ADR 0009.
- **Phase 2 — P2-08 (Confidence model):** `packages/knowledge-graph/src/confidence.ts` —
  `ConfidenceBasis` (`'observed' | 'derived'`) makes the FACT/DIRECTLY-OBSERVED vs
  DERIVED/INFERRED distinction explicit and orthogonal to confidence strength
  (`Confidence.level`/`score`, `@phoenix-ai/shared`, untouched) — Phase 1's own `level: 'inferred'`
  had conflated both into one scale; `ConfidenceCalculation` (optional, free-text — not a
  calculation engine) records how a score was produced, where known; `ConfidenceDetail`
  (`basis` + optional `calculation`) is added as a new optional `confidenceDetail` sibling field on
  `CanonicalKnowledgeObject`/`CanonicalKnowledgeRelationship` (`canonical-object.ts`/
  `relationships.ts`), validated inline in `validation.ts` the same way `lifecycle` already is.
  Kept structurally independent from P2-07's provenance model by design. Proven with
  `packages/knowledge-graph/tests/confidence.test.ts` (21 tests), including a high-confidence
  inference and a low-confidence direct observation — combinations Phase 1's single-axis `level`
  enum could never cleanly express. See ADR 0010.
- **Phase 2 — P2-09 (Evidence/reference model):** `packages/knowledge-graph/src/evidence.ts` —
  `Evidence` gains optional `capturedAt` (when this specific excerpt was captured) and
  `sourceVersion` (which revision of the source it came from), distinct from
  `Provenance.derivedAt`/`Source.version` respectively; `CanonicalKnowledgeRelationship` gains an
  optional `evidence?: Evidence[]` field (`relationships.ts`), mirroring the object's existing
  field; `validateEvidenceEntries` (`validation.ts`) validates each entry's shape, closing the
  same "array-only, no per-entry check" gap P2-07 already fixed for `metadata.provenance[]`. No
  new source-type vocabulary — future source-artifact kinds (source file, documentation, API
  definition, configuration, issue/project record) resolve through `Evidence.sourceId` to
  P2-07's `Source.type`. Proven with `packages/knowledge-graph/tests/evidence.test.ts` (22 tests).
  See ADR 0011.
- **Phase 2 — P2-10 (OKF YAML schema):** `packages/knowledge-graph/src/okf.ts` — `OkfDocument`,
  the finalized, deterministic, versionable YAML serialization of `CanonicalKnowledgeBundle` (not
  a competing model; `okfVersion` narrows an optional field added to `bundle.ts` to required,
  defaulting to the existing `CANONICAL_SCHEMA_VERSION`); `serializeOkfYaml`/`parseOkfYaml` (a
  hand-authored `FIELD_ORDER` priority list drives deterministic, readable key ordering via the
  `yaml` package's `sortMapEntries`); `validateOkfDocument`/`parseAndValidateOkfYaml` (delegate
  entirely to the existing `validateCanonicalKnowledgeBundle`/`validateSourceReferences`
  validators — no new validation logic). Adds `yaml` as a direct dependency of
  `@phoenix-ai/knowledge-graph` (already present in the monorepo's resolved dependency graph
  beforehand). New authoritative reference: `docs/okf/README.md` (full worked YAML example,
  conventions, required/optional field tables). Proven with
  `packages/knowledge-graph/tests/okf.test.ts` (20 tests), including one bundle reconciling every
  prior domain area (Architecture, Domain/Entity, Persona, Integration/API) plus
  provenance/confidence/evidence into a single valid document, and lossless, deterministic
  round-trip serialization. See ADR 0012.
- **Phase 2 — P2-11 (Sample Phoenix OKF):** `packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml`
  — a representative, hand-authored (not extracted) sample OKF document: 18 objects across every
  domain area plus a Flow, 22 relationships, 8 registered sources, grounded in the real Aurora
  Commerce fixtures already used across Phase 2's other tests wherever Phase 1 has real data, and
  clearly labeled `"(illustrative)"` where it doesn't (matching ADR 0006/0008's already-documented
  gaps). Every `Provenance.derivedBy` is `'phoenix-sample-author'`, never `'extraction-engine'`/
  `'inference-engine'` — honest about the file's own origin. Generated by
  `samples/generate-sample.ts` (new `generate:sample` script; adds `tsx` as a devDependency,
  already present in the monorepo's resolved dependency graph via `apps/api`'s identical `dev`
  script) — a worked template for how future connectors should produce equivalent structures.
  Proven with `packages/knowledge-graph/tests/okf-sample.test.ts` (26 tests) validating the
  checked-in file against the real OKF validator on every test run. New documentation:
  `docs/okf/sample.md`.
- **Phase 2 — P2-12 (Validate OKF against existing Phoenix UI):** a compatibility/coverage
  exercise — no new model code. Confirms the canonical model/OKF schema fully represent every
  field the six Phase 1 UI areas actually render (System Summary identity, Architecture, Domain
  Model, Integrations), with six itemized, documented exceptions (`SystemSummary.tags`/
  `lastAnalyzedAt`, `ComponentAttributes.technology`, a missing Domain→Aggregate relationship
  kind, and confirmation that `coverageScore`/`totalElements`/`pendingReviewCount`/
  `driftAlertCount` are dashboard aggregates, not canonical-model data). Confirms Deployment/NFR
  and Review/Gaps/Drift have zero canonical representation — a pre-existing, now-proven condition
  (`docs/ontology/README.md` already listed deployment node types as "not yet formalized"), with
  six concrete, documented-but-not-implemented recommendations for closing it. Proven with
  `packages/knowledge-graph/tests/ui-coverage.test.ts` (20 tests) against the P2-11 sample and the
  real closed `kind` vocabularies. New documentation: `docs/okf/ui-validation.md`.

### Changed

- `apps/web/src/data/types.ts` now imports the six Phase 1 functional areas' types (and
  `GraphElementMetadata`) from `@phoenix-ai/shared` instead of redefining them locally, removing
  a pre-existing duplication of `GraphElementMetadata` between the two packages.
- `apps/web/src/data/api/apiProvider.ts`, `apps/api/README.md`, and `apps/web/README.md` updated
  to reflect which endpoints are now implemented vs. still pending for later phases.
