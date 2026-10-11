import { describe, expect, it } from 'vitest';
import {
  validateCanonicalKnowledgeBundle,
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
  CANONICAL_SCHEMA_VERSION,
  type ActionObject,
  type AggregateObject,
  type ApiObject,
  type CanonicalKnowledgeBundle,
  type CanonicalKnowledgeObject,
  type CanonicalKnowledgeRelationship,
  type ComponentObject,
  type ContainerObject,
  type DataFlowObject,
  type DomainObject,
  type EntityObject,
  type EntityStateObject,
  type FlowObject,
  type IntegrationObject,
  type InterfaceObject,
  type JourneyObject,
  type PersonaObject,
  type SystemObject,
} from '@phoenix-ai/knowledge-graph';
import {
  CURRENTLY_PRODUCED_OBJECT_KINDS,
  CURRENTLY_PRODUCED_RELATIONSHIP_KINDS,
  KNOWN_OBJECT_KINDS,
  OBJECT_KIND_TO_LABEL,
  RELATIONSHIP_KIND_TO_TYPE,
  SCHEMA_RELATIONSHIP_KINDS,
  mapOkfBundleToGraph,
  mapOkfObjectToGraphNode,
  mapOkfRelationshipToGraphRelationship,
} from '../src/graph-mapping.js';

const SYSTEM_ID = 'aurora-commerce';
const GENERATED_AT = '2026-08-21T00:00:00.000Z';

function identity(id: string) {
  return {
    id,
    systemId: SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  };
}

function metadata(sourceId: string) {
  return {
    provenance: [
      {
        sourceId,
        sourceType: 'source-code' as const,
        derivedBy: 'extraction-engine',
        derivedAt: GENERATED_AT,
      },
    ],
    confidence: { level: 'high' as const, score: 0.9 },
  };
}

// One real, validated instance of every Phase 2 OKF object kind -- built as
// the actual typed interfaces (`SystemObject`, `ContainerObject`, ...), not
// a hand-rolled stand-in shape.
const system: SystemObject = {
  identity: identity('sys-1'),
  category: 'entity',
  kind: 'architecture.system',
  label: 'Aurora Commerce Platform',
  attributes: { description: 'The system under analysis.' },
  metadata: metadata('repo://aurora-commerce'),
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

const container: ContainerObject = {
  identity: identity('ctr-1'),
  category: 'entity',
  kind: 'architecture.container',
  label: 'Checkout Service',
  attributes: { responsibility: 'Orchestrates checkout.', technology: 'Node.js' },
  metadata: metadata('repo://aurora-commerce/services/checkout'),
  evidence: [
    {
      id: 'ev-1',
      sourceId: 'repo://aurora-commerce/services/checkout',
      locator: 'src/index.ts#L1',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

const component: ComponentObject = {
  identity: identity('cmp-1'),
  category: 'entity',
  kind: 'architecture.component',
  label: 'Cart Validator',
  attributes: { responsibility: 'Validates cart contents.' },
  metadata: metadata('repo://aurora-commerce/services/checkout'),
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

const domain: DomainObject = {
  identity: identity('dom-1'),
  category: 'entity',
  kind: 'domain.domain',
  label: 'Order Management',
  attributes: { description: 'Everything about orders.' },
  metadata: metadata('data-model://aurora-schema.sql'),
  evidence: [],
};

const entity: EntityObject = {
  identity: identity('ent-1'),
  category: 'entity',
  kind: 'domain.entity',
  label: 'Order',
  attributes: {
    description: 'A customer order.',
    fields: [{ name: 'id', type: 'uuid', required: true }],
  },
  metadata: metadata('data-model://aurora-schema.sql'),
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

const aggregate: AggregateObject = {
  identity: identity('agg-1'),
  category: 'entity',
  kind: 'domain.aggregate',
  label: 'Order Aggregate',
  attributes: {},
  metadata: metadata('data-model://aurora-schema.sql'),
  evidence: [],
};

const entityState: EntityStateObject = {
  identity: identity('est-1'),
  category: 'entity',
  kind: 'domain.entity-state',
  label: 'pending',
  attributes: {},
  metadata: metadata('data-model://aurora-schema.sql'),
  evidence: [],
};

const persona: PersonaObject = {
  identity: identity('per-1'),
  category: 'entity',
  kind: 'journey.persona',
  label: 'Frequent Shopper',
  attributes: { role: 'Frequent online shopper', goals: ['Fast checkout', 'Order tracking'] },
  metadata: metadata('docs/personas.md'),
  evidence: [],
};

const journey: JourneyObject = {
  identity: identity('jou-1'),
  category: 'process',
  kind: 'journey.journey',
  label: 'Purchase a product',
  attributes: { purpose: 'Let a shopper buy a product end to end.' },
  metadata: metadata('docs/personas.md'),
  evidence: [],
};

const flow: FlowObject = {
  identity: identity('flo-1'),
  category: 'process',
  kind: 'journey.flow',
  label: 'Checkout Flow',
  attributes: { triggerScreen: 'Cart' },
  metadata: metadata('docs/personas.md'),
  evidence: [],
};

const action: ActionObject = {
  identity: identity('act-1'),
  category: 'entity',
  kind: 'journey.action',
  label: 'Submit payment',
  attributes: { description: 'The shopper submits payment details.' },
  metadata: metadata('docs/personas.md'),
  evidence: [],
};

const api: ApiObject = {
  identity: identity('api-1'),
  category: 'entity',
  kind: 'integration.api',
  label: 'CheckoutController',
  attributes: { operations: [{ name: 'POST /checkout', description: 'Creates an order.' }] },
  metadata: metadata('repo://aurora-commerce/services/checkout'),
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

const iface: InterfaceObject = {
  identity: identity('ifc-1'),
  category: 'entity',
  kind: 'integration.interface',
  label: 'Payments Contract',
  attributes: { protocol: 'REST/HTTPS' },
  metadata: metadata('openapi://aurora-commerce/payments.yaml'),
  evidence: [],
};

const integration: IntegrationObject = {
  identity: identity('int-1'),
  category: 'entity',
  kind: 'integration.integration',
  label: 'Meridian Pay',
  attributes: { interactionType: 'outbound', protocol: 'REST/HTTPS' },
  metadata: metadata('repo://aurora-commerce/services/payments-adapter'),
  evidence: [],
};

const dataFlow: DataFlowObject = {
  identity: identity('dfl-1'),
  category: 'entity',
  kind: 'integration.dataflow',
  label: 'Payment Authorization',
  attributes: { data: 'Payment amount and card token.', direction: 'outbound' },
  metadata: metadata('repo://aurora-commerce/services/payments-adapter'),
  evidence: [],
};

const ALL_OBJECTS: CanonicalKnowledgeObject[] = [
  system,
  container,
  component,
  domain,
  entity,
  aggregate,
  entityState,
  persona,
  journey,
  flow,
  action,
  api,
  iface,
  integration,
  dataFlow,
];

// One relationship per schema-supported kind, plus the two currently-produced
// (additive) kinds -- every `sourceObjectId`/`targetObjectId` references a
// real object above, matching `validateCanonicalKnowledgeBundle`'s own
// referential-integrity rule.
const containsRelationship: CanonicalKnowledgeRelationship = {
  id: 'rel-contains-1',
  category: 'composition',
  kind: 'contains',
  sourceObjectId: system.identity.id,
  targetObjectId: container.identity.id,
  metadata: metadata('repo://aurora-commerce'),
};

const dependsOnRelationship: CanonicalKnowledgeRelationship = {
  id: 'rel-depends-on-1',
  category: 'association',
  kind: 'dependsOn',
  sourceObjectId: api.identity.id,
  targetObjectId: entity.identity.id,
  attributes: { relation: 'returnType' },
  metadata: metadata('repo://aurora-commerce/services/checkout'),
  evidence: [
    {
      id: 'ev-depends-1',
      sourceId: 'repo://aurora-commerce/services/checkout',
      locator: 'CheckoutController.java#L10',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

const hasAssociationRelationship: CanonicalKnowledgeRelationship = {
  id: 'rel-has-association-1',
  category: 'association',
  kind: 'hasAssociation',
  sourceObjectId: entity.identity.id,
  targetObjectId: aggregate.identity.id,
  attributes: { associationKind: 'ManyToOne', fieldName: 'aggregateRoot' },
  metadata: metadata('data-model://aurora-schema.sql'),
  confidenceDetail: { basis: 'observed' },
};

const ALL_RELATIONSHIPS: CanonicalKnowledgeRelationship[] = [
  containsRelationship,
  dependsOnRelationship,
  hasAssociationRelationship,
];

const BUNDLE: CanonicalKnowledgeBundle = {
  systemId: SYSTEM_ID,
  generatedAt: GENERATED_AT,
  objects: ALL_OBJECTS,
  relationships: ALL_RELATIONSHIPS,
  sources: [
    { id: 'repo://aurora-commerce', type: 'source-code', label: 'aurora-commerce' },
    {
      id: 'repo://aurora-commerce/services/checkout',
      type: 'source-code',
      label: 'checkout service',
    },
    { id: 'data-model://aurora-schema.sql', type: 'data-model', label: 'Aurora primary schema' },
    { id: 'docs/personas.md', type: 'business-doc', label: 'Persona research doc' },
    {
      id: 'openapi://aurora-commerce/payments.yaml',
      type: 'data-model',
      label: 'Payments contract',
    },
    {
      id: 'repo://aurora-commerce/services/payments-adapter',
      type: 'source-code',
      label: 'payments adapter',
    },
  ],
};

describe('fixture sanity -- this test file uses the actual Phase 2 OKF structure, not a mock', () => {
  it('every object in the fixture is a real, valid CanonicalKnowledgeObject', () => {
    for (const object of ALL_OBJECTS) {
      expect(validateCanonicalKnowledgeObject(object)).toEqual({ valid: true, errors: [] });
    }
  });

  it('every relationship in the fixture is a real, valid CanonicalKnowledgeRelationship', () => {
    for (const relationship of ALL_RELATIONSHIPS) {
      expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
        valid: true,
        errors: [],
      });
    }
  });

  it('the whole fixture bundle is valid', () => {
    expect(validateCanonicalKnowledgeBundle(BUNDLE)).toEqual({ valid: true, errors: [] });
  });
});

describe('OBJECT_KIND_TO_LABEL / RELATIONSHIP_KIND_TO_TYPE -- exhaustiveness against real Phase 2 vocabularies', () => {
  it('maps every known OKF object kind (imported from the real domain files, not re-typed by hand)', () => {
    expect(new Set(Object.keys(OBJECT_KIND_TO_LABEL))).toEqual(new Set(KNOWN_OBJECT_KINDS));
  });

  it('maps every schema-supported relationship kind', () => {
    for (const kind of SCHEMA_RELATIONSHIP_KINDS) {
      expect(RELATIONSHIP_KIND_TO_TYPE[kind]).toBeDefined();
    }
  });

  it('also maps the two currently-produced (additive) relationship kinds', () => {
    for (const kind of CURRENTLY_PRODUCED_RELATIONSHIP_KINDS) {
      expect(RELATIONSHIP_KIND_TO_TYPE[kind]).toBeDefined();
    }
  });
});

describe('mapOkfObjectToGraphNode -- representative OKF node -> graph node (Step 9.1)', () => {
  it('maps a System object to a :System node with real properties', () => {
    const result = mapOkfObjectToGraphNode(system);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.node.label).toBe('System');
    expect(result.node.properties.kind).toBe('architecture.system');
    expect(result.node.properties.category).toBe('entity');
    expect(result.node.properties.label).toBe('Aurora Commerce Platform');
    expect(result.node.properties.systemId).toBe(SYSTEM_ID);
    expect(result.node.properties.attr_description).toBe('The system under analysis.');
  });

  it('maps every one of the 15 real Phase 2 object kinds to its documented label', () => {
    const expectedLabels: Record<string, string> = {
      'architecture.system': 'System',
      'architecture.container': 'Container',
      'architecture.component': 'Component',
      'domain.domain': 'Domain',
      'domain.entity': 'Entity',
      'domain.aggregate': 'Aggregate',
      'domain.entity-state': 'EntityState',
      'journey.persona': 'Persona',
      'journey.journey': 'Journey',
      'journey.flow': 'Flow',
      'journey.action': 'Action',
      'integration.api': 'Api',
      'integration.interface': 'Interface',
      'integration.integration': 'Integration',
      'integration.dataflow': 'DataFlow',
    };
    for (const object of ALL_OBJECTS) {
      const result = mapOkfObjectToGraphNode(object);
      expect(result.ok).toBe(true);
      if (!result.ok) throw new Error('unreachable');
      expect(result.node.label).toBe(expectedLabels[object.kind]);
    }
  });

  it('flattens a nested attribute (EntityAttributes.fields) into a lossless JSON property, not a dropped one', () => {
    const result = mapOkfObjectToGraphNode(entity);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.node.properties.attr_fields_json).toBe(JSON.stringify(entity.attributes.fields));
    expect(JSON.parse(result.node.properties.attr_fields_json as string)).toEqual(
      entity.attributes.fields,
    );
  });

  it('flattens a homogeneous string-array attribute (PersonaAttributes.goals) as a real Neo4j-safe array property', () => {
    const result = mapOkfObjectToGraphNode(persona);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.node.properties.attr_goals).toEqual(['Fast checkout', 'Order tracking']);
  });
});

describe('mapOkfRelationshipToGraphRelationship -- representative OKF relationship -> graph relationship (Step 9.2, 9.7)', () => {
  it('maps a schema-supported "contains" relationship to a real :CONTAINS edge between the correct nodes', () => {
    const result = mapOkfRelationshipToGraphRelationship(containsRelationship);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.relationship.type).toBe('CONTAINS');
    expect(result.relationship.sourceId).toBe(system.identity.id);
    expect(result.relationship.targetId).toBe(container.identity.id);
    expect(result.relationship.properties.category).toBe('composition');
  });

  it('maps a currently-produced "dependsOn" relationship, preserving attributes.relation', () => {
    const result = mapOkfRelationshipToGraphRelationship(dependsOnRelationship);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.relationship.type).toBe('DEPENDS_ON');
    expect(result.relationship.properties.attr_relation).toBe('returnType');
  });

  it('maps a currently-produced "hasAssociation" relationship, preserving attributes.associationKind/fieldName', () => {
    const result = mapOkfRelationshipToGraphRelationship(hasAssociationRelationship);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.relationship.type).toBe('HAS_ASSOCIATION');
    expect(result.relationship.properties.attr_associationKind).toBe('ManyToOne');
    expect(result.relationship.properties.attr_fieldName).toBe('aggregateRoot');
  });
});

describe('stable identity strategy (Step 9.3)', () => {
  it('reuses the OKF object identity.id verbatim as the graph node id -- never re-derived', () => {
    const result = mapOkfObjectToGraphNode(container);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.node.id).toBe(container.identity.id);
  });

  it('reuses the OKF relationship id verbatim as the graph relationship id -- never re-derived', () => {
    const result = mapOkfRelationshipToGraphRelationship(containsRelationship);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.relationship.id).toBe(containsRelationship.id);
  });

  it('refuses to map an object with an empty identity.id rather than inventing one', () => {
    const withoutId: CanonicalKnowledgeObject = {
      ...system,
      identity: { ...system.identity, id: '' },
    };
    const result = mapOkfObjectToGraphNode(withoutId);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.issue.reason).toMatch(/refusing to invent/);
  });
});

describe('provenance preservation (Step 9.4)', () => {
  it('preserves the full, unflattened provenance array on the mapped node -- not just the first entry', () => {
    const multiProvenanceObject: CanonicalKnowledgeObject = {
      ...container,
      metadata: {
        ...container.metadata,
        provenance: [
          {
            sourceId: 'repo://aurora-commerce/services/checkout',
            sourceType: 'source-code',
            derivedBy: 'extraction-engine',
            derivedAt: GENERATED_AT,
          },
          {
            sourceId: 'docs/architecture-2024.pdf',
            sourceType: 'technical-doc',
            derivedBy: 'phoenix-sample-author',
            derivedAt: GENERATED_AT,
          },
        ],
      },
    };
    const result = mapOkfObjectToGraphNode(multiProvenanceObject);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.node.provenance).toHaveLength(2);
    expect(result.node.provenance).toEqual(multiProvenanceObject.metadata.provenance);
  });

  it('preserves relationship provenance the same way', () => {
    const result = mapOkfRelationshipToGraphRelationship(containsRelationship);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.relationship.provenance).toEqual(containsRelationship.metadata.provenance);
  });
});

describe('confidence and evidence preservation (Step 9.5)', () => {
  it('flattens singular confidence (level/score) and confidenceDetail.basis onto scalar properties', () => {
    const result = mapOkfObjectToGraphNode(container);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.node.properties.confidenceLevel).toBe('high');
    expect(result.node.properties.confidenceScore).toBe(0.9);
    expect(result.node.properties.confidenceBasis).toBe('observed');
  });

  it('preserves the full evidence array, unflattened, on the mapped node', () => {
    const result = mapOkfObjectToGraphNode(container);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.node.evidence).toEqual(container.evidence);
  });

  it('does not fabricate a confidence score that was never present', () => {
    const noScore: CanonicalKnowledgeObject = {
      ...domain,
      metadata: { ...domain.metadata, confidence: { level: 'medium' } },
    };
    const result = mapOkfObjectToGraphNode(noScore);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('unreachable');
    expect(result.node.properties.confidenceScore).toBeUndefined();
  });
});

describe('unsupported/invalid kind handling (Step 9.6)', () => {
  it('does not throw, and reports an issue, for an unknown object kind', () => {
    const unknownKind: CanonicalKnowledgeObject = { ...system, kind: 'not.a.real.kind' };
    expect(() => mapOkfObjectToGraphNode(unknownKind)).not.toThrow();
    const result = mapOkfObjectToGraphNode(unknownKind);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.issue.elementType).toBe('object');
    expect(result.issue.kind).toBe('not.a.real.kind');
  });

  it('does not throw, and reports an issue, for an unknown relationship kind', () => {
    const unknownKind: CanonicalKnowledgeRelationship = {
      ...containsRelationship,
      kind: 'notARealRelationship',
    };
    expect(() => mapOkfRelationshipToGraphRelationship(unknownKind)).not.toThrow();
    const result = mapOkfRelationshipToGraphRelationship(unknownKind);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('unreachable');
    expect(result.issue.elementType).toBe('relationship');
  });

  it('collects issues at the bundle level instead of aborting the whole mapping', () => {
    const bundleWithOneBadObject: CanonicalKnowledgeBundle = {
      ...BUNDLE,
      objects: [
        ...ALL_OBJECTS,
        { ...system, identity: identity('sys-bad'), kind: 'not.a.real.kind' },
      ],
    };
    const result = mapOkfBundleToGraph(bundleWithOneBadObject);
    expect(result.nodes).toHaveLength(ALL_OBJECTS.length);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]?.kind).toBe('not.a.real.kind');
  });
});

describe('mapOkfBundleToGraph -- deterministic output (Step 9.8)', () => {
  it('produces byte-identical output across two runs over the same input', () => {
    const first = mapOkfBundleToGraph(BUNDLE);
    const second = mapOkfBundleToGraph(BUNDLE);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('produces the same output regardless of input array order', () => {
    const reordered: CanonicalKnowledgeBundle = {
      ...BUNDLE,
      objects: [...ALL_OBJECTS].reverse(),
      relationships: [...ALL_RELATIONSHIPS].reverse(),
    };
    const inOrder = mapOkfBundleToGraph(BUNDLE);
    const reversed = mapOkfBundleToGraph(reordered);
    expect(JSON.stringify(reversed)).toBe(JSON.stringify(inOrder));
  });

  it('maps the whole real fixture bundle: every object and every relationship, zero issues', () => {
    const result = mapOkfBundleToGraph(BUNDLE);
    expect(result.nodes).toHaveLength(ALL_OBJECTS.length);
    expect(result.relationships).toHaveLength(ALL_RELATIONSHIPS.length);
    expect(result.issues).toEqual([]);
  });
});

describe('CURRENTLY_PRODUCED_OBJECT_KINDS documents real Phase 3 coverage accurately', () => {
  it('matches the two kinds bridge-http.ts/bridge-persistence.ts actually produce', () => {
    expect(CURRENTLY_PRODUCED_OBJECT_KINDS).toEqual(['integration.api', 'domain.entity']);
  });
});

describe('mapOkfBundleToGraph -- duplicate ids never reach the write path (P8)', () => {
  it('excludes and reports BOTH objects that share an id, rather than letting MERGE collapse them', () => {
    const impostor = { ...entity, identity: { ...entity.identity, id: container.identity.id } };
    const result = mapOkfBundleToGraph({ ...BUNDLE, objects: [...ALL_OBJECTS, impostor] });

    expect(result.nodes.some((node) => node.id === container.identity.id)).toBe(false);
    const duplicateIssues = result.issues.filter((issue) => issue.id === container.identity.id);
    expect(duplicateIssues).toHaveLength(2);
    expect(duplicateIssues.map((issue) => issue.kind).sort()).toEqual(['Container', 'Entity']);
    for (const issue of duplicateIssues) expect(issue.reason).toMatch(/duplicate id/);
  });

  it('excludes and reports both relationships that share an id', () => {
    const clash = { ...hasAssociationRelationship, id: containsRelationship.id };
    const result = mapOkfBundleToGraph({
      ...BUNDLE,
      relationships: [...ALL_RELATIONSHIPS, clash],
    });

    expect(result.relationships.some((r) => r.id === containsRelationship.id)).toBe(false);
    expect(
      result.issues.filter(
        (issue) => issue.elementType === 'relationship' && issue.id === containsRelationship.id,
      ),
    ).toHaveLength(2);
    // Unrelated relationships are untouched.
    expect(result.relationships.map((r) => r.id)).toContain(dependsOnRelationship.id);
  });

  it('leaves a bundle with unique ids exactly as before', () => {
    const result = mapOkfBundleToGraph(BUNDLE);
    expect(result.issues).toEqual([]);
    expect(result.nodes).toHaveLength(ALL_OBJECTS.length);
    expect(result.relationships).toHaveLength(ALL_RELATIONSHIPS.length);
  });
});

describe('kinds produced after Phase 4 reach the graph (P8)', () => {
  it.each([
    ['reconciliation.conflict', 'Conflict'],
    ['workitem.issue', 'WorkItem'],
    ['business.capability', 'Capability'],
  ])('maps %s objects to :%s nodes instead of reporting them unmappable', (kind, label) => {
    const result = mapOkfObjectToGraphNode({ ...entity, kind } as typeof entity);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.node.label).toBe(label);
  });

  it.each([
    ['groundedIn', 'GROUNDED_IN'],
    ['comprises', 'COMPRISES'],
    ['realizedBy', 'REALIZED_BY'],
  ])('maps %s relationships to %s instead of dropping the traceability edge', (kind, type) => {
    const result = mapOkfRelationshipToGraphRelationship({ ...containsRelationship, kind });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.relationship.type).toBe(type);
  });
});
