import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../src/services/drift.service.js', () => ({
  getDriftAlerts: () => [],
  getDriftHistory: () => [],
}));

describe('GET /api/drift-alerts and /api/drift-history — empty data', () => {
  it('both return 200 with an empty array', async () => {
    const { registerDriftRoutes } = await import('../src/routes/drift.js');
    const app = Fastify();
    registerDriftRoutes(app);

    const alerts = await app.inject({ method: 'GET', url: '/api/drift-alerts' });
    expect(alerts.statusCode).toBe(200);
    expect(alerts.json()).toEqual([]);

    const history = await app.inject({ method: 'GET', url: '/api/drift-history' });
    expect(history.statusCode).toBe(200);
    expect(history.json()).toEqual([]);
  });
});
