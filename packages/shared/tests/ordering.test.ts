import { describe, expect, it } from 'vitest';
import { compareCodeUnits } from '../src/ordering.js';

describe('compareCodeUnits (P8)', () => {
  const names = ['Zebra', 'Öl', 'apple', 'Apple', 'Aardvark', 'api-b', 'api_a', 'api.c'];

  it('orders by code unit, independent of any locale', () => {
    expect([...names].sort(compareCodeUnits)).toEqual([
      'Aardvark',
      'Apple',
      'Zebra',
      'api-b',
      'api.c',
      'api_a',
      'apple',
      'Öl',
    ]);
  });

  it('gives the same order whatever collation the host would have used', () => {
    const expected = [...names].sort(compareCodeUnits);
    for (const locale of ['en', 'da', 'sv', 'de', 'tr', 'ja']) {
      // The input order a locale-sorted upstream step might hand over:
      const handedOver = [...names].sort(new Intl.Collator(locale).compare);
      expect([...handedOver].sort(compareCodeUnits)).toEqual(expected);
    }
  });

  it('is a total order: antisymmetric and zero only for equal strings', () => {
    for (const a of names) {
      for (const b of names) {
        expect(Math.sign(compareCodeUnits(a, b)) + Math.sign(compareCodeUnits(b, a))).toBe(0);
        expect(compareCodeUnits(a, b) === 0).toBe(a === b);
      }
    }
  });
});
