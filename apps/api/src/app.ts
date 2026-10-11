import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiConfig } from './config.js';
import { registerErrorHandling } from './errors.js';
import { registerResourceCleanup } from './lifecycle.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSystemSummaryRoutes } from './routes/system-summary.js';
import { registerArchitectureRoutes } from './routes/architecture.js';
import { registerDomainRoutes } from './routes/domains.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { registerDeploymentRoutes } from './routes/deployment.js';
import { registerNfrRoutes } from './routes/nfrs.js';
import { registerReviewRoutes } from './routes/review-items.js';
import { registerReviewDecisionRoutes } from './routes/review-decisions.js';
import { registerGapRoutes } from './routes/gap-items.js';
import { registerDriftRoutes } from './routes/drift.js';
import { registerGraphRoutes } from './routes/graph.js';
import { registerRunRoutes } from './routes/runs.js';
import { getRunService, type RunService } from './services/runs.service.js';

/**
 * Builds the API exactly as it is served: CORS, error handling, resource
 * cleanup and every route. Extracted from `index.ts` (P8) so tests exercise
 * the real route set -- e.g. the web/API contract test -- without starting a
 * server.
 */
export function buildApp(
  config: ApiConfig,
  dependencies: { runs?: RunService } = {},
): FastifyInstance {
  const runs = dependencies.runs ?? getRunService();
  const app = Fastify({ logger: false });

  // apps/web's dev server (Vite, port 3000) calls this API directly via
  // `fetch` — no dev-server proxy — so browser requests need CORS headers.
  // Handled with a plain hook rather than a new dependency (e.g. @fastify/cors)
  // since this is the only cross-origin behavior Phase 1 needs.
  app.addHook('onRequest', (request, reply, done) => {
    reply.header('Access-Control-Allow-Origin', config.corsOrigin);
    // POST added in P7-01: the review-decision endpoint is the first write in
    // the API, and a browser preflight rejects it without this.
    reply.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    reply.header('Access-Control-Allow-Headers', 'Content-Type');
    // P8: lets the web app read where drift/gap data came from (pipeline vs seed).
    reply.header('Access-Control-Expose-Headers', 'x-phoenix-data-origin, location');
    if (request.method === 'OPTIONS') {
      reply.status(204).send();
      return;
    }
    done();
  });

  registerErrorHandling(app);
  registerResourceCleanup(app);

  registerHealthRoutes(app);
  registerSystemSummaryRoutes(app);
  registerArchitectureRoutes(app);
  registerDomainRoutes(app);
  registerIntegrationRoutes(app);
  registerDeploymentRoutes(app);
  registerNfrRoutes(app);
  registerReviewRoutes(app);
  registerReviewDecisionRoutes(app);
  registerGapRoutes(app, runs);
  registerDriftRoutes(app, runs);
  registerGraphRoutes(app);
  registerRunRoutes(app, runs);

  return app;
}
