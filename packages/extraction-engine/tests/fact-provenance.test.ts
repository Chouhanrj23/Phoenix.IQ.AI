import { describe, expect, it } from 'vitest';
import { stampFactProvenance, type FactProvenance } from '../src/fact-provenance.js';

const PROVENANCE: FactProvenance = {
  sourceId: 'repo://aurora-commerce/services/checkout',
  sourceVersion: 'abc1234',
  derivedBy: 'extraction-engine',
  derivedAt: '2026-08-18T00:00:00.000Z',
};

describe('stampFactProvenance', () => {
  it('attaches provenance to a flat object carrying a path', () => {
    const fact = { path: 'Foo.java', startLine: 3, name: 'Foo' };
    expect(stampFactProvenance(fact, PROVENANCE)).toEqual({ ...fact, provenance: PROVENANCE });
  });

  it('recurses into nested objects and arrays, stamping every path-bearing node', () => {
    const type = {
      path: 'Foo.java',
      startLine: 1,
      simpleName: 'Foo',
      fields: [{ path: 'Foo.java', startLine: 2, name: 'id' }],
      nestedTypes: [
        {
          path: 'Foo.java',
          startLine: 5,
          simpleName: 'Nested',
          fields: [{ path: 'Foo.java', startLine: 6, name: 'count' }],
        },
      ],
    };

    const stamped = stampFactProvenance(type, PROVENANCE);

    expect(stamped.provenance).toEqual(PROVENANCE);
    expect(stamped.fields[0]?.provenance).toEqual(PROVENANCE);
    expect(stamped.nestedTypes[0]?.provenance).toEqual(PROVENANCE);
    expect(stamped.nestedTypes[0]?.fields[0]?.provenance).toEqual(PROVENANCE);
  });

  it('stamps a call fact whose location lives on a nested span object', () => {
    const call = {
      calleeName: 'find',
      unresolved: false,
      span: { path: 'Foo.java', startLine: 4 },
    };

    const stamped = stampFactProvenance(call, PROVENANCE);

    expect(stamped.span.provenance).toEqual(PROVENANCE);
    expect(stamped).not.toHaveProperty('provenance');
  });

  it('leaves an object with no path property unstamped, at any depth', () => {
    const attribute = { raw: '"x"', resolved: true, value: 'x' };
    expect(stampFactProvenance(attribute, PROVENANCE)).toEqual(attribute);
    expect(stampFactProvenance(attribute, PROVENANCE)).not.toHaveProperty('provenance');
  });

  it('does not mutate its input', () => {
    const fact = { path: 'Foo.java', startLine: 1 };
    const original = { ...fact };
    stampFactProvenance(fact, PROVENANCE);
    expect(fact).toEqual(original);
  });

  it('handles a top-level array of facts', () => {
    const facts = [
      { path: 'A.java', startLine: 1 },
      { path: 'B.java', startLine: 2 },
    ];
    const stamped = stampFactProvenance(facts, PROVENANCE);
    expect(stamped[0]?.provenance).toEqual(PROVENANCE);
    expect(stamped[1]?.provenance).toEqual(PROVENANCE);
  });

  it('produces the exact same provenance reference at every stamped node (no per-node duplication cost)', () => {
    const facts = [
      { path: 'A.java', startLine: 1 },
      { path: 'B.java', startLine: 2 },
    ];
    const stamped = stampFactProvenance(facts, PROVENANCE);
    expect(stamped[0]?.provenance).toBe(PROVENANCE);
    expect(stamped[1]?.provenance).toBe(PROVENANCE);
  });
});
