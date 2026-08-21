/**
 * P4-03/P4-04 -- real Neo4j node and relationship persistence.
 *
 * Executes the parameterized `MERGE` write operations P4-02
 * (`transform.ts`) already built, inside one explicit write transaction per
 * ingestion call (`session.executeWrite`, the driver's own managed-
 * transaction API -- it auto-commits on success and auto-rolls-back on any
 * thrown error, so this module does not hand-roll commit/rollback logic).
 *
 * Ordering within the transaction: every node operation runs before any
 * relationship operation, since a relationship's `MATCH` needs its
 * endpoints to already exist -- either persisted by an earlier ingestion
 * call, or (the common case) by the node operations earlier in this SAME
 * transaction.
 *
 * Failure handling, precisely:
 *  - Neo4j unreachable / wrong credentials / wrong database -- detected
 *    BEFORE any write is attempted, by calling the already-real-tested
 *    `verifyNeo4jConnectivity` (`neo4j-client.ts`) as a guard clause. Throws
 *    the existing `Neo4jUnavailableError`, never a new, separately-invented
 *    connectivity error type.
 *  - A relationship whose source/target id does not (yet) exist in the
 *    graph -- `MATCH` matches zero rows, so its `MERGE` never runs, and the
 *    query returns zero records. This is detected explicitly (never
 *    silently ignored: "handle invalid endpoints safely" means reporting
 *    them, not pretending they succeeded) and fails the WHOLE transaction --
 *    a batch containing a dangling relationship reference indicates the
 *    input itself is incomplete or wrong (P2's own
 *    `validateCanonicalKnowledgeBundle` should already have caught this
 *    upstream), so partially committing the rest would leave the graph
 *    silently inconsistent with what was actually intended. Everything in
 *    that transaction rolls back together.
 *  - Any other failure (a malformed write operation, a dropped connection
 *    mid-transaction, ...) is caught, the transaction rolls back
 *    (automatically, via `executeWrite`), and a `GraphIngestionError`
 *    carrying the original error as `.cause` is thrown -- never a silent
 *    success, always actionable.
 *
 * Idempotency: because P4-02's write operations `MERGE` on the OKF's own
 * stable id (never on any other property), re-running `ingestGraphWriteOperations`
 * with identical input converges to the same nodes/relationships every
 * time -- proven by real-Neo4j tests (`ingest.test.ts`) that ingest twice
 * and assert the node/relationship count is unchanged.
 */

import type { Driver } from 'neo4j-driver';
import { verifyNeo4jConnectivity } from './neo4j-client.js';
import type { GraphWriteOperations } from './transform.js';

/** Thrown for any ingestion-logic failure (malformed write operation, missing relationship endpoint, ...) -- distinct from `Neo4jUnavailableError` (connectivity/auth), which is thrown separately and never wrapped by this type. */
export class GraphIngestionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'GraphIngestionError';
  }
}

export interface NodeIngestionResult {
  readonly id: string;
  readonly label: string;
}

export interface RelationshipIngestionResult {
  readonly id: string;
  readonly type: string;
}

export interface RelationshipIngestionFailure {
  readonly id: string;
  readonly type: string;
  readonly reason: string;
}

export interface IngestResult {
  readonly nodesWritten: readonly NodeIngestionResult[];
  readonly relationshipsWritten: readonly RelationshipIngestionResult[];
}

/**
 * Persists every node then every relationship in `operations`, in one
 * transaction. Never persists anything not present in `operations` --
 * "no fabricated relationships" is structural here: this function has no
 * code path that creates a node or edge it was not explicitly asked to
 * write.
 */
export async function ingestGraphWriteOperations(
  driver: Driver,
  database: string,
  operations: GraphWriteOperations,
): Promise<IngestResult> {
  await verifyNeo4jConnectivity(driver, database);

  const session = driver.session({ database });
  try {
    return await session.executeWrite(async (tx) => {
      const nodesWritten: NodeIngestionResult[] = [];
      for (const op of operations.nodeOperations) {
        const result = await tx.run(op.cypher, op.params);
        if (result.records.length === 0) {
          throw new GraphIngestionError(
            `Node write for id "${op.id}" (label ${op.label}) returned no rows -- malformed write operation`,
          );
        }
        nodesWritten.push({ id: op.id, label: op.label });
      }

      const relationshipsWritten: RelationshipIngestionResult[] = [];
      const relationshipFailures: RelationshipIngestionFailure[] = [];
      for (const op of operations.relationshipOperations) {
        const result = await tx.run(op.cypher, op.params);
        if (result.records.length === 0) {
          relationshipFailures.push({
            id: op.id,
            type: op.type,
            reason: `source ("${op.sourceId}") or target ("${op.targetId}") node does not exist in the graph`,
          });
          continue;
        }
        relationshipsWritten.push({ id: op.id, type: op.type });
      }

      if (relationshipFailures.length > 0) {
        throw new GraphIngestionError(
          `${relationshipFailures.length} relationship(s) could not be created because an endpoint is missing: ${relationshipFailures
            .map((f) => `${f.id} (${f.type}): ${f.reason}`)
            .join('; ')}`,
        );
      }

      return { nodesWritten, relationshipsWritten };
    });
  } catch (error) {
    if (error instanceof GraphIngestionError) throw error;
    throw new GraphIngestionError(
      `Graph ingestion failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    await session.close();
  }
}
