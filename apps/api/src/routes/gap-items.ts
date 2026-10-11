import type { FastifyInstance } from 'fastify';
import { getGapItems } from '../services/gap-items.service.js';
import type { RunService } from '../services/runs.service.js';

/**
 * Gap items. P8: the latest run's real gap plan (FR-GAP-01..03) once the
 * system has been analysed (`x-phoenix-data-origin: pipeline`); the Phase 1
 * seed before that (`x-phoenix-data-origin: seed`).
 */
export function registerGapRoutes(app: FastifyInstance, runs?: RunService): void {
  app.get('/api/gap-items', async (_request, reply) => {
    const gaps = await runs?.gapItems(runs.defaultSystemId);
    if (gaps !== undefined) {
      reply.header('x-phoenix-data-origin', 'pipeline');
      return gaps;
    }
    reply.header('x-phoenix-data-origin', 'seed');
    return getGapItems();
  });
}
