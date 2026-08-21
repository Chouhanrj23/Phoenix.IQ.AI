import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Neo4jContainer, type StartedNeo4jContainer } from '@testcontainers/neo4j';
import neo4j, { type Driver } from 'neo4j-driver';
import {
  CANONICAL_SCHEMA_VERSION,
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
  type CanonicalKnowledgeBundle,
  type ContainerObject,
  type CanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { mapOkfBundleToGraph } from '../src/graph-mapping.js';
import { buildGraphWriteOperations } from '../src/transform.js';
import { ingestGraphWriteOperations } from '../src/ingest.js';

/**
 * P4-05/P4-06 -- proves, against a REAL Neo4j instance, that provenance and
 * confidence/evidence survive the full real pipeline (OKF object ->
 * `mapOkfBundleToGraph` (P4-01) -> `buildGraphWriteOperations` (P4-02) ->
 * `ingestGraphWriteOperations` (P4-03/P4-04) -> Neo4j), not just that the
 * pure mapping/transform functions preserve them in memory
 * (`graph-mapping.test.ts`/`transform.test.ts` already cover that).
 *
 * No confidence score is calculated anywhere in this test or the code it
 * exercises -- every value asserted below is copied verbatim from the
 * fixture object into Neo4j and back out again.
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

async function readNodeProperties(id: string): Promise<Record<string, unknown>> {
  const session = driver.session({ database: DATABASE });
  try {
    const result = await session.run('MATCH (n {id: $id}) RETURN n', { id });
    const properties = result.records[0]?.get('n').properties as
      Record<string, unknown> | undefined;
    if (properties === undefined) throw new Error(`node ${id} not found`);
    return properties;
  } finally {
    await session.close();
  }
}

async function readRelationshipProperties(id: string): Promise<Record<string, unknown>> {
  const session = driver.session({ database: DATABASE });
  try {
    const result = await session.run('MATCH ()-[r {id: $id}]->() RETURN r', { id });
    const properties = result.records[0]?.get('r').properties as
      Record<string, unknown> | undefined;
    if (properties === undefined) throw new Error(`relationship ${id} not found`);
    return properties;
  } finally {
    await session.close();
  }
}

// A real, validated Container object carrying TWO provenance entries (a
// source-code origin and a corroborating architecture document), evidence
// with every optional field populated, and a full confidenceDetail
// including a score-calculation record -- deliberately the richest real
// shape Phase 2 supports, so nothing has room to be silently dropped.
const container_: ContainerObject = {
  identity: {
    id: 'ctr-checkout-1',
    systemId: 'aurora-commerce',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'architecture.container',
  label: 'Checkout Service',
  attributes: { responsibility: 'Orchestrates checkout.', technology: 'Node.js' },
  metadata: {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce/services/checkout',
        sourceType: 'source-code',
        derivedBy: 'extraction-engine',
        derivedAt: '2026-08-21T00:00:00.000Z',
      },
      {
        sourceId: 'docs/architecture-2024.pdf',
        sourceType: 'technical-doc',
        derivedBy: 'phoenix-sample-author',
        derivedAt: '2026-08-20T00:00:00.000Z',
      },
    ],
    confidence: {
      level: 'high',
      score: 0.92,
      rationale: 'Corroborated by two independent sources.',
    },
  },
  evidence: [
    {
      id: 'ev-checkout-1',
      sourceId: 'repo://aurora-commerce/services/checkout',
      excerpt: 'export const app = createCheckoutServer()',
      locator: 'src/index.ts:1',
      capturedAt: '2026-08-21T00:00:00.000Z',
      sourceVersion: 'abc1234',
    },
  ],
  confidenceDetail: {
    basis: 'observed',
    calculation: {
      method: 'corroboration-count',
      calculatedAt: '2026-08-21T00:00:00.000Z',
      inputs: { corroboratingSources: 2 },
    },
  },
};

const dependsOnRelationship: CanonicalKnowledgeRelationship = {
  id: 'rel-depends-on-prov-1',
  category: 'association',
  kind: 'dependsOn',
  sourceObjectId: container_.identity.id,
  targetObjectId: container_.identity.id, // placeholder overwritten per-test where a second node exists
  metadata: {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce/services/checkout',
        sourceType: 'source-code',
        derivedBy: 'extraction-engine',
        derivedAt: '2026-08-21T00:00:00.000Z',
      },
    ],
    confidence: { level: 'medium', score: 0.6 },
  },
  confidenceDetail: { basis: 'derived' },
};

describe('fixture sanity', () => {
  it('the fixture object/relationship are real, valid Phase 2 OKF shapes', () => {
    expect(validateCanonicalKnowledgeObject(container_)).toEqual({ valid: true, errors: [] });
  });
});

describe('P4-05 -- provenance survives OKF -> mapping -> transform -> real Neo4j', () => {
  it(
    'preserves all provenance entries (not just the first) through the full real pipeline',
    async () => {
      const bundle: CanonicalKnowledgeBundle = {
        systemId: 'aurora-commerce',
        generatedAt: '2026-08-21T00:00:00.000Z',
        objects: [container_],
        relationships: [],
      };
      const mapping = mapOkfBundleToGraph(bundle);
      expect(mapping.issues).toEqual([]);
      const operations = buildGraphWriteOperations(mapping);
      await ingestGraphWriteOperations(driver, DATABASE, operations);

      const properties = await readNodeProperties(container_.identity.id);
      const roundTrippedProvenance = JSON.parse(properties.provenanceJson as string);
      expect(roundTrippedProvenance).toEqual(container_.metadata.provenance);
      expect(roundTrippedProvenance).toHaveLength(2);
    },
    STARTUP_TIMEOUT_MS,
  );

  it(
    'preserves relationship provenance through the full real pipeline',
    async () => {
      const secondNode: ContainerObject = {
        ...container_,
        identity: { ...container_.identity, id: 'ctr-checkout-2' },
      };
      const relationship: CanonicalKnowledgeRelationship = {
        ...dependsOnRelationship,
        targetObjectId: secondNode.identity.id,
      };
      const bundle: CanonicalKnowledgeBundle = {
        systemId: 'aurora-commerce',
        generatedAt: '2026-08-21T00:00:00.000Z',
        objects: [container_, secondNode],
        relationships: [relationship],
      };
      const mapping = mapOkfBundleToGraph(bundle);
      expect(mapping.issues).toEqual([]);
      const operations = buildGraphWriteOperations(mapping);
      await ingestGraphWriteOperations(driver, DATABASE, operations);

      const properties = await readRelationshipProperties(relationship.id);
      expect(JSON.parse(properties.provenanceJson as string)).toEqual(
        relationship.metadata.provenance,
      );
    },
    STARTUP_TIMEOUT_MS,
  );
});

describe('P4-06 -- confidence and evidence survive OKF -> mapping -> transform -> real Neo4j', () => {
  it(
    'preserves confidence level/score/rationale and confidenceDetail (basis + calculation) exactly',
    async () => {
      const bundle: CanonicalKnowledgeBundle = {
        systemId: 'aurora-commerce',
        generatedAt: '2026-08-21T00:00:00.000Z',
        objects: [container_],
        relationships: [],
      };
      const operations = buildGraphWriteOperations(mapOkfBundleToGraph(bundle));
      await ingestGraphWriteOperations(driver, DATABASE, operations);

      const properties = await readNodeProperties(container_.identity.id);
      expect(properties.confidenceLevel).toBe('high');
      expect(properties.confidenceScore).toBe(0.92);
      expect(properties.confidenceRationale).toBe('Corroborated by two independent sources.');
      expect(properties.confidenceBasis).toBe('observed');
      expect(properties.confidenceCalculationMethod).toBe('corroboration-count');
      expect(JSON.parse(properties.confidenceCalculationInputsJson as string)).toEqual({
        corroboratingSources: 2,
      });
    },
    STARTUP_TIMEOUT_MS,
  );

  it(
    'preserves the full evidence array (excerpt/locator/capturedAt/sourceVersion) exactly',
    async () => {
      const bundle: CanonicalKnowledgeBundle = {
        systemId: 'aurora-commerce',
        generatedAt: '2026-08-21T00:00:00.000Z',
        objects: [container_],
        relationships: [],
      };
      const operations = buildGraphWriteOperations(mapOkfBundleToGraph(bundle));
      await ingestGraphWriteOperations(driver, DATABASE, operations);

      const properties = await readNodeProperties(container_.identity.id);
      expect(JSON.parse(properties.evidenceJson as string)).toEqual(container_.evidence);
    },
    STARTUP_TIMEOUT_MS,
  );

  it(
    'preserves relationship-level confidence too',
    async () => {
      const secondNode: ContainerObject = {
        ...container_,
        identity: { ...container_.identity, id: 'ctr-checkout-3' },
      };
      const relationship: CanonicalKnowledgeRelationship = {
        ...dependsOnRelationship,
        id: 'rel-depends-on-prov-2',
        targetObjectId: secondNode.identity.id,
      };
      expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
        valid: true,
        errors: [],
      });
      const bundle: CanonicalKnowledgeBundle = {
        systemId: 'aurora-commerce',
        generatedAt: '2026-08-21T00:00:00.000Z',
        objects: [container_, secondNode],
        relationships: [relationship],
      };
      const operations = buildGraphWriteOperations(mapOkfBundleToGraph(bundle));
      await ingestGraphWriteOperations(driver, DATABASE, operations);

      const properties = await readRelationshipProperties(relationship.id);
      expect(properties.confidenceLevel).toBe('medium');
      expect(properties.confidenceScore).toBe(0.6);
      expect(properties.confidenceBasis).toBe('derived');
    },
    STARTUP_TIMEOUT_MS,
  );
});
