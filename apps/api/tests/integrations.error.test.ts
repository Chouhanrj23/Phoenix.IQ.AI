import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling } from '../src/errors.js';

// Verifies GET /api/integrations is wired to the shared error handler
// (apps/api/src/errors.ts) end-to-end: a service-layer failure must still
// come back as the standard { statusCode, error, message } shape, with the
// real error message masked.

vi.mock('../src/services/integrations.service.js', () => ({
  getIntegrations: () => {
    throw new Error('seed data unavailable');
  },
}));

describe('GET /api/integrations — server error handling', () => {
  it('returns a masked 500 when the service throws', async () => {
    const { registerIntegrationRoutes } = await import('../src/routes/integrations.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerIntegrationRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/integrations' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
    expect(res.body).not.toContain('seed data unavailable');
  });
});
