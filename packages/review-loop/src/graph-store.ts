/**
 * P7-01 -- the durable review decision store: Neo4j, via the Phase 4 write
 * path, with no new persistence machinery of its own.
 *
 * `save` reuses `mapOkfObjectToGraphNode` -> `buildGraphWriteOperations` ->
 * `ingestGraphWriteOperations` exactly as Phase 4 established, so a decision
 * is written by the same tested, transactional, `MERGE`-keyed code path as
 * every other graph element. Two properties of that path matter here and are
 * inherited rather than reimplemented:
 *
 *  - `MERGE (n:ReviewDecision {id}) SET n += $properties` -- re-submitting
 *    the same decision converges to one node, never a duplicate.
 *  - the whole write (decision node + `REVIEW_OF` edge) runs in ONE
 *    transaction that rolls back as a unit, so a partial write cannot leave
 *    an orphaned decision.
 *
 * The `REVIEW_OF` edge is conditional BY DESIGN. `ingestGraphWriteOperations`
 * THROWS `GraphIngestionError` when a relationship endpoint is missing (it
 * does not silently skip it), and the reviewed element is not guaranteed to
 * be in the graph -- the review queue is still seed-derived, so a target may
 * legitimately have no node yet. Including the edge unconditionally would
 * therefore roll back the whole transaction and lose the decision, so the
 * edge is included ONLY when the target node actually exists. The decision
 * is persisted either way, and `attributes.targetObjectId` remains the
 * authoritative binding -- which is why reads filter on that property rather
 * than traversing the edge.
 *
 * NOTE ON VERIFICATION: the live Neo4j path could not be exercised in the
 * environment this was written in (the local instance was unreachable --
 * `ServiceUnavailable`). Its write-operation CONSTRUCTION is unit-tested
 * (`tests/graph-store.test.ts`), and `tests/graph-store.integration.test.ts`
 * exercises the real round trip but SKIPS when no instance is reachable.
 * Until that integration test has been seen to run, treat the live path as
 * implemented-but-unverified.
 */

import type { Driver } from 'neo4j-driver';
import {
  buildGraphWriteOperations,
  buildRelationshipWriteOperation,
  getNodeById,
  ingestGraphWriteOperations,
  mapOkfObjectToGraphNode,
  type GraphRelationshipMapping,
} from '@phoenix-ai/graph-persistence';
import type { Provenance } from '@phoenix-ai/shared';
import type { Evidence, ReviewDecisionObject } from '@phoenix-ai/knowledge-graph';
import { sortDecisions, type ReviewDecisionStore } from './store.js';
import { buildCorrectionNodeOperation } from './propagation.js';

/** Raised when a decision cannot be mapped to a graph node -- a programming error, not a storage failure. */
export class ReviewDecisionMappingError extends Error {
  constructor(reason: string) {
    super(`review decision cannot be mapped to a graph node: ${reason}`);
    this.name = 'ReviewDecisionMappingError';
  }
}

/** The `REVIEW_OF` edge from a decision to the element it reviewed. Deterministic id, so re-submitting converges on one edge. */
export function buildReviewOfRelationship(
  decision: ReviewDecisionObject,
): GraphRelationshipMapping {
  const targetAttribute = decision.attributes.targetAttribute;
  return {
    id: `${decision.identity.id}:reviewOf`,
    type: 'REVIEW_OF',
    sourceId: decision.identity.id,
    targetId: decision.attributes.targetObjectId,
    properties: typeof targetAttribute === 'string' ? { attribute: targetAttribute } : {},
    provenance: decision.metadata.provenance,
    evidence: decision.evidence,
  };
}

/**
 * Maps a decision into the node + edge write operations Phase 4 executes.
 * Exported so the construction is testable without a live database.
 *
 * `includeReviewOfEdge` must be false when the reviewed element has no node
 * in the graph -- see this file's header for why including it anyway would
 * lose the decision entirely.
 */
export function buildReviewDecisionWriteOperations(
  decision: ReviewDecisionObject,
  includeReviewOfEdge = true,
) {
  const node = mapOkfObjectToGraphNode(decision);
  if (!node.ok) throw new ReviewDecisionMappingError(node.issue.reason);
  return buildGraphWriteOperations({
    nodes: [node.node],
    relationships: includeReviewOfEdge ? [buildReviewOfRelationship(decision)] : [],
  });
}

function parseJsonArray<T>(value: unknown): T[] {
  if (typeof value !== 'string' || value.length === 0) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/**
 * Rebuilds a decision from the flattened node properties Phase 4's mapping
 * writes (`attr_*` for attributes, `provenanceJson`/`evidenceJson`,
 * `lifecycle*`, `confidence*`). The inverse of `mapOkfObjectToGraphNode` for
 * this one kind -- exported so the round trip is testable without a driver.
 */
export function reviewDecisionFromNodeProperties(
  properties: Record<string, unknown>,
): ReviewDecisionObject | undefined {
  const id = properties.id;
  const targetObjectId = properties.attr_targetObjectId;
  const decision = properties.attr_decision;
  if (
    typeof id !== 'string' ||
    typeof targetObjectId !== 'string' ||
    (decision !== 'confirmed' && decision !== 'corrected')
  ) {
    return undefined;
  }

  const attributes: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (!key.startsWith('attr_')) continue;
    if (key.endsWith('_json')) {
      attributes[key.slice('attr_'.length, -'_json'.length)] = JSON.parse(String(value));
    } else {
      attributes[key.slice('attr_'.length)] = value;
    }
  }

  const rationale = properties.confidenceRationale;
  const previousStatus = properties.lifecyclePreviousStatus;
  const calculationMethod = properties.confidenceCalculationMethod;

  return {
    identity: {
      id,
      systemId: String(properties.systemId ?? ''),
      createdAt: String(properties.createdAt ?? ''),
      updatedAt: String(properties.updatedAt ?? ''),
      schemaVersion: String(properties.schemaVersion ?? '1.0.0'),
    },
    category: 'observation',
    kind: 'review.decision',
    label: String(properties.label ?? ''),
    attributes: attributes as ReviewDecisionObject['attributes'],
    metadata: {
      provenance: parseJsonArray<Provenance>(properties.provenanceJson),
      confidence: {
        level: (properties.confidenceLevel as 'high' | 'medium' | 'low' | 'inferred') ?? 'high',
        ...(typeof rationale === 'string' ? { rationale } : {}),
      },
    },
    evidence: parseJsonArray<Evidence>(properties.evidenceJson),
    lifecycle: {
      status: String(properties.lifecycleStatus ?? decision),
      since: String(properties.lifecycleSince ?? properties.createdAt ?? ''),
      ...(typeof previousStatus === 'string' ? { previousStatus } : {}),
    },
    confidenceDetail: {
      basis: 'observed',
      ...(typeof calculationMethod === 'string'
        ? {
            calculation: {
              method: calculationMethod,
              calculatedAt: String(properties.confidenceCalculatedAt ?? properties.createdAt ?? ''),
            },
          }
        : {}),
    },
  };
}

export type CorrectionPropagationOutcome =
  /** The reviewed element's node was updated in place. */
  | 'propagated'
  /** The reviewed element has no node in the graph, so there was nothing to update. Not an error. */
  | 'target-missing';

export interface CorrectionPropagationResult {
  readonly outcome: CorrectionPropagationOutcome;
  readonly targetObjectId: string;
  readonly reason: string;
}

/**
 * P7-02 -- carries a persisted decision onto the reviewed element's EXISTING
 * graph node, and re-asserts the `REVIEW_OF` edge in the same transaction so
 * the decision-to-element relationship is present even if it could not be
 * created when the decision was first saved.
 *
 * Returns `target-missing` (rather than throwing, and rather than creating a
 * node) when the reviewed element is not in the graph -- a real situation
 * while the review queue is still seed-derived.
 */
export async function propagateCorrectionToGraph(
  driver: Driver,
  database: string,
  decision: ReviewDecisionObject,
  options: { at: string },
): Promise<CorrectionPropagationResult> {
  const targetObjectId = decision.attributes.targetObjectId;
  const target = await getNodeById(driver, database, targetObjectId);
  if (target === undefined) {
    return {
      outcome: 'target-missing',
      targetObjectId,
      reason: `no node with id "${targetObjectId}" exists in the graph, so there is nothing to update -- the decision remains persisted and bound to it by id`,
    };
  }

  await ingestGraphWriteOperations(driver, database, {
    nodeOperations: [buildCorrectionNodeOperation(decision, options)],
    relationshipOperations: [buildRelationshipWriteOperation(buildReviewOfRelationship(decision))],
  });

  return {
    outcome: 'propagated',
    targetObjectId,
    reason: 'the reviewed element node was updated in place and linked to the decision',
  };
}

/**
 * Durable store backed by Neo4j. Any connectivity failure propagates
 * (`Neo4jUnavailableError` from the Phase 4 client) -- it is NEVER swallowed
 * into a false success, so the caller can report honestly that nothing was
 * saved.
 */
export function createGraphReviewDecisionStore(
  driver: Driver,
  database: string,
): ReviewDecisionStore {
  async function query(cypher: string, params: Record<string, unknown>) {
    const session = driver.session({ database });
    try {
      return await session.executeRead((tx) => tx.run(cypher, params));
    } finally {
      await session.close();
    }
  }

  async function read(cypher: string, params: Record<string, unknown>) {
    const result = await query(cypher, params);
    const decisions = result.records
      .map((record) => reviewDecisionFromNodeProperties(record.get('n').properties))
      .filter((d): d is ReviewDecisionObject => d !== undefined);
    return sortDecisions(decisions);
  }

  return {
    durability: 'graph',
    async save(decision) {
      // Only link to the reviewed element when it really is in the graph --
      // see the header: an absent endpoint would abort the whole transaction.
      const target = await getNodeById(driver, database, decision.attributes.targetObjectId);
      await ingestGraphWriteOperations(
        driver,
        database,
        buildReviewDecisionWriteOperations(decision, target !== undefined),
      );
    },
    listForTarget(targetObjectId) {
      return read('MATCH (n:ReviewDecision {attr_targetObjectId: $targetObjectId}) RETURN n', {
        targetObjectId,
      });
    },
    listAll() {
      return read('MATCH (n:ReviewDecision) RETURN n', {});
    },
  };
}
