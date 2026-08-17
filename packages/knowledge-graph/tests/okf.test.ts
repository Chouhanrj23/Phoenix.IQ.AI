import { describe, expect, it } from 'vitest';
import type { CanonicalKnowledgeBundle } from '../src/bundle.js';
import type {
  SystemObject,
  ContainerObject,
  ArchitectureRelationship,
} from '../src/architecture.js';
import type { DomainObject, AggregateObject, DomainRelationship } from '../src/domain.js';
import type { PersonaObject } from '../src/journey.js';
import type {
  IntegrationObject,
  DataFlowObject,
  IntegrationRelationship,
} from '../src/integration.js';
import type { Source } from '../src/provenance.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';
import {
  toOkfDocument,
  validateOkfDocument,
  serializeOkfYaml,
  parseOkfYaml,
  parseAndValidateOkfYaml,
  type OkfDocument,
} from '../src/okf.js';

/**
 * A single multi-domain bundle exercising every prior Phase 2 ticket at
 * once (P2-01 canonical envelope, P2-02 categories, P2-03 architecture,
 * P2-04 domain/entity, P2-05 persona, P2-06 integration/API, P2-07
 * provenance/Source, P2-08 confidence, P2-09 evidence) -- this is the
 * concrete proof for "the OKF must represent these consistently", not
 * another per-domain Phase 1 compatibility proof (those already exist in
 * architecture.test.ts/domain.test.ts/journey.test.ts/integration.test.ts).
 * IDs are illustrative, chosen to be recognizable against those files'
 * real fixtures, not re-claimed as freshly sourced from Phase 1 here.
 */
function buildReconciledBundle(): CanonicalKnowledgeBundle {
  const identity = (id: string) => ({
    id,
    systemId: 'aurora-commerce',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  });
  const meta = (
    sourceId: string,
    sourceType: 'source-code' | 'data-model' | 'business-doc',
    score: number,
  ) => ({
    provenance: [
      {
        sourceId,
        sourceType,
        derivedBy: 'extraction-engine',
        derivedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    confidence: { level: score >= 0.8 ? ('high' as const) : ('medium' as const), score },
  });

  const system: SystemObject = {
    identity: identity('sys-aurora'),
    category: 'entity',
    kind: 'architecture.system',
    label: 'Aurora Commerce',
    attributes: { description: 'E-commerce platform' },
    metadata: meta('repo://aurora-commerce', 'source-code', 0.95),
    evidence: [],
  };

  const container: ContainerObject = {
    identity: identity('ctr-checkout'),
    category: 'entity',
    kind: 'architecture.container',
    label: 'Checkout Service',
    attributes: { responsibility: 'Handles cart and checkout flow', technology: 'Node.js' },
    metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 0.9),
    evidence: [
      {
        id: 'ev-checkout-entry',
        sourceId: 'repo://aurora-commerce/services/checkout',
        locator: 'src/index.ts:1',
        excerpt: 'export const app = createServer()',
      },
    ],
    confidenceDetail: { basis: 'observed' },
  };

  const domain: DomainObject = {
    identity: identity('dom-ordering'),
    category: 'entity',
    kind: 'domain.domain',
    label: 'Ordering',
    attributes: { description: 'Order lifecycle and fulfillment' },
    metadata: meta('data-model://aurora-schema.sql', 'data-model', 0.88),
    evidence: [],
  };

  const aggregate: AggregateObject = {
    identity: identity('agg-order'),
    category: 'entity',
    kind: 'domain.aggregate',
    label: 'Order',
    attributes: { description: 'The order aggregate root' },
    metadata: meta('data-model://aurora-schema.sql', 'data-model', 0.88),
    evidence: [],
  };

  const persona: PersonaObject = {
    identity: identity('persona-returning-shopper'),
    category: 'entity',
    kind: 'journey.persona',
    label: 'Returning Shopper',
    attributes: { role: 'Customer', goals: ['Reorder quickly'] },
    metadata: meta('docs/personas.md', 'business-doc', 0.9),
    evidence: [],
  };

  const integration: IntegrationObject = {
    identity: identity('int-meridian-pay'),
    category: 'entity',
    kind: 'integration.integration',
    label: 'Meridian Pay',
    attributes: {
      interactionType: 'outbound',
      protocol: 'REST/HTTPS (synchronous)',
      counterpartDescription: 'External payment processor',
    },
    metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 0.9),
    evidence: [],
    confidenceDetail: {
      basis: 'derived',
      calculation: {
        method: 'log-pattern-match',
        calculatedAt: '2026-08-01T00:00:00.000Z',
        inputs: { corroboratingSources: 2 },
      },
    },
  };

  const dataFlow: DataFlowObject = {
    identity: identity('flow-meridian-authorization'),
    category: 'entity',
    kind: 'integration.dataflow',
    label: 'Authorization Request/Response',
    attributes: {
      data: 'Card token, amount, currency -> authorization result',
      direction: 'outbound',
    },
    metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 0.85),
    evidence: [],
  };

  const containsSystemContainer: ArchitectureRelationship = {
    id: 'rel-sys-contains-checkout',
    category: 'composition',
    kind: 'contains',
    sourceObjectId: 'sys-aurora',
    targetObjectId: 'ctr-checkout',
    metadata: meta('repo://aurora-commerce', 'source-code', 0.95),
  };

  const containsDomainAggregate: DomainRelationship = {
    id: 'rel-dom-contains-order',
    category: 'composition',
    kind: 'contains',
    sourceObjectId: 'dom-ordering',
    targetObjectId: 'agg-order',
    metadata: meta('data-model://aurora-schema.sql', 'data-model', 0.88),
  };

  const hasIntegration: IntegrationRelationship = {
    id: 'rel-checkout-has-meridian',
    category: 'association',
    kind: 'hasIntegration',
    sourceObjectId: 'ctr-checkout',
    targetObjectId: 'int-meridian-pay',
    metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 0.9),
    evidence: [
      {
        id: 'ev-integration-call',
        sourceId: 'repo://aurora-commerce/services/checkout',
        locator: 'src/payments/client.ts:22',
        excerpt: 'meridianClient.authorize(order)',
      },
    ],
  };

  const carries: IntegrationRelationship = {
    id: 'rel-meridian-carries-auth',
    category: 'composition',
    kind: 'carries',
    sourceObjectId: 'int-meridian-pay',
    targetObjectId: 'flow-meridian-authorization',
    metadata: meta('repo://aurora-commerce/services/checkout', 'source-code', 0.85),
  };

  const sources: Source[] = [
    {
      id: 'repo://aurora-commerce',
      type: 'source-code',
      label: 'aurora-commerce (root repo)',
      locator: 'https://git.internal/aurora-commerce',
      version: 'a1b2c3d',
    },
    {
      id: 'repo://aurora-commerce/services/checkout',
      type: 'source-code',
      label: 'aurora-commerce/services/checkout',
      version: 'a1b2c3d',
    },
    { id: 'data-model://aurora-schema.sql', type: 'data-model', label: 'Aurora primary schema' },
    { id: 'docs/personas.md', type: 'business-doc', label: 'Persona research doc' },
  ];

  return {
    systemId: 'aurora-commerce',
    generatedAt: '2026-08-01T00:00:00.000Z',
    objects: [system, container, domain, aggregate, persona, integration, dataFlow],
    relationships: [containsSystemContainer, containsDomainAggregate, hasIntegration, carries],
    sources,
  };
}

// ---------------------------------------------------------------------------
// Step 1 — Reconciliation: one OKF document representing every prior
// domain area (P2-03 through P2-06) plus provenance/confidence/evidence
// (P2-07/P2-08/P2-09) consistently, with no competing model.
// ---------------------------------------------------------------------------

describe('OKF document — multi-domain reconciliation', () => {
  it('a bundle spanning architecture, domain/entity, persona, and integration/API validates as one coherent OKF document', () => {
    const document = toOkfDocument(buildReconciledBundle());
    expect(document.okfVersion).toBe(CANONICAL_SCHEMA_VERSION);
    expect(validateOkfDocument(document)).toEqual({ valid: true, errors: [] });
  });

  it('every object uses the same envelope shape (identity/category/kind/label/attributes/metadata/evidence) regardless of domain area', () => {
    const document = toOkfDocument(buildReconciledBundle());
    for (const object of document.objects) {
      expect(object).toHaveProperty('identity.id');
      expect(object).toHaveProperty('category');
      expect(object).toHaveProperty('kind');
      expect(object).toHaveProperty('label');
      expect(object).toHaveProperty('attributes');
      expect(object).toHaveProperty('metadata.provenance');
      expect(object).toHaveProperty('metadata.confidence');
      expect(object).toHaveProperty('evidence');
    }
  });
});

// ---------------------------------------------------------------------------
// Serialize / round-trip / determinism
// ---------------------------------------------------------------------------

describe('OKF YAML — serialize and round-trip', () => {
  it('serializes to a non-empty YAML string containing every top-level section', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const yamlText = serializeOkfYaml(document);
    expect(yamlText.length).toBeGreaterThan(0);
    for (const key of [
      'okfVersion',
      'systemId',
      'generatedAt',
      'sources',
      'objects',
      'relationships',
    ]) {
      expect(yamlText).toContain(`${key}:`);
    }
  });

  it('round-trips losslessly: parse(serialize(document)) deep-equals the original document', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const parsed = parseOkfYaml(serializeOkfYaml(document));
    expect(parsed).toEqual(document);
  });

  it('is deterministic: serializing the same document twice produces byte-identical YAML', () => {
    const document = toOkfDocument(buildReconciledBundle());
    expect(serializeOkfYaml(document)).toBe(serializeOkfYaml(document));
  });

  it("is deterministic regardless of the source object's own key insertion order", () => {
    const document = toOkfDocument(buildReconciledBundle());
    const reordered: OkfDocument = {
      relationships: document.relationships,
      objects: document.objects,
      sources: document.sources,
      generatedAt: document.generatedAt,
      systemId: document.systemId,
      okfVersion: document.okfVersion,
    };
    expect(serializeOkfYaml(reordered)).toBe(serializeOkfYaml(document));
  });

  it('places identity-like fields before metadata/evidence in the emitted YAML (readable ordering)', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const yamlText = serializeOkfYaml(document);
    const objectsIndex = yamlText.indexOf('objects:');
    const firstIdIndex = yamlText.indexOf('id: sys-aurora');
    const firstMetadataIndex = yamlText.indexOf('metadata:');
    expect(objectsIndex).toBeGreaterThanOrEqual(0);
    expect(firstIdIndex).toBeGreaterThan(objectsIndex);
    expect(firstMetadataIndex).toBeGreaterThan(firstIdIndex);
  });
});

// ---------------------------------------------------------------------------
// Validation — required fields, ids, types, relationships, provenance,
// confidence, evidence
// ---------------------------------------------------------------------------

describe('OKF document validation — required fields and structure', () => {
  it('rejects a document missing okfVersion', () => {
    const bundle = buildReconciledBundle();
    const result = validateOkfDocument(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('okfVersion is required');
  });

  it('rejects a document with a non-object candidate', () => {
    expect(validateOkfDocument(null).valid).toBe(false);
    expect(validateOkfDocument('not a document').valid).toBe(false);
  });

  it('rejects an object missing a required identity field (ids)', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const [firstObject, ...rest] = document.objects;
    const broken = { ...firstObject, identity: { ...firstObject!.identity, id: '' } };
    const result = validateOkfDocument({ ...document, objects: [broken, ...rest] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('identity.id is required'))).toBe(true);
  });

  it('rejects an object with an invalid category (types)', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const [firstObject, ...rest] = document.objects;
    const broken = { ...firstObject, category: 'not-a-real-category' };
    const result = validateOkfDocument({ ...document, objects: [broken, ...rest] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('category must be one of'))).toBe(true);
  });

  it('rejects a relationship pointing at an object not present in the bundle (relationships)', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const result = validateOkfDocument({
      ...document,
      relationships: [{ ...document.relationships[0], targetObjectId: 'obj-does-not-exist' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not reference a known object'))).toBe(true);
  });

  it('rejects a provenance entry with an invalid timestamp (provenance)', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const [firstObject, ...rest] = document.objects;
    const broken = {
      ...firstObject,
      metadata: {
        ...firstObject!.metadata,
        provenance: [{ ...firstObject!.metadata.provenance[0], derivedAt: 'not-a-timestamp' }],
      },
    };
    const result = validateOkfDocument({ ...document, objects: [broken, ...rest] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('derivedAt must be an ISO-8601 timestamp'))).toBe(
      true,
    );
  });

  it('rejects an invalid confidenceDetail (confidence)', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const [firstObject, ...rest] = document.objects;
    const broken = { ...firstObject, confidenceDetail: { basis: 'guessed' } };
    const result = validateOkfDocument({ ...document, objects: [broken, ...rest] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('confidenceDetail.basis must be one of'))).toBe(
      true,
    );
  });

  it('rejects an evidence entry missing sourceId (evidence)', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const [firstObject, ...rest] = document.objects;
    const broken = { ...firstObject, evidence: [{ id: 'ev-broken' }] };
    const result = validateOkfDocument({ ...document, objects: [broken, ...rest] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('evidence[0].sourceId is required'))).toBe(true);
  });

  it('rejects a source reference that does not resolve against the sources registry', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const result = validateOkfDocument({
      ...document,
      sources: [{ id: 'unrelated-source', type: 'other', label: 'unrelated' }],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('does not reference a known source'))).toBe(true);
  });

  it('rejects duplicate object ids', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const result = validateOkfDocument({
      ...document,
      objects: [...document.objects, document.objects[0]],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('duplicate object id'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// parseAndValidateOkfYaml — a single non-throwing entry point for both
// malformed YAML syntax and structurally invalid (but syntactically valid)
// documents
// ---------------------------------------------------------------------------

describe('parseAndValidateOkfYaml', () => {
  it('accepts valid YAML text describing a valid OKF document', () => {
    const document = toOkfDocument(buildReconciledBundle());
    const result = parseAndValidateOkfYaml(serializeOkfYaml(document));
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects malformed YAML syntax without throwing', () => {
    const result = parseAndValidateOkfYaml('objects:\n  - identity: {\n    id: unclosed-flow-map');
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.startsWith('invalid YAML syntax:'))).toBe(true);
  });

  it('rejects syntactically valid YAML describing an invalid document', () => {
    const result = parseAndValidateOkfYaml(
      'systemId: aurora-commerce\ngeneratedAt: 2026-08-01T00:00:00.000Z\nobjects: []\nrelationships: []\n',
    );
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('okfVersion is required');
  });
});
