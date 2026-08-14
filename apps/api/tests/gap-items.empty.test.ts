import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../src/services/gap-items.service.js', () => ({
  getGapItems: () => [],
}));

describe('GET /api/gap-items — empty data', () => {
  it('returns 200 with an empty array', async () => {
    const { registerGapRoutes } = await import('../src/routes/gap-items.js');
    const app = Fastify();
    registerGapRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/gap-items' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
