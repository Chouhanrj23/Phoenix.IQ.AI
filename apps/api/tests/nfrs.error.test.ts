import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling } from '../src/errors.js';

vi.mock('../src/services/nfrs.service.js', () => ({
  getNonFunctionalRequirements: () => {
    throw new Error('seed data unavailable');
  },
}));

describe('GET /api/nfrs — server error handling', () => {
  it('returns a masked 500 when the service throws', async () => {
    const { registerNfrRoutes } = await import('../src/routes/nfrs.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerNfrRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/nfrs' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
    expect(res.body).not.toContain('seed data unavailable');
  });
});
