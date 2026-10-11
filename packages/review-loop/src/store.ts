/**
 * P7-01 -- the review decision store: the one abstraction every persistence
 * mechanism implements, and the one seam the API depends on.
 *
 * Two implementations ship in this package:
 *
 *  - `createGraphReviewDecisionStore` (`graph-store.ts`) -- durable,
 *    persisting decisions as real `:ReviewDecision` nodes in Neo4j via the
 *    Phase 4 write path. The intended production mechanism.
 *  - `createInMemoryReviewDecisionStore` (below) -- NOT durable. Survives a
 *    browser refresh (the state lives in the API process, not the client),
 *    but not an API restart.
 *
 * `durability` is on the interface, not a footnote, precisely so a caller
 * can NEVER report "saved" without also reporting what kind of saved. The
 * API surfaces it in every response and the UI shows it to the reviewer --
 * Phoenix does not claim backend durability it does not have.
 */

import type { ReviewDecisionObject } from '@phoenix-ai/knowledge-graph';
import { compareCodeUnits } from '@phoenix-ai/shared';

/**
 * `graph`  -- persisted to Neo4j; survives an API restart.
 * `memory` -- persisted in the API process only; survives a client refresh,
 *             lost on API restart. Never describe this as durable.
 */
export type ReviewStoreDurability = 'graph' | 'memory';

export interface ReviewDecisionStore {
  readonly durability: ReviewStoreDurability;
  /**
   * Persists one decision. Idempotent by `identity.id` -- the same decision
   * submitted twice converges to one record, never two (the ids are
   * deterministic, see `reviewDecisionId`).
   */
  save(decision: ReviewDecisionObject): Promise<void>;
  /** Every decision recorded against one reviewed element, oldest first. */
  listForTarget(targetObjectId: string): Promise<readonly ReviewDecisionObject[]>;
  /** Every decision, oldest first -- the append-only audit log. */
  listAll(): Promise<readonly ReviewDecisionObject[]>;
}

function decidedAt(decision: ReviewDecisionObject): string {
  return decision.lifecycle?.since ?? decision.identity.createdAt;
}

/** Compares two ISO-8601 instants as instants (so `...00Z` equals `...00.000Z`), falling back to string order only when either is unparseable. */
function compareInstants(a: string, b: string): number {
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);
  if (Number.isNaN(aMs) || Number.isNaN(bMs)) return compareCodeUnits(a, b);
  return aMs - bMs;
}

/**
 * Oldest-first by `lifecycle.since` (falling back to `identity.createdAt`).
 *
 * Decisions recorded in the SAME millisecond are ordered by their
 * `supersedesDecisionId` chain -- a decision always comes after the one it
 * supersedes -- and only then by `identity.id`. `reviewDecisionId` exists
 * precisely so two different same-millisecond decisions (a confirm
 * immediately followed by a correction) both survive; before P8 their order
 * was then decided by comparing those hash-bearing ids, so the correction
 * could sort BEFORE the confirmation it superseded, and every "latest
 * decision" reading (status, current value, the next decision's predecessor)
 * picked the wrong one.
 */
export function sortDecisions(
  decisions: readonly ReviewDecisionObject[],
): readonly ReviewDecisionObject[] {
  const byInstant = [...decisions].sort(
    (a, b) =>
      compareInstants(decidedAt(a), decidedAt(b)) || compareCodeUnits(a.identity.id, b.identity.id),
  );

  const ordered: ReviewDecisionObject[] = [];
  let start = 0;
  while (start < byInstant.length) {
    let end = start + 1;
    while (
      end < byInstant.length &&
      compareInstants(decidedAt(byInstant[start]!), decidedAt(byInstant[end]!)) === 0
    ) {
      end++;
    }
    ordered.push(...orderBySupersession(byInstant.slice(start, end)));
    start = end;
  }
  return ordered;
}

/**
 * Orders decisions that share one instant so each follows the decision it
 * supersedes. Input is already id-sorted, which keeps every remaining choice
 * deterministic. Anything not reachable from a chain root (only possible
 * with a malformed cycle) is appended in id order -- never dropped.
 */
function orderBySupersession(group: readonly ReviewDecisionObject[]): ReviewDecisionObject[] {
  if (group.length < 2) return [...group];

  const ids = new Set(group.map((d) => d.identity.id));
  const successors = new Map<string, ReviewDecisionObject[]>();
  const roots: ReviewDecisionObject[] = [];
  for (const decision of group) {
    const predecessor = decision.attributes.supersedesDecisionId;
    if (typeof predecessor === 'string' && ids.has(predecessor)) {
      successors.set(predecessor, [...(successors.get(predecessor) ?? []), decision]);
    } else {
      roots.push(decision);
    }
  }

  const ordered: ReviewDecisionObject[] = [];
  const placed = new Set<string>();
  const visit = (decision: ReviewDecisionObject): void => {
    if (placed.has(decision.identity.id)) return;
    placed.add(decision.identity.id);
    ordered.push(decision);
    for (const next of successors.get(decision.identity.id) ?? []) visit(next);
  };
  for (const root of roots) visit(root);
  for (const decision of group) visit(decision);
  return ordered;
}

/**
 * In-process store. Used by the API when the graph is unreachable, and by
 * tests. Explicitly `durability: 'memory'` so nothing downstream can mistake
 * it for durable storage.
 */
export function createInMemoryReviewDecisionStore(
  seed: readonly ReviewDecisionObject[] = [],
): ReviewDecisionStore {
  const byId = new Map<string, ReviewDecisionObject>(seed.map((d) => [d.identity.id, d]));

  return {
    durability: 'memory',
    save(decision) {
      byId.set(decision.identity.id, decision);
      return Promise.resolve();
    },
    listForTarget(targetObjectId) {
      const matches = [...byId.values()].filter(
        (d) => d.attributes.targetObjectId === targetObjectId,
      );
      return Promise.resolve(sortDecisions(matches));
    },
    listAll() {
      return Promise.resolve(sortDecisions([...byId.values()]));
    },
  };
}
