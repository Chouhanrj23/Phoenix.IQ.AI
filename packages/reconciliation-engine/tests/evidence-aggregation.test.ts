import { describe, expect, it } from 'vitest';
import type { Evidence } from '@phoenix-ai/knowledge-graph';
import type { Claim } from '../src/claim.js';
import { aggregateEvidence, evidenceForClaims } from '../src/evidence-aggregation.js';

function evidence(id: string, sourceId: string, excerpt?: string): Evidence {
  return { id, sourceId, ...(excerpt === undefined ? {} : { excerpt }) };
}

describe('aggregateEvidence', () => {
  it('returns an empty array for no entries', () => {
    expect(aggregateEvidence([])).toEqual([]);
  });

  it('passes distinct entries through unchanged', () => {
    const a = evidence('ev-1', 'ticket://acme-jira/AUR', 'AUR-101 marked Done');
    const b = evidence('ev-2', 'docs://confluence/eng-status', 'still in progress');
    expect(aggregateEvidence([a, b])).toEqual([a, b]);
  });

  it('deduplicates entries sharing the same id, keeping the first occurrence', () => {
    const first = evidence('ev-1', 'ticket://acme-jira/AUR', 'first excerpt');
    const duplicate = evidence('ev-1', 'ticket://acme-jira/AUR', 'a different excerpt string');
    const result = aggregateEvidence([first, duplicate]);
    expect(result).toEqual([first]);
    expect(result).toHaveLength(1);
  });

  it('preserves first-occurrence order', () => {
    const c = evidence('ev-c', 'source-c');
    const a = evidence('ev-a', 'source-a');
    const b = evidence('ev-b', 'source-b');
    expect(aggregateEvidence([c, a, b]).map((entry) => entry.id)).toEqual(['ev-c', 'ev-a', 'ev-b']);
  });

  it('deduplicating across many repeats still keeps exactly one copy', () => {
    const entry = evidence('ev-1', 'ticket://acme-jira/AUR');
    const result = aggregateEvidence([entry, entry, entry, entry]);
    expect(result).toEqual([entry]);
  });
});

describe('evidenceForClaims', () => {
  function claim(overrides: Partial<Claim> = {}): Claim {
    return {
      subjectId: 'refund-feature',
      attribute: 'status',
      value: 'Done',
      claimCategory: 'intent',
      sourceId: 'ticket://acme-jira/AUR',
      sourceType: 'ticket',
      derivedBy: 'extraction-engine',
      derivedAt: '2026-09-08T00:00:00.000Z',
      evidence: [evidence('ev-1', 'ticket://acme-jira/AUR', 'AUR-101 marked Done')],
      ...overrides,
    };
  }

  it('aggregates evidence across multiple claims', () => {
    const first = claim();
    const second = claim({
      sourceId: 'ticket://other-tracker/AUR-1',
      evidence: [evidence('ev-2', 'ticket://other-tracker/AUR-1', 'mirrored: Done')],
    });
    const result = evidenceForClaims([first, second]);
    expect(result.map((entry) => entry.id)).toEqual(['ev-1', 'ev-2']);
  });

  it('deduplicates when two claims cite the exact same evidence entry', () => {
    const sharedEvidence = evidence('ev-shared', 'ticket://acme-jira/AUR');
    const first = claim({ evidence: [sharedEvidence] });
    const second = claim({ evidence: [sharedEvidence] });
    expect(evidenceForClaims([first, second])).toEqual([sharedEvidence]);
  });

  it('returns an empty array for claims with no evidence', () => {
    expect(evidenceForClaims([claim({ evidence: [] })])).toEqual([]);
  });

  it('returns an empty array for an empty claim list', () => {
    expect(evidenceForClaims([])).toEqual([]);
  });
});
