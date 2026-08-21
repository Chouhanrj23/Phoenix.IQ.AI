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
  app.get('/api/full-graph', async () => {
    try {
      return await getFullGraph();
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
