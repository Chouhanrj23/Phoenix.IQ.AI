import type { FastifyInstance } from 'fastify';
import { getIntegrations } from '../services/integrations.service.js';

export function registerIntegrationRoutes(app: FastifyInstance): void {
  app.get('/api/integrations', async () => getIntegrations());
}
