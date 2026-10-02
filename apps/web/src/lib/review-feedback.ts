import type { ReviewDecisionOutcome } from '../data/index.js';

/**
 * P7-04 — the one place that decides what Phoenix tells a reviewer about
 * where their decision went.
 *
 * Shared by `ReviewPage` and the Correlation Explorer's detail panel so both
 * surfaces tell the identical story. Durability (was the decision stored, and
 * how durably) and propagation (did it reach the canonical graph) are reported
 * SEPARATELY, because they genuinely differ: a decision can be durably stored
 * while the reviewed element has no graph node to update.
 */

/**
 * Phoenix has no authentication, so a reviewer's identity cannot be
 * established. The persisted decision carries `reviewerVerified: false`
 * alongside this value so nothing downstream mistakes a placeholder for a
 * verified identity.
 */
export const REVIEWER_ID = 'unauthenticated-reviewer';

/** Where the decision itself was stored. Never says "saved" without saying where. */
export const DURABILITY_NOTE: Record<'graph' | 'memory', string> = {
  graph: 'Saved to the knowledge graph.',
  memory:
    'Saved on the server, but in memory only — this will survive a page refresh, not an API restart.',
};

/** Whether the correction reached the canonical graph representation. */
export const PROPAGATION_NOTE: Record<
  NonNullable<ReviewDecisionOutcome['propagation']>['outcome'],
  string
> = {
  propagated: 'The reviewed element was updated in the knowledge graph.',
  'target-missing':
    'The reviewed element has no node in the knowledge graph yet, so nothing there was updated.',
  'graph-unavailable': 'The knowledge graph was unreachable, so it was not updated.',
  failed: 'Applying it to the knowledge graph failed.',
};

export interface ReviewActionOutcome {
  kind: 'ok' | 'error';
  message: string;
}

/**
 * Turns a provider result into exactly one sentence pair: what was stored, and
 * whether it reached the graph. Returns an `error` outcome when nothing was
 * persisted, so a caller cannot accidentally render a success.
 */
export function describeReviewOutcome(result: ReviewDecisionOutcome): ReviewActionOutcome {
  if (result.durability === 'none') {
    return { kind: 'error', message: result.reason ?? 'This decision was not saved.' };
  }
  const parts = [DURABILITY_NOTE[result.durability]];
  if (result.propagation !== undefined) parts.push(PROPAGATION_NOTE[result.propagation.outcome]);
  return { kind: 'ok', message: parts.join(' ') };
}
