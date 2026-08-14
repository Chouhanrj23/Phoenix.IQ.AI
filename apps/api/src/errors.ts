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
      const body: ErrorResponseBody = {
        statusCode,
        error: statusCode === 500 ? 'Internal Server Error' : error.name,
        message: statusCode === 500 ? 'An unexpected error occurred.' : error.message,
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
