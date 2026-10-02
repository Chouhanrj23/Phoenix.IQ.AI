import { beforeEach, describe, expect, it } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { createInMemoryReviewDecisionStore } from '@phoenix-ai/review-loop';
import { registerErrorHandling } from '../src/errors.js';
import { registerReviewDecisionRoutes } from '../src/routes/review-decisions.js';
import { resetReviewDecisionStore } from '../src/services/review-decisions.service.js';

/**
 * P7-03 -- the audit trail over HTTP, driven by real sequential submissions.
 *
 * `ctr-payments` is the canonical element id the seeded review item `rev-1`
 * carries (`elementId`), so the trail here is bound to a real reviewed
 * element rather than an invented one.
 */

function buildApp(): FastifyInstance {
  const app = Fastify();
  registerErrorHandling(app);
  registerReviewDecisionRoutes(app);
  return app;
}

const TARGET = 'ctr-payments';

const CONFIRM = {
  targetObjectId: TARGET,
  targetLabel: 'Payments Gateway Adapter — technology',
  targetAttribute: 'technology',
  decision: 'confirmed',
  previousValue: 'Node.js/Express (from source code)',
  reviewerId: 'reviewer-a',
};

const CORRECT = {
  ...CONFIRM,
  decision: 'corrected',
  correctedValue: 'Java / Spring Boot',
  reviewerId: 'reviewer-b',
  rationale: 'The service was rewritten; the 2024 doc is correct.',
};

const RECORRECT = {
  ...CONFIRM,
  decision: 'corrected',
  previousValue: 'Java / Spring Boot',
  correctedValue: 'Java 21 / Spring Boot 3',
  reviewerId: 'reviewer-c',
};

describe('GET /api/review-audit (P7-03)', () => {
  beforeEach(() => {
    resetReviewDecisionStore(createInMemoryReviewDecisionStore());
  });

  it('requires a target, rather than returning an unbounded log', async () => {
    const res = await buildApp().inject({ method: 'GET', url: '/api/review-audit' });
    expect(res.statusCode).toBe(400);
  });

  it('returns an empty but well-formed trail for an element never reviewed', async () => {
    const res = await buildApp().inject({
      method: 'GET',
      url: '/api/review-audit?targetId=ctr-never-reviewed',
    });

    expect(res.statusCode).toBe(200);
    const trail = res.json();
    expect(trail.targetObjectId).toBe('ctr-never-reviewed');
    expect(trail.entries).toEqual([]);
    expect(trail.currentStatus).toBe('pending');
  });

  it('records three sequential reviews and returns them all, oldest first', async () => {
    const app = buildApp();
    for (const payload of [CONFIRM, CORRECT, RECORRECT]) {
      const res = await app.inject({ method: 'POST', url: '/api/review-decisions', payload });
      expect(res.statusCode).toBe(201);
    }

    const trail = (
      await app.inject({ method: 'GET', url: `/api/review-audit?targetId=${TARGET}` })
    ).json();

    expect(trail.entries).toHaveLength(3);
    expect(trail.entries.map((e: { reviewerId: string }) => e.reviewerId)).toEqual([
      'reviewer-a',
      'reviewer-b',
      'reviewer-c',
    ]);
    expect(trail.entries.map((e: { decision: string }) => e.decision)).toEqual([
      'confirmed',
      'corrected',
      'corrected',
    ]);
  });

  it('answers every audit question for a corrected element', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: CONFIRM });
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: CORRECT });

    const trail = (
      await app.inject({ method: 'GET', url: `/api/review-audit?targetId=${TARGET}` })
    ).json();
    const correction = trail.entries[1];

    expect(trail.targetObjectId).toBe(TARGET); // what object
    expect(correction.previousValue).toBe('Node.js/Express (from source code)'); // previous value
    expect(correction.decision).toBe('corrected'); // decision / validated-or-corrected
    expect(correction.correctedValue).toBe('Java / Spring Boot'); // what correction
    expect(correction.targetAttribute).toBe('technology'); // of what
    expect(correction.reviewerId).toBe('reviewer-b'); // who
    expect(correction.reviewerVerified).toBe(false); // ...unverified, stated
    expect(typeof correction.at).toBe('string'); // when
    expect(correction.provenance[0].derivedBy).toBe('human-review'); // provenance
    expect(correction.rationale).toContain('rewritten'); // why
    expect(trail.currentStatus).toBe('corrected'); // current state
    expect(trail.currentValue).toBe('Java / Spring Boot'); // current canonical value
  });

  it('keeps the supersession chain intact across HTTP submissions', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: CONFIRM });
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: CORRECT });

    const trail = (
      await app.inject({ method: 'GET', url: `/api/review-audit?targetId=${TARGET}` })
    ).json();

    expect(trail.entries[0].supersedesDecisionId).toBeUndefined();
    expect(trail.entries[1].supersedesDecisionId).toBe(trail.entries[0].decisionId);
    expect(trail.currentDecisionId).toBe(trail.entries[1].decisionId);
  });

  it('agrees with /api/review-items about the current value — one projection, not two', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: CORRECT });

    const trail = (
      await app.inject({ method: 'GET', url: `/api/review-audit?targetId=${TARGET}` })
    ).json();

    const { registerReviewRoutes } = await import('../src/routes/review-items.js');
    const queueApp = Fastify();
    registerReviewRoutes(queueApp);
    const items = (await queueApp.inject({ method: 'GET', url: '/api/review-items' })).json();
    const item = items.find((i: { id: string }) => i.id === 'rev-1');

    expect(trail.currentValue).toBe(item.currentValue);
    expect(trail.currentStatus).toBe(item.status);
  });

  it('P7-05: reports OKF sync state, naming affected artifacts and stating it cannot render one itself', async () => {
    const app = buildApp();

    const before = (await app.inject({ method: 'GET', url: '/api/okf-sync-state' })).json();
    expect(before.okfGenerationAvailable).toBe(false);
    expect(before.reason).toContain('cannot render an OKF document');
    expect(before.unreflectedDecisionIds).toEqual([]);
    expect(before.affectedArtifacts).toEqual([]);

    // rev-1 is a Container ('ctr-payments'), so a correction to it affects the
    // C4 architecture view and nothing else.
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: CORRECT });

    const after = (await app.inject({ method: 'GET', url: '/api/okf-sync-state' })).json();
    expect(after.unreflectedDecisionIds).toHaveLength(1);
    expect(after.correctedObjectIds).toEqual([TARGET]);
    expect(after.affectedArtifacts).toEqual(['architecture-c4']);
  });

  it('does not leak another element decisions into the trail', async () => {
    const app = buildApp();
    await app.inject({ method: 'POST', url: '/api/review-decisions', payload: CONFIRM });
    await app.inject({
      method: 'POST',
      url: '/api/review-decisions',
      payload: { ...CONFIRM, targetObjectId: 'agg-loyalty' },
    });

    const trail = (
      await app.inject({ method: 'GET', url: `/api/review-audit?targetId=${TARGET}` })
    ).json();
    expect(trail.entries).toHaveLength(1);
  });
});
