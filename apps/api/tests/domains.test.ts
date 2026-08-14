import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerDomainRoutes } from '../src/routes/domains.js';

// Empty-data and server-error cases are covered in domains.empty.test.ts and
// domains.error.test.ts, each with its own mocked service module.

function expectValidDomain(domain: Record<string, unknown>): void {
  expect(typeof domain.id).toBe('string');
  expect(typeof domain.name).toBe('string');
  expect(typeof domain.description).toBe('string');
  const metadata = domain.metadata as {
    provenance: unknown[];
    confidence: Record<string, unknown>;
  };
  expect(Array.isArray(metadata.provenance)).toBe(true);
  expect(metadata.provenance.length).toBeGreaterThan(0);
  expect(['high', 'medium', 'low', 'inferred']).toContain(metadata.confidence.level);
  expect(Array.isArray(domain.aggregates)).toBe(true);
  for (const agg of domain.aggregates as Record<string, unknown>[]) {
    expect(typeof agg.id).toBe('string');
    expect(typeof agg.name).toBe('string');
    expect(Array.isArray(agg.entities)).toBe(true);
    for (const entity of agg.entities as unknown[]) expect(typeof entity).toBe('string');
    const aggMeta = agg.metadata as { confidence: Record<string, unknown> };
    expect(['high', 'medium', 'low', 'inferred']).toContain(aggMeta.confidence.level);
  }
}

describe('GET /api/domains', () => {
  it('returns domains matching the Domain/Aggregate contract, with at least one aggregate each (response shape)', async () => {
    const app = Fastify();
    registerDomainRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/domains' });
    expect(res.statusCode).toBe(200);
    const domains = res.json();
    expect(domains.length).toBeGreaterThan(0);
    for (const domain of domains) {
      expectValidDomain(domain);
      expect(domain.aggregates.length).toBeGreaterThan(0);
    }
  });

  it('returns a deterministic response across repeated calls (same process)', async () => {
    const app = Fastify();
    registerDomainRoutes(app);
    const first = await app.inject({ method: 'GET', url: '/api/domains' });
    const second = await app.inject({ method: 'GET', url: '/api/domains' });
    expect(first.json()).toEqual(second.json());
  });
});
