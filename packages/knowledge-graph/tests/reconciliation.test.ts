import { describe, expect, it } from 'vitest';
import type { ConflictObject } from '../src/reconciliation.js';
import { RECONCILIATION_OBJECT_KINDS, validateConflictObject } from '../src/reconciliation.js';
import { validateCanonicalKnowledgeBundle } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function baseIdentity(id: string) {
  return {
    id,
    systemId: 'aurora-commerce',
    createdAt: '2026-09-08T00:00:00.000Z',
    updatedAt: '2026-09-08T00:00:00.000Z',
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  };
}

function statusConflict(): ConflictObject {
  return {
    identity: baseIdentity('conflict-aur-101-status'),
    category: 'observation',
    kind: 'reconciliation.conflict',
    label: 'Conflicting claims for "status" of aur-101',
    attributes: {
      subjectId: 'aur-101',
      attribute: 'status',
      claimCategory: 'intent',
      positions: [
        {
          value: 'Done',
          sources: [{ sourceId: 'ticket://acme-jira/AUR', sourceType: 'ticket', authority: 3 }],
        },
        {
          value: 'In Progress',
          sources: [
            {
              sourceId: 'docs://confluence/refund-notes',
              sourceType: 'technical-doc',
              authority: 2,
            },
          ],
        },
      ],
    },
    metadata: {
      provenance: [
        {
          sourceId: 'ticket://acme-jira/AUR',
          sourceType: 'ticket',
          derivedBy: 'reconciliation-engine',
          derivedAt: '2026-09-08T00:00:00.000Z',
        },
        {
          sourceId: 'docs://confluence/refund-notes',
          sourceType: 'technical-doc',
          derivedBy: 'reconciliation-engine',
          derivedAt: '2026-09-08T00:00:00.000Z',
        },
      ],
      confidence: { level: 'high' },
    },
    evidence: [],
    confidenceDetail: { basis: 'observed' },
  };
}

describe('RECONCILIATION_OBJECT_KINDS', () => {
  it('declares exactly one object kind', () => {
    expect(RECONCILIATION_OBJECT_KINDS).toEqual(['reconciliation.conflict']);
  });
});

describe('validateConflictObject', () => {
  it('accepts a valid conflict with two positions', () => {
    expect(validateConflictObject(statusConflict())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a conflict with more than two positions', () => {
    const conflict = statusConflict();
    conflict.attributes.positions.push({
      value: 'Blocked',
      sources: [{ sourceId: 'log://ops/incident-42', sourceType: 'log', authority: 1 }],
    });
    expect(validateConflictObject(conflict)).toEqual({ valid: true, errors: [] });
  });

  it('rejects a category other than "observation"', () => {
    const object = { ...statusConflict(), category: 'entity' as const };
    expect(validateConflictObject(object).errors).toContain(
      'category must be "observation" for a conflict object',
    );
  });

  it('rejects a kind other than "reconciliation.conflict"', () => {
    const object = { ...statusConflict(), kind: 'reconciliation.dispute' };
    expect(validateConflictObject(object).errors).toContain(
      'kind must be "reconciliation.conflict"',
    );
  });

  it('requires attributes.subjectId', () => {
    const object = statusConflict();
    expect(
      validateConflictObject({
        ...object,
        attributes: { ...object.attributes, subjectId: '' },
      }).errors,
    ).toContain('attributes.subjectId is required');
  });

  it('requires attributes.attribute', () => {
    const object = statusConflict();
    expect(
      validateConflictObject({
        ...object,
        attributes: { ...object.attributes, attribute: '' },
      }).errors,
    ).toContain('attributes.attribute is required');
  });

  it('requires attributes.claimCategory', () => {
    const object = statusConflict();
    expect(
      validateConflictObject({
        ...object,
        attributes: { ...object.attributes, claimCategory: '' },
      }).errors,
    ).toContain('attributes.claimCategory is required');
  });

  it('rejects fewer than two positions — a single position is not a conflict', () => {
    const object = statusConflict();
    const onePosition = [object.attributes.positions[0]];
    expect(
      validateConflictObject({
        ...object,
        attributes: { ...object.attributes, positions: onePosition },
      }).errors,
    ).toContain(
      'attributes.positions must contain at least two entries -- a conflict with fewer than two positions is not a conflict',
    );
  });

  it('rejects a position with no sources', () => {
    const object = statusConflict();
    const positions = [object.attributes.positions[0], { value: 'Blocked', sources: [] }];
    expect(
      validateConflictObject({ ...object, attributes: { ...object.attributes, positions } }).errors,
    ).toContain('attributes.positions[1].sources must be a non-empty array');
  });

  it('rejects a source missing sourceId/sourceType/authority', () => {
    const object = statusConflict();
    const positions = [
      object.attributes.positions[0],
      { value: 'Blocked', sources: [{ sourceId: '', sourceType: '', authority: 'high' }] },
    ];
    const errors = validateConflictObject({
      ...object,
      attributes: { ...object.attributes, positions },
    }).errors;
    expect(errors).toContain('attributes.positions[1].sources[0].sourceId is required');
    expect(errors).toContain('attributes.positions[1].sources[0].sourceType is required');
    expect(errors).toContain('attributes.positions[1].sources[0].authority must be a number');
  });

  it('still runs the base canonical-object checks (e.g. identity)', () => {
    const object = statusConflict();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it
    const { identity: _identity, ...withoutIdentity } = object;
    expect(validateConflictObject(withoutIdentity).errors).toContain('identity is required');
  });
});

describe('end to end — a conflict object slots directly into a bundle, no separate wrap step', () => {
  it('validates as part of a whole bundle alongside ordinary entity objects', () => {
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-09-08T00:00:00.000Z',
      objects: [statusConflict()],
      relationships: [],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });
});
