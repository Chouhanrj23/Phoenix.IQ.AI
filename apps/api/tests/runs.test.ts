import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createInMemoryReviewDecisionStore } from '@phoenix-ai/review-loop';
import { parseAndValidateOkfYaml } from '@phoenix-ai/knowledge-graph';
import { SHOP_PLATFORM_GOLDEN } from '@phoenix-ai/evaluation-harness';
import { buildApp } from '../src/app.js';
import { RunService } from '../src/services/runs.service.js';
import {
  closeReviewDecisionStore,
  resetReviewDecisionStore,
} from '../src/services/review-decisions.service.js';

/**
 * P8 -- FR-IF-01/03/05: register a source, trigger runs, and read every real
 * output over HTTP. The source is a REAL git repository (the evaluation
 * harness's golden system); the run is the REAL pipeline.
 */

vi.setConfig({ testTimeout: 60_000 });

const SYSTEM = 'shop-platform';
let parent: string;
let repoRoot: string;
let runs: RunService;
let app: ReturnType<typeof buildApp>;
let clock = Date.parse('2026-10-07T10:00:00.000Z');

function git(...args: string[]): string {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Dev',
      GIT_AUTHOR_EMAIL: 'dev@example.invalid',
      GIT_COMMITTER_NAME: 'Dev',
      GIT_COMMITTER_EMAIL: 'dev@example.invalid',
      GIT_AUTHOR_DATE: '2026-09-01T09:00:00+00:00',
      GIT_COMMITTER_DATE: '2026-09-01T09:00:00+00:00',
    },
  });
}

function write(files: Record<string, string>): void {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(repoRoot, path, '..'), { recursive: true });
    writeFileSync(join(repoRoot, path), content, 'utf8');
  }
}

const fileUrl = (path: string) => `file://${encodeURI(path.replace(/\\/g, '/'))}`;

async function runToCompletion(sourceId: string): Promise<Record<string, unknown>> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/runs',
    payload: { systemId: SYSTEM, sourceId },
  });
  expect(res.statusCode, res.body).toBe(202);
  expect(res.json().status).toBe('queued');
  await runs.idle();
  return (
    await app.inject({ method: 'GET', url: `/api/runs/${res.json().id}?systemId=${SYSTEM}` })
  ).json();
}

beforeAll(async () => {
  parent = mkdtempSync(join(tmpdir(), 'phoenix-api-runs-'));
  repoRoot = join(parent, 'repo');
  mkdirSync(repoRoot);
  write(SHOP_PLATFORM_GOLDEN.files);
  git('init', '-q', '-b', 'main');
  git('config', 'core.autocrlf', 'false');
  git('add', '--all');
  git('commit', '-q', '-m', 'initial');

  runs = new RunService({
    workspaceDir: join(parent, 'workspace'),
    defaultSystemId: SYSTEM,
    allowLocalSources: true,
    now: () => new Date((clock += 60_000)),
  });
  resetReviewDecisionStore(createInMemoryReviewDecisionStore());
  app = buildApp({ port: 0, host: '127.0.0.1', corsOrigin: 'http://localhost:3000' }, { runs });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await closeReviewDecisionStore();
  rmSync(parent, { recursive: true, force: true });
});

describe('before any run: seed data, labelled as seed', () => {
  it('drift and gap endpoints say their data is seed', async () => {
    for (const url of ['/api/drift-history', '/api/drift-alerts', '/api/gap-items']) {
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-phoenix-data-origin']).toBe('seed');
    }
  });
});

describe('source registration (FR-IF-01)', () => {
  it('registers a source and lists it for its system only', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/sources',
      payload: { systemId: SYSTEM, id: 'shop', label: 'Shop platform', locator: fileUrl(repoRoot) },
    });
    expect(res.statusCode, res.body).toBe(201);
    const listed = await app.inject({ method: 'GET', url: `/api/sources?systemId=${SYSTEM}` });
    expect(listed.json().map((s: { id: string }) => s.id)).toEqual(['shop']);
    const other = await app.inject({ method: 'GET', url: '/api/sources?systemId=another-tenant' });
    expect(other.json()).toEqual([]);
  });

  it('rejects duplicates, bad ids, unsafe or credentialed locators', async () => {
    const post = (payload: Record<string, unknown>) =>
      app.inject({
        method: 'POST',
        url: '/api/sources',
        payload: { systemId: SYSTEM, ...payload },
      });
    expect((await post({ id: 'shop', locator: fileUrl(repoRoot) })).statusCode).toBe(409);
    expect((await post({ id: '../x', locator: 'https://example.com/r.git' })).statusCode).toBe(400);
    expect((await post({ id: 'h', locator: 'http://example.com/r.git' })).statusCode).toBe(400);
    expect(
      (await post({ id: 'c', locator: 'https://user:token@example.com/r.git' })).json().message,
    ).toMatch(/must not embed credentials/);
    expect(
      (await post({ id: 'b', locator: 'https://example.com/r.git', branch: '--upload-pack=x' }))
        .statusCode,
    ).toBe(400);
    expect(
      (await post({ id: 'ok', locator: 'https://example.com/r.git', branch: 'feature/x' }))
        .statusCode,
    ).toBe(201);
  });

  it('refuses local paths unless the operator allows them', async () => {
    const strict = new RunService({
      workspaceDir: join(parent, 'strict'),
      defaultSystemId: SYSTEM,
      allowLocalSources: false,
    });
    await expect(strict.registerSource({ id: 'x', locator: fileUrl(repoRoot) })).rejects.toThrow(
      /local file:\/\/ sources are disabled/,
    );
  });
});

describe('runs and their outputs (FR-IF-01/03/05)', () => {
  let first: Record<string, unknown>;

  beforeAll(async () => {
    first = await runToCompletion('shop');
  });

  it('a run is accepted (202), executed, and reports every stage', () => {
    expect(first.status).toBe('succeeded');
    expect(first.versionId).toMatch(/^gv-[0-9a-f]{24}$/);
    expect((first.stages as { stage: string }[]).map((s) => s.stage)).toContain('gap-analysis');
  });

  it('serves the valid OKF document', async () => {
    const res = await app.inject({ method: 'GET', url: `/api/runs/${first.id}/okf` });
    expect(res.headers['content-type']).toMatch(/application\/yaml/);
    expect(parseAndValidateOkfYaml(res.body).valid).toBe(true);
  });

  it('serves the eleven artifacts and a portable export whose files match the manifest', async () => {
    const artifacts = (
      await app.inject({ method: 'GET', url: `/api/runs/${first.id}/artifacts` })
    ).json();
    expect(artifacts).toHaveLength(11);
    expect(artifacts.find((a: { id: string }) => a.id === 'deployment').status).toBe('rendered');

    const manifest = (
      await app.inject({ method: 'GET', url: `/api/runs/${first.id}/export` })
    ).json();
    const dbml = manifest.files.find((f: { path: string }) => f.path.endsWith('data-model.dbml'));
    const file = await app.inject({
      method: 'GET',
      url: `/api/runs/${first.id}/export/${dbml.path}`,
    });
    expect(file.statusCode).toBe(200);
    expect(createHash('sha256').update(file.body, 'utf8').digest('hex')).toBe(dbml.sha256);
    expect(file.body).toContain('Table "Invoice"');
    const missing = await app.inject({
      method: 'GET',
      url: `/api/runs/${first.id}/export/../../sources.json`,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('serves the changelog, gaps, knowledge risk and round-trip evaluation', async () => {
    const get = async (part: string) =>
      (await app.inject({ method: 'GET', url: `/api/runs/${first.id}/${part}` })).json();
    expect((await get('changelog')).fromVersionId).toBeUndefined();
    expect((await get('gaps')).coverage).toHaveLength(11);
    expect(Array.isArray(await get('knowledge-risk'))).toBe(true);
    const evaluation = await get('evaluation');
    expect(evaluation.contradicted).toBe(0);
    expect(evaluation.confirmed).toBeGreaterThan(0);
  });

  it('a second run after a commit is a new version; drift and gaps now come from the pipeline', async () => {
    write({
      'billing/src/main/java/com/shop/billing/Refund.java': `package com.shop.billing;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;

@Entity
public class Refund {
  @Id
  private Long id;
}
`,
    });
    git('add', '--all');
    git('commit', '-q', '-m', 'refunds');
    const second = await runToCompletion('shop');
    expect(second.status).toBe('succeeded');
    expect(second.versionId).not.toBe(first.versionId);

    const history = await app.inject({ method: 'GET', url: '/api/drift-history' });
    expect(history.headers['x-phoenix-data-origin']).toBe('pipeline');
    expect(history.json()).toHaveLength(2);
    const alerts = await app.inject({ method: 'GET', url: '/api/drift-alerts' });
    expect(alerts.json().map((a: { elementName: string }) => a.elementName)).toContain('Refund');
    const gaps = await app.inject({ method: 'GET', url: '/api/gap-items' });
    expect(gaps.headers['x-phoenix-data-origin']).toBe('pipeline');
  });

  it("another tenant cannot see this system's runs", async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/api/runs/${first.id}?systemId=another-tenant`,
    });
    expect(res.statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: '/api/runs?systemId=another-tenant' })).json(),
    ).toEqual([]);
  });
});

describe('failures are reported, not hidden', () => {
  it('an unreadable source fails the run with a client-safe message; outputs are refused', async () => {
    await runs.registerSource({
      systemId: SYSTEM,
      id: 'gone',
      locator: fileUrl(join(parent, 'does-not-exist')),
    });
    const failed = await runToCompletion('gone');
    expect(failed.status).toBe('failed');
    expect(JSON.stringify(failed.failure)).not.toContain(parent.replace(/\\/g, '/'));
    const res = await app.inject({ method: 'GET', url: `/api/runs/${failed.id}/okf` });
    expect(res.statusCode).toBe(409);
  });

  it('a run for an unregistered source is refused', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/runs',
      payload: { sourceId: 'nope' },
    });
    expect(res.statusCode).toBe(404);
  });
});
