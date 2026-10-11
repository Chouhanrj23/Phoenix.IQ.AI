/**
 * P7-08 -- FR-REV-04 (Should): "The system shall record correction rate per
 * run as a quality metric."
 *
 * HONEST SCOPE NOTE: Phoenix has no orchestrated "run" yet
 * (`packages/orchestration` is a scaffold), so there is no run id to group by.
 * Rather than inventing one, the metric is computed over an explicit window
 * the caller defines, and `runScoped` states plainly whether a real run
 * boundary was used. Once orchestration exists, the same function takes the
 * run's start/end and nothing else changes.
 *
 * Every number here is a count of real recorded decisions -- no estimation,
 * no smoothing, and a rate of `null` (never 0) when nothing was reviewed, so a
 * quiet period cannot read as perfect quality.
 */

import { isIsoTimestamp, type ReviewDecisionObject } from '@phoenix-ai/knowledge-graph';

/** The requested window is not a usable time range -- an unparseable bound, or `from` after `to`. */
export class InvalidMetricsWindowError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'InvalidMetricsWindowError';
  }
}

/**
 * Parses one window bound to epoch milliseconds.
 *
 * Bounds were previously compared to decision timestamps as STRINGS, which is
 * only correct when both sides share one exact format. `...T10:00:00Z` sorts
 * AFTER `...T10:00:00.000Z` ('Z' > '.'), so an inclusive `from` excluded a
 * decision made at that exact instant; an offset such as `+05:30` compared
 * against `Z` gave arbitrary results; and a garbage bound silently produced
 * a plausible-looking but meaningless metric (P8).
 */
function boundMs(value: string | undefined, name: 'from' | 'to'): number | undefined {
  if (value === undefined) return undefined;
  if (!isIsoTimestamp(value)) {
    throw new InvalidMetricsWindowError(`"${name}" must be an ISO-8601 timestamp, got "${value}"`);
  }
  return Date.parse(value);
}

export interface ReviewMetrics {
  /** Distinct elements that received at least one decision in the window. */
  readonly elementsReviewed: number;
  /** Total decisions recorded in the window (an element re-reviewed counts each time). */
  readonly decisions: number;
  readonly confirmed: number;
  readonly corrected: number;
  readonly rejected: number;
  /**
   * `corrected / decisions`, rounded to 4dp. `null` when no decision was
   * recorded -- an empty window has no correction rate, and reporting 0 would
   * claim a quality result that was never measured.
   */
  readonly correctionRate: number | null;
  /** `(corrected + rejected) / decisions` — how often a human disagreed with the extraction at all. `null` on an empty window. */
  readonly disagreementRate: number | null;
  /** True only when the window came from a real run boundary. False today: no orchestrator exists. */
  readonly runScoped: boolean;
  readonly window: { readonly from?: string; readonly to?: string };
  readonly summary: string;
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : Math.round((numerator / denominator) * 10_000) / 10_000;
}

/**
 * Computes review quality metrics over the decisions in a window.
 *
 * `from`/`to` are inclusive ISO-8601 bounds on the decision timestamp; omit
 * both for "everything recorded so far".
 */
export function computeReviewMetrics(
  decisions: readonly ReviewDecisionObject[],
  options: { from?: string; to?: string; runScoped?: boolean } = {},
): ReviewMetrics {
  const fromMs = boundMs(options.from, 'from');
  const toMs = boundMs(options.to, 'to');
  if (fromMs !== undefined && toMs !== undefined && fromMs > toMs) {
    throw new InvalidMetricsWindowError(
      `"from" (${String(options.from)}) is after "to" (${String(options.to)})`,
    );
  }

  const inWindow = decisions.filter((decision) => {
    const at = Date.parse(decision.lifecycle?.since ?? decision.identity.createdAt);
    if (fromMs !== undefined && at < fromMs) return false;
    if (toMs !== undefined && at > toMs) return false;
    return true;
  });

  const confirmed = inWindow.filter((d) => d.attributes.decision === 'confirmed').length;
  const corrected = inWindow.filter((d) => d.attributes.decision === 'corrected').length;
  const rejected = inWindow.filter((d) => d.attributes.decision === 'rejected').length;
  const elementsReviewed = new Set(inWindow.map((d) => String(d.attributes.targetObjectId))).size;

  const correctionRate = rate(corrected, inWindow.length);
  const runScoped = options.runScoped === true;

  return {
    elementsReviewed,
    decisions: inWindow.length,
    confirmed,
    corrected,
    rejected,
    correctionRate,
    disagreementRate: rate(corrected + rejected, inWindow.length),
    runScoped,
    window: {
      ...(options.from === undefined ? {} : { from: options.from }),
      ...(options.to === undefined ? {} : { to: options.to }),
    },
    summary:
      inWindow.length === 0
        ? 'No review decisions in this window, so no correction rate has been measured.'
        : `${inWindow.length} decision(s) across ${elementsReviewed} element(s): ${corrected} corrected, ${confirmed} confirmed, ${rejected} rejected. Correction rate ${String(correctionRate)}.${runScoped ? '' : ' Not run-scoped: no orchestrated run boundary exists yet.'}`,
  };
}
