import type { FastifyInstance } from 'fastify';
import { getDomains } from '../services/domains.service.js';

export function registerDomainRoutes(app: FastifyInstance): void {
  app.get('/api/domains', async () => getDomains());
}
