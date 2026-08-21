import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Neo4jContainer, type StartedNeo4jContainer } from '@testcontainers/neo4j';
import neo4j, { type Driver } from 'neo4j-driver';
import { ingestGraphWriteOperations } from '../src/ingest.js';
import { buildGraphWriteOperations } from '../src/transform.js';
import { getFullGraph, getNodeById, getRelationshipsForNode } from '../src/query.js';
import type { GraphNodeMapping, GraphRelationshipMapping } from '../src/graph-mapping.js';

const STARTUP_TIMEOUT_MS = 180_000;

let container: StartedNeo4jContainer;
let driver: Driver;
const DATABASE = 'neo4j';

beforeAll(async () => {
  container = await new Neo4jContainer('neo4j:5-community').start();
  driver = neo4j.driver(container.getBoltUri(), neo4j.auth.basic('neo4j', container.getPassword()));
}, STARTUP_TIMEOUT_MS);

afterAll(async () => {
  await driver?.close();
  if (container !== undefined) await container.stop();
});

afterEach(async () => {
  const session = driver.session({ database: DATABASE });
  try {
    await session.run('MATCH (n) DETACH DELETE n');
  } finally {
    await session.close();
  }
});

const API_NODE: GraphNodeMapping = {
  id: 'api-1',
  label: 'Api',
  properties: {
    id: 'api-1',
    kind: 'integration.api',
    label: 'CheckoutController',
    confidenceLevel: 'high',
  },
  provenance: [],
  evidence: [],
};

const ENTITY_NODE: GraphNodeMapping = {
  id: 'ent-1',
  label: 'Entity',
  properties: { id: 'ent-1', kind: 'domain.entity', label: 'Order', confidenceLevel: 'high' },
  provenance: [],
  evidence: [],
};

const DEPENDS_ON: GraphRelationshipMapping = {
  id: 'rel-1',
  type: 'DEPENDS_ON',
  sourceId: API_NODE.id,
  targetId: ENTITY_NODE.id,
  properties: { id: 'rel-1', kind: 'dependsOn', category: 'association' },
  provenance: [],
  evidence: [],
};

async function seed(): Promise<void> {
  const operations = buildGraphWriteOperations({
    nodes: [API_NODE, ENTITY_NODE],
    relationships: [DEPENDS_ON],
  });
  await ingestGraphWriteOperations(driver, DATABASE, operations);
}

describe('getFullGraph (P4-07)', () => {
  it(
    'retrieves every real node and relationship, with real Neo4j labels/types (not the UI vocabulary)',
    async () => {
      await seed();
      const graph = await getFullGraph(driver, DATABASE);

      expect(graph.nodes).toHaveLength(2);
      const api = graph.nodes.find((n) => n.id === API_NODE.id);
      expect(api?.label).toBe('Api');
      expect(api?.properties.kind).toBe('integration.api');

      expect(graph.relationships).toHaveLength(1);
      expect(graph.relationships[0]).toMatchObject({
        id: 'rel-1',
        type: 'DEPENDS_ON',
        sourceId: API_NODE.id,
        targetId: ENTITY_NODE.id,
      });
    },
    STARTUP_TIMEOUT_MS,
  );

  it('returns an empty graph, not an error, when nothing has been ingested', async () => {
    const graph = await getFullGraph(driver, DATABASE);
    expect(graph).toEqual({ nodes: [], relationships: [] });
  });
});

describe('getNodeById (P4-07)', () => {
  it(
    'retrieves a single node by its stable id',
    async () => {
      await seed();
      const node = await getNodeById(driver, DATABASE, ENTITY_NODE.id);
      expect(node?.label).toBe('Entity');
      expect(node?.properties.label).toBe('Order');
    },
    STARTUP_TIMEOUT_MS,
  );

  it('returns undefined for a node id that does not exist', async () => {
    const node = await getNodeById(driver, DATABASE, 'does-not-exist');
    expect(node).toBeUndefined();
  });
});

describe('getRelationshipsForNode (P4-07)', () => {
  it(
    'retrieves relationships touching a node regardless of direction',
    async () => {
      await seed();
      const fromApi = await getRelationshipsForNode(driver, DATABASE, API_NODE.id);
      const fromEntity = await getRelationshipsForNode(driver, DATABASE, ENTITY_NODE.id);

      expect(fromApi).toHaveLength(1);
      expect(fromApi[0]).toMatchObject({ sourceId: API_NODE.id, targetId: ENTITY_NODE.id });
      expect(fromEntity).toHaveLength(1);
      expect(fromEntity[0]).toMatchObject({ sourceId: API_NODE.id, targetId: ENTITY_NODE.id });
    },
    STARTUP_TIMEOUT_MS,
  );
});
