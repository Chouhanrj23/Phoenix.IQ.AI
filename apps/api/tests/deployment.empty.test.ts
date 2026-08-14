import { describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('../src/services/deployment.service.js', () => ({
  getDeploymentTopology: () => [],
}));

describe('GET /api/deployment-topology — empty data', () => {
  it('returns 200 with an empty array', async () => {
    const { registerDeploymentRoutes } = await import('../src/routes/deployment.js');
    const app = Fastify();
    registerDeploymentRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/deployment-topology' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });
});
