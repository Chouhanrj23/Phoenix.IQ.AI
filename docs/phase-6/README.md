# Phoenix Phase 6 — Connector Framework Hardening & New Evidence Sources

Living status record for Phase 6. Mirrors the convention established in
[`docs/phase-3/README.md`](../phase-3/README.md), [`docs/phase-4/README.md`](../phase-4/README.md), and
[`docs/phase-5/README.md`](../phase-5/README.md).

Phase 5 (P5-01 through P5-10, plus its corrective fixes) is complete and accepted. Phase 6 returns to
`packages/ingestion-connectors` — untouched since Phase 3 — to close gaps ADR 0013/ADR 0014 identified
and deliberately deferred (P6-01), then build on the hardened framework to connect a real second
evidence source (P6-02), represent what it produces in the common model (P6-04), and reconcile it
against other sources when they disagree (P6-05).

## P6-0X ticket status

| Ticket | Objective                                                    | Status                                                                                                                                                                                       |
| ------ | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6-01  | Harden the connector abstraction for multiple source layouts | **Complete.** `ConnectorRegistry` (`registry.ts`) and `SourceDocumentSpaceDescriptor`/`createInMemoryDocumentSpaceConnector` (`descriptor.ts`, `document-space-connector.ts`). See ADR 0026. |
| P6-02  | Jira connector — a second real evidence source               | **Complete.** `SourceTicketTrackerDescriptor`/`createJiraConnector` (`descriptor.ts`, `jira-connector.ts`, `jira-client.ts`, `adf.ts`). See ADR 0027.                                        |

## P6-01 — what changed and why

Full rationale: [ADR 0026](../architecture/adr/0026-p6-01-connector-framework-hardening.md). In brief,
two additions to `packages/ingestion-connectors`:

1. **`ConnectorRegistry`.** ADR 0013 shipped `selectConnector` as deliberately minimal first-match
   selection over a plain array, correct with exactly one connector in existence. `createConnectorRegistry`
   now rejects a duplicate connector `id` at construction and an ambiguous descriptor match at
   resolution, instead of resolving either silently by registration order — the failure mode that
   becomes real once more than one connector is registered.
2. **`SourceDocumentSpaceDescriptor` + `createInMemoryDocumentSpaceConnector`.** The second
   source-specific descriptor narrowing (after `SourceRepositoryDescriptor`), proving the P3-01
   contract generalizes to a page-addressed source with no filesystem tree, with no change to
   `SourceConnector`/`ConnectorSession`/`ArtifactRef`/`RawArtifact`. It is also the first connector in
   the package to declare `capabilities.revisionPinning: false` and actually enforce ADR 0013 decision
   6's rejection rule at `open()` — a promise every prior connector documented but none implemented or
   tested.

Both are framework hardening, not a new real connector: no HTTP client, no real wiki/CMS backend, and
no `packages/orchestration` run-sequencing logic were built here. See ADR 0026 "Limitations" for the
full list of what remains deferred and why.

## P6-02 — what changed and why

Full rationale: [ADR 0027](../architecture/adr/0027-p6-02-jira-connector.md). In brief: Phoenix's
second REAL connector (after the git connector, P3-02) and its first for a non-repository source.

1. **`SourceTicketTrackerDescriptor`** — the third source-specific narrowing, for an issue tracker.
   Unlike the repository and document-space narrowings, it has NO `revision` field at all: an issue
   tracker's search API has no snapshot concept to expose, so a caller cannot even construct a
   descriptor asking for a pinned revision — a stronger guarantee than P6-01's runtime rejection.
2. **`createJiraConnector`** reads issues (as `RawArtifact`s, with the description rendered from
   Atlassian Document Format to plain text via the new `adf.ts`), project metadata
   (`ConnectorSession.sourceMetadata`), and issue-to-issue relationships (`issuelinks`/`parent`) —
   reported as RAW FACTS on `RawArtifact.attributes`, never as canonical relationships, keeping ADR
   0013 decision 1's boundary intact for a connector unlike any that came before it.
3. **`jira-client.ts`** is the one place in this package that resolves a credential into an actual
   `Authorization` header — a deliberate, documented departure from "Phoenix never handles a
   credential" (ADR 0014 decision 4), because unlike git, an HTTP API has no external authentication
   mechanism in this environment to delegate to. Scoped narrowly: only `credential.scheme:
'environment'` is resolved (reading `process.env`, never the descriptor itself), and
   `'secret-store'` is refused outright.
4. **Tests fake the HTTP transport**, the deliberate opposite of ADR 0014's "don't mock git" — that
   decision held because a real `git` binary and a network-free repository were both available in CI;
   neither a Jira instance nor real credentials are available here.

Not built here: real-instance validation (all tests fake the transport), comment/attachment/changelog
reading, a secret-store backend, or any turn of the raw issue-link facts into canonical
relationships (extraction's job, a future ticket). See ADR 0027 "Limitations" for the full list.
