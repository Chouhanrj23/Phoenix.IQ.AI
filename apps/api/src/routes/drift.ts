import type { FastifyInstance } from 'fastify';
import { getDriftAlerts, getDriftHistory } from '../services/drift.service.js';
import type { RunService } from '../services/runs.service.js';

/**
 * Drift. P8: when the system has analysis runs, these endpoints serve the
 * REAL changelogs (FR-DFT-02) and say so with `x-phoenix-data-origin:
 * pipeline`; before any run they serve the Phase 1 seed and say
 * `x-phoenix-data-origin: seed`, so a client can never mistake one for the
 * other.
 */
export function registerDriftRoutes(app: FastifyInstance, runs?: RunService): void {
  app.get('/api/drift-alerts', async (_request, reply) => {
    const history = await runs?.driftHistory(runs.defaultSystemId);
    if (history !== undefined) {
      reply.header('x-phoenix-data-origin', 'pipeline');
      return history[0]?.changes ?? [];
    }
    reply.header('x-phoenix-data-origin', 'seed');
    return getDriftAlerts();
  });
  app.get('/api/drift-history', async (_request, reply) => {
    const history = await runs?.driftHistory(runs.defaultSystemId);
    if (history !== undefined) {
      reply.header('x-phoenix-data-origin', 'pipeline');
      return history;
    }
    reply.header('x-phoenix-data-origin', 'seed');
    return getDriftHistory();
  });
}
