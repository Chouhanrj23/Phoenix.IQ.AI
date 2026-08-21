import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { Neo4jUnavailableError } from '@phoenix-ai/graph-persistence';
import { registerErrorHandling } from '../src/errors.js';

// Verifies GET /api/full-graph translates a real, named failure mode --
// Neo4j being unreachable -- into a clean, actionable 503, never a raw
// Neo4j/driver error leaking to the client, and never a silent success.

vi.mock('../src/services/graph.service.js', () => ({
  getFullGraph: () =>
    Promise.reject(new Neo4jUnavailableError('could not reach bolt://localhost:1')),
}));

describe('GET /api/full-graph — Neo4j unavailable', () => {
  it('returns a 503 with an actionable message, not a raw driver error', async () => {
    const { registerGraphRoutes } = await import('../src/routes/graph.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerGraphRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/full-graph' });

    expect(res.statusCode).toBe(503);
    const body = res.json();
    expect(body.message).toContain('temporarily unavailable');
    expect(res.body).not.toContain('bolt://localhost:1');
  });
});

describe('GET /api/full-graph — unexpected service error', () => {
  it('masks an unrelated thrown error behind the standard 500 shape', async () => {
    vi.resetModules();
    vi.doMock('../src/services/graph.service.js', () => ({
      getFullGraph: () => Promise.reject(new Error('unexpected failure detail')),
    }));
    const { registerGraphRoutes } = await import('../src/routes/graph.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerGraphRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/full-graph' });

    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('unexpected failure detail');
  });
});
