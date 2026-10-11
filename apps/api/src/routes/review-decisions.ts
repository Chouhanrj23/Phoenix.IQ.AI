import type { FastifyInstance } from 'fastify';
import { Neo4jUnavailableError } from '@phoenix-ai/graph-persistence';
import {
  InvalidMetricsWindowError,
  InvalidReviewDecisionError,
  InvalidReviewTransitionError,
} from '@phoenix-ai/review-loop';
import { ApiError } from '../errors.js';
import {
  getOkfSyncState,
  getReviewAuditTrail,
  getReviewMetrics,
  listReviewDecisions,
  MalformedReviewRequestError,
  submitReviewDecision,
} from '../services/review-decisions.service.js';

/**
 * P7-01 -- the persisted human review API.
 *
 * `POST /api/review-decisions` records one decision; `GET` returns the
 * append-only decision log (optionally for one element). Together these are
 * what make Confirm/Correct real: the decision leaves the browser, is
 * validated, is persisted, and is readable again after a refresh.
 *
 * Every response carries `durability` ('graph' | 'memory') so a client can
 * tell the reviewer what actually happened. The API never reports a write
 * as durable when it was not.
 *
 * Failure mapping is deliberate and distinct per cause:
 *   400 malformed body            — the request is not a well-formed decision
 *   422 illegal transition/state  — well-formed, but not a legal review move
 *   503 storage unavailable       — nothing was saved; say so, never fake success
 */
export function registerReviewDecisionRoutes(app: FastifyInstance): void {
  app.post('/api/review-decisions', async (request, reply) => {
    try {
      const result = await submitReviewDecision(request.body, new Date().toISOString());
      reply.status(201);
      return {
        decision: result.decision,
        durability: result.durability,
        // P7-02: how far the correction actually travelled. Reported rather
        // than assumed, so a client never implies the canonical graph was
        // updated when it was not.
        propagation: result.propagation,
      };
    } catch (error) {
      if (error instanceof MalformedReviewRequestError) {
        throw new ApiError(400, error.message);
      }
      if (error instanceof InvalidReviewTransitionError) {
        throw new ApiError(422, error.message);
      }
      if (error instanceof InvalidReviewDecisionError) {
        throw new ApiError(422, error.message);
      }
      if (error instanceof Neo4jUnavailableError) {
        throw new ApiError(
          503,
          'Review decisions cannot be saved right now — the knowledge graph is unavailable. Your decision was NOT recorded.',
        );
      }
      throw error;
    }
  });

  app.get<{ Querystring: { targetId?: string } }>('/api/review-decisions', async (request) => {
    const targetId = request.query.targetId;
    try {
      return await listReviewDecisions(targetId);
    } catch (error) {
      if (error instanceof Neo4jUnavailableError) {
        throw new ApiError(
          503,
          'Review decisions are temporarily unavailable. Please try again shortly.',
        );
      }
      throw error;
    }
  });

  /**
   * P7-03 -- the audit trail for one reviewed element: every review action in
   * chronological order, each with its reviewer, timestamp, previous value,
   * correction, evidence and provenance, plus the element's current status and
   * canonical value. A projection over the decisions already stored, not a
   * separate audit log.
   */
  /**
   * FR-REV-04 -- review quality metrics (correction rate) over the recorded
   * decision log. `from`/`to` bound the window; `runScoped` is false until an
   * orchestrated run boundary exists.
   */
  app.get<{ Querystring: { from?: string; to?: string } }>(
    '/api/review-metrics',
    async (request) => {
      const { from, to } = request.query;
      try {
        return await getReviewMetrics({
          ...(from === undefined ? {} : { from }),
          ...(to === undefined ? {} : { to }),
        });
      } catch (error) {
        // P8: an unusable window is the caller's error (400), and an
        // unreachable store is an outage (503) -- the same mapping every
        // other storage-backed review route already used; this one alone
        // let both fall through to a generic 500.
        if (error instanceof InvalidMetricsWindowError) {
          throw new ApiError(400, error.message);
        }
        if (error instanceof Neo4jUnavailableError) {
          throw new ApiError(
            503,
            'Review metrics are temporarily unavailable. Please try again shortly.',
          );
        }
        throw error;
      }
    },
  );

  /**
   * P7-05 -- OKF/documentation synchronisation state. Reports which recorded
   * decisions are not yet reflected in a rendered OKF document and which
   * artifact types they affect, and states plainly that this API cannot render
   * one itself — so a stale export is never mistaken for a current one.
   */
  app.get('/api/okf-sync-state', async () => {
    try {
      return await getOkfSyncState();
    } catch (error) {
      if (error instanceof Neo4jUnavailableError) {
        throw new ApiError(
          503,
          'OKF synchronisation state is temporarily unavailable. Please try again shortly.',
        );
      }
      throw error;
    }
  });

  app.get<{ Querystring: { targetId?: string } }>('/api/review-audit', async (request) => {
    const targetId = request.query.targetId;
    if (targetId === undefined || targetId.trim().length === 0) {
      throw new ApiError(400, '"targetId" query parameter is required');
    }
    try {
      return await getReviewAuditTrail(targetId);
    } catch (error) {
      if (error instanceof Neo4jUnavailableError) {
        throw new ApiError(
          503,
          'The review audit trail is temporarily unavailable. Please try again shortly.',
        );
      }
      throw error;
    }
  });
}
