import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling } from '../src/errors.js';

// Matches the existing route-test convention (e.g. domains.test.ts): the
// happy path mocks the service layer with a fixed, known response and
// verifies the route wires it through unchanged. Real Neo4j persistence/
// query correctness is proven separately, with a REAL instance, in
// @phoenix-ai/graph-persistence's own tests (ingest.test.ts, query.test.ts) --
// this test is only about Fastify route wiring, matching every other route
// test in this file's directory.

vi.mock('../src/services/graph.service.js', () => ({
  getFullGraph: () =>
    Promise.resolve({
      nodes: [
        { id: 'api-1', label: 'CheckoutController', kind: 'Api', confidenceLevel: 'high' },
        { id: 'ent-1', label: 'Order', kind: 'Entity', confidenceLevel: 'high' },
      ],
      edges: [{ id: 'rel-1', source: 'api-1', target: 'ent-1', label: 'dependsOn' }],
    }),
}));

/**
 * The first test cold-imports the route, and with it `neo4j-driver`; under a
 * full parallel `turbo run test` that alone can exceed vitest's 5 s default
 * (P8: observed flaky). The budget covers the import, not the assertion.
 */
const COLD_IMPORT_TIMEOUT_MS = 30_000;

describe('GET /api/full-graph', () => {
  it(
    'returns the graph service response shape unchanged',
    { timeout: COLD_IMPORT_TIMEOUT_MS },
    async () => {
      const { registerGraphRoutes } = await import('../src/routes/graph.js');
      const app = Fastify();
      registerErrorHandling(app);
      registerGraphRoutes(app);

      const res = await app.inject({ method: 'GET', url: '/api/full-graph' });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.nodes).toHaveLength(2);
      expect(body.edges).toHaveLength(1);
      expect(body.nodes[0]).toEqual({
        id: 'api-1',
        label: 'CheckoutController',
        kind: 'Api',
        confidenceLevel: 'high',
      });
      expect(body.edges[0]).toEqual({
        id: 'rel-1',
        source: 'api-1',
        target: 'ent-1',
        label: 'dependsOn',
      });
    },
  );
});
