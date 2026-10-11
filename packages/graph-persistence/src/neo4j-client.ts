/**
 * The Neo4j connection boundary -- Phase 4 prerequisite (Blocker 1/5).
 *
 * Deliberately narrow: this file owns creating a driver, proving it can
 * actually reach a real Neo4j instance, and closing it cleanly, with clear,
 * typed failure behavior when it cannot. It does NOT run any Cypher beyond
 * the connectivity probe itself -- graph mapping (P4-01), ingestion
 * (P4-02/03/04/05/06), querying (P4-07), and consistency validation (P4-09)
 * are separate, not-yet-implemented tickets; this package's job right now
 * is only to make the strategy (a real driver, against a real instance,
 * failing clearly when unavailable) provably work. See
 * `docs/architecture/adr/0023-phase-4-prerequisites.md`.
 *
 * `apps/api` is expected to be the eventual caller, via a future
 * `graph.service.ts` (P4-07) -- not wired up yet, since that route/service
 * layer is explicitly out of scope for this prerequisite fix.
 */

import neo4j, { type Driver } from 'neo4j-driver';
import {
  DEFAULT_NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS,
  DEFAULT_NEO4J_CONNECTION_TIMEOUT_MS,
  type Neo4jConfig,
} from './config.js';

/** Thrown whenever this module cannot reach or use a real Neo4j instance -- never swallowed, always carries the original driver error as `cause`. */
export class Neo4jUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'Neo4jUnavailableError';
  }
}

/**
 * Driver error codes that mean "Neo4j could not be reached or used", as
 * opposed to "the query itself was wrong". `ServiceUnavailable`/
 * `SessionExpired` are the driver's own connection-level codes; the security
 * family covers credentials that stop working mid-session.
 */
const CONNECTIVITY_ERROR_CODES: ReadonlySet<string> = new Set([
  'ServiceUnavailable',
  'SessionExpired',
  'Neo.TransientError.General.DatabaseUnavailable',
]);

/**
 * Whether `error` is a connectivity/availability failure rather than a
 * query/logic failure.
 *
 * `verifyNeo4jConnectivity` only proves the database was reachable at the
 * START of an operation. A connection lost between that check and the actual
 * read/write surfaces as a raw driver error, which callers previously could
 * not tell apart from a logic bug -- so an outage mid-request became a 500
 * instead of the documented "unavailable, nothing was saved" (P8 hardening).
 */
export function isNeo4jConnectivityError(error: unknown): boolean {
  if (error instanceof Neo4jUnavailableError) return true;
  if (typeof error !== 'object' || error === null) return false;
  const code = (error as { code?: unknown }).code;
  if (typeof code !== 'string') return false;
  return CONNECTIVITY_ERROR_CODES.has(code) || code.startsWith('Neo.ClientError.Security.');
}

/**
 * Re-throws a connectivity failure as `Neo4jUnavailableError` (original error
 * kept as `cause`); returns `error` unchanged otherwise, so the caller decides
 * how to report a non-connectivity failure.
 */
export function asNeo4jUnavailable(error: unknown, database: string): unknown {
  if (error instanceof Neo4jUnavailableError) return error;
  if (!isNeo4jConnectivityError(error)) return error;
  return new Neo4jUnavailableError(
    `Lost connection to Neo4j (database "${database}") during the operation: ${error instanceof Error ? error.message : String(error)}`,
    { cause: error },
  );
}

/** Creates a driver instance. Does not connect yet -- `neo4j-driver` connects lazily on first use, which is why `verifyNeo4jConnectivity` exists as a separate, explicit step. */
export function createNeo4jDriver(config: Neo4jConfig): Driver {
  return neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password), {
    // P8: bounded waits, so an unreachable database fails fast as
    // `Neo4jUnavailableError` instead of holding a request for the driver's
    // 30 s defaults. See `DEFAULT_NEO4J_CONNECTION_TIMEOUT_MS`.
    connectionTimeout: config.connectionTimeoutMs ?? DEFAULT_NEO4J_CONNECTION_TIMEOUT_MS,
    connectionAcquisitionTimeout:
      config.connectionAcquisitionTimeoutMs ?? DEFAULT_NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS,
  });
}

/**
 * Proves the driver can actually reach and authenticate against a real
 * Neo4j instance, on the configured database, by running a trivial real
 * query -- not just opening a socket. Throws `Neo4jUnavailableError` (never
 * lets a raw driver error escape uncaught) on any failure: connection
 * refused, auth failure, wrong database name, or timeout.
 */
export async function verifyNeo4jConnectivity(driver: Driver, database: string): Promise<void> {
  const session = driver.session({ database });
  try {
    // A boolean literal, not an integer -- Neo4j integers come back through
    // the driver as a wrapped `Integer` type (not a native JS `number`),
    // which would make a naive `=== 1` check fail even on a successful,
    // correctly-answered query. A boolean avoids that marshalling entirely.
    const result = await session.run('RETURN true AS ok');
    const ok = result.records[0]?.get('ok');
    if (ok !== true) {
      throw new Neo4jUnavailableError(
        `Neo4j at the configured URI responded, but not with the expected result for a trivial query (database "${database}")`,
      );
    }
  } catch (error) {
    if (error instanceof Neo4jUnavailableError) throw error;
    throw new Neo4jUnavailableError(
      `Could not reach Neo4j (database "${database}"): ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  } finally {
    await session.close();
  }
}

/** Closes a driver's connection pool. Never throws -- a close failure during shutdown must not mask whatever the caller was already handling. */
export async function closeNeo4jDriver(driver: Driver): Promise<void> {
  try {
    await driver.close();
  } catch {
    // Deliberately swallowed: closing is best-effort cleanup, not a
    // condition a caller can meaningfully react to.
  }
}
