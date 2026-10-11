/**
 * @phoenix-ai/review-loop
 * Module: Human Review & Correction Loop (FRD §3.10)
 *
 * P7-01 "Persisted Human Review" -- the first real implementation of this
 * module, replacing its scaffold. Covers FR-REV-02 (confirm/correct an
 * element) and the PERSISTENCE half of FR-REV-03 (corrections are persisted
 * and retrievable). Deliberately NOT covered here, each a later work
 * package: review-queue ranking by centrality (FR-REV-01), applying
 * decisions as authoritative truth during a re-run via the reconciliation
 * engine (FR-REV-03's second half), and correction-rate metrics (FR-REV-04).
 *
 * The canonical `review.decision` object itself lives in
 * `@phoenix-ai/knowledge-graph` (`review.ts`) -- the same "model in the
 * knowledge package, behaviour in the module package" split P6-04/P6-05
 * established. Nothing here defines a second review model.
 */

export {
  createInMemoryReviewDecisionStore,
  sortDecisions,
  type ReviewDecisionStore,
  type ReviewStoreDurability,
} from './store.js';

export {
  buildReviewDecisionWriteOperations,
  buildReviewOfRelationship,
  createGraphReviewDecisionStore,
  graphAttributeDisplayValue,
  propagateCorrectionToGraph,
  reviewDecisionFromNodeProperties,
  ReviewDecisionCorruptError,
  ReviewDecisionMappingError,
  type CorrectionPropagationOutcome,
  type CorrectionPropagationResult,
} from './graph-store.js';

export { decisionToClaim, decisionsToClaims, HUMAN_CLAIM_AUTHORITY } from './claims.js';

export {
  degreeCentrality,
  inverseConfidence,
  rankReviewQueue,
  type RankedReviewItem,
  type RelationshipEndpoints,
  type ReviewQueueRanking,
} from './queue.js';

export { computeReviewMetrics, InvalidMetricsWindowError, type ReviewMetrics } from './metrics.js';

export {
  buildReviewAuditTrail,
  walkSupersessionChain,
  type ReviewAuditEntry,
  type ReviewAuditTrail,
} from './audit.js';

export {
  applyCorrectionToObject,
  applyCorrectionsToBundle,
  buildCorrectionConflict,
  buildCorrectionNodeOperation,
  CORRECTION_ATTRIBUTES,
  type BundlePropagationResult,
  type CorrectionApplication,
  type CorrectionOutcome,
} from './propagation.js';

export {
  applyDecisionsToReviewItems,
  latestDecisionFor,
  recordReviewDecision,
  reviewStatusFor,
  targetIdForReviewItem,
  InvalidReviewDecisionError,
  InvalidReviewTransitionError,
  type RecordReviewDecisionResult,
} from './service.js';
