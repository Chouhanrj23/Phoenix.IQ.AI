import { describe, expect, it } from 'vitest';
import type { CanonicalKnowledgeObject } from '../src/canonical-object.js';
import type { CanonicalKnowledgeRelationship } from '../src/relationships.js';
import type { Evidence } from '../src/evidence.js';
import type { Source } from '../src/provenance.js';
import { validateSource } from '../src/provenance.js';
import {
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
} from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function baseObject(overrides: Partial<Record<string, unknown>> = {}): CanonicalKnowledgeObject {
  return {
    identity: {
      id: 'obj-checkout',
      systemId: 'aurora-commerce',
      createdAt: '2026-08-01T00:00:00.000Z',
      updatedAt: '2026-08-01T00:00:00.000Z',
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'architecture.container',
    label: 'Checkout Service',
    attributes: {},
    metadata: {
      provenance: [
        {
          sourceId: 'repo://aurora-commerce/services/checkout',
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      confidence: { level: 'high', score: 0.9 },
    },
    evidence: [],
    ...overrides,
  } as CanonicalKnowledgeObject;
}

function baseRelationship(
  overrides: Partial<Record<string, unknown>> = {},
): CanonicalKnowledgeRelationship {
  return {
    id: 'rel-1',
    category: 'interaction',
    kind: 'calls',
    sourceObjectId: 'obj-checkout',
    targetObjectId: 'obj-payments',
    metadata: {
      provenance: [
        {
          sourceId: 'repo://aurora-commerce',
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: '2026-08-01T00:00:00.000Z',
        },
      ],
      confidence: { level: 'high', score: 0.9 },
    },
    ...overrides,
  } as CanonicalKnowledgeRelationship;
}

const checkoutExcerpt: Evidence = {
  id: 'ev-checkout-route',
  sourceId: 'repo://aurora-commerce/services/checkout',
  excerpt: 'router.post("/checkout", handler)',
  locator: 'src/routes/checkout.ts:14',
  capturedAt: '2026-08-01T00:00:00.000Z',
  sourceVersion: 'a1b2c3d',
};

// ---------------------------------------------------------------------------
// Evidence references — identity, source, valid combinations
// ---------------------------------------------------------------------------

describe('Evidence references — valid combinations', () => {
  it('accepts a fully-populated evidence entry, including capturedAt and sourceVersion', () => {
    expect(validateCanonicalKnowledgeObject(baseObject({ evidence: [checkoutExcerpt] }))).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('accepts an object with an empty evidence array (evidence is optional per-object)', () => {
    expect(validateCanonicalKnowledgeObject(baseObject()).valid).toBe(true);
  });

  it('accepts an evidence entry with only id/sourceId (excerpt/locator/capturedAt/sourceVersion all optional)', () => {
    const minimal: Evidence = { id: 'ev-1', sourceId: 'repo://aurora-commerce/services/checkout' };
    expect(validateCanonicalKnowledgeObject(baseObject({ evidence: [minimal] })).valid).toBe(true);
  });

  it('accepts a relationship with its own evidence, independent of either object it connects', () => {
    const relationship = baseRelationship({
      evidence: [
        {
          id: 'ev-call-site',
          sourceId: 'repo://aurora-commerce',
          excerpt: 'paymentsClient.authorize(order)',
          locator: 'src/checkout/finalize.ts:42',
        },
      ],
    });
    expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('accepts a relationship with no evidence field at all (optional, unlike the object field)', () => {
    expect(validateCanonicalKnowledgeRelationship(baseRelationship()).valid).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Source locations
// ---------------------------------------------------------------------------

describe('Evidence — source locations (locator)', () => {
  it('accepts a variety of locator formats (line range, section heading, comment id)', () => {
    const locators = ['src/routes/checkout.ts:14-21', '#payments-integration', 'comment-4821'];
    for (const locator of locators) {
      const evidence: Evidence = {
        id: `ev-${locator}`,
        sourceId: 'repo://aurora-commerce',
        locator,
      };
      expect(validateCanonicalKnowledgeObject(baseObject({ evidence: [evidence] })).valid).toBe(
        true,
      );
    }
  });

  it('rejects a non-string locator', () => {
    const object = baseObject({
      evidence: [{ id: 'ev-1', sourceId: 'repo://aurora-commerce', locator: 42 }],
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('evidence[0].locator, if present, must be a non-empty string');
  });
});

// ---------------------------------------------------------------------------
// Multiple evidence items
// ---------------------------------------------------------------------------

describe('Evidence — multiple items', () => {
  it('accepts several evidence entries citing different sources for the same object', () => {
    const evidence: Evidence[] = [
      {
        id: 'ev-1',
        sourceId: 'repo://aurora-commerce/services/checkout',
        locator: 'src/routes/checkout.ts:14',
      },
      { id: 'ev-2', sourceId: 'docs/architecture/checkout.md', locator: '#payment-flow' },
      { id: 'ev-3', sourceId: 'ticket://JIRA-4821' },
    ];
    expect(validateCanonicalKnowledgeObject(baseObject({ evidence })).valid).toBe(true);
  });

  it('reports every malformed entry, indexed, when several are invalid', () => {
    const evidence = [
      { id: 'ev-1', sourceId: 'repo://aurora-commerce' },
      { sourceId: 'repo://aurora-commerce' },
      { id: 'ev-3', sourceId: '' },
    ];
    const result = validateCanonicalKnowledgeObject(baseObject({ evidence }));
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('evidence[1].id is required');
    expect(result.errors).toContain('evidence[2].sourceId is required');
    expect(result.errors.some((e) => e.startsWith('evidence[0]'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Missing/invalid references
// ---------------------------------------------------------------------------

describe('Evidence — missing/invalid references', () => {
  it('rejects an evidence entry missing id', () => {
    const object = baseObject({ evidence: [{ sourceId: 'repo://aurora-commerce' }] });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('evidence[0].id is required');
  });

  it('rejects an evidence entry missing sourceId', () => {
    const object = baseObject({ evidence: [{ id: 'ev-1' }] });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('evidence[0].sourceId is required');
  });

  it('rejects a non-object evidence entry', () => {
    const object = baseObject({ evidence: ['not-an-object'] });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('evidence[0] must be an object');
  });

  it('rejects a non-array evidence field', () => {
    const object = baseObject({ evidence: 'not-an-array' });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('evidence must be an array (may be empty)');
  });

  it('rejects an invalid capturedAt timestamp', () => {
    const object = baseObject({
      evidence: [{ id: 'ev-1', sourceId: 'repo://aurora-commerce', capturedAt: 'not-a-timestamp' }],
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'evidence[0].capturedAt, if present, must be an ISO-8601 timestamp',
    );
  });

  it('rejects a non-string sourceVersion', () => {
    const object = baseObject({
      evidence: [{ id: 'ev-1', sourceId: 'repo://aurora-commerce', sourceVersion: 12345 }],
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'evidence[0].sourceVersion, if present, must be a non-empty string',
    );
  });

  it('rejects a non-string excerpt', () => {
    const object = baseObject({
      evidence: [{ id: 'ev-1', sourceId: 'repo://aurora-commerce', excerpt: { not: 'a string' } }],
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('evidence[0].excerpt, if present, must be a non-empty string');
  });

  it('applies the same rejection rules to relationship evidence', () => {
    const relationship = baseRelationship({ evidence: [{ id: 'ev-1' }] });
    const result = validateCanonicalKnowledgeRelationship(relationship);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('evidence[0].sourceId is required');
  });
});

// ---------------------------------------------------------------------------
// Evidence vs Provenance — "what specifically supports this" vs "where did
// this originate"
// ---------------------------------------------------------------------------

describe('Evidence distinguished from Provenance', () => {
  it('two objects can share identical provenance while citing different evidence excerpts from that same source', () => {
    const sharedProvenance = baseObject().metadata.provenance;
    const routeObject = baseObject({
      identity: { ...baseObject().identity, id: 'obj-route' },
      metadata: { provenance: sharedProvenance, confidence: { level: 'high', score: 0.9 } },
      evidence: [
        {
          id: 'ev-route',
          sourceId: sharedProvenance[0]!.sourceId,
          locator: 'src/routes/checkout.ts:14',
        },
      ],
    });
    const handlerObject = baseObject({
      identity: { ...baseObject().identity, id: 'obj-handler' },
      metadata: { provenance: sharedProvenance, confidence: { level: 'high', score: 0.9 } },
      evidence: [
        {
          id: 'ev-handler',
          sourceId: sharedProvenance[0]!.sourceId,
          locator: 'src/handlers/checkout.ts:8',
        },
      ],
    });
    expect(validateCanonicalKnowledgeObject(routeObject).valid).toBe(true);
    expect(validateCanonicalKnowledgeObject(handlerObject).valid).toBe(true);
    expect(routeObject.evidence[0]?.locator).not.toBe(handlerObject.evidence[0]?.locator);
  });

  it("evidence can carry its own sourceVersion, pinned independently of the Source registry's current version", () => {
    const registryVersion: Source = {
      id: 'repo://aurora-commerce/services/checkout',
      type: 'source-code',
      label: 'aurora-commerce/services/checkout',
      version: 'f9e8d7c',
    };
    expect(validateSource(registryVersion).valid).toBe(true);
    const olderEvidence: Evidence = {
      id: 'ev-historical',
      sourceId: registryVersion.id,
      sourceVersion: 'a1b2c3d',
      excerpt: 'router.post("/checkout", legacyHandler)',
    };
    expect(validateCanonicalKnowledgeObject(baseObject({ evidence: [olderEvidence] })).valid).toBe(
      true,
    );
    expect(olderEvidence.sourceVersion).not.toBe(registryVersion.version);
  });
});

// ---------------------------------------------------------------------------
// Future source-artifact kinds (per the objective): source file,
// documentation, API definition, configuration, issue/project record —
// all resolved via the existing SourceType vocabulary (P2-07), no new
// enum needed.
// ---------------------------------------------------------------------------

describe('Evidence — future source-artifact kinds via the existing SourceType vocabulary', () => {
  it('accepts evidence citing each conceptual future-source kind from the objective', () => {
    const cases: { evidence: Evidence; source: Source }[] = [
      {
        evidence: {
          id: 'ev-file',
          sourceId: 'repo://aurora-commerce/services/checkout',
          locator: 'src/routes/checkout.ts:14',
        },
        source: {
          id: 'repo://aurora-commerce/services/checkout',
          type: 'source-code',
          label: 'source file example',
        },
      },
      {
        evidence: {
          id: 'ev-doc',
          sourceId: 'docs/architecture/checkout.md',
          locator: '#payment-flow',
        },
        source: {
          id: 'docs/architecture/checkout.md',
          type: 'technical-doc',
          label: 'documentation example',
        },
      },
      {
        evidence: {
          id: 'ev-api',
          sourceId: 'openapi://aurora-commerce/checkout.yaml',
          locator: 'paths./checkout.post',
        },
        source: {
          id: 'openapi://aurora-commerce/checkout.yaml',
          type: 'data-model',
          label: 'API definition example',
        },
      },
      {
        evidence: {
          id: 'ev-config',
          sourceId: 'repo://aurora-commerce/docker-compose.yml',
          locator: 'services.checkout',
        },
        source: {
          id: 'repo://aurora-commerce/docker-compose.yml',
          type: 'data-model',
          label: 'configuration example',
        },
      },
      {
        evidence: {
          id: 'ev-ticket',
          sourceId: 'ticket://JIRA-4821',
          excerpt: 'Deprecate legacy checkout path',
        },
        source: { id: 'ticket://JIRA-4821', type: 'ticket', label: 'issue/project record example' },
      },
    ];
    for (const { evidence, source } of cases) {
      expect(validateSource(source).valid).toBe(true);
      expect(validateCanonicalKnowledgeObject(baseObject({ evidence: [evidence] })).valid).toBe(
        true,
      );
      expect(evidence.sourceId).toBe(source.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Connecting evidence with confidence, without duplicating data
// ---------------------------------------------------------------------------

describe('Evidence connected to confidence (no duplication)', () => {
  it('ConfidenceCalculation.inputs can reference evidence count as a free-form input, without a new schema field', () => {
    const evidence: Evidence[] = [
      {
        id: 'ev-1',
        sourceId: 'repo://aurora-commerce/services/checkout',
        locator: 'src/routes/checkout.ts:14',
      },
      {
        id: 'ev-2',
        sourceId: 'repo://aurora-commerce/services/checkout',
        locator: 'src/handlers/checkout.ts:8',
      },
      { id: 'ev-3', sourceId: 'docs/architecture/checkout.md', locator: '#payment-flow' },
    ];
    const object = baseObject({
      evidence,
      confidenceDetail: {
        basis: 'observed',
        calculation: {
          method: 'evidence-corroboration',
          calculatedAt: '2026-08-01T00:00:00.000Z',
          inputs: { evidenceCount: evidence.length },
        },
      },
    });
    const result = validateCanonicalKnowledgeObject(object);
    expect(result).toEqual({ valid: true, errors: [] });
    expect(object.confidenceDetail?.calculation?.inputs?.evidenceCount).toBe(3);
  });

  it('an object can have confidenceDetail with zero evidence (a derived claim need not cite direct excerpts)', () => {
    const object = baseObject({ evidence: [], confidenceDetail: { basis: 'derived' } });
    expect(validateCanonicalKnowledgeObject(object).valid).toBe(true);
  });
});
