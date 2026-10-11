import type { FastifyInstance } from 'fastify';
import { Neo4jUnavailableError } from '@phoenix-ai/graph-persistence';
import { ApiError } from '../errors.js';
import { getFullGraph } from '../services/graph.service.js';

/**
 * P4-07 -- the graph query API. Deliberately a single, fixed endpoint, never
 * a passthrough for caller-supplied Cypher: `graph.service.ts` is the only
 * thing this route calls, and it in turn only ever runs the small, fixed
 * set of parameterized queries `@phoenix-ai/graph-persistence`'s
 * `query.ts` defines.
 */
export function registerGraphRoutes(app: FastifyInstance): void {
  app.get('/api/full-graph', async (request) => {
    // P8 (FR-ORC-04): `?systemId=` scopes the graph to one tenant.
    const systemId = (request.query as Record<string, unknown> | undefined)?.systemId;
    if (
      systemId !== undefined &&
      (typeof systemId !== 'string' || !/^[A-Za-z0-9._-]{1,100}$/.test(systemId))
    ) {
      throw new ApiError(400, '"systemId" must be 1-100 characters of [A-Za-z0-9._-]');
    }
    try {
      return await getFullGraph(systemId === undefined ? undefined : { systemId });
    } catch (error) {
      if (error instanceof Neo4jUnavailableError) {
        throw new ApiError(
          503,
          'The knowledge graph is temporarily unavailable. Please try again shortly.',
        );
      }
      throw error;
    }
  });
}
