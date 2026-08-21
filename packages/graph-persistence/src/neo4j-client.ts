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
import type { Neo4jConfig } from './config.js';

/** Thrown whenever this module cannot reach or use a real Neo4j instance -- never swallowed, always carries the original driver error as `cause`. */
export class Neo4jUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'Neo4jUnavailableError';
  }
}

/** Creates a driver instance. Does not connect yet -- `neo4j-driver` connects lazily on first use, which is why `verifyNeo4jConnectivity` exists as a separate, explicit step. */
export function createNeo4jDriver(config: Neo4jConfig): Driver {
  return neo4j.driver(config.uri, neo4j.auth.basic(config.user, config.password));
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
