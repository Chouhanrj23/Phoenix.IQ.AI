import { describe, expect, it } from 'vitest';
import type { SourceType } from '@phoenix-ai/shared';
import { CANONICAL_SCHEMA_VERSION, type WorkItemObject } from '@phoenix-ai/knowledge-graph';
import {
  CLAIM_CATEGORIES,
  SOURCE_TYPE_AUTHORITY,
  authorityOf,
  claimFromObject,
} from '../src/claim.js';

const SOURCE_TYPES: SourceType[] = [
  'source-code',
  'technical-doc',
  'business-doc',
  'ticket',
  'log',
  'data-model',
  'test',
  'recording',
  'other',
];

describe('SOURCE_TYPE_AUTHORITY', () => {
  it('scores every SourceType for every claim category — no silent gaps', () => {
    for (const category of CLAIM_CATEGORIES) {
      for (const sourceType of SOURCE_TYPES) {
        const authority = SOURCE_TYPE_AUTHORITY[category][sourceType];
        expect([1, 2, 3]).toContain(authority);
      }
    }
  });

  it('matches FR-REC-01 literally: code is authoritative for structure', () => {
    expect(authorityOf('structure', 'source-code')).toBe(3);
  });

  it('matches FR-REC-01 literally: logs are authoritative for behaviour', () => {
    expect(authorityOf('behaviour', 'log')).toBe(3);
  });

  it('matches FR-REC-01 literally: docs/tickets are authoritative for intent', () => {
    expect(authorityOf('intent', 'ticket')).toBe(3);
    expect(authorityOf('intent', 'business-doc')).toBe(3);
  });

  it('a source can be authoritative for one category and weak for another', () => {
    expect(authorityOf('structure', 'ticket')).toBeLessThan(authorityOf('intent', 'ticket'));
    expect(authorityOf('intent', 'source-code')).toBeLessThan(
      authorityOf('structure', 'source-code'),
    );
  });
});

describe('claimFromObject', () => {
  function workItem(): WorkItemObject {
    return {
      identity: {
        id: 'wi-aur-101',
        systemId: 'aurora-commerce',
        createdAt: '2026-09-08T00:00:00.000Z',
        updatedAt: '2026-09-08T00:00:00.000Z',
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      },
      category: 'entity',
      kind: 'workitem.issue',
      label: 'Support partial refunds',
      attributes: { issueType: 'Story', status: 'Done', labels: ['checkout'] },
      metadata: {
        provenance: [
          {
            sourceId: 'ticket://acme-jira/AUR',
            sourceType: 'ticket',
            derivedBy: 'extraction-engine',
            derivedAt: '2026-09-08T00:00:00.000Z',
          },
        ],
        confidence: { level: 'high' },
      },
      evidence: [
        {
          id: 'ev-1',
          sourceId: 'ticket://acme-jira/AUR',
          locator: 'ticket://acme-jira/AUR/AUR-101',
          excerpt: 'Support partial refunds',
        },
      ],
      confidenceDetail: { basis: 'observed' },
    };
  }

  it('extracts a claim from an already-bridged object, reusing its own provenance/evidence', () => {
    const claim = claimFromObject(workItem(), 'status', 'intent', 'refund-feature');
    expect(claim).toEqual({
      subjectId: 'refund-feature',
      attribute: 'status',
      value: 'Done',
      claimCategory: 'intent',
      sourceId: 'ticket://acme-jira/AUR',
      sourceType: 'ticket',
      derivedBy: 'extraction-engine',
      derivedAt: '2026-09-08T00:00:00.000Z',
      evidence: workItem().evidence,
    });
  });

  it('returns undefined for an attribute the object does not have', () => {
    expect(claimFromObject(workItem(), 'assignee', 'intent', 'refund-feature')).toBeUndefined();
  });

  it('returns undefined for an object with no provenance entries', () => {
    const object = { ...workItem(), metadata: { ...workItem().metadata, provenance: [] } };
    expect(claimFromObject(object, 'status', 'intent', 'refund-feature')).toBeUndefined();
  });
});
