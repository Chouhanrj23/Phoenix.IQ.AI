import { afterEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling } from '../src/errors.js';

// Verifies GET /api/system-summary is wired to the shared error handler
// (apps/api/src/errors.ts) end-to-end: a service-layer failure must still
// come back as the standard { statusCode, error, message } shape, with the
// real error message masked — not the route's own ad hoc error handling.

vi.mock('../src/services/system-summary.service.js', () => ({
  getSystemSummary: () => {
    throw new Error('seed data unavailable');
  },
}));

afterEach(() => {
  vi.resetModules();
});

describe('GET /api/system-summary — server error handling', () => {
  it('returns a masked 500 when the service throws', async () => {
    const { registerSystemSummaryRoutes } = await import('../src/routes/system-summary.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerSystemSummaryRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/system-summary' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
    // the real error message must not leak to the client
    expect(res.body).not.toContain('seed data unavailable');
  });
});
