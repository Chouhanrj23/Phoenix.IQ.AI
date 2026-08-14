import { afterEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const ENV_KEYS = ['PORT', 'HOST', 'CORS_ORIGIN'] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
});

describe('loadConfig', () => {
  it('falls back to dev defaults when no env vars are set', () => {
    const config = loadConfig();
    expect(config).toEqual({
      port: 3001,
      host: '0.0.0.0',
      corsOrigin: 'http://localhost:3000',
    });
  });

  it('reads overrides from the environment', () => {
    process.env.PORT = '4000';
    process.env.HOST = '127.0.0.1';
    process.env.CORS_ORIGIN = 'https://phoenix.example.com';
    const config = loadConfig();
    expect(config).toEqual({
      port: 4000,
      host: '127.0.0.1',
      corsOrigin: 'https://phoenix.example.com',
    });
  });
});
