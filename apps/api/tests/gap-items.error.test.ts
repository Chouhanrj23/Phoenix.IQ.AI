import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling } from '../src/errors.js';

vi.mock('../src/services/gap-items.service.js', () => ({
  getGapItems: () => {
    throw new Error('seed data unavailable');
  },
}));

describe('GET /api/gap-items — server error handling', () => {
  it('returns a masked 500 when the service throws', async () => {
    const { registerGapRoutes } = await import('../src/routes/gap-items.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerGapRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/gap-items' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
    expect(res.body).not.toContain('seed data unavailable');
  });
});
