import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling } from '../src/errors.js';

vi.mock('../src/services/drift.service.js', () => ({
  getDriftAlerts: () => {
    throw new Error('seed data unavailable');
  },
  getDriftHistory: () => {
    throw new Error('seed data unavailable');
  },
}));

describe('GET /api/drift-alerts and /api/drift-history — server error handling', () => {
  it('both return a masked 500 when the service throws', async () => {
    const { registerDriftRoutes } = await import('../src/routes/drift.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerDriftRoutes(app);

    const expected = {
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    };

    const alerts = await app.inject({ method: 'GET', url: '/api/drift-alerts' });
    expect(alerts.statusCode).toBe(500);
    expect(alerts.json()).toEqual(expected);
    expect(alerts.body).not.toContain('seed data unavailable');

    const history = await app.inject({ method: 'GET', url: '/api/drift-history' });
    expect(history.statusCode).toBe(500);
    expect(history.json()).toEqual(expected);
    expect(history.body).not.toContain('seed data unavailable');
  });
});
