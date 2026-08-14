import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling } from '../src/errors.js';

vi.mock('../src/services/review-items.service.js', () => ({
  getReviewItems: () => {
    throw new Error('seed data unavailable');
  },
}));

describe('GET /api/review-items — server error handling', () => {
  it('returns a masked 500 when the service throws', async () => {
    const { registerReviewRoutes } = await import('../src/routes/review-items.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerReviewRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/review-items' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
    expect(res.body).not.toContain('seed data unavailable');
  });
});
