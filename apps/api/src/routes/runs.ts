import type { FastifyInstance, FastifyRequest } from 'fastify';
import { OKF_ARTIFACT_IDS } from '@phoenix-ai/okf-renderers';
import { ApiError } from '../errors.js';
import type { RunService } from '../services/runs.service.js';

/**
 * P8 -- FR-IF-01 (register sources, trigger runs) and FR-IF-03/05 (serve a
 * run's real outputs). Every route is scoped to one system: `?systemId=`,
 * or the server's default (`PHOENIX_SYSTEM_ID`) when omitted.
 */

const SYSTEM_ID = /^[A-Za-z0-9._-]{1,100}$/;

function systemIdOf(request: FastifyRequest, runs: RunService): string {
  const value = (request.query as Record<string, unknown> | undefined)?.systemId;
  if (value === undefined) return runs.defaultSystemId;
  if (typeof value !== 'string' || !SYSTEM_ID.test(value)) {
    throw new ApiError(400, '"systemId" must be 1-100 characters of [A-Za-z0-9._-]');
  }
  return value;
}

interface RunParams {
  id: string;
}

export function registerRunRoutes(app: FastifyInstance, runs: RunService): void {
  app.get('/api/sources', async (request) => runs.listSources(systemIdOf(request, runs)));

  app.post('/api/sources', async (request, reply) => {
    const source = await runs.registerSource(request.body);
    reply.status(201);
    return source;
  });

  app.get('/api/runs', async (request) => runs.listRuns(systemIdOf(request, runs)));

  app.post('/api/runs', async (request, reply) => {
    const run = await runs.submitRun(request.body);
    // Accepted, not done: poll GET /api/runs/:id for its status.
    reply.status(202).header('location', `/api/runs/${run.id}?systemId=${run.systemId}`);
    return run;
  });

  app.get<{ Params: RunParams }>('/api/runs/:id', async (request) =>
    runs.getRun(systemIdOf(request, runs), request.params.id),
  );

  app.get<{ Params: RunParams }>('/api/runs/:id/okf', async (request, reply) => {
    const yaml = await runs.okfYaml(systemIdOf(request, runs), request.params.id);
    reply.type('application/yaml; charset=utf-8');
    return yaml;
  });

  app.get<{ Params: RunParams }>(
    '/api/runs/:id/changelog',
    async (request) => (await runs.outputs(systemIdOf(request, runs), request.params.id)).changelog,
  );

  app.get<{ Params: RunParams }>(
    '/api/runs/:id/gaps',
    async (request) => (await runs.outputs(systemIdOf(request, runs), request.params.id)).gaps,
  );

  app.get<{ Params: RunParams }>(
    '/api/runs/:id/knowledge-risk',
    async (request) =>
      (await runs.outputs(systemIdOf(request, runs), request.params.id)).knowledgeRisk,
  );

  app.get<{ Params: RunParams }>(
    '/api/runs/:id/evaluation',
    async (request) =>
      (await runs.outputs(systemIdOf(request, runs), request.params.id)).evaluation,
  );

  /** The eleven artifacts: status, missing inputs, and their files (without content). */
  app.get<{ Params: RunParams }>('/api/runs/:id/artifacts', async (request) => {
    const pkg = await runs.exportPackage(systemIdOf(request, runs), request.params.id);
    return pkg.artifacts.map((a) => ({
      id: a.id,
      label: a.label,
      status: a.status,
      elementCount: a.elements.length,
      missingInputs: a.missingInputs,
      notes: a.notes,
      files: a.files.map((f) => ({
        path: `artifacts/${a.id}/${f.path}`,
        mediaType: f.mediaType,
      })),
    }));
  });

  /** The portable export's manifest: every file with its SHA-256. */
  app.get<{ Params: RunParams }>(
    '/api/runs/:id/export',
    async (request) =>
      (await runs.exportPackage(systemIdOf(request, runs), request.params.id)).manifest,
  );

  /** One file of the export, by its manifest path. Only paths in the manifest are served. */
  app.get<{ Params: RunParams & { '*': string } }>(
    '/api/runs/:id/export/*',
    async (request, reply) => {
      const pkg = await runs.exportPackage(systemIdOf(request, runs), request.params.id);
      const file = pkg.files.find((f) => f.path === request.params['*']);
      if (file === undefined)
        throw new ApiError(404, `no file "${request.params['*']}" in this export`);
      reply.type(`${file.mediaType}; charset=utf-8`);
      return file.content;
    },
  );

  // Documents the artifact ids a client can expect, for discoverability.
  app.get('/api/artifact-types', async () => OKF_ARTIFACT_IDS);
}
