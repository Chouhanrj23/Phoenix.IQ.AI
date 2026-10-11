/**
 * P8 -- writes a bundle's graph plan to Neo4j and proves it landed.
 *
 * Persisting is not enough to claim the graph is current: the graph is read
 * back and compared to the bundle with Phase 4's own consistency checker
 * (`checkGraphConsistency`). Only differences for elements THIS bundle owns
 * count -- an `extra-node`/`extra-relationship` is another system's data
 * sharing the database, not a defect of this run.
 */

import type { Driver } from 'neo4j-driver';
import {
  checkGraphConsistency,
  getFullGraph,
  ingestGraphWriteOperations,
  type ConsistencyDifference,
  type GraphWriteOperations,
} from '@phoenix-ai/graph-persistence';
import type { CanonicalKnowledgeBundle } from '@phoenix-ai/knowledge-graph';

export interface GraphTarget {
  readonly driver: Driver;
  readonly database: string;
}

export async function persistAndVerify(
  target: GraphTarget,
  bundle: CanonicalKnowledgeBundle,
  operations: GraphWriteOperations,
): Promise<{ differences: readonly ConsistencyDifference[] }> {
  await ingestGraphWriteOperations(target.driver, target.database, operations);
  const actual = await getFullGraph(target.driver, target.database);
  const report = checkGraphConsistency(bundle, actual);
  return {
    differences: report.differences.filter(
      (d) => d.kind !== 'extra-node' && d.kind !== 'extra-relationship',
    ),
  };
}
