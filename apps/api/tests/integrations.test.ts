import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerIntegrationRoutes } from '../src/routes/integrations.js';

// Empty-data and server-error cases are covered in integrations.empty.test.ts
// and integrations.error.test.ts, each with its own mocked service module.

function expectValidIntegration(integration: Record<string, unknown>): void {
  expect(typeof integration.id).toBe('string');
  expect(typeof integration.name).toBe('string');
  expect(typeof integration.counterpart).toBe('string');
  expect(['outbound', 'inbound', 'bidirectional']).toContain(integration.direction);
  expect(typeof integration.protocol).toBe('string');
  expect(typeof integration.dataExchanged).toBe('string');
  const metadata = integration.metadata as {
    provenance: unknown[];
    confidence: Record<string, unknown>;
  };
  expect(Array.isArray(metadata.provenance)).toBe(true);
  expect(metadata.provenance.length).toBeGreaterThan(0);
  expect(['high', 'medium', 'low', 'inferred']).toContain(metadata.confidence.level);
}

describe('GET /api/integrations', () => {
  it('returns integrations matching the Integration contract (response shape)', async () => {
    const app = Fastify();
    registerIntegrationRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/integrations' });
    expect(res.statusCode).toBe(200);
    const integrations = res.json();
    expect(integrations.length).toBeGreaterThan(0);
    for (const integration of integrations) expectValidIntegration(integration);
  });

  it('returns a deterministic response across repeated calls (same process)', async () => {
    const app = Fastify();
    registerIntegrationRoutes(app);
    const first = await app.inject({ method: 'GET', url: '/api/integrations' });
    const second = await app.inject({ method: 'GET', url: '/api/integrations' });
    expect(first.json()).toEqual(second.json());
  });
});
