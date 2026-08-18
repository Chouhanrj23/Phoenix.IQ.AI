# @phoenix-ai/ingestion-connectors

**Module:** Ingestion & Connector Layer
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Ingestion & Connector Layer"

## Responsibility

Connects to artifact sources (repos, wikis, ticketing, log stores, gateways) and normalises them into
a common intermediate representation (CIR).

## Status — Phase 3 (Source Connectors)

`src/` defines the **common connector contract** (P3-01) — one interface every source connector
implements, so `packages/orchestration` can drive a repository, a documentation space, or a ticket
system through identical code — plus the **git repository connector** (P3-02), the first real
connector, and an in-memory reference implementation used as a test double.

- `ArtifactFilter`/`matchesArtifactFilter`/`matchesPathPattern` (`filter.ts`) — the ONE shared
  implementation of what `includePaths`/`excludePaths`/`maxSizeBytes`/`changedSince` mean, so the
  same descriptor selects the same artifacts under every connector. `*`/`?` stay within a path
  segment, `**` spans segments, and a wildcard-free pattern also matches everything beneath the
  directory it names (so `excludePaths: ['node_modules']` is not a silent no-op).
- `SourceDescriptor`/`SourceRepositoryDescriptor`/`RepositoryCoordinates`/`CredentialReference`
  (`descriptor.ts`) — the ingestion request. Generic by default; the repository is the only
  source-specific narrowing P3-01 defines. `descriptorToSource` is the one-way bridge to P2-07's
  `Source`, and `buildArtifactLocator`/`SOURCE_LOCATOR_PATTERN` make the `<scheme>://<rest>` locator
  convention Phase 1's fixtures already use a validated, deterministic rule.
- `ArtifactRef`/`RawArtifact`/`ArtifactReadResult`/`ArtifactFailure` (`artifact.ts`) — the CIR, and a
  non-throwing partial-failure model: one unreadable file must not abort a 40,000-file run, and the
  failure must survive as data so it can be reported as a coverage gap. `artifactToEvidence` is the
  bridge to P2-09's `Evidence`.
- `SourceConnector`/`ConnectorSession`/`ConnectorCapabilities` (`connector.ts`) — the
  `open → list → read → close` lifecycle, plus `collectArtifacts`, `withConnectorSession`,
  `selectConnector`, and `validateSourceConnector`. Capabilities are declared, and a declaration is a
  promise: a connector that cannot pin a revision must reject a descriptor that asks for one rather
  than silently reading the tip.
- `createInMemoryRepositoryConnector` (`reference-connector.ts`) — a reference implementation and test
  double. **Not a real connector**: no filesystem, network, or git access; it reads only the artifacts
  handed to it as options.
- `createGitRepositoryConnector` (`git-connector.ts`) — **the real git connector** (P3-02), reading
  repository metadata, revisions, and source files from a local checkout or a remote clone. The
  revision is resolved to an immutable SHA once at `open` and every read is addressed against it;
  files come from `git ls-tree`/`git cat-file` on the tree AT that revision, so uncommitted edits and
  untracked files are invisible by construction and a scan is reproducible from the SHA alone.
  `contentHash` is git's own blob object id, verifiable with `git cat-file` outside Phoenix.
  Repository metadata arrives on `ConnectorSession.sourceMetadata`; commit author identity is opt-in,
  because it is personal data and this package sits upstream of `packages/redaction-hardening`.
- `runGit`/`GitCommandError`/`assertSafeRevision`/`isGitAvailable` (`git-command.ts`) — the safe git
  invocation layer. No shell, ever, and explicit rejection of option-shaped revisions and paths:
  `spawn` with an argv array removes command injection, but **argument** injection
  (`--upload-pack=<command>`) is the risk that actually applies to git.

**The boundary this contract draws:** a connector emits raw artifacts plus the metadata needed to
trace them. Turning a file into an `architecture.container` is `extraction-engine`'s and
`inference-engine`'s job; serializing the result is `knowledge-graph`'s `okf.ts` (P2-10).

```
source ──(this package)──> RawArtifact[] + Source ──(extraction/inference)──> canonical objects ──> OKF
```

Design rationale: `docs/architecture/adr/0013-source-connector-contract.md` (the contract) and
`docs/architecture/adr/0014-git-repository-connector.md` (the git connector). Status tracker:
`docs/phase-3/README.md`. The canonical model and OKF schema this contract feeds:
`packages/knowledge-graph/README.md` and `docs/okf/README.md`.

**Prerequisite:** the git connector requires the `git` binary on `PATH`. `isGitAvailable()` probes for
it without throwing.

Not yet implemented: connectors for the non-repository source kinds (HTTP, wiki, ticketing, log store,
gateway) and the `archive` repository kind; any language parsing or extraction; credential resolution
(the git connector rejects a non-`none` scheme — authenticate git itself via a credential helper or
SSH agent); submodule traversal and Git LFS object resolution; ingestion scheduling or run
orchestration; a connector registry with precedence rules; and chunked/streamed reads of a single
large artifact. See ADR 0013 and ADR 0014 "Limitations" for the full list and why each is deferred.
