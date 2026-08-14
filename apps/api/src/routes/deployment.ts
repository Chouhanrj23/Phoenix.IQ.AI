import type { FastifyInstance } from 'fastify';
import { getDeploymentTopology } from '../services/deployment.service.js';

export function registerDeploymentRoutes(app: FastifyInstance): void {
  app.get('/api/deployment-topology', async () => getDeploymentTopology());
}
