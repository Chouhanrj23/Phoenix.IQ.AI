import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createGitRepositoryConnector } from '@phoenix-ai/ingestion-connectors';
import { runPipeline, type PipelineRun } from '@phoenix-ai/orchestration';
import {
  declaredOperations,
  evaluateGate,
  precisionRecall,
  scoreAgainstGolden,
  SHOP_PLATFORM_GOLDEN,
  verifyRoundTrip,
} from '../src/index.js';

/**
 * P8 -- FR-EVA-01..03 CI gate: the REAL pipeline over the golden repository
 * (committed with real git, read by the real connector), scored against the
 * hand-authored ground truth. This test failing is a regression in what
 * Phoenix finds, not a snapshot to update.
 */

const golden = SHOP_PLATFORM_GOLDEN;
let parent: string;
let run: PipelineRun;

beforeAll(async () => {
  parent = mkdtempSync(join(tmpdir(), 'phoenix-golden-'));
  const root = join(parent, 'shop-platform');
  for (const [path, content] of Object.entries(golden.files)) {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content, 'utf8');
  }
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: 'Golden',
    GIT_AUTHOR_EMAIL: 'golden@example.invalid',
    GIT_COMMITTER_NAME: 'Golden',
    GIT_COMMITTER_EMAIL: 'golden@example.invalid',
    GIT_AUTHOR_DATE: '2026-09-01T09:00:00+00:00',
    GIT_COMMITTER_DATE: '2026-09-01T09:00:00+00:00',
  };
  const git = (...args: string[]) =>
    execFileSync('git', args, { cwd: root, env, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'core.autocrlf', 'false');
  git('add', '--all');
  git('commit', '-q', '-m', 'golden');

  run = await runPipeline({
    systemId: golden.systemId,
    generatedAt: '2026-10-07T00:00:00.000Z',
    source: {
      connector: createGitRepositoryConnector(),
      descriptor: {
        id: 'repo://golden/shop-platform',
        sourceType: 'source-code',
        label: 'shop-platform (golden)',
        locator: `file://${encodeURI(root.replace(/\\/g, '/'))}`,
        repository: { kind: 'local-directory' },
      },
    },
  });
}, 120_000);

afterAll(() => rmSync(parent, { recursive: true, force: true }));

describe('CI gate: the real pipeline against the golden system', () => {
  it('meets every threshold (precision/recall >= 0.9, clustering F1 >= 0.9, no contradictions)', () => {
    const scores = scoreAgainstGolden(run.bundle, golden);
    const roundTrip = verifyRoundTrip(
      run.bundle,
      new Map(run.artifacts.map((a) => [a.path, a.content])),
    );
    const gate = evaluateGate(scores, roundTrip);
    expect(gate.failures).toEqual([]);
    expect(gate.passed).toBe(true);
  });

  it('round-trips every API operation, table and image to the source it cites', () => {
    const roundTrip = verifyRoundTrip(
      run.bundle,
      new Map(run.artifacts.map((a) => [a.path, a.content])),
    );
    expect(roundTrip.contradicted).toBe(0);
    expect(roundTrip.unverifiable).toBe(0);
    const kinds = new Set(roundTrip.results.map((r) => r.claimKind));
    expect([...kinds].sort()).toEqual(['api-operation', 'image', 'table']);
    expect(roundTrip.confirmed).toBe(5 + 3 + 3);
  });
});

describe('the gate really fails when knowledge is wrong', () => {
  it('a missing element lowers recall below the threshold', () => {
    const lossy = {
      ...run.bundle,
      objects: run.bundle.objects.filter((o) => o.label !== 'Invoice' && o.label !== 'Customer'),
    };
    const gate = evaluateGate(scoreAgainstGolden(lossy, golden), verifyRoundTrip(lossy, new Map()));
    expect(gate.passed).toBe(false);
    expect(gate.failures.join(' ')).toMatch(/nodes: precision 1, recall 0\.778/);
  });

  it('a claim its cited source contradicts is a failure, not a lower score', () => {
    const tampered = {
      ...run.bundle,
      objects: run.bundle.objects.map((o) =>
        o.label === 'OrderController'
          ? { ...o, attributes: { ...o.attributes, operations: [{ name: 'DELETE /orders/{id}' }] } }
          : o,
      ),
    };
    const roundTrip = verifyRoundTrip(
      tampered,
      new Map(run.artifacts.map((a) => [a.path, a.content])),
    );
    expect(roundTrip.results.find((r) => r.claim === 'DELETE /orders/{id}')?.outcome).toBe(
      'contradicted',
    );
    expect(
      evaluateGate(scoreAgainstGolden(run.bundle, golden), roundTrip).failures.join(' '),
    ).toMatch(/round-trip: 1 claim\(s\) contradicted/);
  });

  it('a claim whose source is unavailable is unverifiable — never confirmed', () => {
    const roundTrip = verifyRoundTrip(run.bundle, new Map());
    expect(roundTrip.confirmed).toBe(0);
    expect(roundTrip.unverifiable).toBe(roundTrip.checked);
  });
});

describe('metric primitives', () => {
  it('precision / recall / F1', () => {
    expect(precisionRecall(['a', 'b', 'c', 'd'], ['a', 'b', 'x'])).toMatchObject({
      precision: 0.667,
      recall: 0.5,
      f1: 0.571,
      missing: ['c', 'd'],
      unexpected: ['x'],
    });
    expect(precisionRecall([], [])).toMatchObject({ precision: 1, recall: 1 });
  });

  it('reads controller mappings independently of the extractor', () => {
    expect(
      [
        ...declaredOperations(
          golden.files['orders/src/main/java/com/shop/orders/OrderController.java']!,
        ),
      ].sort(),
    ).toEqual(['GET /orders/{id}', 'POST /orders', 'PUT /orders/{id}/cancel']);
  });
});
