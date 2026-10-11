import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createInMemoryGraphVersionStore } from '@phoenix-ai/drift-detection';
import { createJavaParseCache } from '@phoenix-ai/extraction-engine';
import { runPipeline, type PipelineRun, type StageReport } from '../src/index.js';
import { createFixtureRepo, FIXTURE_FILES, type FixtureRepo } from './fixture-repo.js';

/**
 * P8 -- a system analysed again and again, as it evolves, through the REAL
 * pipeline over a REAL git repository:
 *
 *   FR-KG-05  each run is an immutable, content-addressed graph version;
 *   FR-DFT-01 unchanged files are not re-parsed;
 *   FR-DFT-02 each run's changelog against the previous version;
 *   FR-DET-04 deployment topology from a docker-compose file added later;
 *   FR-DET-05 change coupling from real commit history;
 *   FR-GAP-01 coverage and gaps that shrink as inputs arrive.
 */

const SYSTEM_ID = 'order-service';
const COMPOSE = `name: shop
services:
  orders:
    image: example/order-service:1.0
    ports:
      - "8080:8080"
    depends_on:
      - db
  db:
    image: postgres:16
`;
const INVOICE = `package com.example.orders;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "invoices")
public class Invoice {
  @Id
  private Long id;
  private String number;
}
`;

const CUSTOMER_PATH = 'src/main/java/com/example/orders/Customer.java';
const ORDER_PATH = 'src/main/java/com/example/orders/Order.java';

let repo: FixtureRepo;
const store = createInMemoryGraphVersionStore();
const cache = createJavaParseCache();
let first: PipelineRun;
let second: PipelineRun;
let again: PipelineRun;

function stage(run: PipelineRun, name: StageReport['stage']): StageReport {
  const found = run.stages.find((s) => s.stage === name);
  if (found === undefined) throw new Error(`stage ${name} missing`);
  return found;
}

async function run(at: string): Promise<PipelineRun> {
  return runPipeline({
    systemId: SYSTEM_ID,
    generatedAt: at,
    source: { connector: repo.connector, descriptor: repo.descriptor },
    versionStore: store,
    parseCache: cache,
  });
}

beforeAll(async () => {
  repo = createFixtureRepo();
  first = await run('2026-10-01T00:00:00.000Z');

  // Two later commits by another author that each touch Order AND Customer
  // together -- real co-change -- and add an entity and a compose file.
  repo.commit(
    {
      'src/main/java/com/example/orders/Invoice.java': INVOICE,
      'docker-compose.yml': COMPOSE,
      [ORDER_PATH]: FIXTURE_FILES[ORDER_PATH]!.replace(
        'private String status;',
        'private String status;\n  private String channel;',
      ),
      [CUSTOMER_PATH]: FIXTURE_FILES[CUSTOMER_PATH]!.replace(
        'private String name;',
        'private String name;\n  private String email;',
      ),
    },
    {
      message: 'Invoices, deployment',
      date: '2026-09-10T09:00:00+00:00',
      authorEmail: 'dev2@example.invalid',
    },
  );
  repo.commit(
    {
      [ORDER_PATH]: FIXTURE_FILES[ORDER_PATH]!.replace(
        'private String status;',
        'private String status;\n  private String channel;\n  private String currency;',
      ),
      [CUSTOMER_PATH]: FIXTURE_FILES[CUSTOMER_PATH]!.replace(
        'private String name;',
        'private String name;\n  private String email;\n  private String phone;',
      ),
    },
    {
      message: 'Contact details',
      date: '2026-09-20T09:00:00+00:00',
      authorEmail: 'dev2@example.invalid',
    },
  );
  second = await run('2026-10-02T00:00:00.000Z');
  again = await run('2026-10-03T00:00:00.000Z');
}, 120_000);

afterAll(() => repo?.dispose());

describe('graph versions across runs (FR-KG-05)', () => {
  it('the first run is stored as the baseline; drift is honestly skipped', async () => {
    expect(stage(first, 'drift').status).toBe('skipped');
    expect(first.changelog.fromVersionId).toBeUndefined();
    expect((await store.list(SYSTEM_ID))[0]).toBe(first.version.id);
  });

  it('a changed repository is a new version whose parent is the previous one', () => {
    expect(second.version.id).not.toBe(first.version.id);
    expect(second.version.parentId).toBe(first.version.id);
  });

  it('re-running unchanged input re-derives the SAME version — nothing new stored', async () => {
    expect(again.version.id).toBe(second.version.id);
    expect(again.changelog.changes).toEqual([]);
    expect(await store.list(SYSTEM_ID)).toEqual([first.version.id, second.version.id]);
  });
});

describe('drift changelog (FR-DFT-02/03)', () => {
  it('reports exactly what changed in the code, classified', () => {
    const changes = second.changelog.changes.filter((c) => c.elementType === 'object');
    const of = (label: string) => changes.find((c) => c.label === label && c.basis === 'observed');
    expect(of('Invoice')).toMatchObject({ change: 'added', changeClass: 'entity' });
    expect(of('Order')).toMatchObject({ change: 'modified', changeClass: 'entity' });
    expect(of('Order')?.changedFields).toContain('attributes.fields');
    expect(of('orders')).toMatchObject({ change: 'added', changeClass: 'deployment' });
    expect(of('OrderController')).toBeUndefined();
  });
});

describe('only changed files are re-parsed (FR-DFT-01)', () => {
  it('the second run parsed the changed and new files only; the third parsed nothing', () => {
    expect(stage(second, 'extraction').notes.join(' ')).toMatch(
      /parse cache: 3 file\(s\) parsed, 2 unchanged file\(s\) reused/,
    );
    expect(stage(again, 'extraction').notes.join(' ')).toMatch(
      /parse cache: 0 file\(s\) parsed, 5 unchanged file\(s\) reused/,
    );
  });
});

describe('history and infrastructure reach the graph (FR-DET-04/05)', () => {
  it('reads the real commit history', () => {
    expect(second.history.map((c) => c.revision)).toHaveLength(3);
    expect(stage(second, 'ingestion').notes.join(' ')).toMatch(/3 commit\(s\) of history read/);
  });

  it('Order and Customer changed together twice: a co-change relationship', () => {
    const labels = new Map(second.bundle.objects.map((o) => [o.identity.id, o.label]));
    const coupling = second.bundle.relationships
      .filter((r) => r.kind === 'coChangesWith')
      .map((r) => [labels.get(r.sourceObjectId), labels.get(r.targetObjectId)].sort().join('~'));
    expect(coupling).toContain('Customer~Order');
  });

  it('the compose file becomes deployment units in their environment', () => {
    const units = second.bundle.objects
      .filter((o) => o.kind === 'deployment.unit')
      .map((o) => o.label);
    expect(units.sort()).toEqual(['db', 'orders']);
    expect(
      second.bundle.objects.some((o) => o.kind === 'deployment.environment' && o.label === 'shop'),
    ).toBe(true);
  });

  it('knowledge risk is assessed per element from real authorship', () => {
    const order = second.knowledgeRisk.find((r) => r.label === 'Order');
    expect(order).toMatchObject({ commits: 3, distinctAuthors: 2, singleOwner: false });
  });
});

describe('gaps shrink as inputs arrive (FR-GAP-01/02)', () => {
  const coverage = (run: PipelineRun, id: string) =>
    run.gaps.coverage.find((c) => c.artifactId === id)?.coverage;

  it('deployment is uncovered until a compose file exists, then covered', () => {
    expect(coverage(first, 'deployment')).toBe('uncovered');
    expect(first.gaps.gaps.some((g) => g.id === 'gap-artifact-deployment')).toBe(true);
    expect(coverage(second, 'deployment')).toBe('covered');
    expect(second.gaps.gaps.some((g) => g.id === 'gap-artifact-deployment')).toBe(false);
    expect(second.gaps.coverageScore).toBeGreaterThan(first.gaps.coverageScore);
  });

  it('the quarantined binary is raised as a gap naming the file', () => {
    expect(first.gaps.gaps.find((g) => g.id === 'gap-quarantined-files')?.missingInputs).toEqual([
      'docs/logo.png',
    ]);
  });
});
