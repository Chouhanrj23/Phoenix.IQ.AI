import { describe, expect, it } from 'vitest';
import type { Confidence } from '@phoenix-ai/shared';
import { boundCompositeConfidence } from '../src/composite-confidence.js';

describe('boundCompositeConfidence (FR-REC-03)', () => {
  it('returns the single constituent when there is only one', () => {
    const only: Confidence = { level: 'high', score: 0.9 };
    expect(boundCompositeConfidence([only])).toBe(only);
  });

  it('returns the weakest of several constituents by level', () => {
    const high: Confidence = { level: 'high', score: 0.95 };
    const low: Confidence = { level: 'low', score: 0.4 };
    const medium: Confidence = { level: 'medium', score: 0.7 };
    expect(boundCompositeConfidence([high, low, medium])).toBe(low);
  });

  it('a composite is never MORE confident than its weakest part, regardless of order', () => {
    const high: Confidence = { level: 'high' };
    const low: Confidence = { level: 'low' };
    expect(boundCompositeConfidence([low, high]).level).toBe('low');
    expect(boundCompositeConfidence([high, low]).level).toBe('low');
  });

  it('treats "inferred" as weaker than "low" — the legacy conflated level', () => {
    const inferred: Confidence = { level: 'inferred' };
    const low: Confidence = { level: 'low' };
    expect(boundCompositeConfidence([low, inferred])).toBe(inferred);
  });

  it('breaks a tie on level by the lower score', () => {
    const lowerScore: Confidence = { level: 'medium', score: 0.5 };
    const higherScore: Confidence = { level: 'medium', score: 0.8 };
    expect(boundCompositeConfidence([higherScore, lowerScore])).toBe(lowerScore);
  });

  it('does not let a missing score win a tiebreak — absence is not evidence of low confidence', () => {
    const withScore: Confidence = { level: 'medium', score: 0.3 };
    const withoutScore: Confidence = { level: 'medium' };
    expect(boundCompositeConfidence([withoutScore, withScore])).toBe(withScore);
  });

  it('throws for an empty constituent list rather than fabricating a confidence', () => {
    expect(() => boundCompositeConfidence([])).toThrow(
      'boundCompositeConfidence requires at least one constituent confidence',
    );
  });
});
