import { getEnv } from '@phoenix-ai/shared';

export interface ApiConfig {
  port: number;
  host: string;
  /** Origin allowed to call this API from the browser (apps/web's dev server by default). */
  corsOrigin: string;
}

/**
 * Parses `PORT` strictly. `Number()` alone turned `PORT=abc` into `NaN` and
 * `PORT=3001.5` into a fractional port, both of which only failed later,
 * inside `listen`, with an error that did not name the setting (P8).
 */
function parsePort(raw: string): number {
  const port = Number(raw);
  if (!/^\d+$/.test(raw.trim()) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer between 1 and 65535, got "${raw}"`);
  }
  return port;
}

export function loadConfig(): ApiConfig {
  return {
    port: parsePort(getEnv('PORT', '3001')),
    host: getEnv('HOST', '0.0.0.0'),
    corsOrigin: getEnv('CORS_ORIGIN', 'http://localhost:3000'),
  };
}
