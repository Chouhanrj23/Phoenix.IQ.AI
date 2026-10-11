/**
 * @phoenix-ai/orchestration
 * Module: Orchestration (FRD §3.12)
 *
 * P8 -- the end-to-end pipeline as one defined stage sequence (FR-ORC-01)
 * over the existing stage implementations, with per-stage accounting so no
 * information leaves the pipeline without a recorded reason, and a
 * caller-supplied clock so identical inputs give identical output (FR-ORC-03).
 *
 *  - `runPipeline` -- source through OKF (`pipeline.ts`).
 *  - `runReviewCycle` -- recorded human decisions through the updated
 *    canonical knowledge, graph and OKF output (`review-cycle.ts`).
 *
 * Not implemented, and not claimed: FR-ORC-02 (model-tier routing -- no
 * stage calls a model). FR-ORC-04 tenant isolation is enforced in the graph
 * itself: nodes are keyed on `(id, systemId)` and every scoped read filters
 * on `systemId` (`@phoenix-ai/graph-persistence`). See
 * `docs/phase-8/README.md`.
 */

export {
  runInference,
  runPipeline,
  type InferenceOutput,
  type PipelineOptions,
  type PipelineRun,
} from './pipeline.js';
export { runReviewCycle, type ReviewCycleOptions, type ReviewCycleResult } from './review-cycle.js';
export { persistAndVerify, type GraphTarget } from './graph.js';
export {
  FORWARD_STAGES,
  PIPELINE_STAGES,
  PipelineStageError,
  REVIEW_STAGES,
  type DroppedItem,
  type PipelineStage,
  type StageReport,
  type StageStatus,
} from './report.js';
