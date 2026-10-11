import { describe, expect, it } from 'vitest';
import type { CommitRecord } from '@phoenix-ai/ingestion-connectors';
import {
  CANONICAL_SCHEMA_VERSION,
  validateCanonicalKnowledgeBundle,
  type CanonicalKnowledgeObject,
} from '@phoenix-ai/knowledge-graph';
import { assessKnowledgeRisk, extractChangeCoupling } from '../src/history.js';

/** P8 -- FR-DET-05 co-change coupling, FR-DET-06 ownership / knowledge risk. */

const OPTIONS = {
  systemId: 'shop',
  sourceId: 'repo://acme/shop',
  generatedAt: '2026-10-07T00:00:00.000Z',
};

function element(id: string, ...paths: string[]): CanonicalKnowledgeObject {
  return {
    identity: {
      id,
      systemId: 'shop',
      createdAt: OPTIONS.generatedAt,
      updatedAt: OPTIONS.generatedAt,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'domain.entity',
    label: id,
    attributes: {},
    metadata: {
      provenance: [
        {
          sourceId: OPTIONS.sourceId,
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: OPTIONS.generatedAt,
        },
      ],
      confidence: { level: 'high' },
    },
    evidence: paths.map((path, i) => ({
      id: `ev-${id}-${i}`,
      sourceId: OPTIONS.sourceId,
      locator: `${path}#L1`,
    })),
  };
}

function commit(
  revision: string,
  committedAt: string,
  authorKey: string,
  files: string[],
): CommitRecord {
  return { revision, committedAt, authorKey, files };
}

const ORDER = element('order', 'src/Order.java');
const INVOICE = element('invoice', 'src/Invoice.java');
const PET = element('pet', 'src/Pet.java');
const ORDER_API = element('order-api', 'src/OrderController.java');

const HISTORY: CommitRecord[] = [
  commit('c1', '2024-01-01T00:00:00Z', 'author-a', ['src/Order.java', 'src/Invoice.java']),
  commit('c2', '2024-02-01T00:00:00Z', 'author-a', ['src/Order.java', 'src/Invoice.java']),
  commit('c3', '2024-03-01T00:00:00Z', 'author-a', ['src/Order.java', 'src/Pet.java']),
  commit('c4', '2026-09-01T00:00:00Z', 'author-b', ['src/OrderController.java']),
  commit('c5', '2026-09-15T00:00:00Z', 'author-c', ['src/OrderController.java', 'README.md']),
];

describe('extractChangeCoupling (FR-DET-05)', () => {
  const relationships = extractChangeCoupling(HISTORY, [ORDER, INVOICE, PET, ORDER_API], OPTIONS);

  it('couples elements whose files changed together at least twice, with the strength', () => {
    expect(relationships).toHaveLength(1);
    const [coupling] = relationships;
    expect(coupling).toMatchObject({
      kind: 'coChangesWith',
      sourceObjectId: 'invoice',
      targetObjectId: 'order',
      attributes: { coChanges: 2, commitsSource: 2, commitsTarget: 3, jaccard: 0.667 },
    });
    expect(coupling?.evidence?.[0]?.locator).toBe('git:c2');
  });

  it('does not treat co-location in one file as coupling', () => {
    const twin = element('order-dto', 'src/Order.java');
    const result = extractChangeCoupling(HISTORY, [ORDER, twin], OPTIONS);
    expect(result).toEqual([]);
  });

  it('ignores sweeping commits that would couple everything to everything', () => {
    const sweeping = Array.from({ length: 3 }, (_, i) =>
      commit(`s${i}`, '2024-05-01T00:00:00Z', 'author-a', [
        'src/Pet.java',
        'src/OrderController.java',
        ...Array.from({ length: 60 }, (_, j) => `gen/F${j}.java`),
      ]),
    );
    expect(extractChangeCoupling(sweeping, [PET, ORDER_API], OPTIONS)).toEqual([]);
  });

  it('produces valid relationships between existing elements, deterministically', () => {
    expect(
      validateCanonicalKnowledgeBundle({
        systemId: 'shop',
        generatedAt: OPTIONS.generatedAt,
        objects: [ORDER, INVOICE, PET, ORDER_API],
        relationships,
      }),
    ).toEqual({ valid: true, errors: [] });
    expect(extractChangeCoupling([...HISTORY], [ORDER_API, PET, INVOICE, ORDER], OPTIONS)).toEqual(
      relationships,
    );
  });
});

describe('assessKnowledgeRisk (FR-DET-06)', () => {
  const findings = assessKnowledgeRisk(HISTORY, [ORDER, INVOICE, PET, ORDER_API], OPTIONS);
  const of = (id: string) => findings.find((f) => f.objectId === id);

  it('flags a single-owner, stale element with its owner and last-change date', () => {
    expect(of('order')).toMatchObject({
      owner: 'author-a',
      singleOwner: true,
      stale: true,
      atRisk: true,
      commits: 3,
      lastChangedAt: '2024-03-01T00:00:00Z',
    });
  });

  it('does not flag an element several people changed recently', () => {
    expect(of('order-api')).toMatchObject({
      distinctAuthors: 2,
      singleOwner: false,
      stale: false,
      atRisk: false,
    });
  });

  it('measures staleness against the run, not the wall clock', () => {
    const asOf2024 = assessKnowledgeRisk(HISTORY, [ORDER], { generatedAt: '2024-06-01T00:00:00Z' });
    expect(asOf2024[0]?.stale).toBe(false);
  });

  it('reports nothing for an element with no history rather than guessing', () => {
    const untracked = element('ghost', 'src/Ghost.java');
    expect(assessKnowledgeRisk(HISTORY, [untracked], OPTIONS)).toEqual([]);
  });
});
