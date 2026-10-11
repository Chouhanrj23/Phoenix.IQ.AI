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
- **Phase 3 — P3-07 (Java database interaction extraction):**
  `packages/extraction-engine/src/java-persistence.ts` — `extractJavaPersistence` (FR-DET-02's ORM
  half), a pure function over P3-04's structural facts reading JPA `@Entity` classes
  (table/id/column/association facts, generic association types unwrapped) and Spring Data
  repository interfaces (type arguments recovered via a small targeted regex over already-extracted
  text, not a second CST pass; declared query methods with `@Query` text). New `bridge-
persistence.ts`'s `bridgeJpaEntity` maps an entity directly to a real, validated `EntityObject`
  (`domain.entity`), reusing P3-06's `bridge-shared.ts` plumbing unchanged; repositories themselves
  do not bridge to a canonical object. `extractJavaProject` now wires persistence extraction and
  bridging in alongside HTTP. No new dependencies. Proven with 5 new tests (46 total), including an
  assertion that bridged output now contains both an `EntityObject` and an `ApiObject` together. See
  ADR 0019.
- **Phase 3 — P3-08 (Java configuration extraction):** `packages/extraction-engine/src/java-config.ts`
  — the last ticket in the Java extraction family (P3-03 through P3-08, now complete).
  `extractPropertiesConfig`/`extractYamlConfig` parse `application.properties`/`.yml` into flat
  key→value facts with line numbers (YAML via the `yaml` package's `parseDocument`, which preserves
  source ranges a plain `parse()` would lose); `extractConfigReferences` is the one module in this
  family that reads more than one other pass's output together, cross-referencing P3-04's structural
  facts (`@Value`/`@ConfigurationProperties` annotation sites) and P3-05's call graph
  (`System.getenv`/`System.getProperty` call sites, via a small `firstStringArgument` addition to
  `JavaCallFact`). `extractJavaProject` reaches its final form for this family. Neither config facts
  nor references bridge to a canonical object (no existing kind fits). New dependency: `yaml`
  (matching `packages/knowledge-graph`'s existing pin). Proven with 6 new tests (52 total across 11
  files), including the full end-to-end assembly into a validated `CanonicalKnowledgeBundle` and a
  byte-stability assertion (FR-DET-07) across two runs of identical input. See ADR 0020.
- **Phase 3 — P3-09 (Java extraction OKF mapping):** `packages/extraction-engine/src/okf-mapping.ts`
  — the final connective step for the Java extraction family. `buildJavaCanonicalBundle` wraps a
  `JavaExtractionResult`'s already-bridged `objects`/`relationships` into a real
  `CanonicalKnowledgeBundle` (accepting an optional `sources: Source[]` registry rather than
  reconstructing one); `mapJavaExtractionToOkfDocument`/`serializeJavaExtractionToOkfYaml` reuse
  P2-10's `toOkfDocument`/`serializeOkfYaml` (`@phoenix-ai/knowledge-graph`) completely unmodified —
  no second YAML serializer or validator. No new canonical mapping is invented: the call graph,
  type-dependency graph, repositories, and configuration facts stay outside any bundle this
  produces, exactly as P3-05/P3-07/P3-08 already decided. No new dependencies. Proven with 4 new
  tests against a real `extractJavaProject` run, including a full round-trip through the real
  `parseAndValidateOkfYaml`. This completes the Java extraction family (P3-03 through P3-09). See
  ADR 0021.
- **Phase 3 — P3-10 (Java extraction fact provenance):** `packages/extraction-engine/src/
fact-provenance.ts` — attaches `FactProvenance` (which source, which revision, derived by what,
  when) to every fact this family returns, not just the two bridged canonical object kinds.
  `stampFactProvenance` is a generic, recursive post-processing enrichment applied once by
  `extractJavaProject` after every other pass has run (it recognizes a fact by its `path: string`
  property at any depth, so it touches none of `java-structure.ts`/`java-calls.ts`/`java-http.ts`/
  `java-persistence.ts`/`java-config.ts`'s own logic); provenance lands wherever a fact's location
  already lives, including on a nested `span` for call/type-dependency facts whose own identity
  isn't itself a location. `JavaExtractionOptions` gains `sourceVersion?` (one caller-supplied value
  for the whole run, matching how `systemId`/`sourceId` already work); `BridgeOptions.sourceVersion?`
  now flows into every bridged object's `Evidence.sourceVersion`, fixing a real, pre-existing gap
  (that field has existed since P2-09 but nothing populated it until now). No new dependencies.
  Proven with 7 new tests for the generic stamper in isolation plus grown end-to-end coverage in
  `extract-java.test.ts`/`bridge-http.test.ts`/`bridge-persistence.test.ts` (69 tests total in the
  package). See ADR 0022.
- **Phase 3 — P3-11 (POC: analyze the Phoenix repository):**
  `packages/extraction-engine/samples/analyze-phoenix-repo.ts` — the first time the real git
  connector (P3-02) and the whole Java extraction family (P3-03 through P3-10) run against a real,
  un-curated repository neither wrote: Phoenix.ai-1's own working tree. Deliberately no ADR (no new
  design decision; nothing in `src/` changes) and no permanent library API (matches
  `packages/knowledge-graph/samples/generate-sample.ts`'s existing `samples/` convention). Real
  result, run against this repository's own HEAD (342 tracked files after excluding build/dependency
  noise): 0 `.java` files and therefore an empty extraction result across every category — the
  correct finding for a TypeScript/Node monorepo with no Java source, proving the pipeline fabricates
  no facts from content it was never designed to understand. What it DID prove positively: the git
  connector lists a real 342-file repository correctly, the whole pipeline completes with zero
  crashes and zero parse failures, and the resulting bundle/OKF YAML validate against the REAL
  `validateCanonicalKnowledgeBundle`/`validateSourceReferences`/`parseAndValidateOkfYaml`. New
  devDependency: `tsx`. Run via
  `pnpm --filter @phoenix-ai/extraction-engine poc:analyze-phoenix`; full output in
  `packages/extraction-engine/samples/phoenix-repo-analysis-report.md`.
  **Positive-path follow-up:** `packages/extraction-engine/samples/analyze-spring-petclinic.ts` runs
  the identical, unmodified pipeline against the real, uncurated
  [spring-projects/spring-petclinic](https://github.com/spring-projects/spring-petclinic) (pinned
  `88e37c15cf6fc8490b01bc3e8e2c800cec1ac272`) via the connector's real remote-clone path (`kind:
'git'`, first real exercise of that path). Real, non-empty findings: 49 `.java` files, 6 Spring MVC
  controllers / 17 REST routes, 6 JPA entities with real associations, 3 Spring Data repositories, 22
  config keys (secrets redacted in the report), 12 bridged canonical objects, all validated against
  the real `validateCanonicalKnowledgeBundle`/`validateSourceReferences`/`parseAndValidateOkfYaml`.
  Two honest, non-defect limitations surfaced by real-world code and documented, not fixed (out of
  scope for this step): inherited `@Id` fields are invisible without classpath resolution (per ADR
  0017's existing, documented shallow-resolution scope), and a dual Gradle+Maven root directory
  resolves deterministically to one module per P3-03's nearest-ancestor rule. Run via
  `pnpm --filter @phoenix-ai/extraction-engine poc:analyze-spring-petclinic`; full output in
  `packages/extraction-engine/samples/spring-petclinic-analysis-report.md` and
  `packages/extraction-engine/samples/spring-petclinic.okf.yaml`. No P3-01–P3-10 code changed.
- **Phase 4 prerequisites (audit-driven, before P4-02/03/04):**
  `packages/extraction-engine/src/bridge-relationships.ts` — fixes a mapping gap (not an extraction
  gap) found by the Phase 4 readiness audit: `extractJavaProject` had always hardcoded
  `relationships: []`, even though the call/type-dependency graph (P3-05) and JPA associations
  (P3-07) were already fully extracted and resolved. Two new, narrow bridges — resolved
  `paramType`/`returnType`/`extends`/`implements`/`throws` dependencies (`kind: 'dependsOn'`) and
  JPA `@OneToMany`/`@ManyToOne`/`@OneToOne`/`@ManyToMany` associations (`kind: 'hasAssociation'`) —
  produce real `CanonicalKnowledgeRelationship`s only between two already-bridged canonical objects,
  never inventing or guessing a target. Verified against real spring-petclinic source: 29
  relationships (24 `dependsOn`, 4 `hasAssociation`) now produced from what was previously always
  zero; report/OKF regenerated. 7 new tests (`bridge-relationships.test.ts`) plus extended
  `pipeline-e2e.test.ts` assertions (77/77 package tests pass). The call graph itself remains
  unbridged (documented deferral, not a silent gap). New package `@phoenix-ai/graph-persistence`
  (`config.ts`/`neo4j-client.ts` only — no mapping/ingestion/query logic yet) with a real,
  Testcontainers-verified Neo4j connection and typed failure behavior (`Neo4jUnavailableError`);
  root `docker-compose.yml`/`.env.example` for local dev. No `apps/api`/`apps/web` changes; no
  P4-01/02/03/04/07/08/09/10 implementation. See ADR 0023.
- **Phase 4 — P4-01 (Finalize graph mapping):** `packages/graph-persistence/src/graph-mapping.ts` —
  the authoritative OKF → Neo4j node/relationship mapping. Maps all 15 real Phase 2 object kinds
  (corrected from an earlier miscounted "12" — see ADR 0024) to Neo4j labels, and all 19 relationship
  kinds (17 schema-supported + the 2 `dependsOn`/`hasAssociation` kinds Phase 3 currently produces) to
  relationship types. Stable ids are reused verbatim from the OKF's own already-deterministic
  `identity.id`/relationship `id` — never re-derived. `attributes` flattens generically (Neo4j-safe
  scalars/arrays as-is, anything else JSON-stringified) rather than hand-mapped per kind, to avoid
  building a second domain model. `provenance`/`evidence` are preserved as their own structured,
  unflattened arrays (never truncated to one entry); `confidence`/`confidenceDetail` flatten onto
  scalar properties, calculating nothing new. Pure and synchronous — no `neo4j-driver` import, no
  Cypher, no API route, no UI change. 28 new tests (`graph-mapping.test.ts`), built against real,
  validated, typed instances of every Phase 2 object kind (each checked with
  `validateCanonicalKnowledgeObject` before any mapping assertion runs). See ADR 0024.
- **Phase 4 — P4-02 through P4-10 (Neo4j transformation, persistence, query, UI integration,
  consistency, real repository demo):** `packages/graph-persistence/src/{transform,ingest,query,
consistency}.ts` — P4-02's pure, parameterized `MERGE` write-operation builder; P4-03/P4-04's real,
  transactional, idempotent Neo4j node/relationship ingestion (`GraphIngestionError` on malformed data
  or a missing relationship endpoint, `Neo4jUnavailableError` reused for connectivity/auth failures);
  P4-07's UI-agnostic query layer (`getFullGraph`/`getNodeById`/`getRelationshipsForNode`); P4-09's
  `checkGraphConsistency` (OKF vs. real queried graph — missing/extra nodes/relationships, endpoint/
  provenance/confidence mismatches, never auto-repaired). Provenance/evidence persist as lossless
  `provenanceJson`/`evidenceJson` string properties (P4-05); confidence/confidenceDetail flatten onto
  scalar properties (P4-06) — no new score calculated anywhere. New `apps/api` route `GET /api/full-graph`
  (`routes/graph.ts` + `services/graph.service.ts`), translating `Neo4jUnavailableError` into a clean
  `503`. `apps/web`'s `apiProvider.getFullGraph` now calls this real route instead of falling back to
  mock data (P4-08) — a real bug was found and fixed in the same pass: `GraphExplorerPage.tsx`'s
  hardcoded `KIND_ORDER` list didn't include `Api`/`Entity`, the only two labels real Phase 3 data
  produces, which would have silently filtered every real node out of the rendered graph despite a
  successful API response; fixed by extending `KIND_ORDER` additively. 26 new real-Neo4j integration
  tests (Testcontainers, `ingest.test.ts`/`query.test.ts`/`provenance-confidence.test.ts`) plus 10
  pure unit tests (`transform.test.ts`) and 13 pure unit tests (`consistency.test.ts`); 3 new `apps/api`
  route tests; 2 new `apps/web` `apiProvider` tests. P4-10: a real, uninterrupted run of the whole chain
  against `spring-projects/spring-petclinic` (pinned `88e37c15cf6fc8490b01bc3e8e2c800cec1ac272`) — 12
  bridged objects, 29 bridged relationships, 0 unmappable, ingested twice into a real Neo4j to prove
  idempotency (12/29 both times), queried back exactly, and confirmed consistent (`consistent: true`,
  0 differences) via `checkGraphConsistency`; a second, persistent (`docker-compose`) run confirmed the
  real `/api/full-graph` HTTP contract end to end. See ADR 0024 and `docs/phase-4/README.md`.
- **Phase 5 — P5-01 through P5-10 (Business understanding):** `packages/inference-engine/src/` —
  domain-agnostic inference of business vocabulary, concepts, capabilities, journeys, entity states,
  and business↔technical traceability from Phase 2/3/4's already-verified OKF facts, never from raw
  source. Reuses 11 existing-but-previously-unpopulated Phase 2 kinds/relationship-kinds
  (`domain.entity`/`domain.entity-state`, `journey.journey`/`.flow`/`.action`, `hasState`/
  `transitionsTo`/`readsEntity`/`writesEntity`/`triggersTransition`/`contains`/`supports`) and adds
  exactly one new, additive kind (`business.capability`, plus `comprises`/`realizedBy` and the
  cross-cutting `groundedIn` relationship kinds) via Phase 2's already-open `kind: string` vocabulary —
  zero changes to `packages/knowledge-graph` itself. `inference-contract.ts` (P5-01) defines the one
  `InferenceProvider<TInput, TOutput>` contract and the single documented, deterministic confidence
  formula every stage uses; no LLM is connected (none exists anywhere in this repo), by explicit design.
  `vocabulary.ts` (P5-02), `concept-inference.ts` (P5-03), `capability-inference.ts` (P5-04),
  `journey-inference.ts` (P5-05), `state-inference.ts` (P5-06), `journey-mapping.ts` (P5-07), and
  `traceability.ts` (P5-08) implement the remaining pipeline stages, each driven by structural,
  domain-neutral rules (naming conventions, CRUD-verb ordering, module co-location) rather than any
  business-noun lookup table. P5-09: domain-neutrality verified mechanically — a scanner
  (`tests/domain-agnostic.test.ts`) reads every actual `src/*.ts` file's text for forbidden business
  nouns and runs the full pipeline over two lexically unrelated placeholder vocabularies, catching and
  fixing two genuine issues in the implementation itself (an illustrative "Order" in two doc-comments;
  an inconsistent verb table between `vocabulary.ts` and `state-inference.ts`). P5-10: the same
  pipeline run over two genuinely different, honestly-disclosed representative fixtures grounded in
  this repo's own existing demo data — Aurora e-commerce (`packages/knowledge-graph/samples/
aurora-commerce.sample.okf.yaml`) and a fintech digital-banking system (`apps/web/src/data/mock/
fintech/fixtures.ts`, "nimbus-financial") — producing structurally analogous, non-overlapping
  business output for both (`tests/aurora-fintech-validation.test.ts`), with neither claimed as a real
  external repository extraction. 90 new tests across 11 test files, all passing. See ADR 0025 and
  `docs/phase-5/README.md`.
- **Phase 5 — corrective fixes (post-acceptance validation audit):** a strict audit found the Phase 5
  pipeline, though green against its own curated fixtures, had never been proven against Phase 3's real
  producer output shape and had two genuine gaps. Five fixes, `packages/inference-engine/src/`:
  (1) `vocabulary.ts`'s `normalizeIdentifierText` now derives a generic `normalizedAction`
  (`create`/`read`/`update`/`terminate`) from the HTTP method alone for real REST operation names
  (`"GET /owners/{id}"`, Phase 3's actual shape) that have no bare leading verb — consumed by
  `journey-inference.ts`/`state-inference.ts`/`journey-mapping.ts`; (2) `capability-inference.ts` gained
  a documented SECONDARY module-key fallback deriving a real Java-package-directory signal from
  `Evidence.locator` file paths for flat/monolith repositories whose `repo://x` provenance carries no
  service-boundary path; (3) `state-inference.ts` now derives real provenance/evidence per inferred
  `domain.entity-state` from its actual status-verb operation evidence (`deriveProvenanceFrom`/
  `deriveEvidenceFrom`, the same mechanism `concept-inference.ts` already used) and returns
  `stateGroundingLinks` that `traceability.ts`'s new `buildStateGroundingRelationships` turns into real
  `groundedIn` edges, closing a traceability hole `explainTraceability` previously could not resolve for
  any state object; (4) `domain-agnostic.test.ts`/`aurora-fintech-validation.test.ts` gained REST-style
  evidence fixtures ADDED ALONGSIDE the existing curated ones; (5) `concept-inference.ts`'s new
  `existingEntityResolutionProvider` wires P5-01's previously-unused `InferenceProvider`/
  `AmbiguousInferenceResult` contract through the one genuine ambiguity point in the pipeline. Validated
  directly against the real `packages/extraction-engine/samples/spring-petclinic.okf.yaml` extraction:
  capabilities went from 0 → 3 real clusters, journeys 0 → 5, entity states 0 → 5, and
  `explainTraceability` now resolves a real state object back to a real source location
  (`OwnerController.java#L48-L179`). 33 new/updated tests (123 total in the package, up from 90). See
  ADR 0025 addendum and `docs/phase-5/README.md` "Corrective fixes."
- **Phase 6 — P6-01 (Connector framework hardening — multi-source-layout preparation):**
  `packages/ingestion-connectors/src/` — two additions that hold the P3-01/P3-02 connector contract
  to its own documented promises now that more than one source layout is in scope: (1)
  `registry.ts`'s `ConnectorRegistry`/`createConnectorRegistry` replaces silent first-match array
  scanning for a set of several connectors, rejecting a duplicate connector `id` at construction
  (`ConnectorRegistrationError`) and an ambiguous descriptor match at resolution
  (`AmbiguousConnectorError`) instead of resolving either by registration order; `selectConnector`
  is unchanged and still exported for the single-connector case. (2) `descriptor.ts`'s
  `SourceDocumentSpaceDescriptor`/`DocumentSpaceCoordinates` is the second source-specific
  narrowing (after `SourceRepositoryDescriptor`), and `document-space-connector.ts`'s
  `createInMemoryDocumentSpaceConnector` is its in-memory reference implementation — the first
  connector in the package to declare `capabilities.revisionPinning: false` and actually enforce
  ADR 0013 decision 6's rejection rule at `open()` (a promise every prior connector documented but
  none exercised, since both `createInMemoryRepositoryConnector` and `createGitRepositoryConnector`
  hardcode `revisionPinning: true`). `descriptorToSource`'s declared-revision lookup, previously
  reading `repository.revision` alone, is generalized to check either narrowing. 30 new tests
  across 2 new files plus additions to `descriptor.test.ts`/`index.test.ts` (208 total in the
  package, up from 178). See
  `docs/architecture/adr/0026-p6-01-connector-framework-hardening.md`.
- **Phase 6 — P6-02 (Jira connector — a second real evidence source):**
  `packages/ingestion-connectors/src/` — Phoenix's second REAL connector (after git, P3-02) and its
  first for a non-repository source, connecting to a Jira Cloud/Server instance over REST API v3.
  `descriptor.ts` gains the third source-specific narrowing, `SourceTicketTrackerDescriptor`/
  `TicketTrackerCoordinates` — deliberately with NO `revision` field at all (an issue tracker has no
  snapshot concept to expose), a stronger form of ADR 0013 decision 6's guarantee than P6-01's
  runtime rejection: the violation is unrepresentable, not merely refused. `jira-connector.ts`'s
  `createJiraConnector` reads issues as `RawArtifact`s (content: a normalized JSON summary with the
  description rendered from Atlassian Document Format to plain text via new `adf.ts`), project
  metadata (`ConnectorSession.sourceMetadata`), and issue-to-issue relationships (`issuelinks`/
  `parent`) as RAW FACTS on `RawArtifact.attributes` — never as canonical relationships, keeping ADR
  0013 decision 1's connector/extraction boundary intact. `jira-client.ts`'s `resolveAuthorization`
  is a deliberate, documented departure from ADR 0014 decision 4's "Phoenix never handles a
  credential": unlike git, an HTTP API has no external authentication mechanism in this environment to
  delegate to, so this is the one place in the package that resolves `credential.scheme:
'environment'` into a real `Authorization` header (Basic when `ticketTracker.accountEmail` is set —
  Jira Cloud API tokens; Bearer otherwise — Jira Server/Data Center PATs) by reading `process.env`,
  never the descriptor itself; `'secret-store'` is refused outright. `list()` pages through Jira's
  `/search` lazily, one page per iteration step — genuinely streaming, per ADR 0013 decision 4.
  Assignee/reporter identity is opt-in (`includeUserIdentity`, default false), mirroring the git
  connector's `includeAuthorMetadata` (ADR 0014 decision 6). Tests fake the HTTP transport
  (`fetchImpl`, built from real Jira REST API v3 response shapes) — the deliberate opposite of ADR
  0014's "don't mock git," since no real Jira instance or credentials are available to test against
  here. 63 new tests across 3 new files (`adf.test.ts`, `jira-client.test.ts`,
  `jira-connector.test.ts`) plus additions to `descriptor.test.ts`/`index.test.ts` (271 total in the
  package, up from 208). See `docs/architecture/adr/0027-p6-02-jira-connector.md`.
- **Phase 6 — P6-04 (OKF mapping — represent Jira-derived facts in the common model):** closes the
  gap ADR 0027 left open ("ready for a future extraction-engine ticket to turn into canonical
  `domain`/`workflow`-shaped objects and relationships"). `packages/knowledge-graph/src/workitem.ts`
  adds the fifth domain-specific `kind` vocabulary — `WorkItemObject`/`WorkItemRelationship`
  (`kind: 'workitem.issue'`), built the same way P2-03 through P2-06 were. ONE object kind covers
  every tracker issue type (Epic/Story/Bug/Task/Sub-task/custom): a tracker's type taxonomy is
  project-configurable, so `attributes.issueType` carries the real string verbatim rather than
  becoming a separate `kind` — the FRD's `Epic`/`Feature`/`Story`/`AcceptanceCriterion` node types
  are deliberately NOT formalized as distinct kinds here, despite `ontology.ts`'s own doc comment
  anticipating that shape (see ADR 0028 decision 4 for the three reasons, including that
  `AcceptanceCriterion` is not a separate Jira entity to bridge from at all).
  `packages/extraction-engine/src/jira-bridge.ts`'s `bridgeJiraArtifacts` is the deterministic
  facts-to-canonical mapping, following `bridge-http.ts`/`bridge-relationships.ts`'s exact
  discipline: one `WorkItemObject` per Jira `RawArtifact`, plus `contains` (parent/child, from
  `parentKey`) and `relatesTo` (from `issueLinks`, preserving the tracker's real link type/direction
  in `attributes`) — both relationship kinds REUSED from `domain.ts`, not newly minted — produced only
  between two objects already bridged in the same batch. `identity.createdAt`/`updatedAt` are always
  `options.generatedAt` (when PHOENIX captured this), matching `bridge-http.ts`'s exact precedent —
  never Jira's own `created`/`updated` timestamps, which land instead on
  `attributes.reportedCreatedAt`/`reportedUpdatedAt`, a deliberate distinction from what
  `KnowledgeObjectIdentity`'s timestamps actually mean. A malformed artifact is reported in the
  result's `skipped` array rather than dropped silently or aborting the batch. `jira-okf-mapping.ts`
  wraps a bridge result into a real `CanonicalKnowledgeBundle`/`OkfDocument`/OKF YAML string,
  mirroring `okf-mapping.ts` (P3-09) exactly. 34 new tests: `packages/knowledge-graph/tests/
workitem.test.ts` (16, 280 total in the package, up from 264) and `packages/extraction-engine/
tests/jira-bridge.test.ts` + `jira-okf-mapping.test.ts` (18, 95 total in the package, up from 77).
  See `docs/architecture/adr/0028-p6-04-jira-okf-mapping.md`.
- **Phase 6 — P6-05 (source-to-source reconciliation — requested as "P6-04 Reconciliation", tracked
  under this number to avoid duplicating the ticket above):** implements the FRD's §3.6
  "Reconciliation & Confidence Engine" module (FR-REC-01/02/03/04/05) as `packages/
reconciliation-engine`'s first real code, replacing its scaffold. `packages/knowledge-graph/src/
reconciliation.ts` adds the sixth domain-specific `kind` vocabulary — `ConflictObject`
  (`kind: 'reconciliation.conflict'`) — and is the FIRST to use `category: 'observation'`, the
  structural category P2-02 reserved since Phase 2 and documented as unfilled by `tests/
ui-coverage.test.ts` since P2-12. `ConflictAttributes.positions` retains EVERY distinct value
  sources claimed about a subject/attribute, each with every source behind it — never collapsed to
  one (FR-REC-04: "shall not silently resolve it"). `packages/reconciliation-engine/src/claim.ts`'s
  `Claim` (the FRD's own "structured claims", §2.1) and `SOURCE_TYPE_AUTHORITY` implement FR-REC-01's
  source-type weighting (code authoritative for structure, logs for behaviour, docs/tickets for
  intent — a deliberately coarse 1-3 scale, not invented decimals); `claimFromObject` extracts a
  claim from ANY already-bridged canonical object (not Jira-specific — Jira's `WorkItemObject`,
  P6-04, is one example among others). `reconcile.ts`'s `reconcileClaims` groups claims by subject/
  attribute/category: agreement derives a structural `Confidence` from source authority and
  corroboration (FR-REC-02: "not from model self-report"); disagreement builds a real `ConflictObject`
  (FR-REC-04), ranked by `rankConflicts` for review (FR-REC-05). `composite-confidence.ts`'s
  `boundCompositeConfidence` separately implements FR-REC-03 (a composite element's confidence
  bounded by its least-certain constituent, returned verbatim). A `ConflictObject` needs no OKF-wrap
  step, unlike Java/Jira — it is already a valid `CanonicalKnowledgeObject`. Cross-source entity
  resolution (deciding which claims from different sources describe "the same" real-world thing) is
  deliberately left to the caller (`Claim.subjectId`), and the FRD's full mandatory
  `status: extracted|inferred|conflicted|human-confirmed` field is NOT added to every canonical
  object/relationship in this ticket — both disclosed scope boundaries, not oversights. 49 new tests:
  `packages/knowledge-graph/tests/reconciliation.test.ts` (13, 293 total in the package, up from 280)
  and `packages/reconciliation-engine/tests/` (36 across 4 files, replacing a 2-test scaffold suite).
  See `docs/architecture/adr/0029-p6-05-source-reconciliation.md`.
- **Phase 6 — P6-06 (confidence calculation — from source agreement/corroboration):** completes
  FR-REC-02, which P6-05 had only half-implemented: a private `confidenceFor` helper existed but ran
  only on the claim-agreement path, so every `ConflictObject` position went out with no computed
  confidence at all — backwards, since FR-REC-02 names "source agreement" as an input specifically
  because it is a matter of degree, not a boolean gate. `packages/reconciliation-engine/src/
confidence-scoring.ts`'s `computeConfidence` extracts and generalizes it into its own dedicated,
  exported, directly-testable module: unchanged three-tier behaviour (`high`/`medium`/`low`) for the
  uncontested case (all 36 P6-05 tests pass unmodified against the new implementation), plus a new
  contested case taking an explicit `contradictingSources` count — `high` is always capped to
  `medium` when any contradiction exists, however authoritative the supporting side; `medium` is
  further capped to `low` only when genuinely OUTNUMBERED (`contradictingSources >
supportingSources`), so a 1-vs-1 tie or a clear majority keeps `medium` rather than collapsing to
  the same floor as the losing side. `reconcile.ts`'s `buildConflictObject` now calls
  `computeConfidence` once PER POSITION (previously zero times), weighing each position's own sources
  against every other position's as the contradicting evidence.
  `@phoenix-ai/knowledge-graph`'s `reconciliation.ts` gains a purely additive
  `ConflictPosition.confidence?: ConflictPositionConfidence` field (a structural mirror of
  `@phoenix-ai/shared`'s `Confidence`, self-indexed for the same reason `ConflictPositionSource
.sourceType` already is) — every pre-P6-06 `ConflictObject` fixture remains valid unchanged. 25 new
  tests: `confidence-scoring.test.ts` (18, dedicated unit coverage for both the uncontested and
  contested cases), plus additions to `reconcile.test.ts`/`index.test.ts` (57 total in the package, up
  from 36) and `knowledge-graph/tests/reconciliation.test.ts` (+4, 297 total in the package, up from
  293). See `docs/architecture/adr/0030-p6-06-confidence-calculation.md`.
- **Phase 6 — P6-08 (evidence aggregation — aggregate supporting evidence for each claim):** the same
  shape of gap P6-06 closed for confidence, but for evidence: `ReconciledClaim` never aggregated
  evidence at all (a caller had to `flatMap` `.claims` themselves, re-deriving deduplication), and
  `ConflictObject.evidence` was a raw, UNDEDUPLICATED flat bag mixing every retained position's
  evidence together with no way to tell which entry backed which side of a dispute.
  `packages/reconciliation-engine/src/evidence-aggregation.ts`'s `aggregateEvidence`/
  `evidenceForClaims` is a new, dedicated module: deduplicates a flat list of `Evidence` by `id`
  (trusting the id as the identity boundary — the "stable identifier for this specific piece of
  evidence" `evidence.ts` itself documents, the same trust pattern `deterministicId` uses everywhere
  else), keeping first occurrence, preserving order. `ReconciledClaim` gains an `evidence: Evidence[]`
  field aggregated across every agreeing claim. `@phoenix-ai/knowledge-graph`'s `reconciliation.ts`
  gains `ConflictPosition.evidenceIds?: string[]` — REFERENCING (never duplicating) entries in the
  object's own now-deduplicated top-level `evidence` array, so a position is traceable to exactly the
  evidence supporting it without cross-referencing sources by hand; referencing by id rather than
  embedding a full `Evidence[]` copy also needs none of the `KnowledgeValue`-index-signature
  workaround `ConflictPositionConfidence` required in P6-06, since a bare `string[]` is already
  `KnowledgeValue`-compatible. Purely additive — every pre-P6-08 `ConflictObject` fixture remains
  valid unchanged. 19 new tests: `evidence-aggregation.test.ts` (9, dedicated unit coverage), plus
  additions to `reconcile.test.ts`/`index.test.ts` (72 total in the package, up from 57) and
  `knowledge-graph/tests/reconciliation.test.ts` (+4, 301 total in the package, up from 297). See
  `docs/architecture/adr/0031-p6-08-evidence-aggregation.md`.
- **Phase 6 — P6-09 (POC — Phoenix repo and Jira analysis using real data sources):** extends P3-11's
  precedent ("run the real pipeline against a real, un-curated repository") to Phase 6.
  `packages/reconciliation-engine/samples/analyze-phoenix-and-jira.ts` (a dev/demo script, not part of
  any runtime API) runs the real git connector (P3-02) against Phoenix.ai-1 itself AND the real Jira
  connector (P6-02) against a representative dataset — no live Jira instance is reachable from this
  environment, so a clearly-labelled representative dataset was used instead of fabricating a live
  connection, the same disclosed stance every prior Jira ADR in this project takes.
  `samples/fixtures/phoenix-backlog-jira.ts` models this project's OWN real Phase 6 backlog (one Jira
  issue per real P6-0X ticket), served through `createJiraConnector`'s real `fetchImpl` injection
  point so the POC exercises real request-building/pagination/ADF-rendering code, not a bypass. The
  git side asks a deliberately strict question — is each ticket's ADR COMMITTED, not merely present on
  disk (the real connector's `ls-tree`-at-HEAD view cannot see an uncommitted file by construction,
  ADR 0014 decision 5) — and both sources' claims about "is this ticket done?" are reconciled per
  ticket via the real `reconcileClaims`. Running it found: revision resolved, 430 tracked files; 8
  Jira issues bridged into 8 `WorkItemObject`s with 12 relationships; 0 agreed claims; 7 conflicts —
  one per real ticket, since every P6-0X deliverable in this session was still uncommitted at the time
  of the run (Jira says done, git says not yet landed) — an honest, accurate finding, not a demo
  shortcoming, and exactly the class of gap FR-REC-04 exists to catch. Everything assembled into one
  real bundle (bridged objects + the 7 `ConflictObject`s + a two-source registry) that validated
  cleanly and round-tripped through the real OKF YAML parser. New `reconciliation-engine`
  devDependencies: `tsx`, `@phoenix-ai/ingestion-connectors`, `@phoenix-ai/extraction-engine`. See
  `docs/architecture/adr/0032-p6-09-phoenix-jira-poc.md`.

- **Phase 8 — end-to-end pipeline:** `packages/orchestration` (`runPipeline`, `runReviewCycle`)
  composes the existing stages into one defined sequence, from source through ingestion, redaction,
  extraction, inference, reconciliation, the validated knowledge graph, graph persistence and OKF,
  then human review, correction, the updated graph and regenerated OKF. Every stage reports items
  in, out and dropped (with reasons); a mandatory stage that cannot produce valid output throws
  `PipelineStageError`. Caller-supplied clock, so runs are byte-reproducible (FR-ORC-01/03).
  `packages/redaction-hardening` replaces its scaffold with a real gate (FR-SEC-01..04):
  pattern-based secret/PII detection, in-place content-free tokens that keep line numbers, an
  AES-256-GCM non-retaining vault, quarantine of unscannable content, and a stamp extraction
  enforces. Integration tests run the whole chain over a real git repository, over the committed
  real spring-petclinic extraction output, and over this repository's own committed tree; a
  live-Neo4j suite runs where a container runtime exists. Stage contracts and remaining gaps are in
  `docs/phase-8/README.md`.
- **Phase 8 — completing the acceptance items:**
  - **Graph versioning:** content-addressed, immutable versions in `packages/drift-detection`
    (FR-KG-05), with in-memory and atomic filesystem stores.
  - **Drift:** changelogs that classify each change and report observed and inferred changes
    separately (BR-07, FR-DFT-02..04).
  - **Re-processing only changed artifacts:** a Java parse cache (FR-DFT-01).
  - **Gap planner:** `packages/gap-analysis` (FR-GAP-01..03).
  - **Renderers and export:** the eleven OKF renderers, with per-element provenance, and a
    portable export with a SHA-256 manifest (BR-02/10, FR-OKF-01..13).
  - **Evaluation:** `packages/evaluation-harness`, with a hand-authored golden system,
    precision/recall and clustering metrics, round-trip verification against cited sources, and a
    CI gate (FR-EVA-01..03).
  - **Deterministic extraction:** IaC (Dockerfile, compose, Kubernetes) to deployment units; git
    commit history to change coupling and knowledge risk (FR-ING-06, FR-DET-04..06).
  - **Tenant isolation:** graph nodes keyed on `(id, systemId)`, scoped queries, and
    tenant-checked review storage (BR-12, FR-ORC-04).
  - **API:** source registration, asynchronous runs, and run outputs (OKF, artifacts, export,
    changelog, gaps, knowledge risk, evaluation). Drift and gap endpoints serve real run data and
    label seed data with `x-phoenix-data-origin` (FR-IF-01/03/05).
  - **Pipeline wiring:** the orchestrator now runs these stages (`graph-versioning`, `drift`,
    `gap-analysis`).

### Fixed

- **Phase 8 — release readiness:**
  - Removed 18 committed `*.fullbak` backup files and the committed `.tsupgrader/` tool output
    (which held machine-specific paths), and stopped tracking `mydocs.md` (personal notes, not
    project documentation; kept locally). All are now gitignored.
  - `graph-persistence` runs its test files one at a time (`vitest.config.ts`): its five
    container-backed files each start a real Neo4j, and starting them in parallel under
    `pnpm test` made some miss their startup wait.
  - `apps/api` gives each test a 20s budget (`vitest.config.ts`): nineteen route tests import the
    route module inside the test body, and under full-suite load one exceeded vitest's 5s default.
    No assertion changed.
  - Rewrote the root, API and web READMEs and `.env.example` to describe what is implemented,
    including setup, environment variables and current limitations.
- **Phase 8 — defects found by the completion work:**
  - The version store refused an unchanged repository analysed again, because it compared
    timestamps.
  - Capability inference collapsed a multi-module repository into one capability when the source
    id named only the repository. This was found by the golden system's clustering metric.
  - Both are covered by regression tests.

- **Phase 8 — final architecture hardening (verified defects only; no redesign, no new phase scope):**
  - **P6-08 regression (evidence loss):** `evidence-aggregation.ts` existed but was neither exported
    nor called, so `ReconciledClaim` carried no aggregated evidence and `ConflictObject.evidence`
    was an undeduplicated `flatMap` with no per-position `evidenceIds`. Re-wired into
    `reconcileClaims` and re-exported; the lost tests restored (FR-REC-04, FR-KG-02).
  - **Reconciliation grouping collision:** claims were grouped by a space-joined key, so subject
    `"a b"`/attribute `"c"` and subject `"a"`/attribute `"b c"` merged into one false conflict. Now a
    JSON-encoded key. Conflict ids are unchanged (stable-id rule, FR-KG-04); the one case where two
    distinct disputes would still share an id now throws `ConflictIdCollisionError` instead of
    silently merging into one graph node.
  - **Rejected review decisions vanished in Neo4j mode:** `reviewDecisionFromNodeProperties`
    accepted only `confirmed`/`corrected`, so every persisted `rejected` decision was dropped on read
    (audit trail, metrics, predecessor chain). Corrupt `evidenceJson`/`provenanceJson`, previously
    read back silently as `[]`, and unreadable `:ReviewDecision` nodes now raise
    `ReviewDecisionCorruptError` (FR-REV-02/03).
  - **Same-millisecond decision order:** `sortDecisions` broke time ties by hash-bearing id, so a
    correction could sort before the confirmation it superseded. Ties now follow the
    `supersedesDecisionId` chain; instants compare by epoch, not string. Same-element submissions
    are serialised in-process so concurrent writes cannot fork the chain.
  - **Stale corrections overwrote the graph:** `propagateCorrectionToGraph` wrote the corrected value
    unconditionally, unlike the bundle path. It now returns `outcome: 'conflict'` and writes nothing
    when the node no longer holds the value the reviewer corrected (FR-REC-04/06). Added to the
    API and web contracts with reviewer-facing wording.
  - **Connectivity loss mid-operation:** a connection dropped after `verifyNeo4jConnectivity` became
    `GraphIngestionError` or a raw driver error (HTTP 500). Now `Neo4jUnavailableError` (HTTP 503,
    "nothing was saved") across ingest, query, and the review store (`isNeo4jConnectivityError`).
  - **Duplicate ids:** `validateCanonicalKnowledgeBundle` now rejects duplicate relationship ids;
    `mapOkfBundleToGraph` excludes and reports every element sharing an id instead of letting
    `MERGE … SET +=` overwrite one with another.
  - **API boundaries:** `/api/review-metrics` validates `from`/`to` (400), compares instants rather
    than strings (an inclusive `…T10:00:00Z` bound excluded a decision at that instant), and maps an
    outage to 503 like every other review route. `PORT` is validated at startup.
  - **Git connector:** a local repository under a path containing a space could not be analysed — the
    percent-encoded `file://` locator reached `git -C` verbatim. Now decoded (git already decodes it
    for clones). Both POC samples now encode their locators; the P6-09 POC's dropped script and
    devDependencies are restored and it runs end to end again.
  - **Tests/CI:** the registry test `okf-renderers/src/artifacts.ts` cited but which did not exist
    (`tests/artifacts.test.ts`); real-clone tests given an explicit timeout (flaky at vitest's 5 s
    default); Prettier violations in the Aurora/Fintech mock data fixed (formatting only).
  - **Found by running the stages together:** the graph mapping had no label/type for
    `reconciliation.conflict`, `workitem.issue`, `business.capability`, `groundedIn`, `comprises`
    or `realizedBy`, so conflicts, work items, capabilities and every inference grounding edge
    never reached Neo4j. The Graph Explorer hid any node kind missing from its fixed list (already
    `ReviewDecision`). Capability `comprises` edges pointed at unmaterialised concept ids. Inferred
    journeys/flows/actions cited `sourceId: systemId`, a source that does not exist, and carried no
    evidence. A stale correction's reviewer was not registered as a source. Graph consistency
    checks ignored attribute values and evidence. All fixed, each with a test that fails on the
    old code.
  - **Security and data-handling hardening:** the redaction detectors backtracked catastrophically
    (a 40 KB dotted string hung the gate); all patterns are now bounded and linear-time, spans come
    from regex group indices (a trailing comment equal to the secret used to be redacted instead
    of the secret), and credential detectors take precedence over the e-mail shape. Descriptor
    validation now rejects locators that embed a credential, and a checkout's `origin` is reported
    without one. Second-source claims and reviewer-entered text now pass the same detectors as
    ingested content (claims redacted; review decisions containing secrets/PII rejected with 422).
    The review API no longer returns internal graph-error text, and every non-`ApiError` 5xx is
    masked. Each fix has a regression test that fails on the previous code.
  - **Reproducibility across hosts:** machine-facing ordering used `localeCompare`, i.e. the host's
    collation, so a Danish or Swedish machine produced different OKF bytes from identical input. All
    30 sites now use `compareCodeUnits` (`@phoenix-ai/shared`). `serializeOkfYaml` no longer emits
    YAML anchors (bytes depended on in-memory object sharing). Graph reads are ordered by id. Jira
    searches use `ORDER BY key ASC`. Proven by emulating other-locale hosts in
    `orchestration/tests/determinism.test.ts`.
  - **Performance and reliability:** redaction line numbering made the gate quadratic in findings
    (20,000 in 680 KB took 10.9 s, now 173 ms). The Neo4j driver now has bounded connection and
    acquisition timeouts (an unreachable host held requests ~21 s). The review queue computes
    leverage from relationship endpoints instead of loading the whole graph per request. The API
    releases its Neo4j pools on close and shuts down gracefully on SIGINT/SIGTERM.
  - **UI/API honesty:** in API mode the "Live API mode" badge hid that five areas (flows, personas,
    journeys, capabilities, epics) were served from browser fixtures; the badge and the affected
    pages now say so. API mode no longer lets a second demo company relabel the API's data. The
    Agent Pipeline page is labelled as a scripted walkthrough, with each stage's real implementation
    status. `/api/full-graph` answers 503 (not 500) when no graph is configured, and read errors show
    the API's own message. A contract test checks every path the web provider calls against the real
    API routes (`buildApp`, extracted from `index.ts`).

### Changed

- **Domain Model page — ER diagram rendering (`apps/web`):** the Domain Model page now renders
  each domain as an entity-relationship diagram (`reactflow`) instead of a flat expand/collapse
  list of entity-name badges — entities as attribute boxes with PK/FK icons, labeled relationship
  edges, dashed external nodes for cross-domain references, an aggregate-column layout, and a
  click-to-inspect side panel (aggregate, confidence, rationale, fields, provenance), reusing the
  existing `FullscreenDiagram` wrapper from the Architecture page. New
  `apps/web/src/lib/er-model.ts` (`buildDomainErModel`) and
  `apps/web/src/components/er-entity-node.tsx`. Presentation-only change over the same
  `dataProvider.getDomains()` data — no `apps/api` route, canonical model, or OKF schema changed.
  Field-level schema and foreign keys are illustrative, not extracted (Phase 1's
  `Aggregate.entities` remains a flat `string[]` — the same documented gap as ADR 0006), and the
  page states this explicitly. See `docs/web-ui/domain-model-er-diagram.md`.

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
