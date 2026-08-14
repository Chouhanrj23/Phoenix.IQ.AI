import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerNfrRoutes } from '../src/routes/nfrs.js';

// Empty-data and server-error cases are covered in nfrs.empty.test.ts and
// nfrs.error.test.ts, each with its own mocked service module.

function expectValidNfr(nfr: Record<string, unknown>): void {
  expect(typeof nfr.id).toBe('string');
  expect(['performance', 'availability', 'security', 'compliance', 'scalability']).toContain(
    nfr.category,
  );
  expect(typeof nfr.requirement).toBe('string');
  expect(typeof nfr.target).toBe('string');
  expect(Array.isArray(nfr.appliesTo)).toBe(true);
  expect((nfr.appliesTo as unknown[]).length).toBeGreaterThan(0);
  const metadata = nfr.metadata as { provenance: unknown[]; confidence: Record<string, unknown> };
  expect(Array.isArray(metadata.provenance)).toBe(true);
  expect(metadata.provenance.length).toBeGreaterThan(0);
  expect(['high', 'medium', 'low', 'inferred']).toContain(metadata.confidence.level);
}

describe('GET /api/nfrs', () => {
  it('returns NFRs matching the NonFunctionalRequirement contract (response shape)', async () => {
    const app = Fastify();
    registerNfrRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/nfrs' });
    expect(res.statusCode).toBe(200);
    const nfrs = res.json();
    expect(nfrs.length).toBeGreaterThan(0);
    for (const nfr of nfrs) expectValidNfr(nfr);
  });

  it('returns a deterministic response across repeated calls (same process)', async () => {
    const app = Fastify();
    registerNfrRoutes(app);
    const first = await app.inject({ method: 'GET', url: '/api/nfrs' });
    const second = await app.inject({ method: 'GET', url: '/api/nfrs' });
    expect(first.json()).toEqual(second.json());
  });
});
