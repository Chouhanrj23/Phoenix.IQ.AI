import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Neo4jContainer, type StartedNeo4jContainer } from '@testcontainers/neo4j';
import neo4j, { type Driver } from 'neo4j-driver';
import { Neo4jUnavailableError } from '../src/neo4j-client.js';
import { GraphIngestionError, ingestGraphWriteOperations } from '../src/ingest.js';
import {
  buildGraphWriteOperations,
  buildNodeWriteOperation,
  type NodeWriteOperation,
} from '../src/transform.js';
import type { GraphNodeMapping, GraphRelationshipMapping } from '../src/graph-mapping.js';

/**
 * P4-03/P4-04 -- real Neo4j integration tests, exactly as established for
 * `neo4j-client.test.ts`: a real Testcontainers instance, never a mocked
 * driver. Proves node/relationship MERGE, idempotency (repeated ingestion
 * creates no duplicates), missing-endpoint handling, and transaction
 * rollback on failure -- all against an actual running Neo4j.
 */

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

async function countNodes(): Promise<number> {
  const session = driver.session({ database: DATABASE });
  try {
    const result = await session.run('MATCH (n) RETURN count(n) AS c');
    return result.records[0]?.get('c').toNumber();
  } finally {
    await session.close();
  }
}

async function countRelationships(): Promise<number> {
  const session = driver.session({ database: DATABASE });
  try {
    const result = await session.run('MATCH ()-[r]->() RETURN count(r) AS c');
    return result.records[0]?.get('c').toNumber();
  } finally {
    await session.close();
  }
}

async function readNodeProperties(id: string): Promise<Record<string, unknown> | undefined> {
  const session = driver.session({ database: DATABASE });
  try {
    const result = await session.run('MATCH (n {id: $id}) RETURN n', { id });
    return result.records[0]?.get('n').properties;
  } finally {
    await session.close();
  }
}

const ORDER_NODE: GraphNodeMapping = {
  id: 'ent-order-1',
  label: 'Entity',
  properties: { id: 'ent-order-1', kind: 'domain.entity', label: 'Order', confidenceLevel: 'high' },
  provenance: [
    {
      sourceId: 'repo://aurora-commerce',
      sourceType: 'source-code',
      derivedBy: 'extraction-engine',
      derivedAt: '2026-08-21T00:00:00.000Z',
    },
  ],
  evidence: [{ id: 'ev-order-1', sourceId: 'repo://aurora-commerce', locator: 'Order.java#L10' }],
};

const API_NODE: GraphNodeMapping = {
  id: 'api-checkout-1',
  label: 'Api',
  properties: {
    id: 'api-checkout-1',
    kind: 'integration.api',
    label: 'CheckoutController',
    confidenceLevel: 'high',
  },
  provenance: [
    {
      sourceId: 'repo://aurora-commerce',
      sourceType: 'source-code',
      derivedBy: 'extraction-engine',
      derivedAt: '2026-08-21T00:00:00.000Z',
    },
  ],
  evidence: [],
};

const DEPENDS_ON_RELATIONSHIP: GraphRelationshipMapping = {
  id: 'rel-depends-on-1',
  type: 'DEPENDS_ON',
  sourceId: API_NODE.id,
  targetId: ORDER_NODE.id,
  properties: { id: 'rel-depends-on-1', kind: 'dependsOn', category: 'association' },
  provenance: [
    {
      sourceId: 'repo://aurora-commerce',
      sourceType: 'source-code',
      derivedBy: 'extraction-engine',
      derivedAt: '2026-08-21T00:00:00.000Z',
    },
  ],
  evidence: [],
};

describe('ingestGraphWriteOperations -- node creation (P4-03)', () => {
  it(
    'persists a real node with its label and properties into a real Neo4j instance',
    async () => {
      const operations = buildGraphWriteOperations({ nodes: [ORDER_NODE], relationships: [] });
      const result = await ingestGraphWriteOperations(driver, DATABASE, operations);

      expect(result.nodesWritten).toEqual([{ id: ORDER_NODE.id, label: 'Entity' }]);
      const properties = await readNodeProperties(ORDER_NODE.id);
      expect(properties?.kind).toBe('domain.entity');
      expect(properties?.label).toBe('Order');
    },
    STARTUP_TIMEOUT_MS,
  );

  it(
    'is idempotent -- ingesting the same node twice creates exactly one node, not two',
    async () => {
      const operations = buildGraphWriteOperations({ nodes: [ORDER_NODE], relationships: [] });
      await ingestGraphWriteOperations(driver, DATABASE, operations);
      await ingestGraphWriteOperations(driver, DATABASE, operations);

      expect(await countNodes()).toBe(1);
    },
    STARTUP_TIMEOUT_MS,
  );

  it(
    'rolls back the whole transaction when one node operation is malformed -- no partial commit',
    async () => {
      const goodOp = buildNodeWriteOperation(ORDER_NODE);
      const malformedOp: NodeWriteOperation = {
        id: 'bad-node',
        label: 'Entity',
        cypher: 'MERGE (n:Entity {id: $id BROKEN SYNTAX',
        params: { id: 'bad-node', properties: {} },
      };

      await expect(
        ingestGraphWriteOperations(driver, DATABASE, {
          nodeOperations: [goodOp, malformedOp],
          relationshipOperations: [],
        }),
      ).rejects.toBeInstanceOf(GraphIngestionError);

      // The FIRST (valid) node must not have been committed either --
      // proof the whole transaction rolled back, not just the bad statement.
      expect(await countNodes()).toBe(0);
    },
    STARTUP_TIMEOUT_MS,
  );
});

describe('ingestGraphWriteOperations -- relationship creation (P4-04)', () => {
  it(
    'persists a real relationship between two already-persisted nodes',
    async () => {
      const operations = buildGraphWriteOperations({
        nodes: [API_NODE, ORDER_NODE],
        relationships: [DEPENDS_ON_RELATIONSHIP],
      });
      const result = await ingestGraphWriteOperations(driver, DATABASE, operations);

      expect(result.relationshipsWritten).toEqual([
        { id: DEPENDS_ON_RELATIONSHIP.id, type: 'DEPENDS_ON' },
      ]);
      expect(await countRelationships()).toBe(1);
    },
    STARTUP_TIMEOUT_MS,
  );

  it(
    'is idempotent -- ingesting the same relationship twice creates exactly one edge, not two',
    async () => {
      const operations = buildGraphWriteOperations({
        nodes: [API_NODE, ORDER_NODE],
        relationships: [DEPENDS_ON_RELATIONSHIP],
      });
      await ingestGraphWriteOperations(driver, DATABASE, operations);
      await ingestGraphWriteOperations(driver, DATABASE, operations);

      expect(await countRelationships()).toBe(1);
    },
    STARTUP_TIMEOUT_MS,
  );

  it(
    'refuses to silently succeed when a relationship references a node that does not exist, and rolls back its valid nodes too',
    async () => {
      const danglingRelationship: GraphRelationshipMapping = {
        ...DEPENDS_ON_RELATIONSHIP,
        targetId: 'does-not-exist',
      };
      const operations = buildGraphWriteOperations({
        nodes: [API_NODE],
        relationships: [danglingRelationship],
      });

      await expect(ingestGraphWriteOperations(driver, DATABASE, operations)).rejects.toThrow(
        /does not exist in the graph/,
      );

      // The API node (a valid part of the SAME batch) must not have been
      // committed either -- the dangling reference fails the whole batch.
      expect(await countNodes()).toBe(0);
    },
    STARTUP_TIMEOUT_MS,
  );

  it('never creates a relationship that was not in the write operations (no fabrication)', async () => {
    const operations = buildGraphWriteOperations({
      nodes: [API_NODE, ORDER_NODE],
      relationships: [],
    });
    await ingestGraphWriteOperations(driver, DATABASE, operations);
    expect(await countRelationships()).toBe(0);
  });
});

describe('ingestGraphWriteOperations -- Neo4j unavailable (P4-03/P4-04 failure handling)', () => {
  it('throws Neo4jUnavailableError, not GraphIngestionError, when Neo4j cannot be reached', async () => {
    const unreachableDriver = neo4j.driver(
      'bolt://localhost:1',
      neo4j.auth.basic('neo4j', container.getPassword()),
    );
    try {
      const operations = buildGraphWriteOperations({ nodes: [ORDER_NODE], relationships: [] });
      await expect(
        ingestGraphWriteOperations(unreachableDriver, DATABASE, operations),
      ).rejects.toBeInstanceOf(Neo4jUnavailableError);
    } finally {
      await unreachableDriver.close();
    }
  }, 30_000);
});
