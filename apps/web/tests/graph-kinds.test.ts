import { describe, expect, it } from 'vitest';
import { orderGraphKinds } from '../src/lib/graph-kinds.js';

describe('orderGraphKinds (P8) — the Graph Explorer never hides a kind the API returned', () => {
  const ORDER = ['System', 'Container', 'Entity', 'Api'];

  it('keeps known kinds in the curated order, and only those present', () => {
    expect(orderGraphKinds(['Api', 'System', 'Api'], ORDER)).toEqual(['System', 'Api']);
  });

  it('appends kinds missing from the curated list instead of filtering them out', () => {
    expect(orderGraphKinds(['ReviewDecision', 'Api', 'Conflict'], ORDER)).toEqual([
      'Api',
      'Conflict',
      'ReviewDecision',
    ]);
  });

  it('is deterministic regardless of node order', () => {
    expect(orderGraphKinds(['Zeta', 'Alpha', 'Entity'], ORDER)).toEqual(
      orderGraphKinds(['Entity', 'Alpha', 'Zeta'], ORDER),
    );
  });
});
