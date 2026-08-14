import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

// Verifies GET /api/integrations degrades gracefully to an empty array
// rather than erroring or returning null/undefined when there is no
// integration data — matches apps/web's `(data ?? []).map(...)` rendering.

vi.mock('../src/services/integrations.service.js', () => ({
  getIntegrations: () => [],
}));

describe('GET /api/integrations — empty data', () => {
  it('returns 200 with an empty array', async () => {
    const { registerIntegrationRoutes } = await import('../src/routes/integrations.js');
    const app = Fastify();
    registerIntegrationRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/integrations' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
