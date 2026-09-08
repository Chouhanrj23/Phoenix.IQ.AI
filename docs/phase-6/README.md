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

| Ticket | Objective                                                               | Status                                                                                                                                                                                                                                                                                          |
| ------ | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P6-01  | Harden the connector abstraction for multiple source layouts            | **Complete.** `ConnectorRegistry` (`registry.ts`) and `SourceDocumentSpaceDescriptor`/`createInMemoryDocumentSpaceConnector` (`descriptor.ts`, `document-space-connector.ts`). See ADR 0026.                                                                                                    |
| P6-02  | Jira connector — a second real evidence source                          | **Complete.** `SourceTicketTrackerDescriptor`/`createJiraConnector` (`descriptor.ts`, `jira-connector.ts`, `jira-client.ts`, `adf.ts`). See ADR 0027.                                                                                                                                           |
| P6-04  | OKF mapping — represent Jira-derived facts in the common model          | **Complete.** `WorkItemObject`/`WorkItemRelationship` (`packages/knowledge-graph/src/workitem.ts`) and `bridgeJiraArtifacts`/`buildJiraCanonicalBundle`/`mapJiraToOkfDocument`/`serializeJiraToOkfYaml` (`packages/extraction-engine/src/jira-bridge.ts`, `jira-okf-mapping.ts`). See ADR 0028. |
| P6-05  | Source-to-source reconciliation — compare claims, retain contradictions | **Complete.** `ConflictObject` (`packages/knowledge-graph/src/reconciliation.ts`) and `reconcileClaims`/`rankConflicts`/`boundCompositeConfidence` (`packages/reconciliation-engine/src/`). See ADR 0029.                                                                                       |
| P6-06  | Confidence calculation — from source agreement/corroboration            | **Complete.** `computeConfidence` (`packages/reconciliation-engine/src/confidence-scoring.ts`), extracted and generalized from P6-05's original agreement-only helper to also score each `ConflictObject` position. See ADR 0030.                                                               |

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

## P6-04 — what changed and why

Full rationale: [ADR 0028](../architecture/adr/0028-p6-04-jira-okf-mapping.md). This is the "future
extraction-engine ticket" ADR 0027's own Consequences section named — closing the gap between what
P6-02 observes and what the canonical model can represent.

1. **`packages/knowledge-graph/src/workitem.ts`** — the fifth domain-specific `kind` vocabulary
   (after Architecture, Domain/Entity, Persona/Journey/State, Integration/API), built the same way
   P2-03 through P2-06 were. ONE object kind, `workitem.issue`, deliberately covers every tracker
   issue type — a tracker's type taxonomy is project-configurable, so `attributes.issueType` carries
   the real string rather than becoming a separate `kind`. `contains`/`relatesTo` are REUSED from
   `domain.ts`, not newly minted, continuing the precedent already set by `contains` across three
   other domain files.
2. **`packages/extraction-engine/src/jira-bridge.ts`'s `bridgeJiraArtifacts`** — the deterministic
   facts-to-canonical mapping, following `bridge-http.ts`/`bridge-relationships.ts`'s exact
   discipline: only bridge what P6-02 already, directly observed. A relationship is only produced
   between two objects already bridged in the same batch. `identity.createdAt`/`updatedAt` are always
   "when Phoenix captured this" (`options.generatedAt`) — Jira's own dates land on
   `attributes.reportedCreatedAt`/`reportedUpdatedAt` instead, a deliberate distinction from what
   `identity`'s timestamps actually mean.
3. **`jira-okf-mapping.ts`** wraps a bridge result into a real `CanonicalKnowledgeBundle`/
   `OkfDocument`/OKF YAML string, mirroring `okf-mapping.ts` (P3-09) exactly — no new mapping logic,
   P2-10's serialization reused unmodified.
4. **The FRD's `Epic`/`Feature`/`Story`/`AcceptanceCriterion` node types remain unformalized as
   separate kinds**, despite `ontology.ts`'s own doc comment anticipating that shape — a deliberate
   choice, not an oversight; see ADR 0028 decision 4 for the three reasons.

Not built here: workflow/status-transition inference over a Work Item's `attributes.status` (a
single-snapshot fact, not a history — `inference-engine`'s job, over evidence this ticket does not
produce), any UI rendering, and bridging for any tracker other than Jira. See ADR 0028 "Limitations"
for the full list.

## P6-05 — what changed and why

Full rationale: [ADR 0029](../architecture/adr/0029-p6-05-source-reconciliation.md). Implements the
FRD's §3.6 "Reconciliation & Confidence Engine" module — the first real code in
`packages/reconciliation-engine`, previously an untouched scaffold.

1. **`packages/knowledge-graph/src/reconciliation.ts`** — the sixth domain-specific `kind`
   vocabulary, `ConflictObject` (`kind: 'reconciliation.conflict'`), and the FIRST to use
   `category: 'observation'` — reserved since P2-02, documented as unfilled by
   `tests/ui-coverage.test.ts` since P2-12, filled here. Retains EVERY distinct value sources
   claimed about a subject/attribute, each with every source behind it — never collapsed to one
   (FR-REC-04).
2. **`packages/reconciliation-engine/src/claim.ts`** — `Claim` (the FRD's own "structured claims")
   and `SOURCE_TYPE_AUTHORITY`, FR-REC-01's source-type weighting table (code authoritative for
   structure, logs for behaviour, docs/tickets for intent — a deliberately coarse 1–3 scale, not
   invented decimals). `claimFromObject` extracts a claim from ANY already-bridged canonical object
   — not Jira-specific, satisfying the ticket's own "Jira, and other sources as well."
3. **`reconcile.ts`'s `reconcileClaims`** groups claims by subject/attribute/category: agreement
   yields a structurally-derived `Confidence` (FR-REC-02); disagreement yields a real `ConflictObject`
   retaining both (or all) positions (FR-REC-04), ranked for review via `rankConflicts` (FR-REC-05).
   `composite-confidence.ts`'s `boundCompositeConfidence` separately implements FR-REC-03.
4. **Cross-source entity resolution — deciding WHICH claims from different sources describe the same
   real-world thing — is deliberately left to the caller** (`Claim.subjectId`), not solved here; see
   ADR 0029 decision 3 for why that is a distinct, harder problem out of scope for this ticket.
5. **The FRD's mandatory `status: extracted|inferred|conflicted|human-confirmed` field is NOT added
   to every canonical object/relationship** — a much larger, cross-cutting change than FR-REC-04
   itself requires; see ADR 0029 decision 5.

Not built here: FR-REC-06 (human-confirmed corrections — `packages/review-loop`'s job), a `SourceType`
for "config/IaC", configurable/tunable authority scores, and any persistence or cross-run comparison
(`packages/drift-detection`'s job). See ADR 0029 "Limitations" for the full list.

## P6-06 — what changed and why

Full rationale: [ADR 0030](../architecture/adr/0030-p6-06-confidence-calculation.md). P6-05's own
confidence calculation was half-built: a private `confidenceFor` helper existed, but it only ever ran
on the agreement path — every `ConflictObject` position went out with NO computed confidence at all,
exactly backwards given FR-REC-02 names "source agreement" as an input specifically because it varies.

1. **`confidence-scoring.ts`'s `computeConfidence`** — extracted into its own dedicated, exported,
   directly-testable module, and generalized to take an explicit `contradictingSources` count
   (defaulting to 0, reproducing P6-05's original behaviour exactly for the uncontested case — all 36
   P6-05 tests pass unmodified against the new implementation).
2. **`buildConflictObject` now calls it once PER POSITION**, not zero times — each retained position
   gets its own differentiated confidence, weighed against every OTHER position's sources as the
   contradicting evidence. A live dispute is capped to `medium` at most (never `high`, however
   authoritative); a position OUTNUMBERED by contradicting sources is capped further to `low`; a clear
   majority keeps `medium` rather than collapsing to the same floor as the minority side.
3. **`ConflictPosition` gains an optional `confidence?: ConflictPositionConfidence` field**
   (`@phoenix-ai/knowledge-graph`'s `reconciliation.ts`) — purely additive, the same P2-08/P2-09
   precedent this codebase uses for extending an existing shape without breaking prior fixtures.

Not built here: authority-weighted (vs. plain source-count) outnumbered/majority comparison,
configurable thresholds, or anything else already named in ADR 0029's own Limitations — this ticket
completes FR-REC-02's calculation, it does not revisit FR-REC-01's weighting table or FR-REC-06's
human-override path. See ADR 0030 "Limitations" for the full list.
