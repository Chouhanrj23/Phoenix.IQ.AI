/**
 * P8 -- per-stage accounting.
 *
 * The point of the end-to-end pipeline is that information cannot vanish
 * between stages without a trace. Every stage therefore reports how many
 * items it received, how many it handed on, and -- by name, with a reason --
 * every item it did NOT hand on. A stage that legitimately keeps something
 * out of its output (a fact extraction found but no canonical kind exists
 * for yet) says so in `notes`; it does not quietly shrink.
 */

export const PIPELINE_STAGES = [
  'ingestion',
  'redaction',
  'extraction',
  'inference',
  'reconciliation',
  'knowledge-graph',
  'graph-persistence',
  'okf',
  // P8: FR-KG-05 versioning, FR-DFT-02 drift, FR-GAP-01 gap planning.
  'graph-versioning',
  'drift',
  'gap-analysis',
  'review-correction',
  'graph-update',
  'okf-regeneration',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

/** The stages `runPipeline` reports, in order. */
export const FORWARD_STAGES = PIPELINE_STAGES.slice(
  0,
  PIPELINE_STAGES.indexOf('review-correction'),
);
/** The stages `runReviewCycle` reports, in order. */
export const REVIEW_STAGES = PIPELINE_STAGES.slice(PIPELINE_STAGES.indexOf('review-correction'));

/**
 * `completed` -- ran and handed on its output.
 * `skipped`   -- an OPTIONAL stage deliberately not run, with the reason in
 *               `notes`. Never used for a mandatory stage.
 */
export type StageStatus = 'completed' | 'skipped';

export interface DroppedItem {
  /** Path, id, or locator of the item that did not continue. */
  readonly item: string;
  readonly reason: string;
}

export interface StageReport {
  readonly stage: PipelineStage;
  readonly status: StageStatus;
  readonly input: number;
  readonly output: number;
  readonly dropped: readonly DroppedItem[];
  readonly notes: readonly string[];
}

/** A mandatory stage could not produce a valid output. Nothing after it ran. */
export class PipelineStageError extends Error {
  readonly stage: PipelineStage;
  readonly errors: readonly string[];
  /** Reports of every stage that completed before the failure. */
  readonly completedStages: readonly StageReport[];
  constructor(
    stage: PipelineStage,
    errors: readonly string[],
    completedStages: readonly StageReport[],
  ) {
    super(`pipeline stopped at "${stage}": ${errors.slice(0, 5).join('; ')}`);
    this.name = 'PipelineStageError';
    this.stage = stage;
    this.errors = errors;
    this.completedStages = completedStages;
  }
}
