import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

// Verifies GET /api/domains degrades gracefully to an empty array rather
// than erroring or returning null/undefined when there is no domain data —
// this is the shape apps/web's `(data ?? []).map(...)` rendering expects.

vi.mock('../src/services/domains.service.js', () => ({
  getDomains: () => [],
}));

describe('GET /api/domains — empty data', () => {
  it('returns 200 with an empty array', async () => {
    const { registerDomainRoutes } = await import('../src/routes/domains.js');
    const app = Fastify();
    registerDomainRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/domains' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
