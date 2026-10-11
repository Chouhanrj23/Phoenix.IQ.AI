import { describe, expect, it } from 'vitest';
import type { Driver } from 'neo4j-driver';
import {
  buildReviewDecision,
  type BuildReviewDecisionInput,
  type ReviewDecisionObject,
} from '@phoenix-ai/knowledge-graph';
import { Neo4jUnavailableError } from '@phoenix-ai/graph-persistence';
import {
  buildReviewDecisionWriteOperations,
  createGraphReviewDecisionStore,
  graphAttributeDisplayValue,
  propagateCorrectionToGraph,
  ReviewDecisionCorruptError,
  reviewDecisionFromNodeProperties,
} from '../src/graph-store.js';
import { createInMemoryReviewDecisionStore, sortDecisions } from '../src/store.js';
import type { ReviewDecisionStore } from '../src/store.js';
import { recordReviewDecision, reviewStatusFor } from '../src/service.js';
import { computeReviewMetrics, InvalidMetricsWindowError } from '../src/metrics.js';

/**
 * P8 -- final architecture hardening of the review loop. Each block pins one
 * verified defect so it cannot return. Graph paths use a fake driver: the
 * defects are in Phoenix's own logic around the driver, and a fake is the
 * only way to reproduce "connection dropped mid-read" deterministically.
 */

const AT = '2026-10-06T10:00:00.000Z';

function input(overrides: Partial<BuildReviewDecisionInput> = {}): BuildReviewDecisionInput {
  return {
    systemId: 'aurora-commerce',
    targetObjectId: 'ctr-payments',
    targetLabel: 'Payments Gateway Adapter',
    targetAttribute: 'technology',
    decision: 'corrected',
    previousValue: 'Node.js/Express',
    correctedValue: 'Java / Spring Boot',
    reviewerId: 'reviewer-a',
    decidedAt: AT,
    ...overrides,
  };
}

function nodePropertiesOf(decision: ReviewDecisionObject): Record<string, unknown> {
  const properties = buildReviewDecisionWriteOperations(decision).nodeOperations[0]?.params
    .properties as Record<string, unknown>;
  return { ...properties, id: decision.identity.id };
}

interface FakeDriverOptions {
  /** Node properties every read query returns, one record per entry. */
  readonly readNodes?: readonly Record<string, unknown>[];
  /** Labels on returned nodes. */
  readonly label?: string;
  /** Rejects every read with this error (after the connectivity probe passes). */
  readonly readFailure?: Error;
}

/** A minimal driver: the connectivity probe passes; reads return `readNodes`; writes are recorded. */
function fakeDriver(options: FakeDriverOptions = {}): { driver: Driver; writes: string[] } {
  const writes: string[] = [];
  const records = (options.readNodes ?? []).map((properties) => ({
    get: () => ({ labels: [options.label ?? 'ReviewDecision'], properties }),
  }));
  const session = {
    run: () => Promise.resolve({ records: [{ get: () => true }] }),
    executeRead: (work: (tx: unknown) => unknown) =>
      options.readFailure !== undefined
        ? Promise.reject(options.readFailure)
        : Promise.resolve(work({ run: () => Promise.resolve({ records }) })),
    executeWrite: (work: (tx: unknown) => unknown) =>
      Promise.resolve(
        work({
          run: (cypher: string) => {
            writes.push(cypher);
            return Promise.resolve({ records: [{}] });
          },
        }),
      ),
    close: () => Promise.resolve(),
  };
  return { driver: { session: () => session } as unknown as Driver, writes };
}

describe('graph review store — every decision kind round-trips (P8)', () => {
  it('reads back a REJECTED decision instead of silently dropping it', () => {
    const rejected = buildReviewDecision(
      input({ decision: 'rejected', correctedValue: undefined }),
    );
    const restored = reviewDecisionFromNodeProperties(nodePropertiesOf(rejected));
    expect(restored?.attributes.decision).toBe('rejected');
    expect(restored?.identity.id).toBe(rejected.identity.id);
  });

  it('a rejected decision persisted in the graph appears in listForTarget, and so in the status', async () => {
    const rejected = buildReviewDecision(
      input({ decision: 'rejected', correctedValue: undefined }),
    );
    const { driver } = fakeDriver({ readNodes: [nodePropertiesOf(rejected)] });
    const store = createGraphReviewDecisionStore(driver, 'neo4j');
    const decisions = await store.listForTarget('ctr-payments');
    expect(decisions.map((d) => d.identity.id)).toEqual([rejected.identity.id]);
    expect(reviewStatusFor(decisions, 'ctr-payments')).toBe('rejected');
  });
});

describe('graph review store — corrupt stored data is never silently emptied (P8)', () => {
  it('an ABSENT evidenceJson still means "no evidence recorded"', () => {
    const properties = nodePropertiesOf(buildReviewDecision(input()));
    delete properties.evidenceJson;
    expect(reviewDecisionFromNodeProperties(properties)?.evidence).toEqual([]);
  });

  it('a CORRUPT evidenceJson throws instead of reading back as no evidence', () => {
    const properties = { ...nodePropertiesOf(buildReviewDecision(input())), evidenceJson: '[{' };
    expect(() => reviewDecisionFromNodeProperties(properties)).toThrow(ReviewDecisionCorruptError);
  });

  it('a provenanceJson that is not an array throws', () => {
    const properties = {
      ...nodePropertiesOf(buildReviewDecision(input())),
      provenanceJson: '{"sourceId":"x"}',
    };
    expect(() => reviewDecisionFromNodeProperties(properties)).toThrow(/not a JSON array/);
  });

  it('an unreadable :ReviewDecision node fails the read loudly rather than vanishing', async () => {
    const { driver } = fakeDriver({ readNodes: [{ id: 'review-decision:broken' }] });
    const store = createGraphReviewDecisionStore(driver, 'neo4j');
    await expect(store.listAll()).rejects.toThrow(ReviewDecisionCorruptError);
  });
});

describe('graph review store — connection lost mid-read (P8)', () => {
  it('surfaces as Neo4jUnavailableError, which the API maps to 503', async () => {
    const lost = Object.assign(new Error('connection reset'), { code: 'SessionExpired' });
    const { driver } = fakeDriver({ readFailure: lost });
    const store = createGraphReviewDecisionStore(driver, 'neo4j');
    await expect(store.listAll()).rejects.toBeInstanceOf(Neo4jUnavailableError);
  });
});

describe('propagateCorrectionToGraph — stale corrections never overwrite the graph (P8)', () => {
  it('returns "conflict" and writes NOTHING when the node no longer holds the value the reviewer corrected', async () => {
    const { driver, writes } = fakeDriver({
      label: 'Container',
      readNodes: [{ id: 'ctr-payments', attr_technology: 'Go (re-extracted)' }],
    });
    const decision = buildReviewDecision(input());
    const result = await propagateCorrectionToGraph(driver, 'neo4j', decision, { at: AT });

    expect(result.outcome).toBe('conflict');
    expect(result.reason).toContain('Go (re-extracted)');
    expect(result.reason).toContain('Node.js/Express');
    expect(writes).toEqual([]);
  });

  it('still propagates when the node holds exactly the value the reviewer saw', async () => {
    const { driver, writes } = fakeDriver({
      label: 'Container',
      readNodes: [{ id: 'ctr-payments', attr_technology: 'Node.js/Express' }],
    });
    const result = await propagateCorrectionToGraph(driver, 'neo4j', buildReviewDecision(input()), {
      at: AT,
    });
    expect(result.outcome).toBe('propagated');
    expect(
      writes.some((cypher) =>
        cypher.startsWith('MATCH (n {id: $id, systemId: $systemId}) SET n += $properties'),
      ),
    ).toBe(true);
  });

  it('a confirmation is never blocked by the stale check — it changes no value', async () => {
    const { driver } = fakeDriver({
      label: 'Container',
      readNodes: [{ id: 'ctr-payments', attr_technology: 'something else' }],
    });
    const confirm = buildReviewDecision(
      input({ decision: 'confirmed', correctedValue: undefined }),
    );
    const result = await propagateCorrectionToGraph(driver, 'neo4j', confirm, { at: AT });
    expect(result.outcome).toBe('propagated');
  });

  it('renders graph values the way the canonical path renders them', () => {
    expect(graphAttributeDisplayValue({ attr_x: 'Java' }, 'x')).toBe('Java');
    expect(graphAttributeDisplayValue({ attr_x: 5 }, 'x')).toBe('5');
    expect(graphAttributeDisplayValue({ attr_x: ['a', 'b'] }, 'x')).toBe('["a","b"]');
    expect(graphAttributeDisplayValue({ attr_x_json: '{"k":1}' }, 'x')).toBe('{"k":1}');
    expect(graphAttributeDisplayValue({}, 'x')).toBe('');
  });
});

describe('sortDecisions — same-millisecond decisions follow their supersession chain (P8)', () => {
  /** Two decisions at one instant, where the SUCCESSOR has the lexicographically SMALLER id. */
  function sameInstantPair(): { first: ReviewDecisionObject; second: ReviewDecisionObject } {
    const a = buildReviewDecision(input({ decision: 'confirmed', correctedValue: undefined }));
    const b = buildReviewDecision(input({ correctedValue: 'Kotlin' }));
    // Make whichever id sorts LATER the predecessor, so id order alone gets it wrong.
    const [predecessor, successorSeed] =
      a.identity.id.localeCompare(b.identity.id) > 0 ? [a, b] : [b, a];
    const successor: ReviewDecisionObject = {
      ...successorSeed,
      attributes: { ...successorSeed.attributes, supersedesDecisionId: predecessor.identity.id },
    };
    return { first: predecessor, second: successor };
  }

  it('puts a decision after the one it supersedes, even when id order says otherwise', () => {
    const { first, second } = sameInstantPair();
    expect(second.identity.id.localeCompare(first.identity.id)).toBeLessThan(0);
    for (const input of [
      [first, second],
      [second, first],
    ]) {
      expect(sortDecisions(input).map((d) => d.identity.id)).toEqual([
        first.identity.id,
        second.identity.id,
      ]);
    }
  });

  it('treats equal instants written at different precisions as the same instant', () => {
    const early = buildReviewDecision(input({ decidedAt: '2026-10-06T10:00:00Z' }));
    const later = buildReviewDecision(
      input({ decidedAt: '2026-10-06T10:00:00.001Z', correctedValue: 'Kotlin' }),
    );
    expect(sortDecisions([later, early]).map((d) => d.identity.id)).toEqual([
      early.identity.id,
      later.identity.id,
    ]);
  });

  it('never drops a decision, even with a malformed supersession cycle', () => {
    const a = buildReviewDecision(input({ decision: 'confirmed', correctedValue: undefined }));
    const b = buildReviewDecision(input({ correctedValue: 'Kotlin' }));
    const cyclic = [
      { ...a, attributes: { ...a.attributes, supersedesDecisionId: b.identity.id } },
      { ...b, attributes: { ...b.attributes, supersedesDecisionId: a.identity.id } },
    ];
    expect(sortDecisions(cyclic)).toHaveLength(2);
  });
});

describe('recordReviewDecision — concurrent submissions for one element cannot fork the chain (P8)', () => {
  /** A memory store whose reads are slow, widening the read-then-write window. */
  function slowReadStore(): ReviewDecisionStore {
    const inner = createInMemoryReviewDecisionStore();
    return {
      durability: inner.durability,
      save: (decision) => inner.save(decision),
      listAll: () => inner.listAll(),
      listForTarget: async (targetObjectId) => {
        const result = await inner.listForTarget(targetObjectId);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return result;
      },
    };
  }

  it('the second of two simultaneous decisions supersedes the first', async () => {
    const store = slowReadStore();
    const [one, two] = await Promise.all([
      recordReviewDecision(store, input({ decision: 'confirmed', correctedValue: undefined })),
      recordReviewDecision(
        store,
        input({ decidedAt: '2026-10-06T10:00:00.005Z', correctedValue: 'Kotlin' }),
      ),
    ]);

    expect(one.decision.attributes.supersedesDecisionId).toBeUndefined();
    expect(two.decision.attributes.supersedesDecisionId).toBe(one.decision.identity.id);
    expect(two.decision.lifecycle?.previousStatus).toBe('confirmed');
  });

  it('a failed submission does not block later ones for the same element', async () => {
    const store = slowReadStore();
    const bad = recordReviewDecision(store, input({ correctedValue: '' }));
    const good = recordReviewDecision(store, input({ correctedValue: 'Kotlin' }));
    await expect(bad).rejects.toThrow();
    await expect(good).resolves.toMatchObject({ durability: 'memory' });
  });
});

describe('computeReviewMetrics — window bounds compare instants, not strings (P8)', () => {
  const decision = buildReviewDecision(input({ decidedAt: '2026-10-06T10:00:00.000Z' }));

  it('an inclusive "from" written without milliseconds includes a decision at that exact instant', () => {
    expect(computeReviewMetrics([decision], { from: '2026-10-06T10:00:00Z' }).decisions).toBe(1);
  });

  it('honours timezone offsets', () => {
    // 15:30+05:30 is 10:00Z — the same instant, so "to" includes it.
    expect(computeReviewMetrics([decision], { to: '2026-10-06T15:30:00+05:30' }).decisions).toBe(1);
    // 15:29+05:30 is 09:59Z — before the decision.
    expect(computeReviewMetrics([decision], { to: '2026-10-06T15:29:00+05:30' }).decisions).toBe(0);
  });

  it('rejects an unparseable bound instead of computing a meaningless metric', () => {
    expect(() => computeReviewMetrics([decision], { from: 'last tuesday' })).toThrow(
      InvalidMetricsWindowError,
    );
  });

  it('rejects a window whose "from" is after its "to"', () => {
    expect(() =>
      computeReviewMetrics([decision], {
        from: '2026-10-07T00:00:00Z',
        to: '2026-10-06T00:00:00Z',
      }),
    ).toThrow(/after "to"/);
  });
});

describe('review text passes the redaction detectors before it is recorded (P8 security)', () => {
  const SECRET = 'AKIAABCDEFGHIJKLMNOP';

  it.each([
    ['correctedValue', { correctedValue: `Uses key ${SECRET}` }],
    ['rationale', { rationale: 'Confirmed with jane.doe@example.com on the call' }],
    ['previousValue', { previousValue: 'password = "hunter2-old"' }],
  ])(
    'rejects a decision whose %s contains a secret or PII, and stores nothing',
    async (field, extra) => {
      const store = createInMemoryReviewDecisionStore();
      const attempt = recordReviewDecision(store, input(extra));
      await expect(attempt).rejects.toThrow(new RegExp(`${field} appears to contain`));
      await attempt.catch((error: Error) => {
        expect(error.message).not.toContain(SECRET);
        expect(error.message).not.toContain('jane.doe@example.com');
        expect(error.message).not.toContain('hunter2-old');
      });
      expect(await store.listAll()).toEqual([]);
    },
  );

  it('records ordinary review text unchanged', async () => {
    const store = createInMemoryReviewDecisionStore();
    const { decision } = await recordReviewDecision(
      store,
      input({ rationale: 'Rewritten in 2024; the architecture doc is stale.' }),
    );
    expect(decision.attributes.rationale).toBe('Rewritten in 2024; the architecture doc is stale.');
  });

  it('accepts a previous value that is already a redaction token', async () => {
    const store = createInMemoryReviewDecisionStore();
    await expect(
      recordReviewDecision(
        store,
        input({ previousValue: '[REDACTED:assigned-secret:0123456789ab]', correctedValue: 'n/a' }),
      ),
    ).resolves.toBeDefined();
  });
});

describe('review decisions stay inside their own tenant (P8, FR-ORC-04)', () => {
  it("a correction only matches the node of the decision's own system", async () => {
    const { driver, writes } = fakeDriver({
      label: 'Container',
      readNodes: [
        { id: 'ctr-payments', systemId: 'aurora-commerce', attr_technology: 'Node.js/Express' },
      ],
    });
    await propagateCorrectionToGraph(driver, 'neo4j', buildReviewDecision(input()), { at: AT });
    const correction = writes.find((cypher) => cypher.startsWith('MATCH (n {id: $id'));
    expect(correction).toContain('systemId: $systemId');
  });

  it('a tenant-scoped store refuses to save another tenant’s decision', async () => {
    const { driver } = fakeDriver({});
    const store = createGraphReviewDecisionStore(driver, 'neo4j', { systemId: 'tenant-b' });
    await expect(store.save(buildReviewDecision(input()))).rejects.toThrow(
      /cannot be saved by a store serving "tenant-b"/,
    );
  });
});
