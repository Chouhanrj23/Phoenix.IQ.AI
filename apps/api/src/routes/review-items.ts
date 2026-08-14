import type { FastifyInstance } from 'fastify';
import { getReviewItems } from '../services/review-items.service.js';

export function registerReviewRoutes(app: FastifyInstance): void {
  app.get('/api/review-items', async () => getReviewItems());
}
