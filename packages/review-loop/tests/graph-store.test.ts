import { describe, expect, it } from 'vitest';
import { buildReviewDecision, type BuildReviewDecisionInput } from '@phoenix-ai/knowledge-graph';
import {
  buildReviewDecisionWriteOperations,
  buildReviewOfRelationship,
  reviewDecisionFromNodeProperties,
} from '../src/graph-store.js';

/**
 * The LIVE Neo4j path is exercised by `graph-store.integration.test.ts`,
 * which skips when no instance is reachable. These tests cover everything
 * that can be verified without a database: what Cypher would be written, and
 * whether a decision survives the flatten/rehydrate round trip.
 */

const AT = '2026-09-27T10:00:00.000Z';

function decisionInput(
  overrides: Partial<BuildReviewDecisionInput> = {},
): BuildReviewDecisionInput {
  return {
    systemId: 'aurora-commerce',
    targetObjectId: 'ctr-payments',
    targetLabel: 'Payments Gateway Adapter',
    decision: 'corrected',
    previousValue: 'Node.js/Express (from source code)',
    correctedValue: 'Java / Spring Boot',
    reviewerId: 'reviewer-a',
    rationale: 'The 2024 architecture doc is stale; the service was rewritten.',
    decidedAt: AT,
    ...overrides,
  };
}

describe('buildReviewDecisionWriteOperations (P7-01) — what reaches Neo4j', () => {
  it('writes the decision as a :ReviewDecision node, MERGE-keyed on its id so a retry cannot duplicate it', () => {
    const ops = buildReviewDecisionWriteOperations(buildReviewDecision(decisionInput()));
    expect(ops.nodeOperations).toHaveLength(1);
    expect(ops.nodeOperations[0]?.cypher).toBe(
      'MERGE (n:ReviewDecision {id: $id}) SET n += $properties RETURN n',
    );
  });

  it('links the decision to the reviewed element with REVIEW_OF, never copying the element', () => {
    const ops = buildReviewDecisionWriteOperations(buildReviewDecision(decisionInput()));
    expect(ops.relationshipOperations).toHaveLength(1);
    const op = ops.relationshipOperations[0];
    expect(op?.cypher).toContain('MERGE (source)-[r:REVIEW_OF {id: $relationshipId}]->(target)');
    expect(op?.params.targetId).toBe('ctr-payments');
  });

  it('carries the reviewed value and the human value into node properties, losing neither', () => {
    const ops = buildReviewDecisionWriteOperations(buildReviewDecision(decisionInput()));
    const properties = ops.nodeOperations[0]?.params.properties as Record<string, unknown>;
    expect(properties.attr_previousValue).toBe('Node.js/Express (from source code)');
    expect(properties.attr_correctedValue).toBe('Java / Spring Boot');
    expect(properties.attr_targetObjectId).toBe('ctr-payments');
    expect(properties.lifecycleStatus).toBe('corrected');
  });

  it('gives the REVIEW_OF edge a deterministic id derived from the decision', () => {
    const decision = buildReviewDecision(decisionInput());
    expect(buildReviewOfRelationship(decision).id).toBe(`${decision.identity.id}:reviewOf`);
  });

  it('records which attribute was reviewed on the edge, when the decision was attribute-scoped', () => {
    const scoped = buildReviewDecision(decisionInput({ targetAttribute: 'technology' }));
    expect(buildReviewOfRelationship(scoped).properties).toEqual({ attribute: 'technology' });
    expect(buildReviewOfRelationship(buildReviewDecision(decisionInput())).properties).toEqual({});
  });
});

describe('reviewDecisionFromNodeProperties (P7-01) — reading a decision back out', () => {
  it('round-trips a decision through the flattened node properties without losing it', () => {
    const original = buildReviewDecision(decisionInput());
    const ops = buildReviewDecisionWriteOperations(original);
    const properties = ops.nodeOperations[0]?.params.properties as Record<string, unknown>;

    const restored = reviewDecisionFromNodeProperties({ ...properties, id: original.identity.id });

    expect(restored?.identity.id).toBe(original.identity.id);
    expect(restored?.attributes.targetObjectId).toBe('ctr-payments');
    expect(restored?.attributes.decision).toBe('corrected');
    expect(restored?.attributes.correctedValue).toBe('Java / Spring Boot');
    expect(restored?.attributes.previousValue).toBe(original.attributes.previousValue);
    expect(restored?.attributes.reviewerId).toBe('reviewer-a');
    expect(restored?.lifecycle?.status).toBe('corrected');
    expect(restored?.lifecycle?.previousStatus).toBe('pending');
  });

  it('restores the human-review provenance, so a corrected value stays distinguishable from an extracted one', () => {
    const original = buildReviewDecision(decisionInput());
    const properties = buildReviewDecisionWriteOperations(original).nodeOperations[0]?.params
      .properties as Record<string, unknown>;
    const restored = reviewDecisionFromNodeProperties({ ...properties, id: original.identity.id });
    expect(restored?.metadata.provenance[0]?.derivedBy).toBe('human-review');
  });

  it('returns undefined for a node that is not a usable review decision, rather than inventing one', () => {
    expect(reviewDecisionFromNodeProperties({})).toBeUndefined();
    expect(reviewDecisionFromNodeProperties({ id: 'x' })).toBeUndefined();
    expect(
      reviewDecisionFromNodeProperties({
        id: 'x',
        attr_targetObjectId: 'y',
        attr_decision: 'nope',
      }),
    ).toBeUndefined();
  });
});
