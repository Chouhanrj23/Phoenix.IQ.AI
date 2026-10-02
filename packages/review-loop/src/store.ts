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

/** Oldest-first by `lifecycle.since`, falling back to `identity.createdAt`, with `identity.id` as a deterministic tie-break. */
export function sortDecisions(
  decisions: readonly ReviewDecisionObject[],
): readonly ReviewDecisionObject[] {
  return [...decisions].sort((a, b) => {
    const aAt = a.lifecycle?.since ?? a.identity.createdAt;
    const bAt = b.lifecycle?.since ?? b.identity.createdAt;
    return aAt.localeCompare(bAt) || a.identity.id.localeCompare(b.identity.id);
  });
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
