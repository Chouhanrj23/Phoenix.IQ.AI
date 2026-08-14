import { getEnv } from '@phoenix-ai/shared';

export interface ApiConfig {
  port: number;
  host: string;
  /** Origin allowed to call this API from the browser (apps/web's dev server by default). */
  corsOrigin: string;
}

export function loadConfig(): ApiConfig {
  return {
    port: Number(getEnv('PORT', '3001')),
    host: getEnv('HOST', '0.0.0.0'),
    corsOrigin: getEnv('CORS_ORIGIN', 'http://localhost:3000'),
  };
}
