import type { FastifyInstance } from 'fastify';
import { getRankedReviewQueue, getReviewItems } from '../services/review-items.service.js';

export function registerReviewRoutes(app: FastifyInstance): void {
  app.get('/api/review-items', async () => getReviewItems());

  /**
   * FR-REV-01 -- the review queue ordered by element leverage (degree
   * centrality) and inverse confidence.
   *
   * A separate endpoint rather than a change to `/api/review-items`: the
   * ranked view carries the per-item leverage/uncertainty scores and a
   * `leverageAvailable` flag, which the plain contract does not have a field
   * for. Existing clients keep the shape they already consume.
   */
  app.get('/api/review-queue', async () => getRankedReviewQueue());
}
