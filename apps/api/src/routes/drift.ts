import type { FastifyInstance } from 'fastify';
import { getDriftAlerts, getDriftHistory } from '../services/drift.service.js';

export function registerDriftRoutes(app: FastifyInstance): void {
  app.get('/api/drift-alerts', async () => getDriftAlerts());
  app.get('/api/drift-history', async () => getDriftHistory());
}
