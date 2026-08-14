import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerSystemSummaryRoutes } from '../src/routes/system-summary.js';

// GET /api/system-summary takes no parameters (no query/body), so "invalid
// request" and "empty/no-data" cases don't apply — the summary is a single
// always-populated record. Server-error handling is covered separately in
// system-summary.error.test.ts.

describe('GET /api/system-summary', () => {
  it('returns a 200 matching the SystemSummary contract exactly (response contract)', async () => {
    const app = Fastify();
    registerSystemSummaryRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/system-summary' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.json()).toEqual({
      id: 'aurora-commerce',
      name: 'Aurora Commerce (Dummy company used for reverse engineering)',
      description: expect.any(String),
      tags: ['e-commerce', 'payments', 'fulfillment'],
      lastAnalyzedAt: '2026-08-01T00:00:00.000Z',
      coverageScore: 0.78,
      totalElements: 142,
      pendingReviewCount: 5,
      driftAlertCount: 3,
    });
  });

  it('returns a deterministic response across repeated calls (same process)', async () => {
    const app = Fastify();
    registerSystemSummaryRoutes(app);
    const first = await app.inject({ method: 'GET', url: '/api/system-summary' });
    const second = await app.inject({ method: 'GET', url: '/api/system-summary' });
    expect(first.json()).toEqual(second.json());
  });

  it('does not expose internal fields beyond the SystemSummary contract', async () => {
    const app = Fastify();
    registerSystemSummaryRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/system-summary' });
    expect(Object.keys(res.json()).sort()).toEqual(
      [
        'id',
        'name',
        'description',
        'tags',
        'lastAnalyzedAt',
        'coverageScore',
        'totalElements',
        'pendingReviewCount',
        'driftAlertCount',
      ].sort(),
    );
  });
});
