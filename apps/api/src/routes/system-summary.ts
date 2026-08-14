import type { FastifyInstance } from 'fastify';
import { getSystemSummary } from '../services/system-summary.service.js';

export function registerSystemSummaryRoutes(app: FastifyInstance): void {
  app.get('/api/system-summary', async () => getSystemSummary());
}
