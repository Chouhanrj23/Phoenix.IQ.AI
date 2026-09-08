import { describe, expect, it } from 'vitest';
import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import {
  validateSourceReferences,
  validateWorkItemObject,
  validateWorkItemRelationship,
} from '@phoenix-ai/knowledge-graph';
import { bridgeJiraArtifacts } from '../src/jira-bridge.js';

// Continues P6-02's Aurora/Jira fixture world (AUR project), grounded in the
// exact JSON shape `createJiraConnector`'s `read()` produces.

const SOURCE_ID = 'ticket://acme-jira/AUR';
const CAPTURED_AT = '2026-09-08T00:00:00.000Z';
const GENERATED_AT = '2026-09-08T01:00:00.000Z';

function artifact(path: string, content: unknown): RawArtifact {
  return {
    path,
    sourceId: SOURCE_ID,
    locator: `${SOURCE_ID}/${path}`,
    content: typeof content === 'string' ? content : JSON.stringify(content, null, 2),
    contentEncoding: 'utf-8',
    capturedAt: CAPTURED_AT,
  };
}

const EPIC = artifact('AUR-100', {
  key: 'AUR-100',
  summary: 'Partial refunds',
  description: '',
  issueType: 'Epic',
  status: 'In Progress',
  labels: [],
  issueLinks: [],
});

const STORY = artifact('AUR-101', {
  key: 'AUR-101',
  summary: 'Support partial refunds',
  description: 'Customers cannot request a partial refund.',
  issueType: 'Story',
  status: 'In Progress',
  priority: 'High',
  labels: ['checkout', 'payments'],
  createdAt: '2026-08-01T08:00:00.000Z',
  updatedAt: '2026-09-01T10:00:00.000Z',
  parentKey: 'AUR-100',
  issueLinks: [
    { type: 'blocks', direction: 'outward', targetKey: 'AUR-102' },
    // AUR-999 is never included in the batch — proves an unresolvable
    // target produces no dangling relationship rather than a broken one.
    { type: 'relates to', direction: 'outward', targetKey: 'AUR-999' },
  ],
});

const BUG = artifact('AUR-102', {
  key: 'AUR-102',
  summary: 'Refund exceeds order total',
  description: '',
  issueType: 'Bug',
  status: 'Done',
  labels: [],
  issueLinks: [{ type: 'is blocked by', direction: 'inward', targetKey: 'AUR-101' }],
});

const MALFORMED = artifact('AUR-103', 'not json at all');

const INCOMPLETE = artifact('AUR-104', { key: 'AUR-104', summary: 'Missing required fields' });

function bridge(artifacts: RawArtifact[] = [EPIC, STORY, BUG]) {
  return bridgeJiraArtifacts(artifacts, { systemId: 'aurora-commerce', generatedAt: GENERATED_AT });
}

describe('bridgeJiraArtifacts — objects', () => {
  it('bridges one WorkItemObject per issue, each passing the real validator', () => {
    const result = bridge();
    expect(result.objects).toHaveLength(3);
    for (const object of result.objects) {
      expect(validateWorkItemObject(object)).toEqual({ valid: true, errors: [] });
    }
  });

  it('uses the issue summary as the label, falling back to the key when summary is empty', () => {
    const result = bridge([
      artifact('AUR-105', {
        key: 'AUR-105',
        summary: '',
        description: '',
        issueType: 'Task',
        status: 'To Do',
        labels: [],
        issueLinks: [],
      }),
    ]);
    expect(result.objects[0]?.label).toBe('AUR-105');
  });

  it('carries issueType/status/labels/priority/description into attributes', () => {
    const result = bridge([STORY]);
    expect(result.objects[0]?.attributes).toMatchObject({
      issueType: 'Story',
      status: 'In Progress',
      labels: ['checkout', 'payments'],
      priority: 'High',
      description: 'Customers cannot request a partial refund.',
    });
  });

  it('reports the tracker-observed dates as attributes, distinct from identity.createdAt/updatedAt', () => {
    const result = bridge([STORY]);
    const object = result.objects[0];
    expect(object?.attributes.reportedCreatedAt).toBe('2026-08-01T08:00:00.000Z');
    expect(object?.attributes.reportedUpdatedAt).toBe('2026-09-01T10:00:00.000Z');
    // identity.createdAt/updatedAt answer "when did PHOENIX capture this",
    // which is GENERATED_AT, not the tracker's own dates.
    expect(object?.identity.createdAt).toBe(GENERATED_AT);
    expect(object?.identity.updatedAt).toBe(GENERATED_AT);
  });

  it('produces deterministic object ids — the same input yields the same id across runs', () => {
    const first = bridge([STORY]).objects[0]?.identity.id;
    const second = bridge([STORY]).objects[0]?.identity.id;
    expect(first).toBeDefined();
    expect(first).toBe(second);
  });

  it('builds evidence from the artifact itself, with the summary as the excerpt', () => {
    const result = bridge([STORY]);
    const evidence = result.objects[0]?.evidence[0];
    expect(evidence).toMatchObject({
      sourceId: SOURCE_ID,
      locator: `${SOURCE_ID}/AUR-101`,
      capturedAt: CAPTURED_AT,
      excerpt: 'Support partial refunds',
    });
  });
});

describe('bridgeJiraArtifacts — relationships', () => {
  it('bridges parentKey into a contains relationship, parent as source', () => {
    const result = bridge();
    const epicId = result.objects.find((o) => o.label === 'Partial refunds')?.identity.id;
    const storyId = result.objects.find((o) => o.label === 'Support partial refunds')?.identity.id;
    const contains = result.relationships.find((r) => r.kind === 'contains');
    expect(contains).toBeDefined();
    expect(contains?.sourceObjectId).toBe(epicId);
    expect(contains?.targetObjectId).toBe(storyId);
    expect(contains?.category).toBe('composition');
    expect(contains?.attributes).toEqual({ childIssueType: 'Story' });
    for (const relationship of result.relationships) {
      expect(validateWorkItemRelationship(relationship)).toEqual({ valid: true, errors: [] });
    }
  });

  it('bridges an issueLink into a relatesTo relationship, preserving the raw link type and direction', () => {
    const result = bridge();
    const storyId = result.objects.find((o) => o.label === 'Support partial refunds')?.identity.id;
    const bugId = result.objects.find((o) => o.label === 'Refund exceeds order total')?.identity.id;

    const outward = result.relationships.find(
      (r) => r.kind === 'relatesTo' && r.sourceObjectId === storyId,
    );
    expect(outward).toMatchObject({
      category: 'association',
      sourceObjectId: storyId,
      targetObjectId: bugId,
      attributes: { linkType: 'blocks', direction: 'outward' },
    });

    // The Bug's own inward-direction entry produces a second, independent
    // relationship row in the opposite direction — both are real, observed
    // facts, not deduplicated into one edge.
    const inward = result.relationships.find(
      (r) => r.kind === 'relatesTo' && r.sourceObjectId === bugId,
    );
    expect(inward).toMatchObject({
      sourceObjectId: bugId,
      targetObjectId: storyId,
      attributes: { linkType: 'is blocked by', direction: 'inward' },
    });
  });

  it('produces no relationship for a link target outside the batch', () => {
    const result = bridge();
    const dangling = result.relationships.some((r) =>
      Object.values(r.attributes ?? {}).includes('AUR-999'),
    );
    expect(dangling).toBe(false);
    // 1 contains + 2 relatesTo (outward blocks, inward is-blocked-by) = 3.
    expect(result.relationships).toHaveLength(3);
  });

  it('returns relationships sorted by id for deterministic output', () => {
    const result = bridge();
    const ids = result.relationships.map((r) => r.id);
    expect(ids).toEqual([...ids].sort((a, b) => a.localeCompare(b)));
  });

  it('produces relationships whose endpoints resolve against the bridged sources', () => {
    const result = bridge();
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
      objects: result.objects,
      relationships: result.relationships,
      sources: [{ id: SOURCE_ID, type: 'ticket' as const, label: 'Jira: AUR' }],
    };
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });
});

describe('bridgeJiraArtifacts — malformed input', () => {
  it('skips content that is not valid JSON, reporting it rather than throwing', () => {
    const result = bridge([EPIC, MALFORMED]);
    expect(result.objects).toHaveLength(1);
    expect(result.skipped).toEqual([
      { path: 'AUR-103', reason: 'unrecognised Jira issue content shape' },
    ]);
  });

  it('skips content missing required fields', () => {
    const result = bridge([INCOMPLETE]);
    expect(result.objects).toHaveLength(0);
    expect(result.skipped).toEqual([
      { path: 'AUR-104', reason: 'unrecognised Jira issue content shape' },
    ]);
  });

  it('does not abort the whole batch when one artifact is malformed', () => {
    const result = bridge([EPIC, STORY, BUG, MALFORMED]);
    expect(result.objects).toHaveLength(3);
    expect(result.skipped).toHaveLength(1);
  });
});
