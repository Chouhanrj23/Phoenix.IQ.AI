import { describe, expect, it } from 'vitest';
import type { WorkItemObject, WorkItemRelationship } from '../src/workitem.js';
import {
  WORKITEM_OBJECT_KINDS,
  WORKITEM_RELATIONSHIP_KINDS,
  validateWorkItemObject,
  validateWorkItemRelationship,
} from '../src/workitem.js';
import { validateCanonicalKnowledgeBundle } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function meta() {
  return {
    provenance: [
      {
        sourceId: 'ticket://acme-jira/AUR',
        sourceType: 'ticket' as const,
        derivedBy: 'extraction-engine',
        derivedAt: '2026-09-08T00:00:00.000Z',
      },
    ],
    confidence: { level: 'high' as const },
  };
}

function baseIdentity(id: string) {
  return {
    id,
    systemId: 'aurora-commerce',
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  };
}

function epicObject(): WorkItemObject {
  return {
    identity: baseIdentity('wi-aur-100'),
    category: 'entity',
    kind: 'workitem.issue',
    label: 'Partial refunds',
    attributes: { issueType: 'Epic', status: 'In Progress', labels: [] },
    metadata: meta(),
    evidence: [],
    confidenceDetail: { basis: 'observed' },
  };
}

function storyObject(): WorkItemObject {
  return {
    identity: baseIdentity('wi-aur-101'),
    category: 'entity',
    kind: 'workitem.issue',
    label: 'Support partial refunds',
    attributes: {
      issueType: 'Story',
      status: 'In Progress',
      labels: ['checkout', 'payments'],
      priority: 'High',
      description: 'Customers cannot request a partial refund.',
    },
    metadata: meta(),
    evidence: [],
    confidenceDetail: { basis: 'observed' },
  };
}

function containsRelationship(): WorkItemRelationship {
  return {
    id: 'rel-epic-contains-story',
    category: 'composition',
    kind: 'contains',
    sourceObjectId: 'wi-aur-100',
    targetObjectId: 'wi-aur-101',
    attributes: { childIssueType: 'Story' },
    metadata: meta(),
    confidenceDetail: { basis: 'observed' },
  };
}

function relatesToRelationship(): WorkItemRelationship {
  return {
    id: 'rel-story-blocks-bug',
    category: 'association',
    kind: 'relatesTo',
    sourceObjectId: 'wi-aur-101',
    targetObjectId: 'wi-aur-102',
    attributes: { linkType: 'blocks', direction: 'outward' },
    metadata: meta(),
    confidenceDetail: { basis: 'observed' },
  };
}

describe('WORKITEM_OBJECT_KINDS / WORKITEM_RELATIONSHIP_KINDS', () => {
  it('declares exactly one object kind and reuses two existing relationship kinds', () => {
    expect(WORKITEM_OBJECT_KINDS).toEqual(['workitem.issue']);
    expect(WORKITEM_RELATIONSHIP_KINDS).toEqual(['contains', 'relatesTo']);
  });
});

describe('validateWorkItemObject', () => {
  it('accepts a valid work item object', () => {
    expect(validateWorkItemObject(storyObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a work item with an empty labels array', () => {
    expect(validateWorkItemObject(epicObject())).toEqual({ valid: true, errors: [] });
  });

  it('rejects a category other than "entity"', () => {
    const object = { ...storyObject(), category: 'process' as const };
    expect(validateWorkItemObject(object).errors).toContain(
      'category must be "entity" for a work item object',
    );
  });

  it('rejects a kind other than "workitem.issue"', () => {
    const object = { ...storyObject(), kind: 'workitem.epic' };
    expect(validateWorkItemObject(object).errors).toContain('kind must be "workitem.issue"');
  });

  it('requires attributes.issueType', () => {
    const object = storyObject();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it
    const { issueType: _issueType, ...withoutIssueType } = object.attributes;
    expect(validateWorkItemObject({ ...object, attributes: withoutIssueType }).errors).toContain(
      'attributes.issueType is required',
    );
  });

  it('requires attributes.status', () => {
    const object = storyObject();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it
    const { status: _status, ...withoutStatus } = object.attributes;
    expect(validateWorkItemObject({ ...object, attributes: withoutStatus }).errors).toContain(
      'attributes.status is required',
    );
  });

  it('requires attributes.labels to be an array', () => {
    const object = storyObject();
    expect(
      validateWorkItemObject({
        ...object,
        attributes: { ...object.attributes, labels: 'checkout' },
      }).errors,
    ).toContain('attributes.labels must be an array (may be empty)');
  });

  it('rejects a non-string labels entry', () => {
    const object = storyObject();
    expect(
      validateWorkItemObject({
        ...object,
        attributes: { ...object.attributes, labels: ['checkout', 42] },
      }).errors,
    ).toContain('attributes.labels entries must all be strings');
  });

  it('still runs the base canonical-object checks (e.g. identity)', () => {
    const object = storyObject();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it
    const { identity: _identity, ...withoutIdentity } = object;
    expect(validateWorkItemObject(withoutIdentity).errors).toContain('identity is required');
  });
});

describe('validateWorkItemRelationship', () => {
  it('accepts a valid contains relationship', () => {
    expect(validateWorkItemRelationship(containsRelationship())).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('accepts a valid relatesTo relationship', () => {
    expect(validateWorkItemRelationship(relatesToRelationship())).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects an unknown kind', () => {
    const relationship = { ...containsRelationship(), kind: 'blocks' };
    expect(validateWorkItemRelationship(relationship).errors).toContain(
      'kind must be one of: contains, relatesTo',
    );
  });

  it('requires category "composition" for kind "contains"', () => {
    const relationship = { ...containsRelationship(), category: 'association' as const };
    expect(validateWorkItemRelationship(relationship).errors).toContain(
      'category must be "composition" for relationship kind "contains"',
    );
  });

  it('requires category "association" for kind "relatesTo"', () => {
    const relationship = { ...relatesToRelationship(), category: 'composition' as const };
    expect(validateWorkItemRelationship(relationship).errors).toContain(
      'category must be "association" for relationship kind "relatesTo"',
    );
  });
});

describe('end to end — a work item bundle validates as a whole', () => {
  it('assembles Epic/Story/Bug objects and their relationships into a valid bundle', () => {
    const bugObject: WorkItemObject = {
      identity: baseIdentity('wi-aur-102'),
      category: 'entity',
      kind: 'workitem.issue',
      label: 'Refund exceeds order total',
      attributes: { issueType: 'Bug', status: 'Done', labels: [] },
      metadata: meta(),
      evidence: [],
      confidenceDetail: { basis: 'observed' },
    };

    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-09-08T00:00:00.000Z',
      objects: [epicObject(), storyObject(), bugObject],
      relationships: [containsRelationship(), relatesToRelationship()],
    };

    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });
});
