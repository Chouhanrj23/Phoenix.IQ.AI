# Phoenix Phase 8 — End-to-end pipeline

Status record for the final phase. The pipeline is composed in `packages/orchestration`
(`runPipeline`, `runReviewCycle`) from the existing stage implementations. Orchestration adds no
analysis of its own: only the stage sequence, the contract checks between stages, and per-stage
accounting.

```
Source → Ingestion → Redaction → Deterministic extraction → Semantic inference (optional)
       → Reconciliation (optional) → Knowledge graph → Graph persistence → OKF
       → Graph version → Drift changelog → Gap plan
       → Human review → Correction → Updated canonical knowledge → Updated graph → Updated output
```

## Guarantee: nothing disappears silently

Every stage returns a `StageReport` (`input`, `output`, `dropped[]` with item and reason, `notes`).
A mandatory stage that cannot produce valid output throws `PipelineStageError` (stage, errors, and
the reports of the stages that completed); nothing after it runs. Integration tests assert that
counts are conserved between stages and that the bundle, graph write plan and OKF document carry
exactly the same element ids.

## Stage contracts

| Stage                                                | Input → output                                                       | Provenance / evidence / confidence                                                                                                       | Identity                                                                                        | Errors                                                                                                                                                                    | Tests                                                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Ingestion (`ingestion-connectors`)                   | `SourceRepositoryDescriptor` → `RawArtifact[]` + `ArtifactFailure[]` | `Source` registered with resolved revision; per-artifact `locator`, `revision`, `contentHash`                                            | `<scheme>://<source>/<path>` locator; percent-encoded `file://` paths decoded for `git -C` (P8) | Read failures become `dropped` with reason                                                                                                                                | `pipeline.e2e` (real git repo), `real-data.e2e` (this repo)                                   |
| Redaction (`redaction-hardening`, P8)                | `RawArtifact[]` → stamped `RawArtifact[]` + quarantined              | Original `contentHash` kept; `attributes.redactionGate` stamp; findings record location only                                             | Tokens `[REDACTED:<kind>:<hash of source/path/ordinal/kind>]`, never derived from the value     | Unscannable content quarantined; extraction refuses unstamped input (`assertRedactionGatePassed`)                                                                         | `redaction-hardening/tests`, secrets absent from every output in `pipeline.e2e`               |
| Extraction (`extraction-engine`)                     | stamped artifacts → facts + bridged objects/relationships            | `source-code` provenance with revision; file:line evidence; `basis: observed`                                                            | Content-derived ids (`deterministicId`)                                                         | Parse failures reported as `dropped`; facts with no canonical kind (calls, repositories, config) **counted in notes** and kept in `PipelineRun.extraction`                | `pipeline.e2e`                                                                                |
| Inference (`inference-engine`), optional             | extracted objects → added objects/relationships                      | Provenance derived from the grounding objects' real sources (`derivedBy: inference-engine`); their evidence referenced; `basis: derived` | Content-derived; never modifies extracted objects                                               | Skipped when disabled, with a note                                                                                                                                        | `inference-engine/tests/bundle-integrity`, `pipeline.e2e`, `real-data.e2e` (spring-petclinic) |
| Reconciliation (`reconciliation-engine`), optional   | `Claim[]` from other sources → agreed + `ConflictObject[]`           | Every position keeps its sources, confidence and `evidenceIds`                                                                           | Content-derived conflict ids; collisions throw                                                  | Skipped for a single-source run: corroboration is not invented. Unregistered claim sources fail the next stage                                                            | `pipeline.e2e`                                                                                |
| Knowledge graph (`knowledge-graph`)                  | all objects/relationships + source registry → validated bundle       | `validateSourceReferences`: every provenance/evidence source registered                                                                  | Duplicate object or relationship ids rejected                                                   | Invalid bundle → `PipelineStageError`                                                                                                                                     | `pipeline.e2e`                                                                                |
| Graph persistence (`graph-persistence`)              | bundle → write plan → Neo4j (optional target)                        | `provenanceJson`, `evidenceJson`, `confidence*` on every node/edge                                                                       | `MERGE` on id; duplicate ids reported, never merged                                             | Unmappable element → `PipelineStageError`. With a target, read back and checked with `checkGraphConsistency` (labels, attribute values, evidence, provenance, confidence) | `pipeline.e2e` (plan), `pipeline.neo4j` (live)                                                |
| OKF (`knowledge-graph` okf)                          | bundle → OKF document + YAML                                         | Carried verbatim                                                                                                                         | Same ids                                                                                        | YAML re-parsed through the real validator; object count must match                                                                                                        | `pipeline.e2e` (lossless round trip)                                                          |
| Review & correction (`review-loop`, `okf-renderers`) | recorded `ReviewDecisionObject[]` + bundle → corrected bundle        | Human provenance appended (original kept); superseded value retained; reviewer registered as a source                                    | Object ids unchanged                                                                            | Stale corrections kept as **conflicts in the updated bundle**; decisions for absent targets reported as `dropped`                                                         | `pipeline.e2e`, `real-data.e2e`, `review-loop/tests/propagation`                              |
| Updated graph / output                               | corrected bundle → verified graph + regenerated OKF                  | as above                                                                                                                                 | as above                                                                                        | `staleBefore` / `staleAfter` from `okfRegenerationState`                                                                                                                  | `pipeline.e2e`, `pipeline.neo4j`                                                              |
| Graph version (`drift-detection`, P8)                | bundle → immutable `GraphVersion` (stored when a store is given)     | Whole bundle kept; per-element `elementVersions`                                                                                         | `gv-` + 24 hex of the canonical bundle without time-of-run fields                               | Different content under an existing id → `GraphVersionConflictError`                                                                                                      | `drift-detection/tests`, `lifecycle.e2e`                                                      |
| Drift (`drift-detection`, P8)                        | previous + new version → `Changelog`                                 | Observed and inferred changes reported apart                                                                                             | Element ids                                                                                     | First run: `skipped`, recorded as the baseline                                                                                                                            | `drift-detection/tests`, `lifecycle.e2e`                                                      |
| Gap analysis (`gap-analysis`, P8)                    | bundle + run facts → coverage per artifact + `GapItem[]`             | Every gap names its missing input or the exact files                                                                                     | `gap-…` ids, deterministic order                                                                | Never invents a gap: only from uncovered artifacts and recorded run facts                                                                                                 | `gap-analysis/tests`, `lifecycle.e2e`                                                         |

## Reproducibility (BR-13, FR-ORC-03)

The caller supplies `generatedAt` (and `at` for a review cycle). Tested: identical input gives a
byte-identical OKF document, graph write plan and redaction; a later run of unchanged input keeps
every element id.

## Optional stages, stated rather than faked

- **Inference.** On by default; `inference: false` skips it with a note.
- **Reconciliation.** Needs claims from a second source (`reconciliation.claims` and `.sources`).
  A single-source run reports `skipped`.
- **Graph persistence.** Without a Neo4j target the write plan is built and checked, and the stage
  reports that nothing was persisted.
- **Commit history.** Read when the connector provides it (git does); otherwise the ingestion stage
  notes its absence. `history: false` disables it.
- **Version storage and drift.** The version id is always computed. It is stored, and drift
  computed against the previous version, only when a `versionStore` is given; the first stored run
  is the baseline and drift reports `skipped`.

## Not complete

- **Domain pages in the web app.** Architecture, Domains, Integrations, Deployment and NFR pages
  still render the API's Phase 1 seed. Drift and Gaps serve real run output once a run exists and
  label seed data as sample data (`x-phoenix-data-origin`) until then. A run's real views are
  available over the API (`/api/runs/:id/artifacts`, `/api/runs/:id/export`).
- **API runs do not persist to Neo4j.** `RunService` does not pass a graph target to
  `runPipeline`, so a run's `graph-persistence` stage reports `skipped`; its knowledge is kept in
  the run workspace (OKF, outputs, graph versions). `/api/full-graph` shows only what was
  persisted otherwise (tests, or programmatic `runPipeline` with a `graph` target).
- **Screens and non-functional requirements** have no extractor, so those two of the eleven
  artifacts are rendered as `unavailable` with the input they would need, and appear as gaps.
- **No `architecture.*` objects are extracted from code.** The C4 view uses IaC deployment units
  as containers when no container is declared, and says so.
- **FR-SEC-05/06** (model context and agent isolation) and **FR-ORC-02** (model-tier routing) do
  not apply: no stage calls a model.
- **Tenancy is data isolation, not access control.** Graph nodes are keyed on `(id, systemId)`
  and every scoped query filters on `systemId`; API listings filter by `systemId`. The API has no
  authentication, so `systemId` is a request parameter, not an identity. Nodes persisted
  before this change carry no `systemId`; tenant-scoped reads and corrections do not match them,
  so an existing graph should be re-persisted by a new pipeline run.
- **Inference precision.** Descriptive text is mined for vocabulary, so the real fixture yields
  concepts such as `Map To Table "orders"`. This is a precision limit of P5's rule-based inference,
  documented rather than redesigned here.

## Completion work (closing the acceptance-audit blockers)

| Requirement                                  | Where                                                                                                                                             | Tests                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| FR-KG-05 graph versioning                    | `drift-detection/src/version.ts`, `store.ts` (in-memory and atomic file store)                                                                    | `drift-detection/tests/drift.test.ts`, `orchestration/tests/lifecycle`   |
| BR-07, FR-DFT-01..04 drift                   | `drift-detection/src/diff.ts`; FR-DFT-01 is the parse cache, `extraction-engine/src/parse-cache.ts`                                               | as above; `extraction-engine/tests/extract-java.test.ts`                 |
| FR-GAP-01..03 gap planner                    | `gap-analysis/src/index.ts`                                                                                                                       | `gap-analysis/tests/gaps.test.ts`                                        |
| BR-02/10, FR-OKF-01..13 renderers and export | `okf-renderers/src/renderers.ts` (DBML + dictionary, Structurizr DSL, mermaid flows/deployment, markdown), `export.ts` (manifest with SHA-256)    | `okf-renderers/tests/renderers.test.ts` (real petclinic and aurora data) |
| FR-EVA-01..03 evaluation                     | `evaluation-harness`: golden system `golden/shop-platform.ts`, `scoreAgainstGolden`, `verifyRoundTrip`, `evaluateGate` (≥ 0.9, no contradictions) | `evaluation-harness/tests/gate.test.ts` (real pipeline over real git)    |
| FR-IF-01/03/05 sources, runs, outputs        | `apps/api/src/services/runs.service.ts`, `routes/runs.ts`                                                                                         | `apps/api/tests/runs.test.ts`                                            |
| BR-12, FR-ORC-04 tenant isolation            | `graph-persistence` (`(id, systemId)` keys, `GraphScope`), `review-loop` store scope, API `systemId` filtering                                    | `graph-persistence/tests/tenant-isolation.test.ts`, `review-loop`, API   |
| FR-ING-06, FR-DET-04/05/06                   | git `commitHistory()`; `extraction-engine/src/iac.ts`, `history.ts` (co-change, knowledge risk)                                                   | `iac.test.ts`, `history.test.ts`, `git-connector.test.ts`, `lifecycle`   |

API endpoints added: `GET/POST /api/sources`, `GET/POST /api/runs` (POST returns 202),
`GET /api/runs/:id`, and per run `/okf`, `/artifacts`, `/export`, `/export/<path>`, `/changelog`,
`/gaps`, `/knowledge-risk`, `/evaluation`; `GET /api/full-graph?systemId=`. Settings:
`PHOENIX_WORKSPACE_DIR` (default `.phoenix-workspace`), `PHOENIX_SYSTEM_ID` (default
`aurora-commerce`), `PHOENIX_ALLOW_LOCAL_SOURCES` (default `false`: only `https://`/`ssh://` git
URLs; URLs with embedded credentials are always refused).

Defects found while doing this, fixed with regression tests:

- **Version store rejected re-derived knowledge.** The immutability check compared bundles
  including their timestamps, so an unchanged repository analysed again was refused as a
  conflict. It now compares the content the version id addresses (`versionContent`).
- **Multi-module repositories collapsed into one capability.** With a `repo://<org>/<repo>`
  source id, capability inference grouped every concept under the repository's name. Evidence
  paths now decide when the source id separates nothing but the evidence does. This was found by
  the golden system's clustering metric (F1 0.571, now 1.0).
- **Stale registry and Cypher expectations.** Tests still described deployment and backlog as
  unmodelled and expected untenanted `MATCH (n {id: $id})`. They were updated to the P8 behaviour.

## Defects found by running the stages together (fixed in P8)

| Defect                                                                                                                           | Effect                                                                                         | Fix                                                          |
| -------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Graph mapping lacked `reconciliation.conflict`, `workitem.issue`, `business.capability`, `groundedIn`, `comprises`, `realizedBy` | Conflicts, work items, capabilities and every inference grounding edge never reached the graph | Mappings added                                               |
| Graph Explorer kept only kinds in a fixed list                                                                                   | `ReviewDecision` (and any new kind) silently hidden                                            | Unknown kinds shown after the curated order                  |
| `comprises` edges targeted unmaterialised concept ids                                                                            | Dangling edges; bundle invalid                                                                 | Target the resolved object (`memberObjectIds`), id unchanged |
| Journeys/flows/actions cited `sourceId: systemId` and had no evidence                                                            | Fabricated source reference; bundle invalid                                                    | Provenance and evidence from the grounding API objects       |
| A stale correction's reviewer was not registered as a source                                                                     | Updated bundle invalid when that reviewer had no applied correction                            | Registered for conflicts too                                 |
| Graph consistency ignored attribute values and evidence                                                                          | An unapplied correction or stale attribute passed as consistent                                | Compared, with Neo4j integers normalised                     |

## Security and data handling (P8 hardening)

| Check                                        | Finding                                                                                                                                                                                                                                                                                                                                             | State                                                                                                                                      |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Untrusted content cannot become instructions | No code-execution sink takes source content. `git` runs without a shell, behind `--` separators, with revision, path and remote validation and `ext::` refused. Cypher is parameterised and labels and types come from closed maps. YAML uses the `yaml` core schema, so data only. No stage calls a model, so FR-SEC-05/06 are not yet applicable. | Verified, no change                                                                                                                        |
| Redaction where required                     | Artifacts went through the gate. **Claims supplied by a second source** (reconciliation input) and **reviewer-entered text** (corrections, rationale) did not.                                                                                                                                                                                      | **Fixed**: claims through `redactText`; review text through the same detectors at `recordReviewDecision`                                   |
| Redaction failure behaviour                  | **The detectors backtracked catastrophically**: a 40 KB `a.a.a.…` file did not finish in 5 minutes, so the gate hung instead of scanning or quarantining. An unquoted config secret followed by an identical comment had the comment redacted and the secret left.                                                                                  | **Fixed**: every pattern bounded (linear time); spans from regex group indices; credential detectors take precedence over the e-mail shape |
| Secrets not persisted                        | **A locator could embed a credential** (`https://<token>@host/…`); it became `Source.locator` and every evidence locator, reaching OKF and the graph. A checkout's `origin` URL with a token appeared in source metadata.                                                                                                                           | **Fixed**: descriptor validation rejects credential-bearing locators (without echoing them); `origin` reported without credentials         |
| API exposure                                 | `/api/full-graph` returns id, label, kind and confidence only. **A failed graph propagation returned raw driver/Cypher error text in a 201 body**, and non-500 5xx errors from libraries returned their message.                                                                                                                                    | **Fixed**: generic reason, detail logged server-side; every non-`ApiError` 5xx masked                                                      |
| Logs                                         | Log calls carry messages, ids and error text, never source content. Fastify request logging is off.                                                                                                                                                                                                                                                 | Verified, no change                                                                                                                        |
| Graph metadata                               | Fed only from redacted content and credential-free locators; connector `sourceMetadata` and artifact attributes do not reach the bundle.                                                                                                                                                                                                            | Verified after the fixes above                                                                                                             |
| Review data bypassing controls               | See "redaction where required". `reviewerId` is the reviewer's declared identity and is not scanned.                                                                                                                                                                                                                                                | **Fixed**                                                                                                                                  |
| Error messages                               | Validation errors name fields and kinds, never values; secret-rejection messages never echo the secret.                                                                                                                                                                                                                                             | Verified, plus the API fixes above                                                                                                         |

Regression tests: `redaction-hardening/tests/security-hardening.test.ts`,
`ingestion-connectors/tests/descriptor.test.ts` and `git-connector.test.ts` (P8 blocks),
`review-loop/tests/p8-hardening.test.ts`, `apps/api/tests/errors.test.ts` and
`review-decisions.test.ts` (P8 blocks), `orchestration/tests/pipeline.e2e.test.ts` (claim redaction).

## Reproducibility and deterministic behaviour (P8)

Same input and configuration give byte-identical output, on any host. Inspected and resolved:

| Source of nondeterminism         | Finding                                                                                                                                                                                                                                                                                                     | State                                                                                                                                               |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| Host collation (`localeCompare`) | Every machine-facing ordering (extraction facts, graph mapping, inference candidates, reconciliation positions, review ordering, 30 sites) followed the host's default collation. A Danish host orders `Aardvark`/`Zebra` and `Apple`/`apple` differently, so identical input produced different OKF bytes. | **Fixed**: `compareCodeUnits` (`@phoenix-ai/shared`), locale-free and ICU-version-free. Human-facing UI lists keep locale-aware sorting on purpose. |
| YAML anchors/aliases             | `serializeOkfYaml` emitted `&a1`/`*a1` wherever the same in-memory object was referenced twice, so bytes depended on how a bundle was assembled rather than on its content.                                                                                                                                 | **Fixed**: `aliasDuplicateObjects: false`; output is a pure function of content and a serialise→parse→serialise fixed point.                        |
| Neo4j result order               | `getFullGraph`/`getRelationshipsForNode` returned rows in storage order, which shifts as the graph is written.                                                                                                                                                                                              | **Fixed**: results sorted by stable id.                                                                                                             |
| Jira pagination                  | Searches had no `ORDER BY`; pages could skip or repeat issues and arrived in index order.                                                                                                                                                                                                                   | **Fixed**: `ORDER BY key ASC`.                                                                                                                      |
| Clock                            | No stage reads the clock: `generatedAt`/`at` are inputs. `capturedAt` (when a file was read), the review API's `decidedAt`, and log timestamps record real events and are kept; none reaches the canonical output.                                                                                          | Verified                                                                                                                                            |
| Random values                    | Only the redaction vault's AES key and IVs, which never reach any output. Redaction tokens are content-free hashes of location.                                                                                                                                                                             | Verified                                                                                                                                            |
| Generated identifiers            | Content-derived (`deterministicId`, `reviewDecisionId`); unchanged.                                                                                                                                                                                                                                         | Verified                                                                                                                                            |
| Filesystem traversal             | Git `ls-tree` order; no directory walking.                                                                                                                                                                                                                                                                  | Verified                                                                                                                                            |
| Asynchronous processing          | Pipeline stages run sequentially; same-element review writes are serialised.                                                                                                                                                                                                                                | Verified                                                                                                                                            |
| API demo seed                    | `driftAlerts.detectedAt` is deliberately relative to now (documented demo-freshness, matching the web mock). Not pipeline output.                                                                                                                                                                           | Left as designed                                                                                                                                    |

Tests: `orchestration/tests/determinism.test.ts` (Danish- and Swedish-collation hosts emulated; repeated runs; review cycle), `shared/tests/ordering.test.ts`, `knowledge-graph/tests/okf.test.ts` (content-only serialisation), `graph-persistence/tests/query-ordering.test.ts`, `ingestion-connectors/tests/jira-connector.test.ts`.

## Performance and reliability (P8)

Only measured or clearly identifiable issues were changed.

| Issue                                              | Evidence                                                                                                                                                | Fix                                                                                                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redaction cost quadratic in the number of findings | Line numbers recounted from the start per finding: 20,000 e-mail addresses in a 680 KB file took 10.9 s.                                                | Lines counted incrementally: 173 ms; 40,000 findings in 1.4 MB take 338 ms.                                                                                             |
| Unbounded wait on an unreachable Neo4j             | Driver defaults: a packet-dropping host held each request ~21 s before the API could answer "unavailable".                                              | `connectionTimeout` 5 s and `connectionAcquisitionTimeout` 10 s by default; configurable via `NEO4J_CONNECTION_TIMEOUT_MS` / `NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS`. |
| Whole graph loaded per review-queue request        | `GET /api/review-queue` called `getFullGraph` (every node and relationship with all properties, including provenance/evidence JSON) to compute degrees. | `getRelationshipEndpoints`: one query, two id columns per relationship. Ranking semantics unchanged.                                                                    |
| No resource cleanup or graceful shutdown           | Two Neo4j pools never closed; no signal handling, so SIGTERM cut in-flight requests (a review POST could be written but unanswered).                    | `onClose` releases both pools; SIGINT/SIGTERM close the app gracefully with a 10 s grace period.                                                                        |

Inspected and left as is:

- **Bounded already:** git artifact size (`maxArtifactBytes`), git command output and timeouts, Jira request timeout, and Jira pagination (stops on an empty page or at `total`).
- **Idempotent retries:** every graph write is `MERGE` or `MATCH … SET`, so the driver's transient-error retry is safe. Missing endpoints fail the whole transaction, with no partial write.
- **Clean failure paths:** git temp clones are removed on failure; connector sessions close on error.
- **Not changed, by judgement:**
  - Each graph call pings Neo4j before its query. Since P8 that ping is redundant for error classification, but removing it changes behaviour the Docker-only integration suites cover, so it is noted rather than changed.
  - `/api/full-graph` and `/api/review-decisions` return everything. Adding pagination would change Phase 4/7 API contracts.
  - Bundle ingestion is one transaction with one statement per element. Batching it would be an optimisation without a measured need.

## UI / API / backend consistency (P8)

The UI must not present demo fixtures or browser-only state as backend functionality.

| Finding                                                                                                                                                                                                              | Fix                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In API mode the masthead said **"Live API mode"**, but execution flows, personas, journeys, business capabilities and epics were silently served from browser fixtures (no API endpoint exists).                     | The provider declares these areas (`API_FIXTURE_FALLBACK_AREAS`). The badge reads "Live API mode — some areas from demo fixtures"; every page showing them carries a notice (`FixtureNotice`). A test checks the declaration against the provider's real behaviour. |
| In API mode the company picker let users choose Fintech: the header said "Nimbus Financial" while every API-backed page showed the API's Aurora data.                                                                | Only the system the API serves is selectable in API mode; the header names it.                                                                                                                                                                                      |
| The Agent Pipeline page presented a scripted run (log lines, approve/reject gates) and FRD target capabilities (AI agents, model-tier routing, tenant isolation, eleven renderers, gap/drift/evaluation) as if real. | A walkthrough notice states the run is scripted and saves nothing; each stage shows "In this build: implemented / partly / not implemented"; rule-based inference is no longer labelled an AI agent.                                                                |
| `/api/full-graph` with no Neo4j configured returned an unexplained 500; GET errors discarded the API's message.                                                                                                      | 503 "knowledge graph unavailable"; the provider surfaces the API's own message for reads as it already did for writes.                                                                                                                                              |

Verified unchanged:

- **Review and correction are already honest.** "Saved" appears only after a confirmed write, with the durability (`graph`/`memory`) and graph propagation outcome stated; the demo provider returns `durability: 'none'` with a reason.
- **Evidence, provenance and confidence panels** show "No evidence recorded" / "Confidence unavailable" rather than inventing values.
- **Other pages' controls** are view state only: expand, select, filter.
- **Contract test:** `api/tests/web-contract.test.ts` reads the web provider's source and requires every path it calls to be served by the real route set.
- **The full chain still works:** Persona → Journey → Entity → Service → API → Evidence → Review → Correction → Graph (`web/tests/review-sync-flow.test.ts`; live API round trip).
