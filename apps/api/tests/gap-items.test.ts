import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerGapRoutes } from '../src/routes/gap-items.js';

// Empty-data and server-error cases are covered in gap-items.empty.test.ts
// and gap-items.error.test.ts, each with its own mocked service module.

function expectValidGapItem(gap: Record<string, unknown>): void {
  expect(typeof gap.id).toBe('string');
  expect(typeof gap.area).toBe('string');
  expect(typeof gap.description).toBe('string');
  expect(Array.isArray(gap.missingInputs)).toBe(true);
  expect((gap.missingInputs as unknown[]).length).toBeGreaterThan(0);
  expect(['blocking', 'high', 'medium', 'low']).toContain(gap.severity);
  expect(typeof gap.suggestedAction).toBe('string');
}

describe('GET /api/gap-items', () => {
  it('returns gap items matching the GapItem contract (response shape)', async () => {
    const app = Fastify();
    registerGapRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/gap-items' });
    expect(res.statusCode).toBe(200);
    const gaps = res.json();
    expect(gaps.length).toBeGreaterThan(0);
    for (const gap of gaps) expectValidGapItem(gap);
  });

  it('returns a deterministic response across repeated calls (same process)', async () => {
    const app = Fastify();
    registerGapRoutes(app);
    const first = await app.inject({ method: 'GET', url: '/api/gap-items' });
    const second = await app.inject({ method: 'GET', url: '/api/gap-items' });
    expect(first.json()).toEqual(second.json());
  });
});
