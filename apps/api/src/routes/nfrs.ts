import type { FastifyInstance } from 'fastify';
import { getNonFunctionalRequirements } from '../services/nfrs.service.js';

export function registerNfrRoutes(app: FastifyInstance): void {
  app.get('/api/nfrs', async () => getNonFunctionalRequirements());
}
