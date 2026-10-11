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
import { compareCodeUnits } from '@phoenix-ai/shared';
import { asNeo4jUnavailable, verifyNeo4jConnectivity } from './neo4j-client.js';

/**
 * P8 -- Cypher returns rows in storage order unless told otherwise, and that
 * order shifts as nodes are written, updated and deleted. Every result is
 * therefore returned sorted by stable id (code-unit order, locale-free), so
 * the same graph always reads back in the same order -- for the API, the
 * consistency check, and every view built on them.
 */
/**
 * P8 -- FR-ORC-04: restricts a read to one system (tenant). Every node
 * carries `systemId`; a scoped read returns only that system's nodes and
 * relationships whose BOTH endpoints belong to it. Omitted, a read is
 * unscoped -- callers serving a tenant (the API) always pass one.
 */
export interface GraphScope {
  readonly systemId: string;
}

function byId<T extends { readonly id: string }>(items: T[]): T[] {
  return items.sort((a, b) => compareCodeUnits(a.id, b.id));
}

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
export async function getFullGraph(
  driver: Driver,
  database: string,
  scope?: GraphScope,
): Promise<QueriedGraph> {
  await verifyNeo4jConnectivity(driver, database);

  const session = driver.session({ database });
  try {
    return await session.executeRead(async (tx) => {
      const nodesResult =
        scope === undefined
          ? await tx.run('MATCH (n) RETURN n')
          : await tx.run('MATCH (n) WHERE n.systemId = $systemId RETURN n', {
              systemId: scope.systemId,
            });
      const nodes = nodesResult.records.map((record) => toQueriedNode(record.get('n')));

      const relationshipsResult =
        scope === undefined
          ? await tx.run(
              'MATCH (source)-[r]->(target) RETURN r, source.id AS sourceId, target.id AS targetId',
            )
          : await tx.run(
              'MATCH (source)-[r]->(target) WHERE source.systemId = $systemId AND target.systemId = $systemId RETURN r, source.id AS sourceId, target.id AS targetId',
              { systemId: scope.systemId },
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

      return { nodes: byId(nodes), relationships: byId(relationships) };
    });
  } catch (error) {
    // Connection lost after the connectivity check: still "unavailable".
    throw asNeo4jUnavailable(error, database);
  } finally {
    await session.close();
  }
}

/** One relationship's endpoints, by stable node id -- nothing else. */
export interface RelationshipEndpointIds {
  readonly sourceId: string;
  readonly targetId: string;
}

/**
 * P8 -- every relationship's endpoint ids, and nothing else.
 *
 * For callers that only need graph STRUCTURE (e.g. degree centrality for the
 * review queue). `getFullGraph` returns every node and relationship with all
 * of their properties -- including the provenance/evidence JSON blobs -- so
 * using it for structure transferred and held the whole graph in memory on
 * every request. One query, two scalar columns per relationship.
 */
export async function getRelationshipEndpoints(
  driver: Driver,
  database: string,
  scope?: GraphScope,
): Promise<readonly RelationshipEndpointIds[]> {
  await verifyNeo4jConnectivity(driver, database);

  const session = driver.session({ database });
  try {
    const result = await session.executeRead((tx) =>
      scope === undefined
        ? tx.run('MATCH (source)-[r]->(target) RETURN source.id AS sourceId, target.id AS targetId')
        : tx.run(
            'MATCH (source)-[r]->(target) WHERE source.systemId = $systemId AND target.systemId = $systemId RETURN source.id AS sourceId, target.id AS targetId',
            { systemId: scope.systemId },
          ),
    );
    return result.records
      .map((record) => ({
        sourceId: record.get('sourceId') as string,
        targetId: record.get('targetId') as string,
      }))
      .sort(
        (a, b) =>
          compareCodeUnits(a.sourceId, b.sourceId) || compareCodeUnits(a.targetId, b.targetId),
      );
  } catch (error) {
    throw asNeo4jUnavailable(error, database);
  } finally {
    await session.close();
  }
}

/** Retrieves one node by its stable OKF id, or `undefined` if it does not exist in the graph. */
export async function getNodeById(
  driver: Driver,
  database: string,
  id: string,
  scope?: GraphScope,
): Promise<QueriedNode | undefined> {
  await verifyNeo4jConnectivity(driver, database);

  const session = driver.session({ database });
  try {
    const result = await session.executeRead((tx) =>
      scope === undefined
        ? tx.run('MATCH (n {id: $id}) RETURN n', { id })
        : tx.run('MATCH (n {id: $id, systemId: $systemId}) RETURN n', {
            id,
            systemId: scope.systemId,
          }),
    );
    const record = result.records[0];
    return record === undefined ? undefined : toQueriedNode(record.get('n'));
  } catch (error) {
    // Connection lost after the connectivity check: still "unavailable".
    throw asNeo4jUnavailable(error, database);
  } finally {
    await session.close();
  }
}

/** Retrieves every relationship touching one node, in either direction -- what a node detail/dossier view needs ("relationship types" the tracker requires). */
export async function getRelationshipsForNode(
  driver: Driver,
  database: string,
  id: string,
  scope?: GraphScope,
): Promise<readonly QueriedRelationship[]> {
  await verifyNeo4jConnectivity(driver, database);

  const session = driver.session({ database });
  try {
    const result = await session.executeRead((tx) =>
      tx.run(
        (scope === undefined
          ? 'MATCH (n {id: $id})-[r]-(other) RETURN r, '
          : 'MATCH (n {id: $id, systemId: $systemId})-[r]-(other) WHERE other.systemId = $systemId RETURN r, ') +
          'CASE WHEN startNode(r).id = $id THEN $id ELSE other.id END AS sourceId, ' +
          'CASE WHEN startNode(r).id = $id THEN other.id ELSE $id END AS targetId',
        scope === undefined ? { id } : { id, systemId: scope.systemId },
      ),
    );
    return byId(
      result.records.map((record) => {
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
      }),
    );
  } catch (error) {
    // Connection lost after the connectivity check: still "unavailable".
    throw asNeo4jUnavailable(error, database);
  } finally {
    await session.close();
  }
}
