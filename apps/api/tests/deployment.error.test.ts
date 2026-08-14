import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerErrorHandling } from '../src/errors.js';

vi.mock('../src/services/deployment.service.js', () => ({
  getDeploymentTopology: () => {
    throw new Error('seed data unavailable');
  },
}));

describe('GET /api/deployment-topology — server error handling', () => {
  it('returns a masked 500 when the service throws', async () => {
    const { registerDeploymentRoutes } = await import('../src/routes/deployment.js');
    const app = Fastify();
    registerErrorHandling(app);
    registerDeploymentRoutes(app);

    const res = await app.inject({ method: 'GET', url: '/api/deployment-topology' });

    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
    expect(res.body).not.toContain('seed data unavailable');
  });
});
