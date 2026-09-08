# @phoenix-ai/ingestion-connectors

**Module:** Ingestion & Connector Layer
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Ingestion & Connector Layer"

## Responsibility

Connects to artifact sources (repos, wikis, ticketing, log stores, gateways) and normalises them into
a common intermediate representation (CIR).

## Status — Phase 3 (Source Connectors) + Phase 6 (framework hardening + Jira)

`src/` defines the **common connector contract** (P3-01) — one interface every source connector
implements, so `packages/orchestration` can drive a repository, a documentation space, or a ticket
system through identical code — plus two REAL connectors (**git**, P3-02, and **Jira**, P6-02) and
two in-memory reference implementations used as test doubles. **P6-01** hardened the framework for a
world with several connectors across several source layouts: a `ConnectorRegistry` that catches a
duplicate connector id or an ambiguous descriptor match instead of resolving either silently, and a
second descriptor narrowing (`SourceDocumentSpaceDescriptor`) proving the contract generalizes past a
repository. **P6-02** connected Phoenix to Jira as its second real evidence source, reading issues,
project metadata, and issue-to-issue relationships over the REST API v3.

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
- `SourceDocumentSpaceDescriptor`/`DocumentSpaceCoordinates` (`descriptor.ts`) and
  `createInMemoryDocumentSpaceConnector` (`document-space-connector.ts`) — P6-01's second
  source-specific narrowing, for a wiki or documentation site: page-addressed rather than
  filesystem-addressed, and — unlike every prior connector — defaults
  `capabilities.revisionPinning` to `false` and actually rejects a descriptor that pins a revision
  anyway, the first real implementation of ADR 0013 decision 6's rejection rule.
- `ConnectorRegistry`/`createConnectorRegistry` (`registry.ts`) — P6-01's hardened connector
  selection for a set of several connectors: rejects a duplicate connector `id` at construction and
  throws `AmbiguousConnectorError`/`NoMatchingConnectorError` at resolution, instead of the silent
  first-match array order `selectConnector` (still exported, for the single-connector case) uses.
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

Design rationale: `docs/architecture/adr/0013-source-connector-contract.md` (the contract),
`docs/architecture/adr/0014-git-repository-connector.md` (the git connector),
`docs/architecture/adr/0026-p6-01-connector-framework-hardening.md` (the registry and the
document-space narrowing), and `docs/architecture/adr/0027-p6-02-jira-connector.md` (the Jira
connector). Status tracker: `docs/phase-3/README.md` and `docs/phase-6/README.md`. The canonical
model and OKF schema this contract feeds: `packages/knowledge-graph/README.md` and
`docs/okf/README.md`.

**Prerequisites:** the git connector requires the `git` binary on `PATH` (`isGitAvailable()` probes
for it without throwing); the Jira connector requires network access to the configured
`ticketTracker.baseUrl` and, for anything but a fully anonymous-read instance, a `JIRA_...`-style
environment variable named by `credential.ref` holding an API token or personal access token.

Not yet implemented: a REAL connector for a wiki/CMS, a log store, or a gateway
(`createInMemoryDocumentSpaceConnector` is a reference double, not a client) and the `archive`
repository kind; any language parsing or extraction (including turning a Jira issue's raw
`attributes.issueLinks`/`attributes.parentKey` into canonical relationships); a secret-store
credential backend (`credential.scheme: 'secret-store'` is refused everywhere in this package);
submodule traversal and Git LFS object resolution; Jira comments, attachments, and changelog/history
reading; ingestion scheduling or run orchestration; precedence/fallback policy across connectors
(`ConnectorRegistry` catches a malformed connector SET — a duplicate id or a genuine `supports()`
ambiguity — not run-level retry or degraded-source fallback, which stays `packages/orchestration`'s
job); and chunked/streamed reads of a single large artifact. See ADR 0013, ADR 0014, ADR 0026, and
ADR 0027 "Limitations" for the full list and why each is deferred.
