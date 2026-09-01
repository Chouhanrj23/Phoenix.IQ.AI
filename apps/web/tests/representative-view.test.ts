import { describe, expect, it } from 'vitest';
import { selectRepresentativeNodes } from '../src/lib/representative-view.js';
import type { GraphEdge, GraphNode } from '../src/data/index.js';

function node(
  id: string,
  kind: string,
  confidenceLevel: GraphNode['confidenceLevel'] = 'high',
): GraphNode {
  return { id, label: id, kind, confidenceLevel };
}

function edge(id: string, source: string, target: string): GraphEdge {
  return { id, source, target };
}

describe('selectRepresentativeNodes (PC-07)', () => {
  it('never trims a small dataset — every node of an active kind is shown when below the limit', () => {
    const nodes = [node('a', 'Entity'), node('b', 'Entity'), node('c', 'Entity')];
    const result = selectRepresentativeNodes(nodes, [], new Set(['Entity']), 6, false);
    expect(result.shownCount).toBe(3);
    expect(result.totalCount).toBe(3);
    expect(result.visibleNodesByKind.get('Entity')).toHaveLength(3);
  });

  it('caps a large dataset per kind, while totalCount always reflects the REAL, uncapped count (nothing deleted)', () => {
    const nodes = Array.from({ length: 50 }, (_, i) => node(`e${i}`, 'Entity'));
    const result = selectRepresentativeNodes(nodes, [], new Set(['Entity']), 6, false);
    expect(result.shownCount).toBe(6);
    expect(result.totalCount).toBe(50); // the real count is preserved, not silently dropped
    expect(result.visibleNodesByKind.get('Entity')).toHaveLength(6);
  });

  it('prioritizes nodes that participate in a real relationship over isolated ones when a kind must be trimmed', () => {
    const nodes = [
      node('isolated-1', 'Entity'),
      node('isolated-2', 'Entity'),
      node('connected-1', 'Entity'),
      node('connected-2', 'Entity'),
    ];
    const edges = [edge('e1', 'connected-1', 'x'), edge('e2', 'y', 'connected-2')];
    const result = selectRepresentativeNodes(nodes, edges, new Set(['Entity']), 2, false);
    const shownIds = result.visibleNodesByKind
      .get('Entity')!
      .map((n) => n.id)
      .sort();
    expect(shownIds).toEqual(['connected-1', 'connected-2']);
  });

  it('"show all" reveals every real node with zero loss, regardless of the limit', () => {
    const nodes = Array.from({ length: 20 }, (_, i) => node(`e${i}`, 'Entity'));
    const result = selectRepresentativeNodes(nodes, [], new Set(['Entity']), 6, true);
    expect(result.shownCount).toBe(20);
    expect(result.totalCount).toBe(20);
  });

  it('caps independently per kind — a large Entity set does not starve a small Persona set', () => {
    const nodes = [
      ...Array.from({ length: 30 }, (_, i) => node(`e${i}`, 'Entity')),
      node('p1', 'Persona'),
      node('p2', 'Persona'),
    ];
    const result = selectRepresentativeNodes(nodes, [], new Set(['Entity', 'Persona']), 6, false);
    expect(result.visibleNodesByKind.get('Entity')).toHaveLength(6);
    expect(result.visibleNodesByKind.get('Persona')).toHaveLength(2); // below the limit, shown in full
  });

  it('excludes kinds that are not active, from both the shown and total counts', () => {
    const nodes = [node('a', 'Entity'), node('b', 'Api')];
    const result = selectRepresentativeNodes(nodes, [], new Set(['Entity']), 6, false);
    expect(result.totalCount).toBe(1);
    expect(result.visibleNodesByKind.has('Api')).toBe(false);
  });

  it('handles an empty graph without throwing (no data)', () => {
    const result = selectRepresentativeNodes([], [], new Set(), 6, false);
    expect(result.shownCount).toBe(0);
    expect(result.totalCount).toBe(0);
    expect(result.visibleNodesByKind.size).toBe(0);
  });

  it('is deterministic — repeated calls over the same input produce the same selection', () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(`e${i}`, 'Entity'));
    const first = selectRepresentativeNodes(nodes, [], new Set(['Entity']), 6, false);
    const second = selectRepresentativeNodes(nodes, [], new Set(['Entity']), 6, false);
    expect(first.visibleNodesByKind.get('Entity')!.map((n) => n.id)).toEqual(
      second.visibleNodesByKind.get('Entity')!.map((n) => n.id),
    );
  });
});
