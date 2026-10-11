import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalKnowledgeBundle,
  type CanonicalKnowledgeObject,
} from '@phoenix-ai/knowledge-graph';
import {
  createFileGraphVersionStore,
  createGraphVersion,
  createInMemoryGraphVersionStore,
  diffGraphVersions,
  GraphVersionConflictError,
  graphVersionId,
  toDriftRun,
} from '../src/index.js';

/** P8 -- FR-KG-05 graph versions; FR-DFT-02/03/04 drift. */

function entity(
  id: string,
  label: string,
  attributes: Record<string, unknown>,
  at: string,
  extra: Partial<CanonicalKnowledgeObject> = {},
): CanonicalKnowledgeObject {
  return {
    identity: {
      id,
      systemId: 'shop',
      createdAt: at,
      updatedAt: at,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'domain.entity',
    label,
    attributes: attributes as CanonicalKnowledgeObject['attributes'],
    metadata: {
      provenance: [
        { sourceId: 'repo://shop', sourceType: 'source-code', derivedBy: 'x', derivedAt: at },
      ],
      confidence: { level: 'high' },
    },
    evidence: [
      { id: `ev-${id}`, sourceId: 'repo://shop', locator: `src/${label}.java#L3`, capturedAt: at },
    ],
    confidenceDetail: { basis: 'observed' },
    ...extra,
  };
}

function bundle(at: string, objects: CanonicalKnowledgeObject[]): CanonicalKnowledgeBundle {
  return { systemId: 'shop', generatedAt: at, objects, relationships: [] };
}

const T1 = '2026-10-01T00:00:00.000Z';
const T2 = '2026-10-02T00:00:00.000Z';

describe('graph versions (FR-KG-05)', () => {
  it('the same knowledge produced at a different time has the same version id', () => {
    const a = bundle(T1, [entity('order', 'Order', { table: 'orders' }, T1)]);
    const b = bundle(T2, [entity('order', 'Order', { table: 'orders' }, T2)]);
    expect(graphVersionId(a)).toBe(graphVersionId(b));
  });

  it('any change — even only evidence — is a new version', () => {
    const a = bundle(T1, [entity('order', 'Order', { table: 'orders' }, T1)]);
    const moved = entity('order', 'Order', { table: 'orders' }, T1);
    moved.evidence = [
      { id: 'ev-order', sourceId: 'repo://shop', locator: 'src/Order.java#L9', capturedAt: T1 },
    ];
    expect(graphVersionId(bundle(T1, [moved]))).not.toBe(graphVersionId(a));
  });

  it('records, per element, the version in which it was last changed', () => {
    const v1 = createGraphVersion(
      bundle(T1, [entity('order', 'Order', { table: 'orders' }, T1), entity('pet', 'Pet', {}, T1)]),
    );
    const v2 = createGraphVersion(
      bundle(T2, [
        entity('order', 'Order', { table: 'sales_orders' }, T2),
        entity('pet', 'Pet', {}, T2),
      ]),
      v1,
    );
    expect(v2.parentId).toBe(v1.id);
    expect(v2.elementVersions).toEqual({ order: v2.id, pet: v1.id });
  });
});

describe('version stores — immutable, per system', () => {
  const dir = mkdtempSync(join(tmpdir(), 'phoenix-versions-'));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  for (const [name, make] of [
    ['in-memory', () => createInMemoryGraphVersionStore()],
    ['filesystem', () => createFileGraphVersionStore(join(dir, String(Math.random()).slice(2)))],
  ] as const) {
    it(`${name}: saves, lists oldest first, re-saving identical content is a no-op`, async () => {
      const store = make();
      const v1 = createGraphVersion(bundle(T1, [entity('order', 'Order', {}, T1)]));
      const v2 = createGraphVersion(bundle(T2, [entity('order', 'Order', { x: 1 }, T2)]), v1);
      await store.save(v1);
      await store.save(v2);
      await store.save(v1);
      expect(await store.list('shop')).toEqual([v1.id, v2.id]);
      expect((await store.latest('shop'))?.id).toBe(v2.id);
      expect((await store.get('shop', v1.id))?.bundle.objects[0]?.label).toBe('Order');
      expect(await store.list('another-tenant')).toEqual([]);
    });

    it(`${name}: the same knowledge re-derived later is the same version, not a conflict`, async () => {
      // Regression (P8): found by the orchestration lifecycle test -- a third
      // run over unchanged input was rejected because timestamps differed.
      const store = make();
      const v1 = createGraphVersion(bundle(T1, [entity('order', 'Order', {}, T1)]));
      const rerun = createGraphVersion(bundle(T2, [entity('order', 'Order', {}, T2)]), v1);
      expect(rerun.id).toBe(v1.id);
      await store.save(v1);
      await expect(store.save(rerun)).resolves.toBeUndefined();
      expect(await store.list('shop')).toEqual([v1.id]);
      expect((await store.get('shop', v1.id))?.createdAt).toBe(T1);
    });

    it(`${name}: refuses to overwrite a version with different content`, async () => {
      const store = make();
      const v1 = createGraphVersion(bundle(T1, [entity('order', 'Order', {}, T1)]));
      await store.save(v1);
      const tampered = { ...v1, bundle: bundle(T1, [entity('order', 'Tampered', {}, T1)]) };
      await expect(store.save(tampered)).rejects.toBeInstanceOf(GraphVersionConflictError);
    });
  }

  it('filesystem: refuses ids that could escape the store directory', async () => {
    const store = createFileGraphVersionStore(join(dir, 'safe'));
    const v1 = createGraphVersion({ ...bundle(T1, []), systemId: '../escape' });
    await expect(store.save(v1)).rejects.toThrow(/not a safe storage name/);
  });

  it('filesystem: leaves no temporary files behind and survives a fresh store instance', async () => {
    const root = join(dir, 'durable');
    const v1 = createGraphVersion(bundle(T1, [entity('order', 'Order', {}, T1)]));
    await createFileGraphVersionStore(root).save(v1);
    expect(readdirSync(join(root, 'shop')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
    expect((await createFileGraphVersionStore(root).latest('shop'))?.id).toBe(v1.id);
    writeFileSync(join(root, 'shop', 'unrelated.txt'), 'x');
    expect(await createFileGraphVersionStore(root).list('shop')).toEqual([v1.id]);
  });
});

describe('drift changelog (FR-DFT-02/03/04)', () => {
  const v1 = createGraphVersion(
    bundle(T1, [
      entity('order', 'Order', { table: 'orders' }, T1),
      entity('pet', 'Pet', {}, T1),
      entity('concept', 'Order Cancel', {}, T1, { confidenceDetail: { basis: 'derived' } }),
    ]),
  );
  const v2 = createGraphVersion(
    bundle(T2, [
      entity('order', 'Order', { table: 'sales_orders' }, T2),
      entity('invoice', 'Invoice', {}, T2),
      entity('concept', 'Order Cancellation', {}, T2, { confidenceDetail: { basis: 'derived' } }),
    ]),
    v1,
  );
  const changelog = diffGraphVersions(v1, v2);

  it('reports added, removed and modified elements, classified', () => {
    expect(changelog.changes.map((c) => [c.id, c.change, c.changeClass])).toEqual([
      ['invoice', 'added', 'entity'],
      ['concept', 'modified', 'entity'],
      ['order', 'modified', 'entity'],
      ['pet', 'removed', 'entity'],
    ]);
    expect(changelog.changes.find((c) => c.id === 'order')?.changedFields).toEqual([
      'attributes.table',
    ]);
  });

  it('separates architectural (observed) drift from inferred churn', () => {
    expect(changelog.summary).toMatchObject({
      observed: 3,
      inferred: 1,
      added: 1,
      removed: 1,
      modified: 2,
    });
    expect(toDriftRun(changelog).changes.map((c) => c.elementName)).toEqual([
      'Invoice',
      'Order',
      'Pet',
    ]);
  });

  it('ignores moved code, timestamps and confidence wording — not drift', () => {
    const shifted = entity('order', 'Order', { table: 'orders' }, T2);
    shifted.evidence = [
      { id: 'ev-order', sourceId: 'repo://shop', locator: 'src/Order.java#L40', capturedAt: T2 },
    ];
    shifted.metadata = {
      ...shifted.metadata,
      confidence: { level: 'high', rationale: 'reworded' },
    };
    const base = createGraphVersion(
      bundle(T1, [entity('order', 'Order', { table: 'orders' }, T1)]),
    );
    const next = createGraphVersion(bundle(T2, [shifted]), base);
    expect(next.id).not.toBe(base.id);
    expect(diffGraphVersions(base, next).changes).toEqual([]);
  });

  it('a first run is a baseline', () => {
    const baseline = diffGraphVersions(undefined, v1);
    expect(baseline.fromVersionId).toBeUndefined();
    expect(toDriftRun(baseline).summary).toMatch(/^Baseline version/);
  });
});
