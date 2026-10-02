/**
 * P7-01 -- persisted human review decisions.
 *
 * Store selection is resolved ONCE, lazily, on first use (the same lazy
 * pattern `graph.service.ts` already uses so the API still starts when Neo4j
 * is not configured):
 *
 *   1. Neo4j, if it is configured AND reachable  -> `durability: 'graph'`
 *   2. otherwise an in-process store             -> `durability: 'memory'`
 *
 * The fallback is NOT a silent one. `durability` is returned on every
 * response and logged as a warning at selection time, because an in-process
 * store survives a browser refresh but NOT an API restart -- calling that
 * "saved" without qualification would be a claim Phoenix cannot honour.
 * Nothing here ever reports success for a write that did not happen.
 */

import {
  closeNeo4jDriver,
  createNeo4jDriver,
  getFullGraph,
  loadNeo4jConfig,
  verifyNeo4jConnectivity,
} from '@phoenix-ai/graph-persistence';
import type { Driver } from 'neo4j-driver';
import {
  applyDecisionsToReviewItems,
  buildReviewAuditTrail,
  computeReviewMetrics,
  createGraphReviewDecisionStore,
  createInMemoryReviewDecisionStore,
  propagateCorrectionToGraph,
  recordReviewDecision,
  targetIdForReviewItem,
  type RecordReviewDecisionResult,
  type RelationshipEndpoints,
  type ReviewAuditTrail,
  type ReviewDecisionStore,
  type ReviewMetrics,
} from '@phoenix-ai/review-loop';
import { artifactsForObjectKind } from '@phoenix-ai/okf-renderers';
import { reviewItems } from '../data/seed.js';
import type { BuildReviewDecisionInput, ReviewDecisionObject } from '@phoenix-ai/knowledge-graph';
import { logger } from '@phoenix-ai/shared';

const SYSTEM_ID = 'aurora-commerce';

let storePromise: Promise<ReviewDecisionStore> | undefined;
/** Set only when the graph is reachable — propagation needs a driver, which the memory store has none of. */
let graphContext: { driver: Driver; database: string } | undefined;

/** Resolves (once) the best available store, preferring durable graph storage. */
async function resolveStore(): Promise<ReviewDecisionStore> {
  try {
    const config = loadNeo4jConfig();
    const driver = createNeo4jDriver(config);
    try {
      await verifyNeo4jConnectivity(driver, config.database);
      graphContext = { driver, database: config.database };
      return createGraphReviewDecisionStore(driver, config.database);
    } catch (error) {
      await closeNeo4jDriver(driver);
      throw error;
    }
  } catch (error) {
    // An operator must see this: review decisions will not survive a restart.
    logger.warn(
      'review decision persistence degraded to an in-process store — decisions survive a page refresh but NOT an API restart; responses report durability "memory" so this is never presented as durable persistence',
      { err: error instanceof Error ? error.message : String(error) },
    );
    return createInMemoryReviewDecisionStore();
  }
}

export function getReviewDecisionStore(): Promise<ReviewDecisionStore> {
  storePromise ??= resolveStore();
  return storePromise;
}

/**
 * Test seam: forget the resolved store so the next call re-resolves it.
 * Also clears the graph context, so an injected store never inherits a
 * driver from a previous resolution.
 */
export function resetReviewDecisionStore(override?: ReviewDecisionStore): void {
  storePromise = override === undefined ? undefined : Promise.resolve(override);
  graphContext = undefined;
}

export interface SubmitReviewDecisionRequest {
  targetObjectId: string;
  targetLabel?: string;
  targetAttribute?: string;
  decision: 'confirmed' | 'corrected' | 'rejected';
  previousValue: string;
  correctedValue?: string;
  reviewerId: string;
  rationale?: string;
  previousStatus?: 'pending' | 'confirmed' | 'corrected' | 'rejected';
}

/** Raised when the submitted body is not a well-formed request. Distinct from a decision that is well-formed but illegal. */
export class MalformedReviewRequestError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'MalformedReviewRequestError';
  }
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new MalformedReviewRequestError(`"${field}" is required and must be a non-empty string`);
  }
  return value;
}

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new MalformedReviewRequestError(`"${field}" must be a string when present`);
  }
  return value;
}

/** Parses and validates an untrusted request body into a decision input. Never trusts a field's presence or type. */
export function parseSubmitRequest(body: unknown, now: string): BuildReviewDecisionInput {
  if (typeof body !== 'object' || body === null) {
    throw new MalformedReviewRequestError('request body must be a JSON object');
  }
  const raw = body as Record<string, unknown>;

  const decision = raw.decision;
  if (decision !== 'confirmed' && decision !== 'corrected' && decision !== 'rejected') {
    throw new MalformedReviewRequestError(
      '"decision" must be "confirmed", "corrected", or "rejected"',
    );
  }

  const targetObjectId = requireString(raw.targetObjectId, 'targetObjectId');
  const reviewerId = requireString(raw.reviewerId, 'reviewerId');
  if (typeof raw.previousValue !== 'string') {
    throw new MalformedReviewRequestError('"previousValue" is required and must be a string');
  }

  const previousStatus = optionalString(raw.previousStatus, 'previousStatus');
  if (
    previousStatus !== undefined &&
    previousStatus !== 'pending' &&
    previousStatus !== 'confirmed' &&
    previousStatus !== 'corrected' &&
    previousStatus !== 'rejected'
  ) {
    throw new MalformedReviewRequestError(
      '"previousStatus" must be one of: pending, confirmed, corrected, rejected',
    );
  }

  const targetLabel = optionalString(raw.targetLabel, 'targetLabel');
  const targetAttribute = optionalString(raw.targetAttribute, 'targetAttribute');
  const correctedValue = optionalString(raw.correctedValue, 'correctedValue');
  const rationale = optionalString(raw.rationale, 'rationale');

  return {
    systemId: SYSTEM_ID,
    targetObjectId,
    targetLabel: targetLabel ?? targetObjectId,
    decision,
    previousValue: raw.previousValue,
    reviewerId,
    decidedAt: now,
    ...(targetAttribute === undefined ? {} : { targetAttribute }),
    ...(correctedValue === undefined ? {} : { correctedValue }),
    ...(rationale === undefined ? {} : { rationale }),
    ...(previousStatus === undefined ? {} : { previousStatus }),
    // Carries the reviewed element's own evidence onto the decision, so the
    // judgement stays traceable to what the reviewer saw. Copied, never
    // moved: the reviewed element keeps its evidence untouched.
    evidence: evidenceForTarget(targetObjectId),
  };
}

/** The evidence currently recorded for the reviewed element, where the queue knows it. */
function evidenceForTarget(targetObjectId: string): [] {
  // The seed review queue carries `metadata.provenance`, not `Evidence[]`
  // (Phase 1 predates the Evidence model), so there is genuinely nothing to
  // copy here yet. Returning empty rather than synthesising evidence that
  // was never captured. The decision's own provenance still records who
  // decided and when, and the reviewed element's provenance is untouched.
  void targetObjectId;
  return [];
}

/** How far a decision travelled: persisted, and then whether it reached the graph representation. */
export interface SubmitReviewDecisionResult extends RecordReviewDecisionResult {
  readonly propagation: {
    readonly outcome: 'propagated' | 'target-missing' | 'graph-unavailable' | 'failed';
    readonly reason: string;
  };
}

/**
 * P7-01 + P7-02: persist the decision, then propagate it into the canonical
 * graph representation.
 *
 * Propagation failure does NOT roll back the decision -- the human's
 * judgement is recorded either way, and losing it because a downstream write
 * failed would be worse. What it must never do is claim the correction
 * reached the graph when it did not, so the outcome is reported explicitly
 * and the reason travels back to the caller.
 */
export async function submitReviewDecision(
  body: unknown,
  now: string,
): Promise<SubmitReviewDecisionResult> {
  const input = parseSubmitRequest(body, now);
  const store = await getReviewDecisionStore();
  const recorded = await recordReviewDecision(store, input);

  if (graphContext === undefined) {
    return {
      ...recorded,
      propagation: {
        outcome: 'graph-unavailable',
        reason:
          'the knowledge graph is not reachable, so the decision was recorded but not applied to the graph representation',
      },
    };
  }

  try {
    const result = await propagateCorrectionToGraph(
      graphContext.driver,
      graphContext.database,
      recorded.decision,
      { at: now },
    );
    return { ...recorded, propagation: { outcome: result.outcome, reason: result.reason } };
  } catch (error) {
    logger.error('review decision persisted but could not be applied to the graph', {
      decisionId: recorded.decision.identity.id,
      err: error instanceof Error ? error.message : String(error),
    });
    return {
      ...recorded,
      propagation: {
        outcome: 'failed',
        reason: `the decision was recorded, but applying it to the graph failed: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

export async function listReviewDecisions(
  targetObjectId?: string,
): Promise<readonly ReviewDecisionObject[]> {
  const store = await getReviewDecisionStore();
  return targetObjectId === undefined ? store.listAll() : store.listForTarget(targetObjectId);
}

/**
 * P7-03 -- the audit trail for one reviewed element.
 *
 * Assembled from the decisions already persisted (no audit store of its own).
 * The current canonical value comes from the review queue with decisions
 * applied -- the same projection `/api/review-items` serves, so the audit
 * trail and the queue can never disagree about what the value is now. It is
 * left undefined when the element is not in the queue, rather than defaulted
 * to something plausible.
 */
export async function getReviewAuditTrail(targetObjectId: string): Promise<ReviewAuditTrail> {
  const store = await getReviewDecisionStore();
  const decisions = await store.listForTarget(targetObjectId);

  const item = reviewItems.find((candidate) => targetIdForReviewItem(candidate) === targetObjectId);
  const currentValue =
    item === undefined
      ? undefined
      : applyDecisionsToReviewItems([item], decisions)[0]?.currentValue;

  return buildReviewAuditTrail(targetObjectId, decisions, {
    ...(item === undefined ? {} : { targetLabel: item.elementName }),
    ...(currentValue === undefined ? {} : { currentValue }),
  });
}

/**
 * FR-REV-01 support -- the relationships needed to compute element leverage.
 *
 * Returns an empty list (never throws, never fabricates) when the graph is
 * unreachable, so the ranking degrades to inverse-confidence-only and reports
 * that honestly rather than failing the queue.
 */
export async function getGraphRelationships(): Promise<readonly RelationshipEndpoints[]> {
  await getReviewDecisionStore(); // resolves graphContext as a side effect
  if (graphContext === undefined) return [];
  try {
    const graph = await getFullGraph(graphContext.driver, graphContext.database);
    return graph.relationships;
  } catch (error) {
    logger.warn('element leverage unavailable — could not read graph relationships', {
      err: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

/** FR-REV-04 -- review quality metrics over the recorded decision log. */
export async function getReviewMetrics(options: {
  from?: string;
  to?: string;
}): Promise<ReviewMetrics> {
  const store = await getReviewDecisionStore();
  return computeReviewMetrics(await store.listAll(), options);
}

export interface OkfSyncState {
  /** Whether this API can currently render an OKF document at all. */
  readonly okfGenerationAvailable: boolean;
  /** Why, in one line — stated rather than implied. */
  readonly reason: string;
  /** Every decision recorded but not yet reflected in any rendered OKF document. */
  readonly unreflectedDecisionIds: readonly string[];
  /** The reviewed elements those decisions changed. */
  readonly correctedObjectIds: readonly string[];
  /** Which of the eleven OKF artifact types those elements feed, where the kind is known. */
  readonly affectedArtifacts: readonly string[];
}

/**
 * P7-05 -- makes OKF regeneration state VISIBLE rather than pretending
 * documentation refreshes itself.
 *
 * Phoenix has no orchestrator, so regeneration is an explicit operation
 * (`regenerateOkfDocument`, `@phoenix-ai/okf-renderers`). This endpoint
 * reports what is waiting for it.
 *
 * It also states a real architectural limitation plainly: this API serves the
 * Phase 1 contract shapes from `data/seed.ts`, NOT a
 * `CanonicalKnowledgeBundle`, so it cannot render an OKF document itself. The
 * artifact mapping below therefore reports which artifact types a correction
 * WOULD affect, based on the reviewed element's `elementType`, without
 * claiming an OKF document exists to be refreshed.
 */
export async function getOkfSyncState(): Promise<OkfSyncState> {
  const store = await getReviewDecisionStore();
  const decisions = await store.listAll();

  const correctedObjectIds = [
    ...new Set(decisions.map((d) => String(d.attributes.targetObjectId))),
  ];

  // `elementType` on the queue item is the only kind signal this API has —
  // the seed carries Phase 1 type names ('Container', 'Aggregate', 'Entity'),
  // not canonical `kind`s. Mapped conservatively; an unrecognised type
  // contributes nothing rather than a guess.
  const artifacts = new Set<string>();
  for (const objectId of correctedObjectIds) {
    const item = reviewItems.find((candidate) => targetIdForReviewItem(candidate) === objectId);
    const kind = CANONICAL_KIND_BY_ELEMENT_TYPE[item?.elementType ?? ''];
    if (kind === undefined) continue;
    for (const artifact of artifactsForObjectKind(kind)) artifacts.add(artifact);
  }

  return {
    okfGenerationAvailable: false,
    reason:
      'This API serves the Phase 1 contract shapes, not a canonical knowledge bundle, so it cannot render an OKF document. Regeneration is an explicit operation over a bundle (@phoenix-ai/okf-renderers regenerateOkfDocument); the decisions below are the ones awaiting it.',
    unreflectedDecisionIds: decisions.map((d) => d.identity.id),
    correctedObjectIds,
    affectedArtifacts: [...artifacts],
  };
}

/** Phase 1 `ReviewItem.elementType` -> canonical object `kind`, for the artifact mapping only. Deliberately partial: a type with no clear canonical counterpart is left out rather than guessed. */
const CANONICAL_KIND_BY_ELEMENT_TYPE: Readonly<Record<string, string>> = {
  Container: 'architecture.container',
  Component: 'architecture.component',
  Aggregate: 'domain.aggregate',
  Entity: 'domain.entity',
  Domain: 'domain.domain',
  Persona: 'journey.persona',
  Journey: 'journey.journey',
};

export { targetIdForReviewItem };
