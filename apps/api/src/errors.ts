import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '@phoenix-ai/shared';

/** Thrown by routes/services for expected failure cases (e.g. bad input). */
export class ApiError extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string;
}

/** Registers a consistent JSON error shape for thrown errors and unmatched routes. */
export function registerErrorHandling(app: FastifyInstance): void {
  app.setErrorHandler(
    (error: Error & { statusCode?: number }, request: FastifyRequest, reply: FastifyReply) => {
      const statusCode = error instanceof ApiError ? error.statusCode : (error.statusCode ?? 500);
      // P8: only messages Phoenix wrote for the client are returned. Any
      // other server-side failure -- not just status 500 -- gets the generic
      // body, so a library's 5xx error text (driver, Cypher, file paths)
      // never reaches a client. 4xx messages describe the client's own
      // request and are kept.
      const exposeMessage = error instanceof ApiError || statusCode < 500;
      const body: ErrorResponseBody = {
        statusCode,
        error: exposeMessage ? error.name : 'Internal Server Error',
        message: exposeMessage ? error.message : 'An unexpected error occurred.',
      };
      if (statusCode >= 500) {
        logger.error('unhandled request error', {
          method: request.method,
          url: request.url,
          err: String(error),
        });
      }
      reply.status(statusCode).send(body);
    },
  );

  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    const body: ErrorResponseBody = {
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
    };
    reply.status(404).send(body);
  });
}
