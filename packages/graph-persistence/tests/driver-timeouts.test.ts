import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS,
  DEFAULT_NEO4J_CONNECTION_TIMEOUT_MS,
  loadNeo4jConfig,
} from '../src/config.js';
import {
  closeNeo4jDriver,
  createNeo4jDriver,
  Neo4jUnavailableError,
  verifyNeo4jConnectivity,
} from '../src/neo4j-client.js';

/**
 * P8 -- an unreachable database fails fast, as `Neo4jUnavailableError`.
 *
 * Measured before the fix: a host that silently drops packets held
 * `verifyNeo4jConnectivity` -- and so every graph-backed API request -- for
 * ~21 s. No container needed: the point is precisely that nothing answers.
 */

/** TEST-NET-adjacent unroutable address: connections hang rather than being refused. */
const BLACKHOLE_URI = 'bolt://10.255.255.1:7687';

const ENV_KEYS = [
  'NEO4J_PASSWORD',
  'NEO4J_CONNECTION_TIMEOUT_MS',
  'NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS',
] as const;

afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe('Neo4j connection timeouts (P8 reliability)', () => {
  it('defaults to bounded timeouts', () => {
    process.env.NEO4J_PASSWORD = 'x';
    expect(loadNeo4jConfig()).toMatchObject({
      connectionTimeoutMs: DEFAULT_NEO4J_CONNECTION_TIMEOUT_MS,
      connectionAcquisitionTimeoutMs: DEFAULT_NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS,
    });
  });

  it('reads overrides from the environment and rejects nonsense', () => {
    process.env.NEO4J_PASSWORD = 'x';
    process.env.NEO4J_CONNECTION_TIMEOUT_MS = '2500';
    expect(loadNeo4jConfig().connectionTimeoutMs).toBe(2500);
    for (const bad of ['0', '-1', 'abc', '1.5']) {
      process.env.NEO4J_CONNECTION_TIMEOUT_MS = bad;
      expect(() => loadNeo4jConfig()).toThrow(/NEO4J_CONNECTION_TIMEOUT_MS must be/);
    }
  });

  it('an unreachable host fails within the configured bound, as Neo4jUnavailableError', async () => {
    const driver = createNeo4jDriver({
      uri: BLACKHOLE_URI,
      user: 'neo4j',
      password: 'x',
      database: 'neo4j',
      connectionTimeoutMs: 1_500,
      connectionAcquisitionTimeoutMs: 3_000,
    });
    const started = performance.now();
    try {
      await expect(verifyNeo4jConnectivity(driver, 'neo4j')).rejects.toBeInstanceOf(
        Neo4jUnavailableError,
      );
      expect(performance.now() - started).toBeLessThan(8_000);
    } finally {
      await closeNeo4jDriver(driver);
    }
  }, 30_000);
});
