import { describe, expect, it } from 'vitest';
import {
  validateConflictObject,
  validateSourceReferences,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import type { Claim } from '../src/claim.js';
import { reconcileClaims, rankConflicts } from '../src/reconcile.js';

const GENERATED_AT = '2026-09-08T02:00:00.000Z';

function evidence(sourceId: string, excerpt: string) {
  return [{ id: `ev-${sourceId}`, sourceId, excerpt }];
}

function options() {
  return { systemId: 'aurora-commerce', generatedAt: GENERATED_AT };
}

// The scenario the ticket itself describes: Jira (a "docs/tickets" source)
// says the refund feature is Done; a separate technical-doc source (an
// engineering status page) says it is still In Progress — a genuine,
// realistic contradiction between two independent evidence sources.

const JIRA_CLAIM: Claim = {
  subjectId: 'refund-feature',
  attribute: 'status',
  value: 'Done',
  claimCategory: 'intent',
  sourceId: 'ticket://acme-jira/AUR',
  sourceType: 'ticket',
  derivedBy: 'extraction-engine',
  derivedAt: GENERATED_AT,
  evidence: evidence('ticket://acme-jira/AUR', 'AUR-101 marked Done'),
};

const DOC_CLAIM: Claim = {
  subjectId: 'refund-feature',
  attribute: 'status',
  value: 'In Progress',
  claimCategory: 'intent',
  sourceId: 'docs://confluence/eng-status',
  sourceType: 'technical-doc',
  derivedBy: 'extraction-engine',
  derivedAt: GENERATED_AT,
  evidence: evidence('docs://confluence/eng-status', 'Refunds: still in progress as of last sync'),
};

describe('reconcileClaims — agreement', () => {
  it('produces one ReconciledClaim when every claim agrees', () => {
    const second: Claim = { ...JIRA_CLAIM, sourceId: 'ticket://acme-jira/AUR-mirror' };
    const result = reconcileClaims([JIRA_CLAIM, second], options());

    expect(result.conflicts).toEqual([]);
    expect(result.agreed).toHaveLength(1);
    expect(result.agreed[0]).toMatchObject({
      subjectId: 'refund-feature',
      attribute: 'status',
      claimCategory: 'intent',
      value: 'Done',
    });
  });

  it('gives high confidence to an authoritative claim corroborated by another independent source', () => {
    const second: Claim = { ...JIRA_CLAIM, sourceId: 'ticket://acme-jira/AUR-mirror' };
    const result = reconcileClaims([JIRA_CLAIM, second], options());
    expect(result.agreed[0]?.confidence.level).toBe('high');
  });

  it('gives medium confidence to a single authoritative claim with no corroboration', () => {
    const result = reconcileClaims([JIRA_CLAIM], options());
    expect(result.agreed[0]?.confidence.level).toBe('medium');
  });

  it('gives low confidence to a single weakly-authoritative claim', () => {
    const weak: Claim = { ...JIRA_CLAIM, claimCategory: 'structure', sourceType: 'ticket' };
    const result = reconcileClaims([weak], options());
    expect(result.agreed[0]?.confidence.level).toBe('low');
  });

  it('treats claims with the same subject/attribute but different claimCategory as separate groups', () => {
    const structureClaim: Claim = { ...JIRA_CLAIM, claimCategory: 'structure', value: 'Done' };
    const result = reconcileClaims([JIRA_CLAIM, structureClaim], options());
    // Same value, but two distinct groups (different claimCategory) — two
    // independent agreed entries, not one merged corroborated one.
    expect(result.agreed).toHaveLength(2);
    expect(result.conflicts).toEqual([]);
  });

  it('two claims for different subjects never interact', () => {
    const otherSubject: Claim = { ...JIRA_CLAIM, subjectId: 'other-feature', value: 'To Do' };
    const result = reconcileClaims([JIRA_CLAIM, otherSubject], options());
    expect(result.agreed).toHaveLength(2);
    expect(result.conflicts).toEqual([]);
  });
});

describe('reconcileClaims — conflict (FR-REC-04: retain both positions, never silently resolve)', () => {
  it('produces a real, valid ConflictObject when two sources disagree', () => {
    const result = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options());
    expect(result.agreed).toEqual([]);
    expect(result.conflicts).toHaveLength(1);

    const conflict = result.conflicts[0];
    expect(conflict).toBeDefined();
    if (conflict === undefined) return;
    expect(validateConflictObject(conflict)).toEqual({ valid: true, errors: [] });
  });

  it('retains BOTH positions verbatim, with their own sources and authority', () => {
    const [conflict] = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts;
    expect(conflict).toBeDefined();
    if (conflict === undefined) return;

    expect(conflict.attributes.subjectId).toBe('refund-feature');
    expect(conflict.attributes.attribute).toBe('status');
    expect(conflict.attributes.positions).toHaveLength(2);

    const done = conflict.attributes.positions.find((p) => p.value === 'Done');
    const inProgress = conflict.attributes.positions.find((p) => p.value === 'In Progress');
    expect(done?.sources).toEqual([
      { sourceId: 'ticket://acme-jira/AUR', sourceType: 'ticket', authority: 3 },
    ]);
    expect(inProgress?.sources).toEqual([
      { sourceId: 'docs://confluence/eng-status', sourceType: 'technical-doc', authority: 2 },
    ]);
  });

  it('gives each position its OWN differentiated confidence (P6-06), not a shared flat value', () => {
    const [conflict] = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts;
    expect(conflict).toBeDefined();
    if (conflict === undefined) return;

    const done = conflict.attributes.positions.find((p) => p.value === 'Done');
    const inProgress = conflict.attributes.positions.find((p) => p.value === 'In Progress');

    // A 1-vs-1 tie between an authority-3 and an authority-2 source: the
    // stronger side keeps "medium", the weaker one is "low" — see
    // confidence-scoring.test.ts for the underlying formula this exercises
    // end to end.
    expect(done?.confidence?.level).toBe('medium');
    expect(inProgress?.confidence?.level).toBe('low');
    expect(done?.confidence?.score).toBeGreaterThan(inProgress?.confidence?.score ?? 1);
  });

  it('never picks a winner — the conflict itself carries no settled value', () => {
    const [conflict] = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts;
    expect(conflict).toBeDefined();
    expect(conflict).not.toHaveProperty('value');
    expect(conflict?.attributes).not.toHaveProperty('value');
  });

  it('carries evidence from BOTH sides in the conflict object own evidence array', () => {
    const [conflict] = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts;
    const sourceIds = conflict?.evidence.map((e) => e.sourceId) ?? [];
    expect(sourceIds).toEqual(
      expect.arrayContaining(['ticket://acme-jira/AUR', 'docs://confluence/eng-status']),
    );
  });

  it('records provenance for every distinct contributing source', () => {
    const [conflict] = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts;
    expect(conflict?.metadata.provenance).toHaveLength(2);
  });

  it('groups more than two disagreeing sources into one conflict with more than two positions', () => {
    const thirdOpinion: Claim = {
      ...DOC_CLAIM,
      value: 'Blocked',
      sourceId: 'log://ops/incident-42',
      sourceType: 'log',
    };
    const result = reconcileClaims([JIRA_CLAIM, DOC_CLAIM, thirdOpinion], options());
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0]?.attributes.positions).toHaveLength(3);
  });

  it('groups agreeing sources within a conflict into a single shared position', () => {
    const secondJiraLikeSource: Claim = { ...JIRA_CLAIM, sourceId: 'ticket://other-tracker/AUR-1' };
    const result = reconcileClaims([JIRA_CLAIM, secondJiraLikeSource, DOC_CLAIM], options());
    expect(result.conflicts).toHaveLength(1);
    const done = result.conflicts[0]?.attributes.positions.find((p) => p.value === 'Done');
    expect(done?.sources).toHaveLength(2);
  });

  it('a corroborated majority position keeps "medium" confidence rather than being crushed to "low"', () => {
    const secondJiraLikeSource: Claim = { ...JIRA_CLAIM, sourceId: 'ticket://other-tracker/AUR-1' };
    const result = reconcileClaims([JIRA_CLAIM, secondJiraLikeSource, DOC_CLAIM], options());
    const done = result.conflicts[0]?.attributes.positions.find((p) => p.value === 'Done');
    // 2 supporting vs. 1 contradicting — a clear majority, but the dispute
    // is still live, so "high" is never claimed (see confidence-scoring.ts).
    expect(done?.confidence?.level).toBe('medium');
  });

  it('is deterministic — the same claims produce the same conflict id across runs', () => {
    const first = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts[0]?.identity.id;
    const second = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts[0]?.identity.id;
    expect(first).toBeDefined();
    expect(first).toBe(second);
  });

  it('the conflict resolves against a real Source registry via validateSourceReferences', () => {
    const [conflict] = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts;
    if (conflict === undefined) throw new Error('expected a conflict');

    const sources: Source[] = [
      { id: 'ticket://acme-jira/AUR', type: 'ticket', label: 'Jira: AUR' },
      {
        id: 'docs://confluence/eng-status',
        type: 'technical-doc',
        label: 'Confluence: Eng Status',
      },
    ];
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
      objects: [conflict],
      relationships: [],
      sources,
    };
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });
});

describe('rankConflicts (FR-REC-05: prioritised for review)', () => {
  it('ranks a conflict with more disputed positions ahead of one with fewer', () => {
    const twoWay = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts[0];
    const threeWayClaims: Claim[] = [
      { ...JIRA_CLAIM, subjectId: 'other-feature' },
      { ...DOC_CLAIM, subjectId: 'other-feature' },
      {
        ...DOC_CLAIM,
        subjectId: 'other-feature',
        value: 'Blocked',
        sourceId: 'log://ops/1',
        sourceType: 'log',
      },
    ];
    const threeWay = reconcileClaims(threeWayClaims, options()).conflicts[0];
    if (twoWay === undefined || threeWay === undefined) throw new Error('expected both conflicts');

    const ranked = rankConflicts([twoWay, threeWay]);
    expect(ranked[0]?.identity.id).toBe(threeWay.identity.id);
  });

  it('is a pure sort — does not mutate its input array', () => {
    const conflicts = reconcileClaims([JIRA_CLAIM, DOC_CLAIM], options()).conflicts;
    const copy = [...conflicts];
    rankConflicts(conflicts);
    expect(conflicts).toEqual(copy);
  });
});
