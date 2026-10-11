/**
 * P8 -- the back half of the pipeline:
 *
 *   Human review -> Correction -> Updated canonical knowledge
 *                -> Updated graph -> Updated output
 *
 * Again composition only. Decisions are recorded by `@phoenix-ai/review-loop`
 * (`recordReviewDecision`, which validates the transition and persists to the
 * store the caller chose); this function takes those recorded decisions and
 * carries them forward with the existing machinery:
 *
 *  - `regenerateOkfDocument` (`@phoenix-ai/okf-renderers`, P7-05) applies them
 *    to the canonical bundle via `applyCorrectionsToBundle` (P7-02) and
 *    re-validates the result;
 *  - a correction that could not be applied safely (stale) comes back as a
 *    P6-05 `ConflictObject`, which is ADDED to the updated bundle so it is
 *    exposed in the graph and the OKF output (FR-REC-04/05) rather than
 *    reported once and lost;
 *  - the updated bundle is persisted and verified exactly like the first
 *    pass (`graph.ts`), and re-rendered to OKF.
 *
 * Staleness is reported both ways, so "is the output current?" always has an
 * answer: the document in hand before, and the regenerated one after.
 */

import {
  okfRegenerationState,
  regenerateOkfDocument,
  type OkfArtifactId,
} from '@phoenix-ai/okf-renderers';
import type { CorrectionApplication } from '@phoenix-ai/review-loop';
import {
  validateCanonicalKnowledgeBundle,
  validateSourceReferences,
  type CanonicalKnowledgeBundle,
  type OkfDocument,
  type ReviewDecisionObject,
} from '@phoenix-ai/knowledge-graph';
import {
  buildGraphWriteOperations,
  mapOkfBundleToGraph,
  type GraphWriteOperations,
} from '@phoenix-ai/graph-persistence';
import type { GraphTarget } from './graph.js';
import { graphStage, renderOkf } from './pipeline.js';
import { PipelineStageError, type StageReport } from './report.js';

export interface ReviewCycleOptions {
  /** ISO-8601 -- when the regeneration happens. Supplied, never read from the clock. */
  readonly at: string;
  readonly graph?: GraphTarget;
}

export interface ReviewCycleResult {
  /** The canonical knowledge with every applicable decision applied, plus any conflicts it produced. */
  readonly bundle: CanonicalKnowledgeBundle;
  readonly document: OkfDocument;
  readonly okfYaml: string;
  readonly graphOperations: GraphWriteOperations;
  /** One entry per decision that targeted an object in the bundle, in order. */
  readonly applications: readonly CorrectionApplication[];
  /** Decisions whose target is not in this bundle -- still persisted in the review store, just nothing here to update. */
  readonly decisionsWithoutTarget: readonly string[];
  /** Which OKF artifact types the corrections affected (only those were re-rendered in substance). */
  readonly regeneratedArtifacts: readonly OkfArtifactId[];
  /** Was the document in hand BEFORE this cycle stale with respect to the decisions? */
  readonly staleBefore: boolean;
  /** Is the regenerated document stale? Always false on success. */
  readonly staleAfter: boolean;
  readonly stages: readonly StageReport[];
}

export async function runReviewCycle(
  current: { readonly bundle: CanonicalKnowledgeBundle; readonly document: OkfDocument },
  decisions: readonly ReviewDecisionObject[],
  options: ReviewCycleOptions,
): Promise<ReviewCycleResult> {
  const stages: StageReport[] = [];
  const staleBefore = okfRegenerationState(current.document, decisions).stale;

  // --- Review & correction -> updated canonical knowledge -----------------------------------------
  const regeneration = regenerateOkfDocument(current.bundle, decisions, { at: options.at });
  if (!regeneration.valid) {
    throw new PipelineStageError('review-correction', regeneration.errors, stages);
  }

  const objectIds = new Set(current.bundle.objects.map((o) => o.identity.id));
  const decisionsWithoutTarget = decisions
    .filter((d) => !objectIds.has(String(d.attributes.targetObjectId)))
    .map((d) => d.identity.id);

  const regenerated = regeneration.document;
  const bundle: CanonicalKnowledgeBundle = {
    systemId: regenerated.systemId,
    generatedAt: regenerated.generatedAt,
    objects: [...regenerated.objects, ...regeneration.conflicts],
    relationships: regenerated.relationships,
    ...(regenerated.sources === undefined ? {} : { sources: regenerated.sources }),
  };
  const bundleErrors = [
    ...validateCanonicalKnowledgeBundle(bundle).errors,
    ...validateSourceReferences(bundle).errors,
  ];
  if (bundleErrors.length > 0)
    throw new PipelineStageError('review-correction', bundleErrors, stages);

  const outcomes = new Map<string, number>();
  for (const application of regeneration.applications) {
    outcomes.set(application.outcome, (outcomes.get(application.outcome) ?? 0) + 1);
  }
  stages.push({
    stage: 'review-correction',
    status: 'completed',
    input: decisions.length,
    output: regeneration.applications.length,
    dropped: decisionsWithoutTarget.map((id) => ({
      item: id,
      reason:
        'targets an element that is not in this bundle; the decision stays persisted in the review store, there is nothing here to update',
    })),
    notes: [
      `outcomes: ${[...outcomes].map(([k, v]) => `${k}=${v}`).join(', ') || 'none'}`,
      `${regeneration.conflicts.length} stale correction(s) retained as conflicts in the updated bundle, not discarded`,
      `${regeneration.unchangedObjectIds.length} object(s) left byte-identical`,
    ],
  });

  // --- Updated graph ------------------------------------------------------------------------------
  const mapping = mapOkfBundleToGraph(bundle);
  if (mapping.issues.length > 0) {
    throw new PipelineStageError(
      'graph-update',
      mapping.issues.map((i) => `${i.elementType} ${i.id ?? '(no id)'}: ${i.reason}`),
      stages,
    );
  }
  const graphOperations = buildGraphWriteOperations(mapping);
  stages.push(await graphStage('graph-update', bundle, graphOperations, options.graph, stages));

  // --- Updated output -----------------------------------------------------------------------------
  const { document, okfYaml } = renderOkf(bundle, stages, 'okf-regeneration');
  const staleAfter = okfRegenerationState(document, decisions).stale;
  stages.push({
    stage: 'okf-regeneration',
    status: 'completed',
    input: bundle.objects.length,
    output: document.objects.length,
    dropped: [],
    notes: [
      `affected artifact types: ${regeneration.regeneratedArtifacts.join(', ') || 'none currently modelled'}`,
      `document stale before: ${String(staleBefore)}; after: ${String(staleAfter)}`,
    ],
  });

  return {
    bundle,
    document,
    okfYaml,
    graphOperations,
    applications: regeneration.applications,
    decisionsWithoutTarget,
    regeneratedArtifacts: regeneration.regeneratedArtifacts,
    staleBefore,
    staleAfter,
    stages,
  };
}
