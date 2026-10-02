import { beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { Neo4jUnavailableError } from '@phoenix-ai/graph-persistence';
import { createInMemoryReviewDecisionStore } from '@phoenix-ai/review-loop';
import { registerErrorHandling } from '../src/errors.js';
import { registerReviewDecisionRoutes } from '../src/routes/review-decisions.js';
import { resetReviewDecisionStore } from '../src/services/review-decisions.service.js';

/**
 * P7-01 -- the persisted review API.
 *
 * Each test pins an in-process store explicitly, so nothing here depends on
 * whether a Neo4j instance happens to be reachable in the environment.
 * `graph-store.integration.test.ts` (review-loop) covers the durable path.
 */

function buildApp(): FastifyInstance {
  const app = Fastify();
  registerErrorHandling(app);
  registerReviewDecisionRoutes(app);
  return app;
}

const CONFIRM = {
  targetObjectId: 'ctr-payments',
  targetLabel: 'Payments Gateway Adapter',
  decision: 'confirmed',
  previousValue: 'Node.js/Express (from source code)',
  reviewerId: 'reviewer-a',
  previousStatus: 'pending',
};

const CORRECT = {
  ...CONFIRM,
  decision: 'corrected',
  correctedValue: 'Java / Spring Boot',
};

describe('POST /api/review-decisions (P7-01)', () => {
  beforeEach(() => {
    resetReviewDecisionStore(createInMemoryReviewDecisionStore());
  });

  it('creates a confirmation and reports where it was actually stored', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: CONFIRM,
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.durability).toBe('memory');
    expect(body.decision.attributes.targetObjectId).toBe('ctr-payments');
    expect(body.decision.attributes.decision).toBe('confirmed');
    expect(body.decision.kind).toBe('review.decision');
  });

  it('creates a correction that keeps the extracted value on the record', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: CORRECT,
    });

    expect(res.statusCode).toBe(201);
    const attributes = res.json().decision.attributes;
    expect(attributes.correctedValue).toBe('Java / Spring Boot');
    expect(attributes.previousValue).toBe('Node.js/Express (from source code)');
  });

  it('records who decided and when, marking the reviewer unverified (there is no auth)', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: CONFIRM,
    });

    const decision = res.json().decision;
    expect(decision.attributes.reviewerId).toBe('reviewer-a');
    expect(decision.attributes.reviewerVerified).toBe(false);
    expect(typeof decision.lifecycle.since).toBe('string');
    expect(decision.metadata.provenance[0].derivedBy).toBe('human-review');
  });

  it('rejects a malformed body with 400 and persists nothing', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: { decision: 'confirmed' },
    });
    expect(res.statusCode).toBe(400);

    const after = await app.inject({ method: 'GET', url: '/api/review-decisions' });
    expect(after.json()).toEqual([]);
  });

  it('accepts all three FR-REV-02 decisions and rejects anything else with 400', async () => {
    for (const decision of ['confirmed', 'corrected', 'rejected']) {
      const payload =
        decision === 'corrected'
          ? { ...CONFIRM, decision, correctedValue: 'Java' }
          : { ...CONFIRM, decision };
      const res = await buildApp().inject({
        method: 'POST',
        url: '/api/review-decisions',
        payload,
      });
      expect(res.statusCode, `decision "${decision}" must be accepted`).toBe(201);
    }

    const unknown = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: { ...CONFIRM, decision: 'deferred' },
    });
    expect(unknown.statusCode).toBe(400);
  });

  it('rejects an invalid review state (correction with no corrected value) with 422', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: { ...CONFIRM, decision: 'corrected' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().message).toContain('correctedValue');
  });

  it('rejects an illegal previous status with 400 rather than guessing', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: { ...CONFIRM, previousStatus: 'archived' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('reports honestly that the graph was NOT updated when it is unreachable (P7-02)', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: CORRECT,
    });

    expect(res.statusCode).toBe(201);
    const propagation = res.json().propagation;
    // The in-process store has no driver, so the correction cannot reach the
    // graph — and the response says so instead of implying it did.
    expect(propagation.outcome).toBe('graph-unavailable');
    expect(propagation.reason).toContain('not applied to the graph');
  });

  it('carries the reviewed attribute through, so propagation can target it precisely (P7-02)', async () => {
    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: { ...CORRECT, targetAttribute: 'technology' },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().decision.attributes.targetAttribute).toBe('technology');
  });

  it('reports 503 and does NOT claim a save when the store is unavailable', async () => {
    resetReviewDecisionStore({
      durability: 'graph',
      save: () => Promise.reject(new Neo4jUnavailableError('Neo4j unavailable')),
      listForTarget: () => Promise.resolve([]),
      listAll: () => Promise.resolve([]),
    });

    const res = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: CONFIRM,
    });

    expect(res.statusCode).toBe(503);
    expect(res.json().message).toContain('NOT recorded');
  });
});

describe('GET /api/review-decisions (P7-01) — retrieval after a reload', () => {
  beforeEach(() => {
    resetReviewDecisionStore(createInMemoryReviewDecisionStore());
  });

  it('returns an empty log before anything has been reviewed', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/review-decisions' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([]);
  });

  it('returns a persisted decision to a NEW app instance — the refresh path', async () => {
    const submitRes = await buildApp().inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: CORRECT,
    });
    expect(submitRes.statusCode).toBe(201);

    // A brand-new Fastify instance, as a reloaded browser would hit.
    const reloaded = await buildApp().inject({ method: 'GET', url: '/api/review-decisions' });
    const decisions = reloaded.json();
    expect(decisions).toHaveLength(1);
    expect(decisions[0].attributes.correctedValue).toBe('Java / Spring Boot');
  });

  it('filters the log by the reviewed element', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: CONFIRM });
    await app.inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: { ...CONFIRM, targetObjectId: 'ctr-fraud' },
    });

    const filtered = await app.inject({
      method: 'GET',
      url: '/api/review-decisions?targetId=ctr-fraud',
    });
    expect(filtered.json()).toHaveLength(1);
    expect(filtered.json()[0].attributes.targetObjectId).toBe('ctr-fraud');
  });

  it('keeps every decision as history when an element is re-reviewed', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: CONFIRM });
    await app.inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: { ...CORRECT, previousStatus: 'confirmed' },
    });

    const all = await app.inject({ method: 'GET', url: '/api/review-decisions' });
    expect(all.json().length).toBeGreaterThanOrEqual(2);
  });
});
