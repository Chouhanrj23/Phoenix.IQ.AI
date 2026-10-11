/**
 * Neo4j connection configuration -- Phase 4 prerequisite (Blocker 1/5).
 *
 * Follows `apps/api/src/config.ts`'s exact existing convention: `getEnv`
 * (`@phoenix-ai/shared`) for reads, safe non-secret defaults where a
 * fallback is genuinely harmless, and a required (no-fallback, throws when
 * missing) read wherever the value is a credential. `NEO4J_URI`/
 * `NEO4J_USER`/`NEO4J_DATABASE` default to Neo4j's own well-known local
 * values (not secrets -- every Neo4j install ships these as its defaults);
 * `NEO4J_PASSWORD` has no default at all, deliberately, so this package can
 * never silently start up against a guessable or hardcoded credential -- see
 * `docs/architecture/adr/0023-phase-4-prerequisites.md` decision 1.
 */

import { getEnv } from '@phoenix-ai/shared';

export interface Neo4jConfig {
  uri: string;
  user: string;
  password: string;
  database: string;
  /**
   * P8 -- how long to wait for a TCP connection before failing. Optional so
   * hand-built configs keep working; `createNeo4jDriver` applies the default.
   */
  connectionTimeoutMs?: number;
  /** P8 -- how long a request may wait for a pooled connection before failing. */
  connectionAcquisitionTimeoutMs?: number;
}

/**
 * P8 defaults. With the driver's own defaults an unreachable database (a
 * host that drops packets rather than refusing) held every request for the
 * OS/driver connect timeout -- measured at ~21 s -- before the API could
 * answer "unavailable". Five seconds is ample for a reachable database on
 * any network Phoenix is meant to run on.
 */
export const DEFAULT_NEO4J_CONNECTION_TIMEOUT_MS = 5_000;
export const DEFAULT_NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS = 10_000;

function positiveIntegerEnv(name: string, fallback: number): number {
  const raw = getEnv(name, String(fallback));
  const value = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || !Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer number of milliseconds, got "${raw}"`);
  }
  return value;
}

/** Reads `NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASSWORD`/`NEO4J_DATABASE` from the environment. Throws if `NEO4J_PASSWORD` is unset -- there is no safe default for a credential. */
export function loadNeo4jConfig(): Neo4jConfig {
  return {
    uri: getEnv('NEO4J_URI', 'bolt://localhost:7687'),
    user: getEnv('NEO4J_USER', 'neo4j'),
    password: getEnv('NEO4J_PASSWORD'),
    database: getEnv('NEO4J_DATABASE', 'neo4j'),
    connectionTimeoutMs: positiveIntegerEnv(
      'NEO4J_CONNECTION_TIMEOUT_MS',
      DEFAULT_NEO4J_CONNECTION_TIMEOUT_MS,
    ),
    connectionAcquisitionTimeoutMs: positiveIntegerEnv(
      'NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS',
      DEFAULT_NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS,
    ),
  };
}
