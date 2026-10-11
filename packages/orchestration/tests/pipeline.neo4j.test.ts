import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Each test runs real git, the whole pipeline, and live Neo4j writes and
// read-backs (~5-10 s each). Without a budget every test hit vitest's 5 s
// default the first time this suite ran against a real database -- found by
// the P8 regression run; the assertions themselves all held.
vi.setConfig({ testTimeout: 120_000 });
import neo4j, { type Driver } from 'neo4j-driver';
import { Neo4jContainer, type StartedNeo4jContainer } from '@testcontainers/neo4j';
import { getFullGraph, getNodeById } from '@phoenix-ai/graph-persistence';
import {
  createGraphReviewDecisionStore,
  propagateCorrectionToGraph,
  recordReviewDecision,
} from '@phoenix-ai/review-loop';
import { runPipeline, runReviewCycle, type GraphTarget } from '../src/index.js';
import { createFixtureRepo, type FixtureRepo } from './fixture-repo.js';

/**
 * P8 -- the graph half of the chain against a REAL Neo4j: persisted graph,
 * durable review decision, live correction propagation, and the review
 * cycle's updated graph, each read back and verified.
 *
 * Needs a container runtime (as `@phoenix-ai/graph-persistence`'s own
 * integration suites do); CI provides one. Where none is available the tests
 * are SKIPPED with the reason, never passed against a fake database.
 * `PHOENIX_NEO4J_INTEGRATION=skip` opts out explicitly, matching
 * `review-loop`'s integration suite.
 */

const T0 = '2026-10-06T10:00:00.000Z';
const T1 = '2026-10-06T11:00:00.000Z';
const T2 = '2026-10-06T12:00:00.000Z';
const DATABASE = 'neo4j';

let container: StartedNeo4jContainer | undefined;
let driver: Driver | undefined;
let target: GraphTarget | undefined;
let unavailable = 'not started';
let repo: FixtureRepo;

beforeAll(async () => {
  repo = createFixtureRepo();
  if (process.env.PHOENIX_NEO4J_INTEGRATION === 'skip') {
    unavailable = 'PHOENIX_NEO4J_INTEGRATION=skip';
    return;
  }
  try {
    container = await new Neo4jContainer('neo4j:5-community').start();
    driver = neo4j.driver(
      container.getBoltUri(),
      neo4j.auth.basic(container.getUsername(), container.getPassword()),
    );
    target = { driver, database: DATABASE };
  } catch (error) {
    unavailable = `no container runtime: ${error instanceof Error ? error.message : String(error)}`;
  }
}, 240_000);

afterAll(async () => {
  await driver?.close();
  await container?.stop();
  repo?.dispose();
});

describe('live Neo4j — persisted, corrected, and verified', () => {
  it('persists the pipeline output and verifies every element read back', async ({ skip }) => {
    if (target === undefined) return skip(unavailable);
    const run = await runPipeline({
      systemId: 'order-service',
      generatedAt: T0,
      source: { connector: repo.connector, descriptor: repo.descriptor },
      graph: target,
    });
    expect(run.stages.find((s) => s.stage === 'graph-persistence')?.status).toBe('completed');

    const graph = await getFullGraph(target.driver, target.database);
    expect(graph.nodes.length).toBe(run.bundle.objects.length);
    expect(graph.relationships.length).toBe(run.bundle.relationships.length);
  });

  it('re-running unchanged input is idempotent: no duplicate nodes or edges', async ({ skip }) => {
    if (target === undefined) return skip(unavailable);
    const before = await getFullGraph(target.driver, target.database);
    await runPipeline({
      systemId: 'order-service',
      generatedAt: T0,
      source: { connector: repo.connector, descriptor: repo.descriptor },
      graph: target,
    });
    const after = await getFullGraph(target.driver, target.database);
    expect(after.nodes.length).toBe(before.nodes.length);
    expect(after.relationships.length).toBe(before.relationships.length);
  });

  it('a durable decision, propagated live and through the review cycle, lands in the verified graph', async ({
    skip,
  }) => {
    if (target === undefined) return skip(unavailable);
    const run = await runPipeline({
      systemId: 'order-service',
      generatedAt: T0,
      source: { connector: repo.connector, descriptor: repo.descriptor },
      graph: target,
    });
    const order = run.bundle.objects.find((o) => o.label === 'Order');
    if (order === undefined) throw new Error('Order missing');

    const store = createGraphReviewDecisionStore(target.driver, target.database);
    const { decision } = await recordReviewDecision(store, {
      systemId: 'order-service',
      targetObjectId: order.identity.id,
      targetLabel: 'Order',
      targetAttribute: 'description',
      decision: 'corrected',
      previousValue: String(order.attributes.description),
      correctedValue: 'Maps to table "sales_orders".',
      reviewerId: 'architect-1',
      decidedAt: T1,
    });

    // The API's live path (P7-02), guarded against stale values (P8).
    const live = await propagateCorrectionToGraph(target.driver, target.database, decision, {
      at: T1,
    });
    expect(live.outcome).toBe('propagated');

    // The decision is durable: a NEW store instance reads it back.
    const reread = await createGraphReviewDecisionStore(
      target.driver,
      target.database,
    ).listForTarget(order.identity.id);
    expect(reread.map((d) => d.identity.id)).toEqual([decision.identity.id]);

    // The review cycle's updated graph is persisted and verified -- including
    // the attribute VALUE, which the consistency check now compares (P8).
    const cycle = await runReviewCycle(run, reread, { at: T2, graph: target });
    expect(cycle.stages.find((s) => s.stage === 'graph-update')?.status).toBe('completed');

    const node = await getNodeById(target.driver, target.database, order.identity.id);
    expect(node?.properties.attr_description).toBe('Maps to table "sales_orders".');
    expect(node?.properties.attr_humanSupersededExtractedValue).toBe(order.attributes.description);
  });
});
