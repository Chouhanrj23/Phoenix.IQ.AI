/**
 * P4-07 -- the graph query layer.
 *
 * Deliberately narrow: a small, fixed set of parameterized Cypher reads,
 * never arbitrary caller-supplied Cypher. This module is UI-agnostic --
 * it returns the real Neo4j label/relationship-type strings P4-01 produced
 * (e.g. `'Entity'`, `'DEPENDS_ON'`), not the Phoenix UI's own vocabulary.
 * Translating to `apps/web`'s `GraphNode`/`GraphEdge` shape is
 * `apps/api/src/services/graph.service.ts`'s job (the "graph API response
 * layer" ADR 0024 decision 7 named) -- keeping that UI-specific adapter out
 * of this package is what lets `@phoenix-ai/graph-persistence` stay usable
 * by any future consumer, not just this one UI.
 *
 * Every property value returned includes `provenanceJson`/`evidenceJson`
 * (P4-02's structured-property-object representation, `transform.ts`) as
 * plain JSON strings -- this module does not parse them, leaving that to
 * whichever caller actually needs the structured data (e.g. a node detail
 * view), so a caller that only needs the raw graph shape isn't forced to
 * pay a parse cost it doesn't need.
 */

import type { Driver } from 'neo4j-driver';
import { verifyNeo4jConnectivity } from './neo4j-client.js';

export interface QueriedNode {
  readonly id: string;
  readonly label: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface QueriedRelationship {
  readonly id: string;
  readonly type: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly properties: Readonly<Record<string, unknown>>;
}

export interface QueriedGraph {
  readonly nodes: readonly QueriedNode[];
  readonly relationships: readonly QueriedRelationship[];
}

function toQueriedNode(node: {
  labels: readonly string[];
  properties: Record<string, unknown>;
}): QueriedNode {
  const id = node.properties.id;
  if (typeof id !== 'string') {
    throw new Error(
      'a node in the graph is missing its "id" property -- this should be impossible for anything this package wrote',
    );
  }
  return { id, label: node.labels[0] ?? '', properties: node.properties };
}

/** Retrieves every node and every relationship currently in the graph -- "full graph retrieval", the UI's `getFullGraph()` needs. */
export async function getFullGraph(driver: Driver, database: string): Promise<QueriedGraph> {
  await verifyNeo4jConnectivity(driver, database);

  const session = driver.session({ database });
  try {
    return await session.executeRead(async (tx) => {
      const nodesResult = await tx.run('MATCH (n) RETURN n');
      const nodes = nodesResult.records.map((record) => toQueriedNode(record.get('n')));

      const relationshipsResult = await tx.run(
        'MATCH (source)-[r]->(target) RETURN r, source.id AS sourceId, target.id AS targetId',
      );
      const relationships: QueriedRelationship[] = relationshipsResult.records.map((record) => {
        const relationship = record.get('r');
        const id = relationship.properties.id;
        if (typeof id !== 'string') {
          throw new Error('a relationship in the graph is missing its "id" property');
        }
        return {
          id,
          type: relationship.type as string,
          sourceId: record.get('sourceId') as string,
          targetId: record.get('targetId') as string,
          properties: relationship.properties,
        };
      });

      return { nodes, relationships };
    });
  } finally {
    await session.close();
  }
}

/** Retrieves one node by its stable OKF id, or `undefined` if it does not exist in the graph. */
export async function getNodeById(
  driver: Driver,
  database: string,
  id: string,
): Promise<QueriedNode | undefined> {
  await verifyNeo4jConnectivity(driver, database);

  const session = driver.session({ database });
  try {
    const result = await session.executeRead((tx) =>
      tx.run('MATCH (n {id: $id}) RETURN n', { id }),
    );
    const record = result.records[0];
    return record === undefined ? undefined : toQueriedNode(record.get('n'));
  } finally {
    await session.close();
  }
}

/** Retrieves every relationship touching one node, in either direction -- what a node detail/dossier view needs ("relationship types" the tracker requires). */
export async function getRelationshipsForNode(
  driver: Driver,
  database: string,
  id: string,
): Promise<readonly QueriedRelationship[]> {
  await verifyNeo4jConnectivity(driver, database);

  const session = driver.session({ database });
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        'MATCH (n {id: $id})-[r]-(other) RETURN r, ' +
          'CASE WHEN startNode(r).id = $id THEN $id ELSE other.id END AS sourceId, ' +
          'CASE WHEN startNode(r).id = $id THEN other.id ELSE $id END AS targetId',
        { id },
      ),
    );
    return result.records.map((record) => {
      const relationship = record.get('r');
      const relId = relationship.properties.id;
      if (typeof relId !== 'string') {
        throw new Error('a relationship in the graph is missing its "id" property');
      }
      return {
        id: relId,
        type: relationship.type as string,
        sourceId: record.get('sourceId') as string,
        targetId: record.get('targetId') as string,
        properties: relationship.properties,
      };
    });
  } finally {
    await session.close();
  }
}
