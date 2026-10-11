import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInMemoryReviewDecisionStore } from '@phoenix-ai/review-loop';
import { buildApp } from '../src/app.js';
import {
  closeReviewDecisionStore,
  resetReviewDecisionStore,
} from '../src/services/review-decisions.service.js';

/**
 * P8 -- the web app's API provider calls only endpoints the backend really
 * serves.
 *
 * The paths are read from `apps/web`'s provider SOURCE rather than copied
 * here, so the two cannot drift apart unnoticed: a path the UI calls that
 * the API does not register fails this test as a 404.
 */

const PROVIDER_SOURCE = fileURLToPath(
  new URL('../../web/src/data/api/apiProvider.ts', import.meta.url),
);

function providerCalls(): { method: 'GET' | 'POST'; path: string }[] {
  const source = readFileSync(PROVIDER_SOURCE, 'utf8');
  return [...source.matchAll(/(getJson|postJson)\(\s*[`'"]([^`'"]+)[`'"]/g)].map((match) => ({
    method: match[1] === 'postJson' ? 'POST' : 'GET',
    path: (match[2] ?? '').replace('${level}', 'container'),
  }));
}

const app = buildApp({ port: 0, host: '127.0.0.1', corsOrigin: 'http://localhost:3000' });

beforeAll(async () => {
  resetReviewDecisionStore(createInMemoryReviewDecisionStore());
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await closeReviewDecisionStore();
});

describe('web provider ↔ API contract (P8)', () => {
  const calls = providerCalls();

  it('finds every call the provider makes', () => {
    expect(calls.length).toBeGreaterThanOrEqual(12);
  });

  for (const { method, path } of providerCalls()) {
    it(`${method} ${path} is served by the API`, async () => {
      const res = await app.inject({
        method,
        url: path,
        payload: method === 'POST' ? {} : undefined,
      });
      expect(res.statusCode, res.body).not.toBe(404);
      if (method === 'POST') expect(res.statusCode).toBe(400); // empty body: rejected, but routed
    });
  }
});

describe('graph not configured (P8)', () => {
  it('answers 503 "unavailable" with an explanation, not an unexplained 500', async () => {
    const saved = process.env.NEO4J_PASSWORD;
    delete process.env.NEO4J_PASSWORD;
    try {
      const res = await app.inject({ method: 'GET', url: '/api/full-graph' });
      expect(res.statusCode).toBe(503);
      expect(res.json().message).toBe(
        'The knowledge graph is temporarily unavailable. Please try again shortly.',
      );
    } finally {
      if (saved !== undefined) process.env.NEO4J_PASSWORD = saved;
    }
  });
});
