import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../src/services/nfrs.service.js', () => ({
  getNonFunctionalRequirements: () => [],
}));

describe('GET /api/nfrs — empty data', () => {
  it('returns 200 with an empty array', async () => {
    const { registerNfrRoutes } = await import('../src/routes/nfrs.js');
    const app = Fastify();
    registerNfrRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/nfrs' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
