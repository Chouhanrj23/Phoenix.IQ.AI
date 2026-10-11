/**
 * P4-07 -- the graph API's service layer. Bridges `apps/api`'s existing
 * routes/services convention to `@phoenix-ai/graph-persistence`'s
 * UI-agnostic query layer (`query.ts`), translating its real Neo4j
 * label/relationship-type output into the shape `apps/web`'s
 * `GraphNode`/`GraphEdge` (`apps/web/src/data/types.ts`) expects -- the
 * "graph API response layer" adapter ADR 0024 decision 7 named, not yet
 * built until now.
 *
 * The driver is created lazily, on first use, not at module load -- eagerly
 * calling `loadNeo4jConfig()` at import time would make the whole API
 * process fail to start whenever Neo4j is not configured (e.g. Phase 1-3
 * development that never touches the graph), which would be a regression
 * unrelated to this ticket's scope.
 */

import {
  closeNeo4jDriver,
  createNeo4jDriver,
  getFullGraph as queryFullGraph,
  loadNeo4jConfig,
  Neo4jUnavailableError,
  type GraphScope,
  type Neo4jConfig,
  type QueriedNode,
  type QueriedRelationship,
} from '@phoenix-ai/graph-persistence';
import type { Driver } from 'neo4j-driver';

export interface GraphApiNode {
  id: string;
  label: string;
  /** The real Neo4j node label (e.g. "Entity", "Api") -- P4-01's mapping already translated the OKF's dotted `kind` into this Title-Case form, so it doubles directly as the UI's `GraphNode.kind`. */
  kind: string;
  confidenceLevel: string;
}

export interface GraphApiEdge {
  id: string;
  source: string;
  target: string;
  /** The OKF relationship `kind` (e.g. "dependsOn", "contains") -- `GraphEdge` has no typed relationship-kind field, so this is carried in `label`, the same field the UI already renders on every edge. */
  label?: string;
}

export interface FullGraphResponse {
  nodes: GraphApiNode[];
  edges: GraphApiEdge[];
}

let cachedDriver: Driver | undefined;
let cachedConfig: Neo4jConfig | undefined;

function getDriverAndConfig(): { driver: Driver; config: Neo4jConfig } {
  if (cachedDriver === undefined || cachedConfig === undefined) {
    try {
      cachedConfig = loadNeo4jConfig();
    } catch (error) {
      // P8: no graph configured is an unavailable graph (503, with the
      // route's honest message) -- not an unexplained 500. The review store
      // already treats the same condition as "graph unavailable".
      throw new Neo4jUnavailableError(
        `the knowledge graph is not configured: ${error instanceof Error ? error.message : String(error)}`,
        { cause: error },
      );
    }
    cachedDriver = createNeo4jDriver(cachedConfig);
  }
  return { driver: cachedDriver, config: cachedConfig };
}

/** Closes the cached driver, if one was ever created -- for graceful shutdown and test cleanup. */
export async function closeGraphServiceDriver(): Promise<void> {
  if (cachedDriver !== undefined) {
    await closeNeo4jDriver(cachedDriver);
    cachedDriver = undefined;
    cachedConfig = undefined;
  }
}

function toApiNode(node: QueriedNode): GraphApiNode {
  const label = node.properties.label;
  const confidenceLevel = node.properties.confidenceLevel;
  return {
    id: node.id,
    label: typeof label === 'string' ? label : node.id,
    kind: node.label,
    confidenceLevel: typeof confidenceLevel === 'string' ? confidenceLevel : 'inferred',
  };
}

function toApiEdge(relationship: QueriedRelationship): GraphApiEdge {
  const kind = relationship.properties.kind;
  return {
    id: relationship.id,
    source: relationship.sourceId,
    target: relationship.targetId,
    ...(typeof kind === 'string' ? { label: kind } : {}),
  };
}

export async function getFullGraph(scope?: GraphScope): Promise<FullGraphResponse> {
  const { driver, config } = getDriverAndConfig();
  const graph = await queryFullGraph(driver, config.database, scope);
  return {
    nodes: graph.nodes.map(toApiNode),
    edges: graph.relationships.map(toApiEdge),
  };
}
