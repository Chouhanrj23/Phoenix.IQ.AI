import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Neo4jContainer, type StartedNeo4jContainer } from '@testcontainers/neo4j';
import {
  closeNeo4jDriver,
  createNeo4jDriver,
  Neo4jUnavailableError,
  verifyNeo4jConnectivity,
} from '../src/neo4j-client.js';
import type { Neo4jConfig } from '../src/config.js';

/**
 * Phase 4 prerequisite (Blocker 1) -- proves the chosen testing strategy
 * actually works: a REAL Neo4j instance via Testcontainers, not a mocked
 * driver. Matches this repo's established "don't mock real infrastructure"
 * discipline (`git-connector.test.ts`, `pipeline-e2e.test.ts`).
 *
 * Deliberately narrow, same as `neo4j-client.ts` itself: this proves the
 * driver can connect, run a real query, and fail clearly when the instance
 * is unreachable -- not that any graph mapping/ingestion/query logic works,
 * since none of that exists yet (P4-02 onward).
 *
 * Requires a working Docker daemon on the machine running this test (same
 * requirement Testcontainers always has) -- pulls the real `neo4j` image on
 * first run.
 */

const STARTUP_TIMEOUT_MS = 180_000;

let container: StartedNeo4jContainer;
let config: Neo4jConfig;

beforeAll(async () => {
  container = await new Neo4jContainer('neo4j:5-community').start();
  config = {
    uri: container.getBoltUri(),
    user: 'neo4j',
    password: container.getPassword(),
    database: 'neo4j',
  };
}, STARTUP_TIMEOUT_MS);

afterAll(async () => {
  if (container !== undefined) await container.stop();
});

describe('verifyNeo4jConnectivity', () => {
  it(
    'connects to a real Neo4j instance and runs a real query',
    async () => {
      const driver = createNeo4jDriver(config);
      try {
        await expect(verifyNeo4jConnectivity(driver, config.database)).resolves.toBeUndefined();
      } finally {
        await closeNeo4jDriver(driver);
      }
    },
    STARTUP_TIMEOUT_MS,
  );

  it('throws Neo4jUnavailableError (not a raw driver error) when the instance is unreachable', async () => {
    const unreachable: Neo4jConfig = {
      ...config,
      // Port 1 is reserved/unroutable for a bolt connection in any real environment.
      uri: 'bolt://localhost:1',
    };
    const driver = createNeo4jDriver(unreachable);
    try {
      await expect(verifyNeo4jConnectivity(driver, unreachable.database)).rejects.toBeInstanceOf(
        Neo4jUnavailableError,
      );
    } finally {
      await closeNeo4jDriver(driver);
    }
  }, 30_000);

  it('throws Neo4jUnavailableError when credentials are wrong (auth failure, not a connection failure)', async () => {
    const wrongCredentials: Neo4jConfig = { ...config, password: 'definitely-not-the-password' };
    const driver = createNeo4jDriver(wrongCredentials);
    try {
      await expect(
        verifyNeo4jConnectivity(driver, wrongCredentials.database),
      ).rejects.toBeInstanceOf(Neo4jUnavailableError);
    } finally {
      await closeNeo4jDriver(driver);
    }
  }, 30_000);
});
