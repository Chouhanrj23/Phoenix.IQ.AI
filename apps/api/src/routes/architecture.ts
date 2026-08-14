import type { FastifyInstance } from 'fastify';
import type { C4Level } from '@phoenix-ai/shared';
import { getArchitecture } from '../services/architecture.service.js';

interface ArchitectureQuery {
  level?: C4Level;
}

export function registerArchitectureRoutes(app: FastifyInstance): void {
  app.get<{ Querystring: ArchitectureQuery }>(
    '/api/architecture',
    {
      schema: {
        querystring: {
          type: 'object',
          properties: {
            level: { type: 'string', enum: ['context', 'container', 'component'] },
          },
        },
      },
    },
    async (request) => getArchitecture(request.query.level ?? 'context'),
  );
}
