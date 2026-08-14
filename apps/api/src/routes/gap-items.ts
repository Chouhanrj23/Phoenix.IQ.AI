import type { FastifyInstance } from 'fastify';
import { getGapItems } from '../services/gap-items.service.js';

export function registerGapRoutes(app: FastifyInstance): void {
  app.get('/api/gap-items', async () => getGapItems());
}
