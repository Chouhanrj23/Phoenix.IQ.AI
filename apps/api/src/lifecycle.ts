import type { FastifyInstance } from 'fastify';
import { logger } from '@phoenix-ai/shared';
import { closeGraphServiceDriver } from './services/graph.service.js';
import { closeReviewDecisionStore } from './services/review-decisions.service.js';

/**
 * P8 -- resource cleanup and graceful shutdown.
 *
 * The API opened up to two Neo4j connection pools (graph queries, review
 * store) and never closed either, and it had no signal handling: SIGTERM
 * from an orchestrator killed the process mid-request. A review POST cut off
 * after its decision was written left the client unable to tell whether it
 * had been saved.
 *
 * `app.close()` stops accepting connections, lets in-flight requests finish,
 * then runs `onClose`, which releases both pools.
 */
export function registerResourceCleanup(app: FastifyInstance): void {
  app.addHook('onClose', async () => {
    await Promise.all([closeGraphServiceDriver(), closeReviewDecisionStore()]);
  });
}

/**
 * Closes the app on SIGINT/SIGTERM, then exits. A second signal, or a close
 * that takes longer than `graceMs`, exits immediately -- a stuck shutdown
 * must not keep a container alive forever.
 */
export function registerShutdownSignals(
  app: FastifyInstance,
  options: { graceMs?: number; exit?: (code: number) => void } = {},
): void {
  const graceMs = options.graceMs ?? 10_000;
  const exit = options.exit ?? ((code: number) => process.exit(code));
  let shuttingDown = false;

  const onSignal = (signal: NodeJS.Signals): void => {
    if (shuttingDown) {
      exit(1);
      return;
    }
    shuttingDown = true;
    logger.info(`received ${signal}; shutting down`);
    const deadline = setTimeout(() => {
      logger.error('shutdown exceeded its grace period; exiting', { graceMs });
      exit(1);
    }, graceMs);
    deadline.unref();
    app
      .close()
      .then(() => exit(0))
      .catch((error: unknown) => {
        logger.error('error during shutdown', { err: String(error) });
        exit(1);
      })
      .finally(() => clearTimeout(deadline));
  };

  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);
}
