# ADR 0032: POC — Phoenix repo and Jira analysis (P6-09)

- **Status:** Accepted
- **Date:** 2026-09-08
- **Owners:** Platform maintainers

## Context

Requested as "P6-09 — POC: Phoenix repo and Jira analysis, using Phoenix repo and Jira as a real data
source." The precedent is P3-11 (`docs/phase-3/README.md`'s own section, deliberately shipped without
an ADR — "no new design decision is made here"): run the real pipeline against a real, un-curated
repository (Phoenix.ai-1 itself) rather than only against small, purpose-built test fixtures.

P6-09 is not a repeat of P3-11 — it proves the Phase 6 additions (P6-01/02/04/05/06/08) against real
data for the first time, and it genuinely does require new design decisions P3-11 didn't face, which is
why (unlike P3-11) this one gets an ADR:

- **No live Jira instance is reachable from this environment.** Asked directly whether a real
  instance and credentials were available for this POC, the answer was: use a representative offline
  dataset instead, clearly labelled as such. Every prior Jira ADR in this project already carries the
  same limitation (ADR 0027: "No real Jira instance was tested against"); P6-09 does not change that,
  it works within it honestly.
- **Combining two independently-real pipelines (git + Jira) into one reconciliation run** is new: P3-11
  only ever exercised one source at a time.

## Decision

1. **`packages/reconciliation-engine/samples/analyze-phoenix-and-jira.ts`** — a dev/demo script, not
   part of any package's runtime API, matching `extraction-engine/samples/analyze-phoenix-repo.ts`'s
   exact precedent (not in `tsc -b`'s `include`, run via
   `pnpm --filter @phoenix-ai/reconciliation-engine poc:analyze-phoenix-and-jira`). Placed in
   `reconciliation-engine`, not `extraction-engine`, because reconciliation is genuinely the
   downstream-most step being exercised here; `@phoenix-ai/ingestion-connectors` and
   `@phoenix-ai/extraction-engine` are added as `devDependencies` (not `dependencies` — this
   package's own `src/` needs neither).

2. **The Jira half uses a REPRESENTATIVE dataset** (`samples/fixtures/phoenix-backlog-jira.ts`), served
   through `createJiraConnector`'s real `fetchImpl` injection point — the SAME mechanism
   `jira-connector.test.ts` already uses. This means the POC exercises the REAL connector code (real
   HTTP-shaped requests, real pagination, real ADF rendering, real bridging) against representative
   response bodies, not a hand-built `RawArtifact` bypass that would skip testing the connector itself.
   The dataset is not arbitrary: it models the ACTUAL Phase 6 backlog this project executed — one Jira
   issue per real P6-0X ticket (real titles, real completion state as of this run), under one Epic. Not
   live data, but not invented busywork either — see `fixtures/phoenix-backlog-jira.ts`'s own header.

3. **The git half asks a DELIBERATELY STRICT question: is each ticket's ADR committed, not merely
   present on disk.** The real git connector (P3-02) reads `git ls-tree` at HEAD, which by construction
   cannot see an uncommitted file (ADR 0014 decision 5) — a stronger, more useful signal for THIS POC
   than a plain filesystem existence check would have been, and it exercises the real connector
   meaningfully rather than only checking `fs.existsSync`.

4. **The claim reconciled per ticket is "is this ticket done?", asked of both sources** — Jira's
   `status` field via `claimFromObject`, and git's ADR-commit-presence via a hand-built `Claim`
   (`sourceType: 'technical-doc'`, `claimCategory: 'intent'`, matching FR-REC-01's own "docs/tickets
   for intent" framing for BOTH sides, since an ADR is exactly the kind of document that category
   describes). Both claims share a `subjectId` (`phoenix-ticket-p6-0X`) the script itself assigns —
   the caller-supplied correlation ADR 0029 decision 3 requires, demonstrated concretely here.

5. **The result is reported honestly, including when it is uniform.** At the time this POC was first
   run, every P6-0X deliverable in this session was still uncommitted working-tree state, so ALL SEVEN
   tickets came back as reconciliation conflicts: Jira says the work is done; version control says it
   has not landed. This is not a demo shortcoming — it is exactly the class of gap FR-REC-04 exists to
   surface, and the script's own header explains it rather than hiding it. Running the script again
   after committing this work would show the same tickets resolve to agreement instead.

6. **Everything is assembled into one real, combined OKF bundle** — the bridged `WorkItemObject`s, the
   `ConflictObject`s reconciliation produced, and a two-entry `sources` registry (the repo and the
   Jira project) — validated with the real `validateCanonicalKnowledgeBundle`/`validateSourceReferences`
   and round-tripped through the real `serializeOkfYaml`/`parseAndValidateOkfYaml`, the same closing
   proof every prior POC and OKF-mapping ticket in this project has used.

## What it actually found

Running against this repository's real HEAD and the representative Jira fixture: revision resolved,
430 tracked files (after excluding `node_modules`/`.git`/build output); 8 Jira issues read and bridged
into 8 `WorkItemObject`s with 12 `contains`/`relatesTo` relationships (0 skipped); 0 agreed claims; **7
conflicts** — one per real P6-0X ticket, each with two retained positions (Jira's `Done`/`In Progress`
at `medium` confidence vs. git's `Not Started` at `low` confidence, per `computeConfidence`'s own
contested-case rule), each carrying real aggregated evidence. The assembled bundle validated cleanly,
every provenance/evidence `sourceId` resolved against the two-source registry, and the generated OKF
YAML (955 lines) round-tripped through the real parser/validator.

Run it yourself: `pnpm --filter @phoenix-ai/reconciliation-engine poc:analyze-phoenix-and-jira`. Full
output: `packages/reconciliation-engine/samples/phoenix-and-jira-analysis-report.md`. New
devDependencies: `tsx` (matching `extraction-engine`'s own `samples/` script runner),
`@phoenix-ai/ingestion-connectors`, `@phoenix-ai/extraction-engine`.

## Consequences

Every Phase 6 capability built this session (P6-01 through P6-08) has now been exercised together,
once, against something that is not a hand-tuned unit-test fixture: a real repository and a
representative-but-realistic Jira project. The finding that all seven tickets currently conflict is
itself a genuine, useful signal about this session's own state, not a contrived demo result.

The corresponding cost: `reconciliation-engine`'s `package.json` gains two `devDependencies` on
sibling pipeline packages, used only by this one sample script — the same shape of addition
`extraction-engine` already carries for its own `ingestion-connectors` dependency, just correctly
scoped to `devDependencies` here since `reconciliation-engine`'s actual runtime `src/` needs neither.

## Limitations

- **The Jira dataset is representative, not live** (decision 2) — the disclosed, deliberate choice
  this ticket made under the stated constraint. It proves the connector and bridge code paths run
  correctly against realistic data; it does not prove behaviour against every quirk a real Jira Cloud
  tenant might exhibit (ADR 0027's own Limitations already cover that gap for the connector itself).
- **The git-commit-presence signal will read "Not Started" for any ADR that exists only in the working
  tree**, which is the case for every P6-0X ADR at the time of this run (decision 5). This is accurate,
  not a defect, but it does mean the POC's conflict-heavy result is a snapshot of this session's commit
  state, not an inherent property of the pipeline.
- **No new source connector, bridge, or reconciliation logic was built here.** This ticket is a POC
  exercising Phase 6's existing capabilities end to end, the same scope boundary P3-11 drew for
  Phase 3's.

## Alternatives considered

- **Build a live Jira integration test against a real instance** — rejected for this ticket per the
  explicit decision: no real instance or credentials are available in this environment, and fabricating
  a claim of "real" data would contradict this project's own repeated stance (every prior Jira ADR
  states its representative/offline status explicitly rather than implying otherwise).
- **Check ADR existence via `fs.existsSync` instead of the real git connector** — rejected, see
  decision 3: it would answer a different, less interesting question ("does the file exist right now")
  and would not exercise the real connector at all, wasting the opportunity this POC exists to take.
- **Hand-build `RawArtifact`s for the Jira side instead of running the real connector against a fake
  transport** — rejected, see decision 2: it would prove the bridge works but say nothing about whether
  the connector itself (request-building, pagination, ADF rendering) does.
- **Pick a Jira dataset unrelated to this project's own history** (e.g. reusing the Aurora e-commerce
  fixture world) — rejected: a dataset genuinely describing THIS repository's own real backlog is more
  meaningful for a "Phoenix repo AND Jira" POC than an arbitrary unrelated scenario, and every field in
  it (ticket titles, completion order) is drawn from this session's actual real work rather than
  invented.
