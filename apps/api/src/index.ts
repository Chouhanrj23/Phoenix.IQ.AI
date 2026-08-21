import Fastify from 'fastify';
import { logger } from '@phoenix-ai/shared';
import { loadConfig } from './config.js';
import { registerErrorHandling } from './errors.js';
import { registerHealthRoutes } from './routes/health.js';
import { registerSystemSummaryRoutes } from './routes/system-summary.js';
import { registerArchitectureRoutes } from './routes/architecture.js';
import { registerDomainRoutes } from './routes/domains.js';
import { registerIntegrationRoutes } from './routes/integrations.js';
import { registerDeploymentRoutes } from './routes/deployment.js';
import { registerNfrRoutes } from './routes/nfrs.js';
import { registerReviewRoutes } from './routes/review-items.js';
import { registerGapRoutes } from './routes/gap-items.js';
import { registerDriftRoutes } from './routes/drift.js';
import { registerGraphRoutes } from './routes/graph.js';

const config = loadConfig();
const app = Fastify({ logger: false });

// apps/web's dev server (Vite, port 3000) calls this API directly via
// `fetch` — no dev-server proxy — so browser requests need CORS headers.
// Handled with a plain hook rather than a new dependency (e.g. @fastify/cors)
// since this is the only cross-origin behavior Phase 1 needs.
app.addHook('onRequest', (request, reply, done) => {
  reply.header('Access-Control-Allow-Origin', config.corsOrigin);
  reply.header('Access-Control-Allow-Methods', 'GET,OPTIONS');
  reply.header('Access-Control-Allow-Headers', 'Content-Type');
  if (request.method === 'OPTIONS') {
    reply.status(204).send();
    return;
  }
  done();
});

registerErrorHandling(app);

registerHealthRoutes(app);
registerSystemSummaryRoutes(app);
registerArchitectureRoutes(app);
registerDomainRoutes(app);
registerIntegrationRoutes(app);
registerDeploymentRoutes(app);
registerNfrRoutes(app);
registerReviewRoutes(app);
registerGapRoutes(app);
registerDriftRoutes(app);
registerGraphRoutes(app);

app
  .listen({ port: config.port, host: config.host })
  .then(() => logger.info(`api listening on :${config.port}`))
  .catch((err: unknown) => {
    logger.error('failed to start api', { err: String(err) });
    process.exit(1);
  });
