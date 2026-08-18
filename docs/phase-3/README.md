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
and P3-05 in
[`docs/architecture/adr/0017-java-call-dependency-graph.md`](../architecture/adr/0017-java-call-dependency-graph.md);
this document is the narrative status record, not a duplicate of those ADRs.

P3-03 onward is a family of tickets, all in `packages/extraction-engine`, each adding one piece of
deterministic Java extraction on top of the last: P3-03 (source discovery) → P3-04 (structural facts)
→ P3-05 (call/dependency graph) → P3-06 (REST/API) → P3-07 (persistence) → P3-08 (configuration).
Each has its own ADR, its own commit, and its own section below.

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

## Remaining Phase 3 work

Not started:

- P3-06 (REST/API extraction), P3-07 (database interaction extraction), and P3-08 (configuration
  extraction) — the rest of the Java extraction family, each building on P3-05's call/dependency
  graph and P3-04's structural facts.
- Connectors for the other source kinds in this package's remit (documentation, project/issue
  systems, log stores, gateways) — each adds its own descriptor narrowing; the `SourceConnector`
  interface does not change.
- Extraction for any language other than Java.
- Reconciling the P2-11 sample's three non-conforming `Source` ids with `SOURCE_LOCATOR_PATTERN`.
- The Deployment/NFR and Review/Gap/Drift `kind` vocabularies
  ([`docs/okf/ui-validation.md`](../okf/ui-validation.md) recommendations 1–3) — still open, and
  still blocking any connector that targets those UI areas.

## Phase 1 and Phase 2 status

Unaffected. Phase 1 (P1-01 through P1-12) is closed — see [`docs/phase-1/README.md`](../phase-1/README.md).
Phase 2 (P2-01 through P2-12) is closed — see [`docs/phase-2/README.md`](../phase-2/README.md).
P3-01 through P3-05 added new package content and documentation only; all 264
`packages/knowledge-graph` tests pass unmodified, and `git status` confirms no changes to `apps/api`,
`apps/web`, or `packages/shared`.
