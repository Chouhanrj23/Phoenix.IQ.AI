import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import neo4j, { type Driver } from 'neo4j-driver';
import { buildReviewDecision } from '@phoenix-ai/knowledge-graph';
import { createGraphReviewDecisionStore, propagateCorrectionToGraph } from '../src/graph-store.js';
import { CORRECTION_ATTRIBUTES } from '../src/propagation.js';

/**
 * P7-01 -- the REAL round trip against a live Neo4j: save a decision, read it
 * back, prove it survives a fresh store instance (the server-side equivalent
 * of a browser refresh).
 *
 * SKIPS when no instance is reachable, exactly like the Phase 4 suites that
 * need Docker. This is deliberate and disclosed: the environment this was
 * written in had no reachable Neo4j, so the live path is implemented against
 * already-tested Phase 4 primitives but has NOT been observed running. Run
 * `docker compose up neo4j` and re-run this suite to verify it for real.
 */

const URI = process.env.NEO4J_URI ?? 'bolt://localhost:7687';
const USER = process.env.NEO4J_USER ?? 'neo4j';
const PASSWORD = process.env.NEO4J_PASSWORD ?? 'phoenix-demo-local-only';
const DATABASE = process.env.NEO4J_DATABASE ?? 'neo4j';

const AT = '2026-09-27T10:00:00.000Z';
const TARGET = 'ctr-payments-p7-integration';

let driver: Driver | undefined;
let reachable = false;

beforeAll(async () => {
  try {
    const candidate = neo4j.driver(URI, neo4j.auth.basic(USER, PASSWORD));
    const session = candidate.session({ database: DATABASE });
    await session.run('RETURN 1');
    await session.close();
    driver = candidate;
    reachable = true;
  } catch {
    reachable = false;
  }
}, 30_000);

afterAll(async () => {
  if (driver && reachable) {
    const session = driver.session({ database: DATABASE });
    await session.run('MATCH (n:ReviewDecision {attr_targetObjectId: $target}) DETACH DELETE n', {
      target: TARGET,
    });
    await session.run('MATCH (n:Container {id: $id}) DETACH DELETE n', { id: TARGET });
    await session.run('MATCH (n:Container {id: $id}) DETACH DELETE n', { id: UNRELATED });
    await session.close();
  }
  await driver?.close();
});

const UNRELATED = 'ctr-unrelated-p7-integration';

describe.runIf(process.env.PHOENIX_NEO4J_INTEGRATION !== 'skip')(
  'createGraphReviewDecisionStore (P7-01) — live Neo4j round trip',
  () => {
    it('persists a decision and reads it back from a NEW store instance (survives a reload)', async ({
      skip,
    }) => {
      if (!reachable || !driver) return skip('no reachable Neo4j instance');

      const writer = createGraphReviewDecisionStore(driver, DATABASE);
      const decision = buildReviewDecision({
        systemId: 'aurora-commerce',
        targetObjectId: TARGET,
        targetLabel: 'Payments Gateway Adapter',
        decision: 'corrected',
        previousValue: 'Node.js/Express',
        correctedValue: 'Java / Spring Boot',
        reviewerId: 'reviewer-a',
        decidedAt: AT,
      });

      await writer.save(decision);

      // A separate store instance, as a restarted API process would have.
      const reader = createGraphReviewDecisionStore(driver, DATABASE);
      const found = await reader.listForTarget(TARGET);

      expect(found).toHaveLength(1);
      expect(found[0]?.attributes.correctedValue).toBe('Java / Spring Boot');
      expect(found[0]?.attributes.previousValue).toBe('Node.js/Express');
      expect(found[0]?.metadata.provenance[0]?.derivedBy).toBe('human-review');
    }, 30_000);

    it('is idempotent — saving the same decision twice leaves exactly one node', async ({
      skip,
    }) => {
      if (!reachable || !driver) return skip('no reachable Neo4j instance');

      const store = createGraphReviewDecisionStore(driver, DATABASE);
      const decision = buildReviewDecision({
        systemId: 'aurora-commerce',
        targetObjectId: TARGET,
        targetLabel: 'Payments Gateway Adapter',
        decision: 'confirmed',
        previousValue: 'Node.js/Express',
        reviewerId: 'reviewer-a',
        decidedAt: AT,
      });

      await store.save(decision);
      await store.save(decision);

      const found = await store.listForTarget(TARGET);
      expect(found.filter((d) => d.identity.id === decision.identity.id)).toHaveLength(1);
    }, 30_000);

    it('P7-02: applies a correction to the EXISTING node, preserving its identity and leaving unrelated nodes untouched', async ({
      skip,
    }) => {
      if (!reachable || !driver) return skip('no reachable Neo4j instance');
      const session = driver.session({ database: DATABASE });

      // Two real extracted nodes, written as the pipeline writes them (P8:
      // keyed on id AND systemId): one to be corrected, one that must not move.
      await session.run(
        'MERGE (n:Container {id: $id, systemId: "aurora-commerce"}) SET n += {kind: "architecture.container", label: "Target", attr_technology: "Node.js/Express", provenanceJson: $prov}',
        { id: TARGET, prov: JSON.stringify([{ sourceId: 'repo://x', sourceType: 'source-code' }]) },
      );
      await session.run(
        'MERGE (n:Container {id: $id, systemId: "aurora-commerce"}) SET n += {kind: "architecture.container", label: "Unrelated", attr_technology: "Python"}',
        { id: UNRELATED },
      );
      // P8 (FR-ORC-04): another tenant's node with the SAME id must never be corrected.
      await session.run(
        'MERGE (n:Container {id: $id, systemId: "other-tenant"}) SET n += {kind: "architecture.container", label: "Target", attr_technology: "Node.js/Express"}',
        { id: TARGET },
      );
      const beforeCount = (await session.run('MATCH (n) RETURN count(n) AS c')).records[0]?.get(
        'c',
      );

      const decision = buildReviewDecision({
        systemId: 'aurora-commerce',
        targetObjectId: TARGET,
        targetLabel: 'Target',
        targetAttribute: 'technology',
        decision: 'corrected',
        previousValue: 'Node.js/Express',
        correctedValue: 'Java / Spring Boot',
        reviewerId: 'reviewer-a',
        decidedAt: AT,
      });
      await createGraphReviewDecisionStore(driver, DATABASE, { systemId: 'aurora-commerce' }).save(
        decision,
      );

      const result = await propagateCorrectionToGraph(driver, DATABASE, decision, { at: AT });
      expect(result.outcome).toBe('propagated');

      // The corrected value is queryable, and the extracted value is retained.
      const corrected = await session.run(
        'MATCH (n:Container {id: $id, systemId: "aurora-commerce"}) RETURN n',
        { id: TARGET },
      );
      const properties = corrected.records[0]?.get('n').properties as Record<string, unknown>;
      expect(properties.attr_technology).toBe('Java / Spring Boot');
      expect(properties[CORRECTION_ATTRIBUTES.supersededValue]).toBe('Node.js/Express');
      expect(properties[CORRECTION_ATTRIBUTES.reviewStatus]).toBe('corrected');
      expect(properties[CORRECTION_ATTRIBUTES.decisionId]).toBe(decision.identity.id);
      // Identity and provenance survive.
      expect(properties.id).toBe(TARGET);
      expect(String(properties.provenanceJson)).toContain('repo://x');

      // Exactly ONE node of this tenant still carries that id -- no duplicate was created.
      const duplicates = await session.run(
        'MATCH (n {id: $id, systemId: "aurora-commerce"}) RETURN count(n) AS c',
        { id: TARGET },
      );
      expect(duplicates.records[0]?.get('c').toString()).toBe('1');

      // The other tenant's same-id node is untouched.
      const other = await session.run('MATCH (n {id: $id, systemId: "other-tenant"}) RETURN n', {
        id: TARGET,
      });
      const otherProps = other.records[0]?.get('n').properties as Record<string, unknown>;
      expect(otherProps.attr_technology).toBe('Node.js/Express');
      expect(otherProps[CORRECTION_ATTRIBUTES.reviewStatus]).toBeUndefined();

      // The decision is linked to the element it corrected.
      const linked = await session.run(
        'MATCH (:ReviewDecision {id: $decisionId})-[:REVIEW_OF]->(t {id: $target}) RETURN count(*) AS c',
        { decisionId: decision.identity.id, target: TARGET },
      );
      expect(linked.records[0]?.get('c').toString()).toBe('1');

      // Unrelated data is exactly as it was, and nothing new was invented.
      const unrelated = await session.run(
        'MATCH (n:Container {id: $id, systemId: "aurora-commerce"}) RETURN n',
        { id: UNRELATED },
      );
      const unrelatedProps = unrelated.records[0]?.get('n').properties as Record<string, unknown>;
      expect(unrelatedProps.attr_technology).toBe('Python');
      expect(unrelatedProps[CORRECTION_ATTRIBUTES.reviewStatus]).toBeUndefined();

      const afterCount = (await session.run('MATCH (n) RETURN count(n) AS c')).records[0]?.get('c');
      // Only the decision node was added by this test's propagation step.
      expect(Number(afterCount) - Number(beforeCount)).toBeLessThanOrEqual(1);

      await session.close();
    }, 45_000);

    it('P7-02: reports target-missing rather than creating a node for an element that is not in the graph', async ({
      skip,
    }) => {
      if (!reachable || !driver) return skip('no reachable Neo4j instance');

      const decision = buildReviewDecision({
        systemId: 'aurora-commerce',
        targetObjectId: 'ctr-definitely-not-in-the-graph',
        targetLabel: 'Ghost',
        decision: 'corrected',
        previousValue: 'a',
        correctedValue: 'b',
        reviewerId: 'reviewer-a',
        decidedAt: AT,
      });

      const result = await propagateCorrectionToGraph(driver, DATABASE, decision, { at: AT });
      expect(result.outcome).toBe('target-missing');

      const session = driver.session({ database: DATABASE });
      const created = await session.run('MATCH (n {id: $id}) RETURN count(n) AS c', {
        id: 'ctr-definitely-not-in-the-graph',
      });
      expect(created.records[0]?.get('c').toString()).toBe('0');
      await session.close();
    }, 30_000);
  },
);
