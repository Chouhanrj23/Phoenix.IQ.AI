import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { registerDriftRoutes } from '../src/routes/drift.js';

// Empty-data and server-error cases are covered in drift.empty.test.ts and
// drift.error.test.ts, each with its own mocked service module.
//
// driftAlerts.detectedAt is intentionally relative-to-now (matching
// apps/web's mock provider — see the comment in apps/api/src/data/seed.ts),
// so it is NOT asserted for exact/deterministic values here, only shape.

function expectValidDriftAlert(alert: Record<string, unknown>): void {
  expect(typeof alert.id).toBe('string');
  expect(typeof alert.elementName).toBe('string');
  expect(['added', 'removed', 'modified']).toContain(alert.changeType);
  expect(typeof alert.description).toBe('string');
  expect(() => new Date(alert.detectedAt as string).toISOString()).not.toThrow();
}

describe('GET /api/drift-alerts', () => {
  it('returns drift alerts matching the DriftAlert contract (response shape)', async () => {
    const app = Fastify();
    registerDriftRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/drift-alerts' });
    expect(res.statusCode).toBe(200);
    const alerts = res.json();
    expect(alerts.length).toBeGreaterThan(0);
    for (const alert of alerts) expectValidDriftAlert(alert);
  });
});

describe('GET /api/drift-history', () => {
  it('returns drift runs matching the DriftRun contract, each with a non-empty summary (response shape)', async () => {
    const app = Fastify();
    registerDriftRoutes(app);
    const res = await app.inject({ method: 'GET', url: '/api/drift-history' });
    expect(res.statusCode).toBe(200);
    const runs = res.json();
    expect(runs.length).toBeGreaterThan(0);
    for (const run of runs) {
      expect(typeof run.id).toBe('string');
      expect(() => new Date(run.runDate as string).toISOString()).not.toThrow();
      expect(typeof run.summary).toBe('string');
      expect(run.summary.length).toBeGreaterThan(0);
      expect(Array.isArray(run.changes)).toBe(true);
      for (const change of run.changes) expectValidDriftAlert(change);
    }
  });

  it('returns a deterministic set of run dates/summaries across repeated calls (same process)', async () => {
    const app = Fastify();
    registerDriftRoutes(app);
    const first = await app.inject({ method: 'GET', url: '/api/drift-history' });
    const second = await app.inject({ method: 'GET', url: '/api/drift-history' });
    const strip = (runs: { id: string; runDate: string; summary: string }[]) =>
      runs.map((r) => ({ id: r.id, runDate: r.runDate, summary: r.summary }));
    expect(strip(first.json())).toEqual(strip(second.json()));
  });
});
