import { logger } from '@phoenix-ai/shared';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { registerShutdownSignals } from './lifecycle.js';

const config = loadConfig();
const app = buildApp(config);

app
  .listen({ port: config.port, host: config.host })
  .then(() => {
    registerShutdownSignals(app);
    logger.info(`api listening on :${config.port}`);
  })
  .catch((err: unknown) => {
    logger.error('failed to start api', { err: String(err) });
    process.exit(1);
  });
