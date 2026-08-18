# ADR 0013: Common source connector contract (P3-01)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Owners:** Platform maintainers

## Context

Phase 2 (P2-01 through P2-12) finished the canonical knowledge model, all four domain ontologies,
the three cross-cutting metadata models, and the OKF YAML serialization — and every one of those
tickets explicitly deferred connectors. `docs/okf/README.md` describes OKF as "the contract Phase 3
repository/documentation/ticket connectors will target"; `docs/okf/ui-validation.md` §"Phase 3
dependencies" confirms nothing about Areas 1–4 blocks a repository connector today.

P3-01 is the first Phase 3 ticket: the contract every source connector implements, before any real
connector exists. It is a type-and-semantics exercise, the same shape as P2-01 through P2-10.

What existed beforehand:

- `packages/ingestion-connectors` — a scaffold with `MODULE_NAME`/`placeholder()` and nothing else,
  whose README already stated the remit: "Connects to artifact sources (repos, wikis, ticketing, log
  stores, gateways) and normalises them into a common intermediate representation (CIR)."
- `Source`/`validateSourceReferences` (P2-07) — a resolvable registry of origin artifacts, with a
  documented target shape for "a future extraction source (repository scanner, documentation
  indexer, ticket-system connector, …)" and nothing populating it.
- `Evidence` with `capturedAt`/`sourceVersion` (P2-09) — the per-claim supporting material, likewise
  unpopulated.
- A locator convention used consistently by Phase 1 fixtures and the P2-11 sample OKF
  (`repo://aurora-commerce/services/checkout`, `data-model://aurora-schema.sql`) but written by
  hand, never validated, and nowhere defined.

## Decision

1. **A connector emits raw artifacts, never `CanonicalKnowledgeObject`s.** This is the load-bearing
   decision. `RawArtifact` (`artifact.ts`) is the common intermediate representation the package
   README has named since the scaffold: path, content, encoding, optional hash/media type/size/mtime,
   plus the four fields that make it traceable (`sourceId`, `locator`, `revision`, `capturedAt`).
   Deciding that a file describes an `architecture.container` requires parsing and inference, which
   is `packages/extraction-engine`'s and `packages/inference-engine`'s job. Had the contract returned
   canonical objects, every connector would have to embed extraction logic and the pipeline layering
   would collapse into it.

2. **One generic `SourceConnector`, with the repository as its first descriptor narrowing.** The
   ticket asked for a repository contract; scoping the interface to git alone would mean breaking it
   for every connector the package's own remit already lists (wikis, ticketing, log stores,
   gateways). Only the _coordinates_ are repository-specific, so only they are narrowed:
   `SourceDescriptor` is generic, `SourceRepositoryDescriptor` adds `repository: RepositoryCoordinates`
   (`kind`/`branch`/`revision`/`subpaths`), and `SourceConnector<TDescriptor>` is parameterized over
   the descriptor it accepts while `supports()` still takes the generic type — a registry has to ask
   "can you handle this?" about a descriptor whose specific type it does not yet know.

3. **`SourceDescriptor` and `Source` (P2-07) are two types with a one-way bridge, not one type.** A
   descriptor carries things a knowledge bundle must never contain (a credential reference, a
   filter, a branch still to be resolved); a `Source` carries a resolved `version` a descriptor may
   not know yet. `descriptorToSource` is the only way to cross, so no connector hand-assembles a
   `Source` and `credential`/`filter` cannot leak into a bundle that gets serialized to OKF YAML.
   Critically, **no new identifier space**: `SourceDescriptor.id` _is_ `Source.id` _is_
   `Provenance.sourceId` _is_ `Evidence.sourceId`. `artifactToEvidence` is the matching bridge on the
   output side, filling only what a connector legitimately knows and leaving `excerpt` to the caller
   (choosing relevant lines is an extraction judgement; a whole file is not an excerpt).

4. **The lifecycle is `open → list → read → close`, not a single `ingest()` call.** `open`
   authenticates and resolves a revision once instead of per artifact, and rejects a descriptor the
   connector cannot honour. `list` returns an `AsyncIterable<ArtifactRef>` so a large source streams
   rather than materializing every path. `read` is separate from `list` so a caller can skip an
   artifact by path, size, or mtime without paying to read its content. `close` releases what `open`
   acquired, and is idempotent. `withConnectorSession` wraps the pair in a `try/finally` so a
   hand-written one at every call site is not a leak waiting to happen.

5. **Filter semantics are defined centrally, not per connector.** `matchesArtifactFilter`
   (`filter.ts`) is the single implementation of what `includePaths`/`excludePaths`/`maxSizeBytes`/
   `changedSince` mean. Left to each connector, the same descriptor would silently select different
   artifact sets under different connectors. Two documented glob rules: `*`/`?` stay within a
   segment and `**` spans segments (standard); and a **wildcard-free** pattern that matches an
   ancestor directory also matches everything beneath it, so `excludePaths: ['node_modules']` does
   what every caller expects instead of being a silent no-op. Restricting the second rule to literal
   patterns is what keeps "direct children only" (`services/*`) expressible.
   `ConnectorCapabilities.subtreeFiltering: false` means the filter cannot be _pushed down_ to the
   source for efficiency — never that it may be ignored.

6. **Capabilities are declared, and a declaration is a promise.** Sources differ irreducibly: git can
   pin an immutable revision, a wiki usually cannot; a repository has content digests, a live
   configuration endpoint may not. A connector declaring `revisionPinning: false` must _reject_ a
   descriptor that pins a revision rather than silently reading the tip — otherwise the provenance it
   produces would name a revision the artifacts did not come from, which is exactly the failure
   P2-07's `Source.version` exists to prevent.

7. **Per-artifact problems are data; source-level problems are exceptions.** `read` returns a
   discriminated `ArtifactReadResult` (`ok: true` with the artifact, or `ok: false` with a closed-
   vocabulary `ArtifactFailure`), matching this project's existing non-throwing `ValidationResult`
   convention: one unreadable file in a 40,000-file repository must not abort a run, and the caller
   needs the failure as data so it can be surfaced as a coverage gap rather than swallowed.
   `ArtifactCollection.failures` is always present (possibly empty) so a partially-failed run cannot
   be mistaken for a complete one. `open`, by contrast, throws — a source that cannot be opened at
   all is a run-level failure, not a per-artifact one.

8. **A credential is referenced, never carried.** `CredentialReference` is `{ scheme, ref }` where
   `ref` names an environment variable or secret-store key. Validation additionally rejects
   `token`/`accessToken`/`password`/`passphrase`/`secret`/`apiKey`/`privateKey`/`credentials` as keys
   at any depth of a descriptor, because descriptors get logged, cached, and echoed in run summaries
   — a pasted token in one is a real leak. Resolving a `ref` into an actual credential is out of
   scope here and belongs behind `packages/redaction-hardening`'s trust boundary. This is a
   structural guard, not a secret scanner: it cannot catch a secret stored under an innocent key, and
   a test asserts that limitation rather than leaving it implied.

9. **The locator convention is validated, not merely conventional.** `SOURCE_LOCATOR_PATTERN`
   (`<scheme>://<rest>`) is the shape Phase 1's fixtures and the P2-11 sample already use, and
   `buildArtifactLocator` normalizes the descriptor-plus-path join so a trailing slash cannot change
   the output — OKF serialization is required to be deterministic (P2-10), which means locators
   cannot vary with how a caller typed a descriptor.

10. **Built in `packages/ingestion-connectors`, extending the existing scaffold.** Same call ADR 0003
    made for `packages/knowledge-graph`: the placeholder package for this exact module already
    existed, and P2-01's precedent (replace `MODULE_NAME`/`placeholder()`, rewrite `index.test.ts` to
    cover the real entry point) is followed exactly. The package gains a dependency on
    `@phoenix-ai/knowledge-graph` — the direction the pipeline already flows, and no cycle, since
    `knowledge-graph` does not depend on this package. `ValidationResult`/`isNonEmptyString`/
    `isIsoTimestamp`/`isPlainObject` are reused from there rather than redefined, the same way every
    P2-03-onward domain file reuses them.

11. **An in-memory reference connector, clearly labelled as one.** A connector interface nothing
    implements is a guess. `createInMemoryRepositoryConnector` is the smallest complete implementation
    — lifecycle, filtering, revision pinning, content hashing, partial failure — and doubles as the
    test double `extraction-engine`/`orchestration` will need. It performs no filesystem, network, or
    git access, reading only the artifacts handed to it as options. `node:crypto` is used for real
    sha256 hashing rather than inventing a digest; `@types/node` (already in the monorepo's resolved
    dependency graph via `packages/shared`) is the only new devDependency.

## Testing

`packages/ingestion-connectors/tests/` (119 tests across 5 files), grounded in real Phase 1 data
wherever it exists — the Aurora `ctr-checkout` container and the actual registered `Source` ids from
`packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml`
(`repo://aurora-commerce/services/checkout`, `.../services/payments-adapter`), not invented ones:

- **`filter.test.ts` (30)** — both glob rules, including the sibling-prefix case
  (`services/checkout` must not catch `services/checkout-legacy`), the wildcard restriction on the
  ancestor rule, glob-not-regex escaping, exclusion beating inclusion, and the two "absence is not
  evidence" cases (unknown size under `maxSizeBytes`, unknown mtime under `changedSince`).
- **`descriptor.test.ts` (31)** — every locator scheme the fixtures use, credential-scheme rules,
  inline-secret rejection at top level and nested, and `descriptorToSource` proven against the real
  `validateSource`/`validateSources` (resolved revision wins over declared; `version` omitted rather
  than faked; `credential`/`filter` provably absent from the result).
- **`artifact.test.ts` (24)** — path normalization rules (absolute, backslash, `..`), empty content
  accepted as real content, base64 for binary, and `artifactToEvidence` proven to carry exactly the
  fields a connector knows.
- **`connector.test.ts` (30)** — the reference connector driven end to end: lifecycle and
  post-`close` behaviour, `withConnectorSession` closing on a thrown body, descriptor/per-call
  filters composing, `repository.subpaths`, an incremental scan, deterministic hashing, all three
  failure paths, and **the seam that matters**: connector output assembled into a bundle that passes
  the real `validateContainerObject`, `validateCanonicalKnowledgeBundle`,
  `validateSourceReferences`, and `validateOkfDocument`, and round-trips through
  `serializeOkfYaml`/`parseAndValidateOkfYaml` — plus the negative case, where a mismatched source
  registry is caught rather than silently accepted.
- **`index.test.ts` (4)** — the public entry point re-exports each part of the contract.

All 264 previously-passing `packages/knowledge-graph` tests still pass unmodified; nothing in Phase 1
or Phase 2 was changed.

## Consequences

There is now one interface to implement per source kind, and a connector that implements it produces
output that plugs into the canonical model's provenance and evidence machinery with no hand-assembly
and no second identifier space. A real git connector (P3-02 onward) replaces the reference
connector's option-supplied artifacts with a checkout and its `sha256` with git's own object ids;
nothing else about the shape changes. `extraction-engine` can be built and tested against
`RawArtifact` before any real connector exists, using the in-memory reference connector as its
fixture.

The corresponding cost: `packages/ingestion-connectors` now depends on
`@phoenix-ai/knowledge-graph`, so a change to `Source`/`Evidence`/`ValidationResult` is a change
this package must follow. That is the correct coupling — the two bridges are the whole point of the
contract — but it is a coupling that did not exist before.

## Limitations

- **No real connector exists.** No git, no filesystem walking, no HTTP, no wiki/ticket/log-store/
  gateway client, no language parsing, no credential resolution, and no ingestion scheduling or run
  orchestration.
- **`SourceDescriptor` has no `systemId`.** A repository is a repository regardless of which analyzed
  system it feeds, and `identity.systemId` is assigned when raw artifacts become canonical objects.
  If a future run-orchestration concept needs to bind a source set to a system, that belongs in
  `packages/orchestration`, not on the descriptor.
- **The P2-11 sample contains three `Source` ids that this contract's locator rule would reject** —
  `docs/architecture-2024.pdf`, `docs/personas.md`, and (as an id, though not as a scheme)
  bare-path forms. A pre-existing inconsistency in hand-authored sample data, asserted in
  `descriptor.test.ts` rather than papered over. Reconciling it is a follow-up ticket: either the
  sample gains `doc://` locators or `Source.id` is formally decoupled from the locator shape.
- **`ArtifactContentHash.algorithm` and `RepositoryCoordinates.revision` are free-text**, for the
  same reason `Source.version` is (ADR 0009 decision 3): no real connector has been implemented yet
  to know which digest and revision formats matter.
- **No streaming for a single large artifact.** `RawArtifact.content` is a whole string, so an
  artifact must fit in memory one at a time. `maxSizeBytes` plus a `too-large` failure is the
  mitigation; a chunked/streamed read is a future extension if a real source needs it.
- **`selectConnector` is first-match, not best-match**, and deliberately not a registry — with no
  scoring concept in the contract, "best" would be undefined. Precedence rules belong to
  `packages/orchestration`.

## Alternatives considered

- **Return `CanonicalKnowledgeObject`s (or a whole `OkfDocument`) from a connector** — rejected, see
  decision 1. It reads as convenient (one call, canonical output) but forces parsing and inference
  into every connector, and would make `extraction-engine`'s existence pointless.
- **A git-only `RepositoryConnector` interface with no generic base** — rejected, see decision 2.
  Generalising later would break the interface every connector already implements, and the
  repository-specific surface turns out to be one field (`repository`).
- **One `SourceDescriptor` type that doubles as the `Source` record** — rejected: it would put a
  credential reference and a filter inside a type destined for OKF YAML output, and would force a
  descriptor to carry a resolved revision it cannot know before `open`.
- **A single `ingest(descriptor): Promise<RawArtifact[]>` call** — rejected: it makes skipping an
  artifact without reading it impossible, forces the whole source into memory, and gives
  authentication/revision resolution no place to happen once.
- **Throwing on an unreadable artifact** — rejected, see decision 7. It makes a 40,000-file run
  abort on one permission error and discards exactly the coverage information gap analysis needs.
- **Per-connector filter semantics** (each connector interpreting `includePaths` its own way) —
  rejected, see decision 5. A shared contract whose central parameter means different things per
  implementation is not a contract.
- **Strict glob semantics with no ancestor-directory rule** — rejected: it is more "correct" and makes
  `excludePaths: ['node_modules']` a silent no-op, which is a worse outcome than a documented,
  tested extra rule.
- **A `credential` field holding the secret, with redaction on the way out** — rejected: the secret
  would exist in memory in a routinely-logged structure, and redaction-on-output is a mitigation for
  a problem the contract can simply refuse to have.
- **`contentHash` required on every artifact** — rejected: a `local-directory` connector may
  legitimately have no digest, and a required field would be met by inventing one. Optional plus a
  `contentHashing` capability flag states the truth.
