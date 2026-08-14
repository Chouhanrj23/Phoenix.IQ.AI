import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerReviewRoutes } from '../src/routes/review-items.js';

// Empty-data and server-error cases are covered in review-items.empty.test.ts
// and review-items.error.test.ts, each with its own mocked service module.

function expectValidReviewItem(item: Record<string, unknown>): void {
  expect(typeof item.id).toBe('string');
  expect(typeof item.elementType).toBe('string');
  expect(typeof item.elementName).toBe('string');
  expect(typeof item.currentValue).toBe('string');
  expect(['pending', 'confirmed', 'corrected']).toContain(item.status);
  const metadata = item.metadata as { provenance: unknown[]; confidence: Record<string, unknown> };
  expect(Array.isArray(metadata.provenance)).toBe(true);
  expect(metadata.provenance.length).toBeGreaterThan(0);
  expect(['high', 'medium', 'low', 'inferred']).toContain(metadata.confidence.level);
  if ('conflict' in item && item.conflict) {
    for (const c of item.conflict as Record<string, unknown>[]) {
      expect(typeof c.sourceId).toBe('string');
      expect(typeof c.sourceLabel).toBe('string');
      expect(typeof c.value).toBe('string');
    }
  }
}

describe('GET /api/review-items', () => {
  it('returns review items matching the ReviewItem contract, including at least one conflict (response shape)', async () => {
    const app = Fastify();
    registerReviewRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/review-items' });
    expect(res.statusCode).toBe(200);
    const items = res.json();
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) expectValidReviewItem(item);
    expect(items.some((i: { conflict?: unknown[] }) => i.conflict && i.conflict.length > 0)).toBe(
      true,
    );
  });

  it('returns a deterministic response across repeated calls (same process)', async () => {
    const app = Fastify();
    registerReviewRoutes(app);
    const first = await app.inject({ method: 'GET', url: '/api/review-items' });
    const second = await app.inject({ method: 'GET', url: '/api/review-items' });
    expect(first.json()).toEqual(second.json());
  });
});
