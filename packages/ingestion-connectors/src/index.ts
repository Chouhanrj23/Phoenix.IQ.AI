/**
 * @phoenix-ai/ingestion-connectors
 * Module: Ingestion & Connector Layer
 *
 * P3-01: the common connector contract -- one interface every source
 * connector implements, so the orchestration layer drives a repository, a
 * documentation space, or a ticket system through identical code, and every
 * connector's output plugs into the canonical model's provenance/evidence
 * machinery (P2-07/P2-09) without hand-assembly.
 *
 *   - `filter.ts` -- `ArtifactFilter` and the ONE shared implementation of
 *     its semantics (`matchesArtifactFilter`), so the same descriptor selects
 *     the same artifacts under every connector.
 *   - `descriptor.ts` -- `SourceDescriptor` (the generic ingestion request),
 *     `SourceRepositoryDescriptor` (the only source-specific narrowing P3-01
 *     defines), `CredentialReference` (a reference, never a secret), and
 *     `descriptorToSource` -- the one-way bridge to P2-07's `Source`.
 *   - `artifact.ts` -- `ArtifactRef`/`RawArtifact` (the common intermediate
 *     representation), the non-throwing `ArtifactReadResult`/`ArtifactFailure`
 *     partial-failure model, and `artifactToEvidence` -- the bridge to P2-09's
 *     `Evidence`.
 *   - `connector.ts` -- `SourceConnector`/`ConnectorSession`/
 *     `ConnectorCapabilities`, the `open -> list -> read -> close` lifecycle,
 *     plus `collectArtifacts`/`withConnectorSession`/`selectConnector`.
 *   - `reference-connector.ts` -- an in-memory reference implementation of the
 *     REPOSITORY narrowing, proving the contract is implementable and usable
 *     as a test double. It touches no filesystem, network, or git.
 *   - `document-space-connector.ts` -- P6-01's second source-specific
 *     narrowing (`SourceDocumentSpaceDescriptor`) plus its in-memory
 *     reference implementation, proving the contract generalizes past a
 *     repository without the `SourceConnector` interface changing.
 *   - `registry.ts` -- P6-01's `ConnectorRegistry`, for selecting the right
 *     connector once several are registered across several source layouts:
 *     rejects a duplicate connector `id` at construction and an ambiguous
 *     descriptor match at resolution, instead of resolving either silently by
 *     array order the way the plain `selectConnector` helper does.
 *
 * The boundary this contract draws (ADR 0013 decision 1): a connector emits
 * RAW ARTIFACTS plus the metadata needed to trace them. Turning a file into
 * an `architecture.container` is `extraction-engine`'s/`inference-engine`'s
 * job, and serializing the result is `okf.ts`'s (P2-10).
 *
 * Deliberately NOT implemented here: a real connector for a wiki/CMS, a log
 * store, or a gateway; any language parsing or extraction (including of a
 * Jira issue's raw fields into canonical relationships); a secret-store
 * credential backend; and ingestion scheduling or run orchestration. See
 * `docs/architecture/adr/0013-source-connector-contract.md`,
 * `docs/architecture/adr/0026-p6-01-connector-framework-hardening.md`,
 * `docs/architecture/adr/0027-p6-02-jira-connector.md`, and
 * `docs/phase-3/README.md`.
 */

export * from './filter.js';
export * from './descriptor.js';
export * from './artifact.js';
export * from './connector.js';
export * from './reference-connector.js';
export * from './document-space-connector.js';
export * from './registry.js';
export * from './git-command.js';
export * from './git-connector.js';
