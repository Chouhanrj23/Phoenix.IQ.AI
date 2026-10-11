import { afterEach, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { createInMemoryReviewDecisionStore } from '@phoenix-ai/review-loop';
import { registerResourceCleanup, registerShutdownSignals } from '../src/lifecycle.js';
import {
  closeReviewDecisionStore,
  resetReviewDecisionStore,
} from '../src/services/review-decisions.service.js';

/**
 * P8 -- connection pools are released when the API closes, and a shutdown
 * signal closes the app gracefully instead of killing it mid-request.
 */

function fakeDriver() {
  const state = { closes: 0 };
  const driver = {
    session: () => ({ close: () => Promise.resolve() }),
    close: () => {
      state.closes++;
      return Promise.resolve();
    },
  };
  return { driver: driver as never, state };
}

afterEach(async () => {
  await closeReviewDecisionStore();
});

describe('resource cleanup on close (P8)', () => {
  it("closes the review store's Neo4j pool when the app closes", async () => {
    const { driver, state } = fakeDriver();
    resetReviewDecisionStore(createInMemoryReviewDecisionStore(), { driver, database: 'neo4j' });

    const app = Fastify();
    registerResourceCleanup(app);
    await app.ready();
    await app.close();

    expect(state.closes).toBe(1);
  });

  it('closing twice, or with nothing resolved, is safe', async () => {
    await expect(closeReviewDecisionStore()).resolves.toBeUndefined();
    await expect(closeReviewDecisionStore()).resolves.toBeUndefined();
  });
});

describe('graceful shutdown on SIGTERM (P8)', () => {
  it('lets an in-flight request finish, then exits 0', async () => {
    const exits: number[] = [];
    const app = Fastify();
    let release: () => void = () => undefined;
    let arrived: () => void = () => undefined;
    const inHandler = new Promise<void>((resolve) => {
      arrived = resolve;
    });
    app.get('/slow', async () => {
      await new Promise<void>((resolve) => {
        release = resolve;
        arrived();
      });
      return { done: true };
    });
    registerShutdownSignals(app, { exit: (code) => exits.push(code), graceMs: 5_000 });
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    const inFlight = fetch(`http://127.0.0.1:${port}/slow`).then((r) => r.json());
    // Signal only once the request is genuinely in flight. A fixed 50ms sleep
    // raced under load: the request sometimes arrived after shutdown began
    // and was (correctly) refused with 503.
    await inHandler;
    process.emit('SIGTERM', 'SIGTERM');
    release();

    await expect(inFlight).resolves.toEqual({ done: true });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(exits).toEqual([0]);
  });

  it('exits non-zero if shutdown overruns its grace period', async () => {
    const exits: number[] = [];
    const app = Fastify();
    app.addHook('onClose', () => new Promise<void>(() => undefined)); // never finishes
    await app.ready();
    registerShutdownSignals(app, { exit: (code) => exits.push(code), graceMs: 50 });

    process.emit('SIGINT', 'SIGINT');
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(exits).toEqual([1]);
  });
});
