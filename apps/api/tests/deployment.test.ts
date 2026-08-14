import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerDeploymentRoutes } from '../src/routes/deployment.js';

// Empty-data and server-error cases are covered in deployment.empty.test.ts
// and deployment.error.test.ts, each with its own mocked service module.

function expectValidDeploymentNode(node: Record<string, unknown>): void {
  expect(typeof node.id).toBe('string');
  expect(['environment', 'instance']).toContain(node.kind);
  expect(typeof node.name).toBe('string');
  const metadata = node.metadata as { provenance: unknown[]; confidence: Record<string, unknown> };
  expect(Array.isArray(metadata.provenance)).toBe(true);
  expect(metadata.provenance.length).toBeGreaterThan(0);
  expect(['high', 'medium', 'low', 'inferred']).toContain(metadata.confidence.level);
  if (node.kind === 'instance') {
    expect(typeof node.environmentId).toBe('string');
    expect(typeof node.containerId).toBe('string');
  }
}

describe('GET /api/deployment-topology', () => {
  it('returns environment and instance nodes matching the DeploymentNode contract, instances pointing at a valid environment (response shape)', async () => {
    const app = Fastify();
    registerDeploymentRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/deployment-topology' });
    expect(res.statusCode).toBe(200);
    const nodes = res.json();
    for (const node of nodes) expectValidDeploymentNode(node);
    const environmentIds = new Set(
      nodes
        .filter((n: { kind: string }) => n.kind === 'environment')
        .map((n: { id: string }) => n.id),
    );
    expect(environmentIds.size).toBeGreaterThan(0);
    for (const node of nodes.filter((n: { kind: string }) => n.kind === 'instance')) {
      expect(environmentIds.has(node.environmentId)).toBe(true);
    }
  });

  it('returns a deterministic response across repeated calls (same process)', async () => {
    const app = Fastify();
    registerDeploymentRoutes(app);
    const first = await app.inject({ method: 'GET', url: '/api/deployment-topology' });
    const second = await app.inject({ method: 'GET', url: '/api/deployment-topology' });
    expect(first.json()).toEqual(second.json());
  });
});
