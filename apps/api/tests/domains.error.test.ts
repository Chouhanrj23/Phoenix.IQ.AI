import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling } from '../src/errors.js';

// Verifies GET /api/domains is wired to the shared error handler
// (apps/api/src/errors.ts) end-to-end: a service-layer failure must still
// come back as the standard { statusCode, error, message } shape, with the
// real error message masked.

vi.mock('../src/services/domains.service.js', () => ({
  getDomains: () => {
    throw new Error('seed data unavailable');
  },
}));

describe('GET /api/domains — server error handling', () => {
  it('returns a masked 500 when the service throws', async () => {
    const { registerDomainRoutes } = await import('../src/routes/domains.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerDomainRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/domains' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
    expect(res.body).not.toContain('seed data unavailable');
  });
});
