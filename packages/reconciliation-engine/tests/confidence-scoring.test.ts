import { describe, expect, it } from 'vitest';
import { computeConfidence } from '../src/confidence-scoring.js';

describe('computeConfidence — uncontested (FR-REC-02, no live dispute)', () => {
  it('gives high confidence to an authoritative source corroborated by another', () => {
    const confidence = computeConfidence({ supportingAuthority: 3, supportingSources: 2 });
    expect(confidence.level).toBe('high');
  });

  it('gives medium confidence to a single authoritative source with no corroboration', () => {
    const confidence = computeConfidence({ supportingAuthority: 3, supportingSources: 1 });
    expect(confidence.level).toBe('medium');
  });

  it('gives medium confidence to a moderately-authoritative source corroborated by another', () => {
    const confidence = computeConfidence({ supportingAuthority: 2, supportingSources: 2 });
    expect(confidence.level).toBe('medium');
  });

  it('gives low confidence to a single moderately-authoritative source', () => {
    const confidence = computeConfidence({ supportingAuthority: 2, supportingSources: 1 });
    expect(confidence.level).toBe('low');
  });

  it('gives low confidence to a single weak source, however many times corroborated', () => {
    expect(computeConfidence({ supportingAuthority: 1, supportingSources: 1 }).level).toBe('low');
    expect(computeConfidence({ supportingAuthority: 1, supportingSources: 5 }).level).toBe('low');
  });

  it('defaults contradictingSources to 0 — omitting it is the same as passing 0', () => {
    const omitted = computeConfidence({ supportingAuthority: 3, supportingSources: 1 });
    const explicit = computeConfidence({
      supportingAuthority: 3,
      supportingSources: 1,
      contradictingSources: 0,
    });
    expect(omitted).toEqual(explicit);
  });

  it('score increases with authority', () => {
    const weak = computeConfidence({ supportingAuthority: 1, supportingSources: 1 });
    const moderate = computeConfidence({ supportingAuthority: 2, supportingSources: 1 });
    const strong = computeConfidence({ supportingAuthority: 3, supportingSources: 1 });
    expect(weak.score).toBeLessThan(moderate.score);
    expect(moderate.score).toBeLessThan(strong.score);
  });

  it('score increases (up to a cap) with corroboration', () => {
    const one = computeConfidence({ supportingAuthority: 2, supportingSources: 1 });
    const two = computeConfidence({ supportingAuthority: 2, supportingSources: 2 });
    const many = computeConfidence({ supportingAuthority: 2, supportingSources: 10 });
    expect(one.score).toBeLessThan(two.score);
    // The corroboration bonus is capped at 0.15 — five vs. ten corroborating
    // sources should not keep pushing the score up indefinitely.
    const five = computeConfidence({ supportingAuthority: 2, supportingSources: 5 });
    expect(many.score).toBe(five.score);
  });

  it('score never exceeds 1', () => {
    const confidence = computeConfidence({ supportingAuthority: 3, supportingSources: 100 });
    expect(confidence.score).toBeLessThanOrEqual(1);
  });

  it('throws for zero or negative supportingSources rather than fabricating a result', () => {
    expect(() => computeConfidence({ supportingAuthority: 3, supportingSources: 0 })).toThrow(
      'computeConfidence requires at least one supporting source',
    );
  });
});

describe('computeConfidence — contested (P6-06: a real, differentiated result per position)', () => {
  it('never returns "high" when there is any contradicting source, however authoritative', () => {
    const confidence = computeConfidence({
      supportingAuthority: 3,
      supportingSources: 5,
      contradictingSources: 1,
    });
    expect(confidence.level).not.toBe('high');
  });

  it('a 1-vs-1 tie between an authoritative and a moderate source keeps the stronger side at "medium"', () => {
    // The exact scenario the ticket describes: a Jira claim (authority 3)
    // against a single technical-doc claim (authority 2).
    const strongerSide = computeConfidence({
      supportingAuthority: 3,
      supportingSources: 1,
      contradictingSources: 1,
    });
    expect(strongerSide.level).toBe('medium');
  });

  it('the weaker side of that same tie is "low", not equal to the stronger side', () => {
    const weakerSide = computeConfidence({
      supportingAuthority: 2,
      supportingSources: 1,
      contradictingSources: 1,
    });
    expect(weakerSide.level).toBe('low');
  });

  it('an outnumbered position (more contradicting sources than supporting) is capped to "low"', () => {
    const outnumbered = computeConfidence({
      supportingAuthority: 3,
      supportingSources: 1,
      contradictingSources: 3,
    });
    expect(outnumbered.level).toBe('low');
  });

  it('a clear majority position keeps "medium" rather than being crushed to "low"', () => {
    const majority = computeConfidence({
      supportingAuthority: 3,
      supportingSources: 3,
      contradictingSources: 1,
    });
    expect(majority.level).toBe('medium');
  });

  it('score is strictly lower when contested than the identical uncontested case', () => {
    const uncontested = computeConfidence({ supportingAuthority: 3, supportingSources: 1 });
    const contested = computeConfidence({
      supportingAuthority: 3,
      supportingSources: 1,
      contradictingSources: 1,
    });
    expect(contested.score).toBeLessThan(uncontested.score);
  });

  it('score drops further as the proportion of contradicting evidence grows', () => {
    const oneAgainstOne = computeConfidence({
      supportingAuthority: 3,
      supportingSources: 1,
      contradictingSources: 1,
    });
    const oneAgainstThree = computeConfidence({
      supportingAuthority: 3,
      supportingSources: 1,
      contradictingSources: 3,
    });
    expect(oneAgainstThree.score).toBeLessThan(oneAgainstOne.score);
  });

  it('score never drops below 0', () => {
    const confidence = computeConfidence({
      supportingAuthority: 1,
      supportingSources: 1,
      contradictingSources: 100,
    });
    expect(confidence.score).toBeGreaterThanOrEqual(0);
  });
});
