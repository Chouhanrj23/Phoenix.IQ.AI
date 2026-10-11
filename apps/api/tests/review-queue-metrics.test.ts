import { beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Neo4jUnavailableError } from '@phoenix-ai/graph-persistence';
import { createInMemoryReviewDecisionStore } from '@phoenix-ai/review-loop';
import { registerErrorHandling } from '../src/errors.js';
import { registerReviewRoutes } from '../src/routes/review-items.js';
import { registerReviewDecisionRoutes } from '../src/routes/review-decisions.js';
import { resetReviewDecisionStore } from '../src/services/review-decisions.service.js';

/**
 * P7-08 over HTTP: the ranked queue (FR-REV-01), the reject decision
 * (FR-REV-02), and the correction-rate metric (FR-REV-04).
 */

function buildApp(): FastifyInstance {
  const app = Fastify();
  registerErrorHandling(app);
  registerReviewRoutes(app);
  registerReviewDecisionRoutes(app);
  return app;
}

const TARGET = 'ctr-payments';

describe('GET /api/review-queue (FR-REV-01)', () => {
  beforeEach(() => {
    resetReviewDecisionStore(createInMemoryReviewDecisionStore());
  });

  it('returns every queue item with a leverage and inverse-confidence score', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/review-queue' });
    expect(res.statusCode).toBe(200);

    const ranking = res.json();
    expect(ranking.items.length).toBeGreaterThan(0);
    for (const entry of ranking.items) {
      expect(typeof entry.leverage).toBe('number');
      expect(typeof entry.inverseConfidence).toBe('number');
      expect(typeof entry.score).toBe('number');
      expect(entry.item.id).toBeTruthy();
    }
  });

  it('orders by score descending — the queue leads with what needs attention most', async () => {
    const ranking = (await buildApp().inject({ method: 'GET', url: '/api/review-queue' })).json();
    const scores = ranking.items.map((e: { score: number }) => e.score);
    expect([...scores].sort((a: number, b: number) => b - a)).toEqual(scores);
  });

  it('states honestly that leverage was unavailable when the graph is unreachable', async () => {
    const ranking = (await buildApp().inject({ method: 'GET', url: '/api/review-queue' })).json();
    // No Neo4j in the test environment, so centrality cannot be computed.
    expect(ranking.leverageAvailable).toBe(false);
    expect(ranking.summary).toContain('inverse confidence only');
  });

  it('leaves /api/review-items shape untouched — the ranked view is additive', async () => {
    const items = (await buildApp().inject({ method: 'GET', url: '/api/review-items' })).json();
    expect(Array.isArray(items)).toBe(true);
    expect(items[0]).not.toHaveProperty('leverage');
  });
});

describe('POST /api/review-decisions — reject (FR-REV-02)', () => {
  beforeEach(() => {
    resetReviewDecisionStore(createInMemoryReviewDecisionStore());
  });

  const REJECT = {
    targetObjectId: TARGET,
    targetAttribute: 'technology',
    decision: 'rejected',
    previousValue: 'Node.js/Express (from source code)',
    reviewerId: 'reviewer-a',
    rationale: 'Neither source is right; needs investigation.',
  };

  it('persists a rejection', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: REJECT,
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().decision.attributes.decision).toBe('rejected');
    expect(res.json().decision.lifecycle.status).toBe('rejected');
  });

  it('refuses a rejection that smuggles in a replacement value', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: { ...REJECT, correctedValue: 'Java' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toContain('correctedValue');
  });

  it('shows up as rejected in the queue, and does NOT change the value', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: REJECT });

    const items = (await app.inject({ method: 'GET', url: '/api/review-items' })).json();
    const item = items.find((i: { id: string }) => i.id === 'rev-1');
    expect(item.status).toBe('rejected');
    expect(item.currentValue).toBe('Node.js/Express (from source code)');
  });

  it('appears in the audit trail as a rejection', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: REJECT });

    const trail = (
      await app.inject({ method: 'GET', url: `/api/review-audit?targetId=${TARGET}` })
    ).json();
    expect(trail.currentStatus).toBe('rejected');
    expect(trail.entries[0].decision).toBe('rejected');
    expect(trail.entries[0].correctedValue).toBeUndefined();
  });
});

describe('GET /api/review-metrics (FR-REV-04)', () => {
  beforeEach(() => {
    resetReviewDecisionStore(createInMemoryReviewDecisionStore());
  });

  it('reports no measured correction rate before anything is reviewed', async () => {
    const m = (await buildApp().inject({ method: 'GET', url: '/api/review-metrics' })).json();
    expect(m.decisions).toBe(0);
    expect(m.correctionRate).toBeNull();
    expect(m.runScoped).toBe(false);
  });

  it('computes the correction rate across real recorded decisions', async () => {
    const app = buildApp();
    await app.inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: {
        targetObjectId: TARGET,
        targetAttribute: 'technology',
        decision: 'corrected',
        previousValue: 'Node.js/Express (from source code)',
        correctedValue: 'Java / Spring Boot',
        reviewerId: 'reviewer-a',
      },
    });
    await app.inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: {
        targetObjectId: 'agg-loyalty',
        targetAttribute: 'owner',
        decision: 'confirmed',
        previousValue: 'Owned by Customer domain (inferred)',
        reviewerId: 'reviewer-b',
      },
    });

    const m = (await app.inject({ method: 'GET', url: '/api/review-metrics' })).json();
    expect(m.decisions).toBe(2);
    expect(m.elementsReviewed).toBe(2);
    expect(m.corrected).toBe(1);
    expect(m.confirmed).toBe(1);
    expect(m.correctionRate).toBe(0.5);
    expect(m.summary).toContain('Not run-scoped');
  });

  it('honours an explicit window', async () => {
    const m = (
      await buildApp().inject({
        method: 'GET',
        url: '/api/review-metrics?from=2030-01-01T00:00:00.000Z',
      })
    ).json();
    expect(m.decisions).toBe(0);
    expect(m.window.from).toBe('2030-01-01T00:00:00.000Z');
  });

  it('rejects an unparseable window bound with 400 instead of computing a meaningless metric (P8)', async () => {
    const res = await buildApp().inject({
      method: 'GET',
      url: '/api/review-metrics?from=last-tuesday',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().message).toContain('"from" must be an ISO-8601 timestamp');
  });

  it('rejects a window whose from is after its to with 400 (P8)', async () => {
    const res = await buildApp().inject({
      method: 'GET',
      url: '/api/review-metrics?from=2030-01-02T00:00:00Z&to=2030-01-01T00:00:00Z',
    });
    expect(res.statusCode).toBe(400);
  });

  it('reports a store outage as 503, like every other storage-backed review route (P8)', async () => {
    resetReviewDecisionStore({
      durability: 'graph',
      save: () => Promise.reject(new Neo4jUnavailableError('down')),
      listForTarget: () => Promise.reject(new Neo4jUnavailableError('down')),
      listAll: () => Promise.reject(new Neo4jUnavailableError('down')),
    });
    const res = await buildApp().inject({ method: 'GET', url: '/api/review-metrics' });
    expect(res.statusCode).toBe(503);
  });
});

describe('GET /api/review-queue — leverage from graph structure only (P8 performance)', () => {
  it('computes leverage from relationship endpoints without loading any node data', async () => {
    const cyphers: string[] = [];
    const rows = [
      { sourceId: TARGET, targetId: 'agg-orders' },
      { sourceId: 'ctr-checkout', targetId: TARGET },
    ];
    const session = {
      run: () => Promise.resolve({ records: [{ get: () => true }] }),
      executeRead: (work: (tx: unknown) => unknown) =>
        Promise.resolve(
          work({
            run: (cypher: string) => {
              cyphers.push(cypher);
              return Promise.resolve({
                records: rows.map((row) => ({
                  get: (key: 'sourceId' | 'targetId') => row[key],
                })),
              });
            },
          }),
        ),
      close: () => Promise.resolve(),
    };
    resetReviewDecisionStore(createInMemoryReviewDecisionStore(), {
      driver: { session: () => session } as never,
      database: 'neo4j',
    });

    const ranking = (await buildApp().inject({ method: 'GET', url: '/api/review-queue' })).json();
    expect(ranking.leverageAvailable).toBe(true);
    const target = ranking.items.find(
      (entry: { item: { elementId?: string; id: string } }) =>
        (entry.item.elementId ?? entry.item.id) === TARGET,
    );
    expect(target?.leverage).toBe(2);
    expect(cyphers.some((cypher) => cypher.includes('MATCH (n) RETURN n'))).toBe(false);
  });
});
