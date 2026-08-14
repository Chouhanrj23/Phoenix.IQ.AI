import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../src/services/review-items.service.js', () => ({
  getReviewItems: () => [],
}));

describe('GET /api/review-items — empty data', () => {
  it('returns 200 with an empty array', async () => {
    const { registerReviewRoutes } = await import('../src/routes/review-items.js');
    const app = Fastify();
    registerReviewRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/review-items' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
