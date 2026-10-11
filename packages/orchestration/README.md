# @phoenix-ai/orchestration

**Module:** Orchestration (FRD §3.12)

## Responsibility

Sequences the end-to-end pipeline over the existing stage implementations, and accounts for every
item each stage receives, hands on, or drops. It adds no analysis of its own.

- `runPipeline`: source → ingestion → redaction → extraction → inference (optional) →
  reconciliation (optional) → validated knowledge graph → graph persistence (optional target) → OKF.
- `runReviewCycle`: recorded human decisions → corrected canonical knowledge (stale corrections kept
  as conflicts) → updated, verified graph → regenerated OKF.

Every run returns a `StageReport` per stage (`input`, `output`, `dropped` with reasons, `notes`). A
mandatory stage that cannot produce valid output throws `PipelineStageError` naming the stage and
carrying the reports of the stages that completed.

## Reproducibility

The caller supplies `generatedAt` (and `at` for a review cycle); no stage reads the clock. Identical
input gives a byte-identical bundle, OKF document, graph write plan and redaction.

## Not implemented

- FR-ORC-02 (model-tier routing): no stage calls a model.
- FR-ORC-04 (per-tenant isolation): `systemId` scopes a run's data, but the Neo4j database is shared.

See `docs/phase-8/README.md` for the per-stage contract table.
