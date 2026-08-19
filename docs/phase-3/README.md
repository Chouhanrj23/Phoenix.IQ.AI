# Phoenix Phase 3 — Source Connectors

Living status record for Phase 3 ("Source Connectors"), the first phase in which Phoenix reads
anything real. Mirrors the convention established in [`docs/phase-1/README.md`](../phase-1/README.md)
and [`docs/phase-2/README.md`](../phase-2/README.md).

Phase 2 (P2-01 through P2-12) is closed — the canonical knowledge model, all four domain ontologies,
the three cross-cutting metadata models, and the OKF YAML schema are complete and unused by anything
that reads a real source. Phase 3's job is to populate them.

Design rationale is recorded separately per ticket — P3-01 in
[`docs/architecture/adr/0013-source-connector-contract.md`](../architecture/adr/0013-source-connector-contract.md),
P3-02 in
[`docs/architecture/adr/0014-git-repository-connector.md`](../architecture/adr/0014-git-repository-connector.md),
P3-03 in
[`docs/architecture/adr/0015-java-source-discovery.md`](../architecture/adr/0015-java-source-discovery.md),
P3-04 in
[`docs/architecture/adr/0016-java-structural-facts.md`](../architecture/adr/0016-java-structural-facts.md),
P3-05 in
[`docs/architecture/adr/0017-java-call-dependency-graph.md`](../architecture/adr/0017-java-call-dependency-graph.md),
P3-06 in
[`docs/architecture/adr/0018-java-rest-api-extraction.md`](../architecture/adr/0018-java-rest-api-extraction.md),
P3-07 in
[`docs/architecture/adr/0019-java-persistence-extraction.md`](../architecture/adr/0019-java-persistence-extraction.md),
P3-08 in
[`docs/architecture/adr/0020-java-configuration-extraction.md`](../architecture/adr/0020-java-configuration-extraction.md),
P3-09 in
[`docs/architecture/adr/0021-java-okf-mapping.md`](../architecture/adr/0021-java-okf-mapping.md),
and P3-10 in
[`docs/architecture/adr/0022-java-fact-provenance.md`](../architecture/adr/0022-java-fact-provenance.md);
this document is the narrative status record, not a duplicate of those ADRs.

P3-03 onward is a family of tickets, all in `packages/extraction-engine`, each adding one piece of
deterministic Java extraction on top of the last: P3-03 (source discovery) → P3-04 (structural facts)
→ P3-05 (call/dependency graph) → P3-06 (REST/API) → P3-07 (persistence) → P3-08 (configuration) →
P3-09 (OKF mapping) → P3-10 (fact provenance) → P3-11 (a real-repository POC, deliberately without an
ADR — see its own section for why). Each library ticket (P3-03 through P3-10) has its own ADR, its
own commit, and its own section below.

## P3-01 — Common Connector Contract for Source Repositories

**Status: Complete.**

Implemented in `packages/ingestion-connectors/src/` (previously an untouched `MODULE_NAME`/
`placeholder()` scaffold — the same call ADR 0003 made for `packages/knowledge-graph`, and the same
replacement pattern P2-01 used). Five files:

- `filter.ts` — `ArtifactFilter` plus the ONE shared implementation of its semantics
  (`matchesArtifactFilter`/`matchesPathPattern`), so the same descriptor selects the same artifacts
  under every connector. Two documented glob rules; see ADR 0013 decision 5.
- `descriptor.ts` — `SourceDescriptor` (the generic ingestion request),
  `SourceRepositoryDescriptor`/`RepositoryCoordinates` (the only source-specific narrowing P3-01
  defines), `CredentialReference` (a reference, never a secret), `SOURCE_LOCATOR_PATTERN`,
  `buildArtifactLocator`, and `descriptorToSource` — the one-way bridge to P2-07's `Source`.
- `artifact.ts` — `ArtifactRef`/`RawArtifact` (the common intermediate representation this package's
  README has named since the scaffold), the non-throwing `ArtifactReadResult`/`ArtifactFailure`
  partial-failure model, and `artifactToEvidence` — the bridge to P2-09's `Evidence`.
- `connector.ts` — `SourceConnector`/`ConnectorSession`/`ConnectorCapabilities`, the
  `open → list → read → close` lifecycle, plus `collectArtifacts`/`withConnectorSession`/
  `selectConnector`/`validateSourceConnector`.
- `reference-connector.ts` — `createInMemoryRepositoryConnector`, an in-memory reference
  implementation. No filesystem, network, or git access; it reads only the artifacts handed to it as
  options.

`Source`, `Evidence`, `ValidationResult`, `isNonEmptyString`, `isIsoTimestamp`, and `isPlainObject`
are reused from `@phoenix-ai/knowledge-graph`, and `SourceType` from `@phoenix-ai/shared` — none
redefined, following the pattern every P2-03-onward domain file already uses. `packages/shared` is
untouched.

**The load-bearing decision** (ADR 0013 decision 1): a connector emits RAW ARTIFACTS plus the
metadata needed to trace them, never `CanonicalKnowledgeObject`s. Deciding that a file describes an
`architecture.container` is `extraction-engine`'s and `inference-engine`'s job. Two bridges connect
the two halves without a second identifier space — `SourceDescriptor.id` _is_ `Source.id` _is_
`Provenance.sourceId` _is_ `Evidence.sourceId`.

Proven against real Phase 1 data: `tests/connector.test.ts` drives the reference connector over the
actual Aurora `repo://aurora-commerce/services/checkout` source (a registered `Source` id in the
P2-11 sample OKF), assembles the result into a bundle carrying the real `ctr-checkout` "Checkout
Service" container, and validates it with the real `validateContainerObject`,
`validateCanonicalKnowledgeBundle`, `validateSourceReferences`, and `validateOkfDocument`, then
round-trips it through `serializeOkfYaml`/`parseAndValidateOkfYaml`. The negative case is asserted
too: a mismatched source registry is caught, not silently accepted.

Also **documents an honest gap**: three `Source` ids in the P2-11 sample (`docs/architecture-2024.pdf`,
`docs/personas.md`, and bare-path forms generally) would be rejected by this contract's locator rule.
That inconsistency is asserted in `descriptor.test.ts` rather than papered over; reconciling it is a
follow-up ticket, not something P3-01 changed the sample or weakened the rule to hide.

**What P3-01 deliberately does NOT include** (all explicitly deferred):

- Any real connector — no git, no filesystem walking, no HTTP, no wiki/ticketing/log-store/gateway
  client. `createInMemoryRepositoryConnector` is a reference implementation and test double, not a
  connector for anything real.
- Any language parsing, schema discovery, or extraction of any kind — the contract stops at raw
  artifacts by design.
- Credential resolution. `CredentialReference` names an environment variable or secret-store key;
  turning that into an actual credential belongs behind `packages/redaction-hardening`'s trust
  boundary.
- Ingestion scheduling, run orchestration, or a connector registry with precedence rules —
  `selectConnector` is deliberately first-match; the rest is `packages/orchestration`'s job.
- Streaming a single large artifact in chunks. `RawArtifact.content` is a whole string;
  `maxSizeBytes` plus a `too-large` failure is the mitigation.
- Any change to `packages/shared`, `apps/api`, or `apps/web`.

**New dependencies:** `packages/ingestion-connectors` now depends on `@phoenix-ai/knowledge-graph`
(workspace, the direction the pipeline already flows — no cycle) and adds `@types/node` as a
devDependency for the reference connector's `node:crypto` hashing. `@types/node` was already in the
monorepo's resolved dependency graph via `packages/shared`.

## P3-02 — Git Repository Ingestion (metadata, revisions, source files)

**Status: Complete.**

The first REAL connector: `createGitRepositoryConnector` reads repository metadata, revisions, and
source files from a local checkout or a remote clone. Two new files in
`packages/ingestion-connectors/src/`:

- `git-command.ts` — the safe `git` invocation layer every git operation in the package goes through.
  `spawn` with an explicit argv array and no shell, so metacharacters in a caller-supplied locator,
  revision, or path are inert; `assertSafeRevision`/`assertSafePath`/`assertSafeRemote` then close off
  **argument** injection, which is the real risk with git (`--upload-pack=<command>`). Hardening
  applied to every call: `protocol.ext.allow=never`, `core.fsmonitor=false`,
  `GIT_TERMINAL_PROMPT=0`. Plus timeouts, an output ceiling, and `GitCommandError` carrying
  argv/exit code/stderr so callers can classify a failure instead of matching a message.
- `git-connector.ts` — `createGitRepositoryConnector`, implementing
  `SourceConnector<SourceRepositoryDescriptor>` with all five capabilities declared true and honest.

How the ticket's three deliverables are actually obtained:

- **Revisions** — `git rev-parse --verify <ref>^{commit}` resolves whatever the descriptor asked for
  (branch, tag, SHA, or `HEAD`) to an immutable full SHA **once, at `open`**. Every later read is
  addressed against that SHA, so a branch moving mid-run cannot produce a bundle mixing two
  revisions, and that SHA is what lands in `Source.version` and every `Evidence.sourceVersion`.
- **Repository metadata** — one `git log -1` plus a few `rev-parse`/`tag`/`remote` calls at `open`,
  surfaced as `ConnectorSession.sourceMetadata` (`GitRepositoryMetadata`): resolved and short SHA,
  committer date, commit subject, requested ref, default branch, tags at HEAD, remote URL,
  shallowness, and tracked file count. Commit **author identity is opt-in** — it is personal data and
  this package sits upstream of `packages/redaction-hardening`.
- **Source files** — `git ls-tree -r -l -z <sha>` lists the tree AT that revision and
  `git cat-file blob <oid>` reads each one, so uncommitted edits and untracked files are invisible
  **by construction** rather than by a filter that could be misconfigured. `contentHash` is git's own
  blob object id (`git-blob-sha1`), verifiable outside Phoenix with `git cat-file` — not a digest
  this connector invented. Binary content is detected with git's own NUL-in-first-8000-bytes rule and
  base64-encoded rather than corrupted by a UTF-8 decode.

File history (`lastModifiedAt`, `attributes.lastCommitRevision`) costs exactly **one** extra
`git log --name-only` pass for the whole repository, not one call per file — the difference between
affordable and switched off on a large repository, and what gives `ArtifactFilter.changedSince`
something real to filter on. `repository.subpaths` are pushed down to git as pathspecs, which is what
makes `subtreeFiltering: true` truthful rather than a restatement of `matchesArtifactFilter`.

**Three additive amendments to the P3-01 contract** (ADR 0014; no existing field changed meaning, and
all 119 P3-01 tests pass unmodified):

1. `ConnectorSession.sourceMetadata` and `RawArtifact.attributes` — P3-01 had nowhere to report
   observed source-level or per-artifact metadata, and "read repository metadata" is a third of this
   ticket. Free-form because the content is irreducibly source-kind-specific.
2. `SourceConnector.sourceType` → `sourceTypes` (a set) — one git repository legitimately holds source
   code, data models, tests, and documentation; the descriptor says which.
3. `RepositoryCoordinates.workingTreePath` — separates where a repository **is** from what it **is**,
   so pointing git at a local checkout no longer stamps that machine's absolute path into
   `Source.locator` and every `Evidence.locator`. Without it, the same repository analyzed on two
   build agents produces different provenance, which ADR 0013 decision 9's determinism requirement
   does not allow.

**Not included in P3-02:** any parsing of a source file (extraction's job, P3-03 onward), submodule
traversal, Git LFS object resolution, credential resolution (rejected outright — authenticate git
itself via a helper or SSH agent), incremental _fetch_, and any change to `packages/shared`,
`apps/api`, or `apps/web`. See ADR 0014 "Limitations".

**New prerequisite:** the `git` binary must be on `PATH` wherever ingestion runs — the first
environmental dependency in this project beyond Node. `isGitAvailable`/`gitVersion` probe for it and
fail clearly rather than with a cryptic spawn error. No new package dependencies.

## P3-03 — Java Source Discovery and Project Structure

**Status: Complete.**

The first ticket in the Java extraction family (see the note above) — and deliberately the smallest:
it performs no Java parsing at all. `packages/extraction-engine/src/java-project.ts` classifies Java
`RawArtifact`s (from P3-02's git connector, or any other `SourceConnector`) into Maven/Gradle modules
by walking each `.java` path upward to its nearest ancestor `pom.xml`/`build.gradle[.kts]` — the same
shape a module boundary actually has — then splits each module's files into `main`/`test` by the
`src/main/java`/`src/test/java` convention.

POM coordinates (`groupId`/`artifactId`/`version`/`packaging`) are read with a narrow,
depth-tracking tag reader scoped to the root `<project>` element's DIRECT children only — not a
general XML parsing dependency, mirroring `ingestion-connectors/src/filter.ts`'s own precedent of a
hand-rolled parser for a well-known, bounded grammar. The depth tracking is what stops a `<parent>`
or `<dependency>` block's own `<groupId>` from being misread as the module's; `<parent>` inheritance
itself is an honest, tested gap, not silently guessed. Gradle coordinates are read from top-level
`group`/`version` assignments only.

New dependency: `@phoenix-ai/ingestion-connectors` (for the `RawArtifact` type P3-03 classifies).
Proven with 7 tests: nearest-ancestor module resolution for a nested multi-module layout, a
`<parent>` POM fixture proving inheritance is not wrongly picked up, Gradle Groovy/Kotlin-DSL
coordinate shorthand, and an unassigned `.java` file surfaced rather than dropped. See ADR 0015.

## P3-04 — Java Structural Facts (Packages, Classes, Interfaces)

**Status: Complete.**

The first ticket in the family that actually parses Java. Three new files in
`packages/extraction-engine/src/`:

- `java-parser-adapter.ts` — the one call site wrapping `java-parser`'s throw-only `parse()` into a
  non-throwing result (`{ ok: true, cst } | { ok: false, reason, detail, position? }`), mirroring
  `ArtifactReadResult`'s convention from `ingestion-connectors`.
- `cst-utils.ts` — rule-agnostic CST helpers (`sourceTextOf`, `resolveLiteral`, ...) every other
  CST-touching module in this family shares.
- `java-structure.ts` — `extractJavaStructure`: package, imports, and every type declaration
  (class/interface/enum/record/annotation-type) with its modifiers, annotations, extends/implements,
  fields, methods, and nested types, each carrying file+line evidence (FR-DET-01, FR-DET-08). Plain
  recursive-descent over the declaration grammar, not a CST visitor — see ADR 0016 decision 3.

`extract-java.ts`'s `extractJavaProject` now wires discovery through parsing through structural
facts. New dependency: `java-parser` (pinned `3.0.1`) — the AST/CST library the rest of this family
rests on. Proven with 16 new tests (23 total in the package), including a dedicated nested-class
recursion guard and a parse failure proven not to abort the run. See ADR 0016.

## P3-05 — Java Method, Call, and Dependency Extraction

**Status: Complete.**

`packages/extraction-engine/src/java-calls.ts` — `extractJavaCallGraph`, finishing FR-DET-01's "call
graph" requirement. Two independent passes:

- The **type-dependency graph** is derived purely from P3-04's already-computed `JavaFileFacts` — no
  second CST pass. `extends`/`implements`/field/parameter/return/throws type text, already captured
  as strings, is resolved against a project-wide qualified-name index.
- The **call graph** is a second, targeted CST walk per file, using a real
  `BaseJavaCstVisitorWithDefaults` subclass (unlike P3-04's structural facts, which deliberately do
  NOT use the visitor API — statement/expression nesting is not boundedly enumerable by hand the way
  declarations are). Resolution is deliberately shallow: resolved only for a bare/`this` call or
  `Type.method()` against a known project-local type; a call through an instance field is
  `unresolved: true`, never guessed, since this package has no classpath or symbol table.

`extractJavaProject` now wires the call/type-dependency graph in after structural facts. No new
dependencies. Proven with 3 new tests plus a grown end-to-end assertion in `extract-java.test.ts`
(27 tests total in the package), including a call through an instance field proven to stay
unresolved rather than silently guessed. See ADR 0017.

## P3-06 — Java REST/API Extraction (Spring MVC)

**Status: Complete.**

`packages/extraction-engine/src/java-http.ts` — `extractJavaHttp` (FR-DET-03), a pure function over
P3-04's structural facts: a type with a type-level `@RestController`/`@Controller` annotation becomes
a controller; its `@RequestMapping` class-level path(s) join with each handler method's
`@GetMapping`/`@PostMapping`/`@PutMapping`/`@DeleteMapping`/`@PatchMapping` (or method-level
`@RequestMapping`) via the independently-tested `joinPaths` normalizer; `@PathVariable`/
`@RequestParam`/`@RequestBody`/`@RequestHeader`-annotated parameters become route parameter metadata.

This is also the first ticket with a canonical-object bridge: `bridge-shared.ts` (deterministic
`sha256`-based ids, evidence construction — shared plumbing every later bridge reuses) and
`bridge-http.ts`'s `bridgeSpringController`, mapping a controller directly to a real, validated
`ApiObject` (`integration.api`) with `confidenceDetail: { basis: 'observed' }`. `extractJavaProject`
gains its `options` parameter (`systemId`/`sourceId`/`generatedAt`) here — the first stage that needs
one.

New dependency: `@phoenix-ai/knowledge-graph` (for `ApiObject` and its real validator). Proven with
12 new tests (39 total in the package), including `joinPaths`' normalization rules tested in
isolation and the bridged `ApiObject` validated with the real `validateApiObject`. See ADR 0018.

## P3-07 — Java Database Interaction Extraction (JPA/Spring Data)

**Status: Complete.**

`packages/extraction-engine/src/java-persistence.ts` — `extractJavaPersistence` (FR-DET-02's ORM
half), a pure function over P3-04's structural facts, matching P3-06's shape: a type with a
type-level `@Entity` annotation becomes a `JavaJpaEntityFact` (`@Table` for the table name, `@Id`
fields, `@Column` names, `@OneToMany`/`@ManyToOne`/`@OneToOne`/`@ManyToMany` associations with their
generic collection type unwrapped); an interface extending a `*Repository` type becomes a
`JavaRepositoryFact`, its generic type arguments recovered with a small targeted regex over the
already-extracted `extendsTypes` text (not a second CST pass).

`bridge-persistence.ts`'s `bridgeJpaEntity` maps an entity directly to a real, validated
`EntityObject` (`domain.entity`), reusing P3-06's `bridge-shared.ts` plumbing unchanged. Repositories
themselves do NOT bridge to a canonical object (no existing kind fits one, and conflating it with its
entity would lose information) — they stay a fact in `JavaExtractionResult.repositories`.

No new dependencies. Proven with 5 new tests (46 total in the package), including the bridged
`EntityObject` validated with the real `validateEntityObject` and an end-to-end assertion that
`objects` now contains both an `EntityObject` and an `ApiObject` together. See ADR 0019.

## P3-08 — Java Configuration Extraction

**Status: Complete. The Java extraction family (P3-03 through P3-08) is now complete.**

`packages/extraction-engine/src/java-config.ts` — the last ticket in the family, and the one module
that reads more than one other pass's output together. `extractPropertiesConfig`/`extractYamlConfig`
parse `application.properties`/`.yml` into flat key→value facts, each with a line number (YAML via
the `yaml` package's `parseDocument`, specifically because it preserves source ranges a plain
`parse()` would lose; nested keys flatten with `.`, list items with `[index]`, matching Spring Boot's
own relaxed-binding convention). `extractConfigReferences` cross-references P3-04's structural facts
(`@Value("${key:default}")`/`@ConfigurationProperties(prefix=...)` annotation sites) and P3-05's call
graph (`System.getenv`/`System.getProperty` call sites, via a small `firstStringArgument` addition to
`JavaCallFact`) to say WHERE a configuration key or environment variable is actually consumed.

`extractJavaProject` reaches its final form for this family: discover → parse → structural facts →
call/type-dependency graph → HTTP + persistence extraction → configuration extraction → bridge to
`ApiObject`/`EntityObject`. Neither config facts nor config references bridge to a canonical object —
no existing kind fits either, so both stay facts for a later module.

Proven end to end: `tests/extract-java.test.ts`'s final growth assembles the bridged
`EntityObject`/`ApiObject` into a real `CanonicalKnowledgeBundle`, validated with the real
`validateCanonicalKnowledgeBundle`/`validateSourceReferences`, plus a byte-stability assertion
(FR-DET-07) diffing two runs of identical input. New dependency: `yaml` (matching
`packages/knowledge-graph`'s existing pin). 6 new tests (52 total in the package, across 11 files).
See ADR 0020.

## P3-09 — Java Extraction OKF Mapping

**Status: Complete.**

`packages/extraction-engine/src/okf-mapping.ts` — the final connective step: wraps a
`JavaExtractionResult`'s already-bridged `objects`/`relationships` (from P3-06/P3-07's bridges) into
a real, complete `CanonicalKnowledgeBundle`/`OkfDocument`/OKF YAML string, reusing P2-10's
`toOkfDocument`/`serializeOkfYaml` (`@phoenix-ai/knowledge-graph`) completely unmodified — no second
YAML serializer, no second validator. `buildJavaCanonicalBundle` assembles the bundle (accepting an
optional `sources: Source[]` registry, typically the `Source` an `ingestion-connectors` connector
session already produced, rather than reconstructing one); `mapJavaExtractionToOkfDocument` adds
P2-10's `okfVersion` envelope; `serializeJavaExtractionToOkfYaml` renders the final YAML text.

No new canonical mapping is invented here — deciding what bridges to a canonical object was already
settled, deliberately, by each prior ticket's own bridge (or lack of one): the call graph,
type-dependency graph, repositories, and configuration facts stay outside any bundle this produces,
exactly as P3-05/P3-07/P3-08 already decided.

Proven with 4 new tests, all against a real `extractJavaProject` run: the bundle validated with the
real `validateCanonicalKnowledgeBundle`/`validateSourceReferences`, the OKF document validated with
the real `validateOkfDocument`, and the serialized YAML round-tripped through the real
`parseAndValidateOkfYaml`. No new dependencies. See ADR 0021.

## P3-10 — Java Extraction Fact Provenance

**Status: Complete.**

`packages/extraction-engine/src/fact-provenance.ts` — attaches `FactProvenance` (which source,
which revision, derived by what, when) to every fact this family returns, not just the two bridged
canonical object kinds. `stampFactProvenance` is a generic, recursive post-processing enrichment
applied once by `extractJavaProject` after every other pass has already run — it recognizes "this is
a fact" by the presence of a `path: string` property at any depth, so it needs no maintenance when a
future ticket adds a new fact shape, and it touches NONE of `java-structure.ts`/`java-calls.ts`/
`java-http.ts`/`java-persistence.ts`/`java-config.ts`'s own logic. `JavaExtractionOptions` gains a
`sourceVersion?` field (a single, caller-supplied value for the whole run, matching how `systemId`/
`sourceId` already work); `BridgeOptions.sourceVersion?` flows straight into `Evidence.sourceVersion`
too, fixing a real, pre-existing gap in P3-06/P3-07's bridges (`Evidence.sourceVersion` has existed
since P2-09 but nothing populated it until now).

Provenance lands wherever a fact's own location already lives, which is not uniform across this
family: a fact extending `SourceSpan` directly gets `provenance` as a sibling of its own `path`; a
call/type-dependency fact, whose location lives on a nested `span` (its own identity is
caller/callee, not a location), gets `provenance` on `span` instead — the generic rule finds it
there, correctly, and a dedicated test asserts both shapes.

Proven with 7 new tests for the generic stamper in isolation plus 4 new end-to-end tests (`files`/
`calls`/`controllers`/`entities`/`repositories`/`config` all carrying the run's provenance in the
right place, nested facts stamped too, `Evidence.sourceVersion` set from `options.sourceVersion`,
and everything correctly omitted when the caller does not track a revision) plus one test each in
`bridge-http.test.ts`/`bridge-persistence.test.ts`. No new dependencies. See ADR 0022.

## P3-11 — POC: Analyze the Phoenix Repository

**Status: Complete.**

Every test up to this point ran the pipeline against a small, hand-built fixture — purpose-shaped to
exercise one behavior at a time. P3-11 is the first time the real git connector (P3-02) and the whole
Java extraction family (P3-03 through P3-10) run against a real, un-curated repository neither wrote:
`packages/extraction-engine/samples/analyze-phoenix-repo.ts` points them at Phoenix.ai-1 itself — this
project's own working tree — and reports what it finds. Not a formal ADR (no new design decision is
made here; nothing in `src/` changes), but a genuinely executed POC with real output, matching the
`samples/` convention `packages/knowledge-graph/samples/generate-sample.ts` already established.

**What it actually found**, running against this repository's own real HEAD
(`f57198d6d21f5903d5110f4f55c77bdb04eea683`, 342 tracked files after excluding `node_modules`/`.git`/
build output): 0 `.java` files, 0 Maven/Gradle build files, and therefore an empty extraction result
across every category (structural facts, call graph, controllers, entities, config). This is the
CORRECT and expected finding, not a failure — Phoenix.ai-1 is a TypeScript/Node monorepo with no Java
source, and an empty result is exactly what proves the pipeline does not fabricate facts out of
content it was never designed to understand. What the run DID prove, positively: the git connector
opens and lists a real 342-file repository correctly (the file-extension breakdown matches this
project's real composition — 192 `.ts`, 58 `.md`, 36 `.json`, 29 `.tsx`, ...); the whole pipeline runs
to completion with zero crashes and zero parse failures; and the resulting (empty-but-real) bundle
validates against the REAL `validateCanonicalKnowledgeBundle`/`validateSourceReferences`, and the REAL
generated OKF YAML round-trips through the REAL `parseAndValidateOkfYaml` — every validation in the
script's final report ran against actual code, not a fixture standing in for it.

Run it yourself: `pnpm --filter @phoenix-ai/extraction-engine poc:analyze-phoenix`. Full output:
`packages/extraction-engine/samples/phoenix-repo-analysis-report.md`. New devDependency: `tsx`
(matching `packages/knowledge-graph`'s own `samples/` script runner).

### Positive-path POC: spring-petclinic

The Phoenix-repo run above proved the pipeline's negative/null path (no Java, therefore correctly
empty output) — it could not prove the Java-specific extraction logic (P3-04 through P3-08) against
real, un-curated Spring/JPA code, since Phoenix.ai-1 has none. **This gap is now closed.**

`packages/extraction-engine/samples/analyze-spring-petclinic.ts` runs the identical pipeline against
[spring-projects/spring-petclinic](https://github.com/spring-projects/spring-petclinic) — the Spring
team's own official reference sample application, real and uncurated by Phoenix, pinned to revision
`88e37c15cf6fc8490b01bc3e8e2c800cec1ac272`. Unlike the Phoenix-repo run (`kind: 'local-directory'`),
this uses `kind: 'git'` with a real `https://` remote locator, so it is also the first real exercise
of the connector's remote-clone path (shallow clone to a temp directory, cleaned up on `close`).

**What it actually found**: 130 tracked files, 49 real `.java` files, 2 build modules (the repository
ships both `build.gradle` and `pom.xml`), 30 files parsed with zero parse failures, 25 types, 87
methods, 209 call-graph edges, 193 type-dependency edges, **6 real Spring MVC controllers with 17
real REST routes** (e.g. `GET /owners/{ownerId}/edit`, `POST /owners/{ownerId}/pets/new`), **6 real
JPA entities** (`Owner`, `Pet`, `PetType`, `Visit`, `Specialty`, `Vet`) with real `@OneToMany`/
`@ManyToOne`/`@ManyToMany` associations, **3 real Spring Data repositories**, and 22 real
`application.properties`/profile config keys (password values correctly redacted in the report).
12 objects (6 `ApiObject` + 6 `EntityObject`) bridged; the resulting bundle validates against the
real `validateCanonicalKnowledgeBundle`/`validateSourceReferences`, and the generated 405-line OKF
YAML round-trips through the real `parseAndValidateOkfYaml`.

**A genuine, honestly-reported limitation this real-world run surfaced** (not a runtime defect —
nothing crashed, nothing was fabricated): every entity reports `idFields: []`. petclinic's entities
inherit their `@Id`-annotated `id` field from a common `BaseEntity` superclass rather than declaring
it directly; P3-05's ADR 0017 already documents that this family does no classpath/inheritance
resolution ("no classpath or symbol table"), so an inherited annotation on a field this pass never
sees is correctly invisible to it. A second, minor observation: because petclinic's root directory
contains both `build.gradle` and `pom.xml`, the Gradle module claims every source file under P3-03's
nearest-ancestor rule, leaving the Maven module's file counts at zero — a deterministic, non-crashing
resolution of a genuinely ambiguous dual-build-system layout the ticket never anticipated needing to
disambiguate. Neither is a defect in the P3-01–P3-10 implementation; both are exactly the kind of
real-world edge case a fixture-only test suite cannot surface, which is the whole point of this step.

Reproduce it yourself: `pnpm --filter @phoenix-ai/extraction-engine poc:analyze-spring-petclinic`
(requires network access and `git` on `PATH`). Full narrative report:
`packages/extraction-engine/samples/spring-petclinic-analysis-report.md`. Full generated OKF
document: `packages/extraction-engine/samples/spring-petclinic.okf.yaml`. No dependency, interface,
or `src/` change was needed to run this — the connector and extraction pipeline used are byte-for-byte
what P3-01 through P3-10 already shipped.

## Remaining Phase 3 work

Not started:

- Connectors for the other source kinds in this package's remit (documentation, project/issue
  systems, log stores, gateways) — each adds its own descriptor narrowing; the `SourceConnector`
  interface does not change.
- Extraction for any language other than Java.
- JAX-RS, MyBatis, and raw SQL migration (Flyway/Liquibase) support within the Java extraction
  engine.
- Cross-object relationship bridging (e.g. Controller "handles" Entity) — `JavaExtractionResult.
relationships` is always empty across the whole family; correctly constructing one requires
  resolving exactly the call/type graph P3-05 documents as deliberately shallow.
- `packages/inference-engine` turning this family's raw facts (call graph, type-dependency graph,
  repositories, configuration) into semantic interpretation (bounded contexts, Component boundaries)
  — explicitly out of scope for deterministic extraction (FR-SEM-01).
- Reconciling the P2-11 sample's three non-conforming `Source` ids with `SOURCE_LOCATOR_PATTERN`.
- The Deployment/NFR and Review/Gap/Drift `kind` vocabularies
  ([`docs/okf/ui-validation.md`](../okf/ui-validation.md) recommendations 1–3) — still open, and
  still blocking any connector that targets those UI areas.

## Phase 1 and Phase 2 status

Unaffected. Phase 1 (P1-01 through P1-12) is closed — see [`docs/phase-1/README.md`](../phase-1/README.md).
Phase 2 (P2-01 through P2-12) is closed — see [`docs/phase-2/README.md`](../phase-2/README.md).
P3-01 through P3-11 added new package content and documentation only; all 264
`packages/knowledge-graph` tests pass unmodified, and `git status` confirms no changes to `apps/api`,
`apps/web`, or `packages/shared`.
