import { describe, expect, it } from 'vitest';
import type { Driver } from 'neo4j-driver';
import { getFullGraph, getRelationshipEndpoints, getRelationshipsForNode } from '../src/query.js';

/**
 * P8 -- the same graph reads back in the same order, whatever order Neo4j
 * returns rows in. Driver-free: what is under test is Phoenix's handling of
 * the rows, and a fake is the only way to hand over the SAME graph in two
 * different storage orders deterministically.
 */

interface FakeRow {
  readonly n?: { labels: string[]; properties: Record<string, unknown> };
  readonly r?: { type: string; properties: Record<string, unknown> };
  readonly sourceId?: string;
  readonly targetId?: string;
}

function record(row: FakeRow) {
  return { get: (key: keyof FakeRow) => row[key] };
}

/** A driver whose node query returns `nodes` and whose relationship queries return `relationships`, in exactly that order. */
function driverReturning(nodes: FakeRow[], relationships: FakeRow[]): Driver {
  const session = {
    run: () => Promise.resolve({ records: [{ get: () => true }] }),
    executeRead: (work: (tx: unknown) => unknown) =>
      Promise.resolve(
        work({
          run: (cypher: string) =>
            Promise.resolve({
              records: (cypher.startsWith('MATCH (n) RETURN n') ? nodes : relationships).map(
                record,
              ),
            }),
        }),
      ),
    close: () => Promise.resolve(),
  };
  return { session: () => session } as unknown as Driver;
}

const NODES: FakeRow[] = ['entity-b', 'api-a', 'Entity-C', 'entity-a'].map((id) => ({
  n: { labels: ['Entity'], properties: { id } },
}));
const RELATIONSHIPS: FakeRow[] = ['rel-2', 'rel-10', 'rel-1'].map((id) => ({
  r: { type: 'DEPENDS_ON', properties: { id } },
  sourceId: 'api-a',
  targetId: 'entity-a',
}));

describe('graph reads are ordered by stable id (P8)', () => {
  it('getFullGraph returns the same order for the same graph, however rows arrive', async () => {
    const forward = await getFullGraph(driverReturning(NODES, RELATIONSHIPS), 'neo4j');
    const reversed = await getFullGraph(
      driverReturning([...NODES].reverse(), [...RELATIONSHIPS].reverse()),
      'neo4j',
    );
    expect(reversed).toEqual(forward);
    expect(forward.nodes.map((n) => n.id)).toEqual(['Entity-C', 'api-a', 'entity-a', 'entity-b']);
    expect(forward.relationships.map((r) => r.id)).toEqual(['rel-1', 'rel-10', 'rel-2']);
  });

  it('getRelationshipsForNode is ordered the same way', async () => {
    const forward = await getRelationshipsForNode(
      driverReturning([], RELATIONSHIPS),
      'neo4j',
      'api-a',
    );
    const reversed = await getRelationshipsForNode(
      driverReturning([], [...RELATIONSHIPS].reverse()),
      'neo4j',
      'api-a',
    );
    expect(reversed.map((r) => r.id)).toEqual(forward.map((r) => r.id));
    expect(forward.map((r) => r.id)).toEqual(['rel-1', 'rel-10', 'rel-2']);
  });
});

describe('getRelationshipEndpoints (P8 performance)', () => {
  it('runs ONE structural query — no node scan, no properties — and returns sorted endpoints', async () => {
    const cyphers: string[] = [];
    const session = {
      run: () => Promise.resolve({ records: [{ get: () => true }] }),
      executeRead: (work: (tx: unknown) => unknown) =>
        Promise.resolve(
          work({
            run: (cypher: string) => {
              cyphers.push(cypher);
              return Promise.resolve({
                records: [
                  { sourceId: 'b', targetId: 'c' },
                  { sourceId: 'a', targetId: 'b' },
                ].map((row) => ({ get: (key: 'sourceId' | 'targetId') => row[key] })),
              });
            },
          }),
        ),
      close: () => Promise.resolve(),
    };
    const driver = { session: () => session } as unknown as Driver;

    const endpoints = await getRelationshipEndpoints(driver, 'neo4j');
    expect(endpoints).toEqual([
      { sourceId: 'a', targetId: 'b' },
      { sourceId: 'b', targetId: 'c' },
    ]);
    expect(cyphers).toEqual([
      'MATCH (source)-[r]->(target) RETURN source.id AS sourceId, target.id AS targetId',
    ]);
  });
});
