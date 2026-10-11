/**
 * @phoenix-ai/evaluation-harness
 * Module: Evaluation Harness (FRD §3.11)
 *
 * P8 --
 *  - FR-EVA-01: a hand-authored golden system with known ground truth
 *    (`golden/shop-platform.ts`).
 *  - FR-EVA-02: precision / recall of nodes and typed edges, of concrete
 *    facts (API operations, tables), and a clustering metric
 *    (`scoreAgainstGolden`).
 *  - FR-EVA-03: round-trip verification of every concrete claim against the
 *    source it cites; contradictions are failures (`verifyRoundTrip`).
 *  - `evaluateGate`: the CI regression gate over both.
 */

export {
  precisionRecall,
  predictedClusters,
  scoreAgainstGolden,
  type EvaluationScores,
  type GoldenEdge,
  type GoldenNode,
  type GoldenSystem,
  type PrecisionRecall,
} from './metrics.js';
export {
  declaredOperations,
  verifyRoundTrip,
  type RoundTripClaimKind,
  type RoundTripReport,
  type RoundTripResult,
} from './round-trip.js';
export { SHOP_PLATFORM_GOLDEN } from './golden/shop-platform.js';

import type { EvaluationScores } from './metrics.js';
import type { RoundTripReport } from './round-trip.js';

export interface GateThresholds {
  /** Minimum precision AND recall for nodes, edges, API operations and tables. */
  readonly minPrecisionRecall: number;
  readonly minClusteringF1: number;
  /** Contradicted claims allowed. The default is none: a contradiction is a failure. */
  readonly maxContradictions: number;
}

export const DEFAULT_GATE: GateThresholds = {
  minPrecisionRecall: 0.9,
  minClusteringF1: 0.9,
  maxContradictions: 0,
};

export interface GateResult {
  readonly passed: boolean;
  readonly failures: readonly string[];
}

export function evaluateGate(
  scores: EvaluationScores,
  roundTrip: RoundTripReport,
  thresholds: GateThresholds = DEFAULT_GATE,
): GateResult {
  const failures: string[] = [];
  for (const metric of ['nodes', 'edges', 'apiOperations', 'tables'] as const) {
    const { precision, recall, missing, unexpected } = scores[metric];
    if (precision < thresholds.minPrecisionRecall || recall < thresholds.minPrecisionRecall) {
      failures.push(
        `${metric}: precision ${precision}, recall ${recall} (minimum ${thresholds.minPrecisionRecall}); missing [${missing.join(', ')}], unexpected [${unexpected.join(', ')}]`,
      );
    }
  }
  if (scores.clustering.f1 < thresholds.minClusteringF1) {
    failures.push(`clustering: F1 ${scores.clustering.f1} (minimum ${thresholds.minClusteringF1})`);
  }
  if (roundTrip.contradicted > thresholds.maxContradictions) {
    failures.push(
      `round-trip: ${roundTrip.contradicted} claim(s) contradicted by their cited source: ${roundTrip.results
        .filter((r) => r.outcome === 'contradicted')
        .map((r) => `${r.label} ${r.claim} (${r.cited})`)
        .join('; ')}`,
    );
  }
  return { passed: failures.length === 0, failures };
}
