import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { ApiError, registerErrorHandling } from '../src/errors.js';

describe('error handling', () => {
  it('returns a consistent JSON shape for unmatched routes', async () => {
    const app = Fastify();
    registerErrorHandling(app);
    const res = await app.inject({ method: 'GET', url: '/api/does-not-exist' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({
      statusCode: 404,
      error: 'Not Found',
      message: 'Route GET:/api/does-not-exist not found',
    });
  });

  it('serializes a thrown ApiError with its own status code and message', async () => {
    const app = Fastify();
    registerErrorHandling(app);
    app.get('/boom', async () => {
      throw new ApiError(400, 'bad request');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ statusCode: 400, error: 'ApiError', message: 'bad request' });
  });

  it('masks unexpected errors as a generic 500 without leaking the message', async () => {
    const app = Fastify();
    registerErrorHandling(app);
    app.get('/boom', async () => {
      throw new Error('some internal detail');
    });
    const res = await app.inject({ method: 'GET', url: '/boom' });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred.',
    });
  });
});
