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
}

/** Reads `NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASSWORD`/`NEO4J_DATABASE` from the environment. Throws if `NEO4J_PASSWORD` is unset -- there is no safe default for a credential. */
export function loadNeo4jConfig(): Neo4jConfig {
  return {
    uri: getEnv('NEO4J_URI', 'bolt://localhost:7687'),
    user: getEnv('NEO4J_USER', 'neo4j'),
    password: getEnv('NEO4J_PASSWORD'),
    database: getEnv('NEO4J_DATABASE', 'neo4j'),
  };
}
