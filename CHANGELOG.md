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
- **Phase 3 — P3-01 (Common connector contract for source repositories):**
  `packages/ingestion-connectors/src/` — the contract every source connector implements, replacing
  that package's placeholder scaffold. `SourceConnector`/`ConnectorSession`/`ConnectorCapabilities`
  with an `open → list → read → close` lifecycle (`connector.ts`, plus `collectArtifacts`/
  `withConnectorSession`/`selectConnector`); `SourceDescriptor` and its first source-specific
  narrowing `SourceRepositoryDescriptor` (`descriptor.ts`), with `CredentialReference` (a reference,
  never a secret — inline `token`/`password`/`apiKey`-style keys are rejected at any depth) and the
  `<scheme>://<rest>` locator convention Phase 1's fixtures already used made a validated,
  deterministic rule; `ArtifactRef`/`RawArtifact` — the common intermediate representation — plus a
  non-throwing `ArtifactReadResult`/`ArtifactFailure` partial-failure model (`artifact.ts`);
  `ArtifactFilter` with ONE shared implementation of its glob semantics (`filter.ts`); and
  `createInMemoryRepositoryConnector` (`reference-connector.ts`), a reference implementation and test
  double that touches no filesystem, network, or git. Two bridges connect ingestion to the canonical
  model without a second identifier space: `descriptorToSource` (to P2-07's `Source`) and
  `artifactToEvidence` (to P2-09's `Evidence`). A connector emits raw artifacts, never
  `CanonicalKnowledgeObject`s — extraction/inference remain separate stages. Adds
  `@phoenix-ai/knowledge-graph` as a workspace dependency and `@types/node` as a devDependency (both
  already in the monorepo's resolved dependency graph). Proven with
  `packages/ingestion-connectors/tests/` (119 tests), including connector output assembled into a
  bundle that passes the real `validateContainerObject`/`validateCanonicalKnowledgeBundle`/
  `validateSourceReferences`/`validateOkfDocument` and round-trips through OKF YAML. New
  documentation: `docs/phase-3/README.md`. See ADR 0013.
- **Phase 3 — P3-02 (Git repository ingestion — metadata, revisions, source files):**
  `packages/ingestion-connectors/src/git-connector.ts` — `createGitRepositoryConnector`, the first
  REAL connector, reading a local checkout or a remote clone. The revision the descriptor asks for
  (branch, tag, SHA, or `HEAD`) is resolved to an immutable full SHA **once at `open`** via
  `git rev-parse`, and every read is addressed against it, so a branch moving mid-run cannot yield a
  bundle mixing two revisions; that SHA becomes `Source.version` and every `Evidence.sourceVersion`.
  Repository metadata (resolved/short SHA, committer date, subject, requested ref, default branch,
  tags at HEAD, remote URL, shallowness, tracked file count) is surfaced on the new
  `ConnectorSession.sourceMetadata`. Source files come from `git ls-tree -r -l -z <sha>` and
  `git cat-file blob`, i.e. the tree AT the pinned revision — uncommitted edits and untracked files
  are invisible by construction — with `contentHash` reported as git's own blob object id
  (`git-blob-sha1`, verifiable with `git cat-file` outside Phoenix) and binary content base64-encoded
  using git's own NUL-byte heuristic. Per-file history (`lastModifiedAt`,
  `attributes.lastCommitRevision`) costs one `git log --name-only` pass for the whole repository, not
  one call per file. `repository.subpaths` are pushed down to git as pathspecs. Commit **author
  identity is opt-in** (`includeAuthorMetadata`, default off) because it is personal data and this
  package sits upstream of `packages/redaction-hardening`; a non-`none` `credential.scheme` is
  rejected outright, since authenticating git is git's own job (credential helper or SSH agent) and
  Phoenix never handles the secret. New `packages/ingestion-connectors/src/git-command.ts` — the safe
  invocation layer every git call goes through: `spawn` with an explicit argv array and no shell, plus
  explicit rejection of option-shaped revisions/paths/remotes (`--upload-pack=<command>`-style
  **argument** injection, which a shell-free spawn does not prevent), `protocol.ext.allow=never`,
  `core.fsmonitor=false`, `GIT_TERMINAL_PROMPT=0`, per-command timeouts, an output ceiling, and
  `GitCommandError` carrying argv/exit code/stderr. Requires the `git` binary on `PATH` — the
  project's first environmental prerequisite beyond Node (`isGitAvailable`/`gitVersion` probe for it).
  No new package dependencies. Proven with 57 new tests (178 total in the package) against a real git
  repository built in a temp directory, including reading an older revision as it was, a shallow
  clone reported as shallow, the temporary clone removed on `close`, and real git output assembled
  into a bundle that round-trips through OKF YAML with every `Evidence.sourceVersion` equal to the
  real SHA. See ADR 0014.
- **Phase 3 — P3-03 (Java source discovery and project structure):** `packages/extraction-engine/src/`
  — replaces the package's placeholder scaffold with the first ticket of the Java extraction family
  (P3-03 through P3-08). `discoverJavaProject` (`java-project.ts`) classifies `.java` artifacts into
  Maven/Gradle modules by walking each path upward to its nearest ancestor `pom.xml`/
  `build.gradle[.kts]`, splits main/test source by the `src/main/java`/`src/test/java` convention, and
  reads POM/Gradle coordinates with a narrow, depth-tracking tag reader scoped to the root `<project>`
  element's direct children — not a general XML parsing dependency, mirroring
  `ingestion-connectors/src/filter.ts`'s own precedent. Deliberately performs no Java parsing at all;
  that begins with P3-04. New dependency: `@phoenix-ai/ingestion-connectors` (for the `RawArtifact`
  type this ticket classifies). Proven with 7 tests, including a `<parent>` POM fixture proving
  inheritance is not wrongly picked up and a nested multi-module layout resolving to its nearest
  ancestor build file. See ADR 0015.
- **Phase 3 — P3-04 (Java structural facts):** `packages/extraction-engine/src/` — the first ticket
  in the Java extraction family that actually parses Java, on a real AST parser (`java-parser`,
  pinned `3.0.1`) rather than a hand-rolled scanner. `java-parser-adapter.ts` wraps `java-parser`'s
  throw-only `parse()` into a non-throwing result; `cst-utils.ts` provides rule-agnostic CST helpers
  shared by every later CST-touching module; `extractJavaStructure` (`java-structure.ts`) captures
  package/imports and every type declaration (fields, methods, annotations, extends/implements,
  nested types) with file+line evidence, via plain recursive-descent over the declaration grammar
  rather than a CST visitor (avoiding Chevrotain's default-auto-recursion foot-gun). `extractJavaProject`
  (`extract-java.ts`) now wires discovery through parsing through structural facts. New dependency:
  `java-parser`. Proven with 16 new tests (23 total), including a dedicated nested-class recursion
  guard. See ADR 0016.
- **Phase 3 — P3-05 (Java method, call, and dependency extraction):**
  `packages/extraction-engine/src/java-calls.ts` — `extractJavaCallGraph`, finishing FR-DET-01's
  "call graph" requirement. The type-dependency graph is derived purely from P3-04's already-computed
  structural facts (no second CST pass); the call graph is a second, targeted CST walk using a real
  `BaseJavaCstVisitorWithDefaults` subclass (unlike P3-04's declaration-grammar extraction, which
  deliberately avoids the visitor API), deliberately shallow — resolved only for a bare/`this` call
  or `Type.method()` against a known project-local type, never guessing at a call through an instance
  field (no classpath/symbol resolution). `extractJavaProject` now wires this graph in after
  structural facts. No new dependencies. Proven with 3 new tests plus a grown end-to-end assertion
  (27 tests total). See ADR 0017.
- **Phase 3 — P3-06 (Java REST/API extraction):** `packages/extraction-engine/src/java-http.ts` —
  `extractJavaHttp` (FR-DET-03), a pure function over P3-04's structural facts reading Spring MVC
  controllers/routes/HTTP methods/parameter metadata, with class- and method-level paths joined by
  the independently-tested `joinPaths` normalizer. New `bridge-shared.ts` (deterministic `sha256`
  ids, evidence construction -- shared plumbing for every bridge in this family) and
  `bridge-http.ts`'s `bridgeSpringController`, this family's first canonical-object bridge: a
  controller maps directly to a real, validated `ApiObject` (`integration.api`) with
  `confidenceDetail: { basis: 'observed' }`. `extractJavaProject` gains its `options`
  (`systemId`/`sourceId`/`generatedAt`) parameter here, the first stage that needs one. New
  dependency: `@phoenix-ai/knowledge-graph`. Proven with 12 new tests (39 total). See ADR 0018.

### Changed

- **P3-01 contract amended additively by P3-02** (ADR 0014; no existing field changed meaning and all
  119 P3-01 tests pass unmodified): `ConnectorSession.sourceMetadata` and `RawArtifact.attributes`
  added, since P3-01 had nowhere to report observed source-level or per-artifact metadata;
  `SourceConnector.sourceType` widened to `sourceTypes` (a set), because one git repository
  legitimately holds source code, data models, tests, and documentation; and
  `RepositoryCoordinates.workingTreePath` added, separating where a repository _is_ from what it _is_
  so that pointing git at a local checkout no longer stamps that machine's absolute path into
  `Source.locator` and every `Evidence.locator` (which would make OKF provenance differ per build
  agent, contrary to ADR 0013 decision 9).

- `apps/web/src/data/types.ts` now imports the six Phase 1 functional areas' types (and
  `GraphElementMetadata`) from `@phoenix-ai/shared` instead of redefining them locally, removing
  a pre-existing duplication of `GraphElementMetadata` between the two packages.
- `apps/web/src/data/api/apiProvider.ts`, `apps/api/README.md`, and `apps/web/README.md` updated
  to reflect which endpoints are now implemented vs. still pending for later phases.
