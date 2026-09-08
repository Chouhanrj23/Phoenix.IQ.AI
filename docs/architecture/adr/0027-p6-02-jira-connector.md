# ADR 0027: Jira connector — a second evidence source (P6-02)

- **Status:** Accepted
- **Date:** 2026-09-08
- **Owners:** Platform maintainers

## Context

P6-01 (ADR 0026) hardened the connector framework for a world with several source layouts, and
proved the generic contract generalizes past a repository with `SourceDocumentSpaceDescriptor` — but
that narrowing's only implementation is `createInMemoryDocumentSpaceConnector`, a reference double
with no real backend. P6-02 is the next step: a REAL second connector, of P3-02's shape (the git
connector was the first), giving Phoenix an actual second evidence source and finally exercising an
issue tracker (`SourceType: 'ticket'`, defined since Phase 1 in `@phoenix-ai/shared` but never
produced by anything).

Jira is the target: connect to a Jira Cloud or Server/Data Center instance's REST API v3 and extract
issues (as `RawArtifact`s), their metadata (status, type, priority, labels — as
`RawArtifact.attributes`, and project identity as `ConnectorSession.sourceMetadata`), and their
relationships to other issues (`issuelinks`, `parent` — also as raw `attributes`, per decision 3
below).

Two things distinguish this connector from the git one and drove real design decisions rather than a
mechanical repeat of P3-02's shape:

1. **There is no git-equivalent credential delegate.** ADR 0014 decision 4 established "Phoenix never
   handles a credential" specifically because git has its own working authentication (a credential
   helper, an SSH agent) to hand the problem to. An HTTP REST API has nothing equivalent running in
   this environment.
2. **There is no git-equivalent local, real, network-free test target.** ADR 0014 decision 1 rejected
   mocking git specifically because a real `git` binary and a real temp-directory repository were
   available in CI with zero external dependency. No Jira instance is available here, and provisioning
   one (or real credentials) is out of scope for an automated test suite.

## Decision

1. **`SourceTicketTrackerDescriptor`/`TicketTrackerCoordinates`, the third source-specific narrowing**
   (`descriptor.ts`). Modelled after `RepositoryCoordinates` (`kind`/`baseUrl`/`projectKeys`/
   `issueTypes`/`jql`/`accountEmail`) but with NO `revision` field at all — unlike
   `DocumentSpaceCoordinates` (P6-01), which keeps one because some document-space backends genuinely
   support a snapshot. An issue tracker's search API has no snapshot concept to expose, so the field
   simply does not exist: a caller cannot even construct a descriptor asking for a pinned revision.
   That is a STRONGER form of ADR 0013 decision 6's guarantee than P6-01's runtime rejection in
   `document-space-connector.ts` — the violation is unrepresentable, not merely refused — and it is
   the honest choice precisely because, unlike a wiki export or a static-site build, nothing about a
   real Jira deployment would ever make `revisionPinning: true` true here.

2. **The connector resolves its own credential, `git-command.ts`'s precedent notwithstanding** —
   `jira-client.ts`'s `resolveAuthorization`. `credential.scheme: 'environment'` is resolved by
   reading `process.env[credential.ref]` directly (never a value embedded in the descriptor —
   `credential.ref` names the variable, ADR 0013 decision 8's structural guard against inline secrets
   is unaffected and still enforced by `validateSourceDescriptor`). `credential.scheme:
'secret-store'` is refused with a clear message: no secret-store backend is integrated anywhere in
   this repository, and accepting the scheme while silently not resolving it would be worse than
   refusing it outright. `credential.scheme: 'none'` sends no `Authorization` header at all (a
   legitimate configuration for a Jira instance behind network-level auth Phoenix does not need to
   layer on top of). This is a deliberate, documented departure from ADR 0014 decision 4, not an
   oversight: the reason that decision held for git — a real, working, external authentication
   mechanism to delegate to — does not exist for a bare HTTP API, and refusing to touch
   authentication at all would just make this connector unusable for its actual job.

3. **Basic auth (Jira Cloud) vs. bearer PAT (Jira Server/Data Center) are the SAME credential
   reference, distinguished only by `ticketTracker.accountEmail`.** Jira Cloud's API-token scheme
   needs an account email paired with the token (`Authorization: Basic base64(email:token)`); Jira
   Server/Data Center's personal-access-token scheme needs only the token
   (`Authorization: Bearer token`). `accountEmail` is not a secret (an email address paired with a
   token the caller already controls is not sensitive on its own), so it lives in
   `TicketTrackerCoordinates`, not behind a `CredentialReference` — the same "non-secret coordinate
   vs. referenced secret" split ADR 0013 already drew between `repository.branch` and
   `credential.ref`.

4. **Issues, metadata, and relationships stay separated exactly the way ADR 0013 decision 1 requires
   for every connector.** An issue becomes one `RawArtifact` (content: a normalized JSON
   representation of the issue — summary, a plain-text-rendered description, status, type, dates —
   never Jira's raw API payload verbatim, and never its Atlassian Document Format `description` blob
   unrendered). Per-issue metadata (status, issue type, priority, labels) and — critically —
   relationships (`issuelinks`, `parent`) land in `RawArtifact.attributes` as RAW FACTS, not as
   `CanonicalKnowledgeRelationship` objects. Turning `attributes.issueLinks`/`attributes.parentKey`
   into real graph edges is extraction's job (a future ticket), exactly as turning a file's imports
   into a `dependsOn` edge already is for the git connector's output. Project-level metadata (id, key,
   name for each configured project) lands on `ConnectorSession.sourceMetadata`, mirroring
   `GitRepositoryMetadata`.

5. **ADF is rendered to plain text, never serialized as a nested JSON tree into artifact content**
   (`adf.ts`). Jira's REST API v3 returns a description (and comment bodies, not yet read by this
   ticket) as Atlassian Document Format — a nested document structure, not plain text. Handing that
   tree to extraction as-is would make every future consumer re-implement the same flattening; a
   small, explicitly minimal renderer (paragraph/heading/text/hardBreak/lists/codeBlock/blockquote/
   rule) does it once, here. An unrecognised node type (ADF has many: tables, panels, mentions, media,
   emoji) renders its text-bearing children if any exist rather than aborting the whole render — the
   same "render what you understand, drop what you don't" stance `git-connector.ts` takes toward an
   unfamiliar git object type (a submodule commit entry is skipped, not fatal).

6. **`open()` resolves and validates every configured project up front, mirroring how `git-connector.ts`
   resolves a revision at `open()`.** `GET /rest/api/3/project/{key}` for each `projectKeys` entry both
   confirms the project exists and is reachable with the given credential (a bad token or a
   nonexistent project fails loudly at `open`, a source-level failure per ADR 0013 decision 7 — never
   silently at the first `list()`/`read()` call) and supplies the `sourceMetadata.projects` array.

7. **`list()` pages through `/search` lazily, genuinely streaming rather than materializing every
   issue up front** — unlike `git-connector.ts`, which reads a repository's whole tree metadata in one
   `ls-tree` call because git offers no cheaper alternative. Jira's search API IS paginated, so this
   connector's async generator fetches one page per iteration step, honouring ADR 0013 decision 4's
   "a large source streams rather than materializing every path in memory" more literally than the git
   connector's own implementation does. `read()` is a separate call per issue (`GET /issue/{key}`),
   the same list/read split for the same reason: a caller can skip an issue by its lightweight listing
   fields without paying for the full fetch.

8. **`ArtifactFilter.changedSince` is honoured locally via the existing shared `matchesArtifactFilter`,
   not pushed into JQL as an `updated >=` clause.** JQL's date-literal syntax has no reliable timezone-
   qualified form, and getting that wrong would silently mis-filter a differential scan — a worse
   failure than the modest efficiency this would have bought. `incrementalScan: true` is still honest:
   the capability promises `changedSince` is honoured at all, not that it is pushed to the source (git's
   own connector makes the identical choice — `changedSince` compares real dates locally, no separate
   git-side mechanism exists for it either).

9. **HTTP tests fake the transport layer, not the connector's logic — the deliberate opposite of ADR
   0014 decision 1's "don't mock git."** That decision held because a real `git` binary and a
   zero-network temp-directory repository were both available in CI. Neither exists for Jira here: no
   instance, no credentials, and a test suite that made real network calls would be flaky, slow, and
   unrunnable offline. `JiraConnectorOptions.fetchImpl` (and `JiraClientOptions.fetchImpl`) is
   injectable, defaulting to the global `fetch`; tests supply a fake implementing the narrow REST API
   v3 slice this connector actually calls (`/project/{key}`, `/search`, `/issue/{key}`), built from
   real, documented Jira response shapes rather than invented ad hoc ones, and constructed with the
   real global `Response`/`Headers`/`URL` so the client layer's own parsing is exercised faithfully.
   This is the standard, honest way to test an HTTP boundary — the mock is the transport, never the
   business logic on top of it.

10. **A JQL string is built from operator-authored configuration, treated at the same trust level as
    `repository.branch`, not as untrusted end-user input.** `projectKeys`/`issueTypes` are wrapped as
    escaped JQL string literals (`jqlQuote`, escaping `\` and `"`) so a stray character in a project
    key cannot break the query; `ticketTracker.jql` is a caller-supplied JQL FRAGMENT and is embedded
    parenthesized, unescaped, because it cannot be treated as a literal value — it is code, the same
    way `repository.branch` is trusted configuration rather than sanitized user input in the git
    connector. The worst case of a malicious `jql` fragment is scope-broadening within Jira's own
    permission model (still bounded by what the configured credential can actually see), not remote
    code execution — a materially different risk than git's argument-injection concern (ADR 0014
    decision 2), which is why this connector has no equivalent of `assertSafeRevision`.

## Testing

`packages/ingestion-connectors/tests/` — 271 tests across 12 files, 63 new over the 208 ADR 0026
baseline:

- **`adf.test.ts` (new, 11)** — every node type this renderer special-cases, a plain-string
  passthrough, an unrecognised node type's children still rendering, a childless leaf node producing
  nothing, and blank-line collapsing.
- **`jira-client.test.ts` (new, 14)** — request construction (URL, only-defined query params, the
  `Accept` header); every `resolveAuthorization` branch (`none` sends no header, `environment` builds
  Bearer or Basic depending on `accountEmail`, a missing env var throws naming the variable — never
  logging a value, `secret-store` is refused); and every `JiraApiError.reason` (`http-status`,
  `invalid-json`, `network`, `too-large`), including a token never appearing in a thrown message.
- **`jira-connector.test.ts` (new, 26)** — shape and capability honesty; `supports()`; `open()`
  resolving and recording project metadata and throwing for an unreachable project; lazy `/search`
  pagination (asserted by counting actual page-fetch calls, not just final output) and descriptor
  filtering; JQL construction from `projectKeys`/`issueTypes`/`jql`; `read()` producing a
  `validateRawArtifact`-passing artifact with a rendered ADF description AND a passed-through
  plain-text one (the older API shape); issue links and parent surfaced as `attributes`, never as
  relationships; assignee/reporter opt-in identical in spirit to the git connector's
  `includeAuthorMetadata`; deterministic hashing; `not-found`/`too-large` failures; lifecycle
  (idempotent close, post-close rejection); and an end-to-end `validateSourceReferences` check.
- **`descriptor.test.ts` (+13)** — `validateSourceTicketTrackerDescriptor` mirroring the existing
  repository/document-space coverage, plus the `descriptorToSource` case proving a ticket-tracker
  descriptor never fabricates a `version`.
- **`index.test.ts` (+1)** — the public entry point re-exports the new narrowing, the renderer, and
  the connector.

## Consequences

Phoenix has a second real evidence source, and — unlike P6-01's document-space narrowing — one with
an actual client behind it: an ingestion run can now pull issues, their status/type/priority/label
metadata, and their raw cross-issue links from a live Jira project, ready for a future
`extraction-engine` ticket to turn into canonical `domain`/`workflow`-shaped objects and
relationships. The credential-resolution precedent set here (`resolveAuthorization`, scoped to
`'environment'` only) is now the template for any future HTTP-based connector (a log store, a
gateway) that has the same "no external delegate" problem git did not have.

The corresponding cost: this package now reads `process.env` directly for the first time (previously
only `git-command.ts` touched environment variables, and only to sanitize what it passed to a
subprocess, never to resolve a secret's value into memory). That is a real, deliberate narrowing of
the "Phoenix never handles a credential" stance from ADR 0013 decision 8 / ADR 0014 decision 4 —
scoped to exactly one code path (`resolveAuthorization`), never logged, and never placed on a
descriptor or a `Source`/`Evidence` record.

## Limitations

- **No real Jira instance was tested against.** All tests fake the HTTP transport (decision 9); the
  connector has not been run against a live Jira Cloud or Server tenant. Real-world response shape
  drift (a field Jira adds, removes, or renames) is a risk this ticket accepts and does not mitigate
  beyond defensive parsing (`normalizeIssue` returns `undefined` — an `unreadable` failure — rather
  than throwing, on an unrecognised issue shape).
- **Comments are not read.** Only `fields.description` is rendered through `adf.ts`; issue comments
  (also ADF, also reachable via `GET /issue/{key}/comment`) are a natural follow-on, not built here.
- **No changelog/history reading**, so an issue's PAST states are invisible — only its current
  snapshot. This is the concrete instance of decision 1's "no revision concept": Jira's changelog
  could theoretically be replayed to reconstruct one, at the cost of a call per issue this ticket does
  not make.
- **Only `credential.scheme: 'environment'` is resolvable.** `'secret-store'` remains refused
  (decision 2) until this repository integrates an actual secret-store backend — the same gap
  `git-command.ts` has for every non-`'none'` scheme, just with one scheme narrower.
- **JQL injection via `ticketTracker.jql` is bounded by Jira's own permission model, not prevented**
  (decision 10) — acceptable for operator-authored configuration, NOT for a deployment that lets an
  end user supply `jql` directly. A future multi-tenant use of this connector would need to add that
  boundary itself; it does not exist here.
- **No rate-limit-aware backoff.** A `429` is classified as `transport-error` (retryable, in the same
  sense the git connector's own `transport-error` is) but this connector performs no automatic retry
  or backoff — that remains `packages/orchestration`'s job, unbuilt, the same deferral ADR 0013
  already made for run-level policy.
- **Attachments are not read.** An issue's attached files are a distinct API surface
  (`fields.attachment`) this ticket does not touch.

## Alternatives considered

- **Delegate authentication to something external, matching git's precedent exactly** — rejected, see
  decision 2. No such delegate exists for a bare HTTP API in this environment; refusing to resolve any
  credential at all would make the connector unable to authenticate to anything but a fully
  anonymous-read Jira instance, which does not describe a realistic deployment.
- **Model Jira as a document-space descriptor** (`documentSpace.kind: 'jira'`) instead of a new
  narrowing — rejected: `DocumentSpaceCoordinates` is page/path-shaped (`pathPrefix`, `spaceId`) in a
  way an issue tracker, addressed by structured project/issue-type/JQL coordinates, is not; forcing it
  through would have proven nothing new and left `SourceType: 'ticket'` still unconnected to any
  narrowing that actually matches it.
- **Serialize Jira's raw API response verbatim as artifact content** — rejected, see decision 4/5. It
  would push ADF-flattening and field-shape knowledge onto every future consumer instead of doing it
  once, and would make `contentHash` sensitive to irrelevant response noise (field ordering, unused
  metadata Jira includes) rather than the facts this connector actually reports.
- **Turn `issuelinks`/`parent` into `CanonicalKnowledgeRelationship` objects directly in this
  connector** — rejected outright: ADR 0013 decision 1 draws the line at raw artifacts for every
  connector, and an issue tracker gets no exception. A raw fact in `attributes` is exactly what the git
  connector already does for `attributes.lastCommitRevision`.
- **Mock the Jira client with a hand-rolled interface instead of faking `fetch` itself** — rejected:
  faking the actual transport function exercises `jira-client.ts`'s real header-building, URL
  construction, status handling, and JSON parsing; a higher-level mock would only prove the connector
  calls its own abstraction correctly, which is not in doubt.
- **Push `changedSince` into JQL as `updated >= "..."`** — rejected, see decision 8. JQL's date-literal
  timezone handling is genuinely ambiguous across Jira deployments, and a silent off-by-timezone
  filtering bug is a worse outcome than the (already correct, already tested) local application via
  `matchesArtifactFilter`.
