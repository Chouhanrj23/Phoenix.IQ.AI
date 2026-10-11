import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { Neo4jContainer, type StartedNeo4jContainer } from '@testcontainers/neo4j';
import neo4j, { type Driver } from 'neo4j-driver';
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalKnowledgeBundle,
} from '@phoenix-ai/knowledge-graph';
import { mapOkfBundleToGraph } from '../src/graph-mapping.js';
import { buildGraphWriteOperations } from '../src/transform.js';
import { ingestGraphWriteOperations } from '../src/ingest.js';
import { getFullGraph, getNodeById, getRelationshipsForNode } from '../src/query.js';

/**
 * P8 -- FR-ORC-04 / BR-12: "isolate each system's data per tenant with no
 * cross-tenant access", against a real Neo4j.
 *
 * The hard case is deliberately the realistic one: two tenants analysing the
 * SAME repository get the SAME content-derived ids. Keyed on id alone, the
 * second write overwrote the first tenant's nodes.
 */

const STARTUP_TIMEOUT_MS = 180_000;
// A cold Neo4j under a parallel test run takes longer than vitest's 5s
// default for the first writes; a timed-out test's writes would otherwise
// land after cleanup and leak into the next test.
vi.setConfig({ testTimeout: 60_000 });
const DATABASE = 'neo4j';
let container: StartedNeo4jContainer;
let driver: Driver;

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

function bundleFor(systemId: string, ownerLabel: string): CanonicalKnowledgeBundle {
  const at = '2026-10-07T00:00:00.000Z';
  const object = (id: string, label: string) => ({
    identity: {
      id,
      systemId,
      createdAt: at,
      updatedAt: at,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity' as const,
    kind: 'domain.entity',
    label,
    attributes: {},
    metadata: {
      provenance: [
        {
          sourceId: 'repo://shared',
          sourceType: 'source-code' as const,
          derivedBy: 'test',
          derivedAt: at,
        },
      ],
      confidence: { level: 'high' as const },
    },
    evidence: [],
  });
  return {
    systemId,
    generatedAt: at,
    // Same ids in both tenants -- the content-derived ids of one repository.
    objects: [object('entity-owner', ownerLabel), object('entity-pet', 'Pet')],
    relationships: [
      {
        id: 'rel-owner-pet',
        category: 'association',
        kind: 'hasAssociation',
        sourceObjectId: 'entity-owner',
        targetObjectId: 'entity-pet',
        metadata: {
          provenance: [
            {
              sourceId: 'repo://shared',
              sourceType: 'source-code',
              derivedBy: 'test',
              derivedAt: at,
            },
          ],
          confidence: { level: 'high' },
        },
      },
    ],
  };
}

async function persist(bundle: CanonicalKnowledgeBundle): Promise<void> {
  await ingestGraphWriteOperations(
    driver,
    DATABASE,
    buildGraphWriteOperations(mapOkfBundleToGraph(bundle)),
  );
}

describe('tenant isolation in the graph (FR-ORC-04)', () => {
  it('two tenants with identical element ids get separate nodes — neither overwrites the other', async () => {
    await persist(bundleFor('tenant-a', 'Owner (A)'));
    await persist(bundleFor('tenant-b', 'Owner (B)'));

    const all = await getFullGraph(driver, DATABASE);
    expect(all.nodes).toHaveLength(4);
    expect(all.relationships).toHaveLength(2);

    const a = await getNodeById(driver, DATABASE, 'entity-owner', { systemId: 'tenant-a' });
    const b = await getNodeById(driver, DATABASE, 'entity-owner', { systemId: 'tenant-b' });
    expect(a?.properties.label).toBe('Owner (A)');
    expect(b?.properties.label).toBe('Owner (B)');
  });

  it("a scoped read returns only that tenant's nodes and relationships", async () => {
    await persist(bundleFor('tenant-a', 'Owner (A)'));
    await persist(bundleFor('tenant-b', 'Owner (B)'));

    const a = await getFullGraph(driver, DATABASE, { systemId: 'tenant-a' });
    expect(a.nodes.map((n) => n.properties.systemId)).toEqual(['tenant-a', 'tenant-a']);
    expect(a.relationships).toHaveLength(1);
    expect(a.relationships[0]?.properties.systemId).toBe('tenant-a');

    const rels = await getRelationshipsForNode(driver, DATABASE, 'entity-owner', {
      systemId: 'tenant-b',
    });
    expect(rels).toHaveLength(1);
    expect(rels[0]?.properties.systemId).toBe('tenant-b');
  });

  it("a relationship is never created to another tenant's node", async () => {
    await persist(bundleFor('tenant-a', 'Owner (A)'));
    // tenant-b declares the relationship but only one endpoint of its own.
    const partial = bundleFor('tenant-b', 'Owner (B)');
    const lonely = { ...partial, objects: partial.objects.slice(0, 1) };
    await expect(persist({ ...lonely, relationships: partial.relationships })).rejects.toThrow(
      /endpoint is missing/,
    );
    const b = await getFullGraph(driver, DATABASE, { systemId: 'tenant-b' });
    expect(b.relationships).toEqual([]);
  });

  it('an unknown tenant sees nothing', async () => {
    await persist(bundleFor('tenant-a', 'Owner (A)'));
    expect(await getFullGraph(driver, DATABASE, { systemId: 'tenant-z' })).toEqual({
      nodes: [],
      relationships: [],
    });
    expect(
      await getNodeById(driver, DATABASE, 'entity-owner', { systemId: 'tenant-z' }),
    ).toBeUndefined();
  });
});
