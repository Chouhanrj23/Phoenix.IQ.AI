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
