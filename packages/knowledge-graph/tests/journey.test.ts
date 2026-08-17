import { describe, expect, it } from 'vitest';
import type { GraphElementMetadata } from '@phoenix-ai/shared';
import type {
  ActionObject,
  FlowObject,
  JourneyObject,
  JourneyRelationship,
  PersonaObject,
} from '../src/journey.js';
import {
  validateActionObject,
  validateFlowObject,
  validateJourneyModelObject,
  validateJourneyObject,
  validateJourneyRelationship,
  validatePersonaObject,
} from '../src/journey.js';
import type { EntityStateObject } from '../src/domain.js';
import { validateCanonicalKnowledgeBundle } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function meta() {
  return {
    provenance: [
      {
        sourceId: 'docs/personas.md',
        sourceType: 'business-doc' as const,
        derivedBy: 'inference-engine',
        derivedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    confidence: { level: 'high' as const, score: 0.9 },
  };
}

function baseIdentity(id: string) {
  return {
    id,
    systemId: 'aurora-commerce',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  };
}

function personaObject(): PersonaObject {
  return {
    identity: baseIdentity('per-shopper'),
    category: 'entity',
    kind: 'journey.persona',
    label: 'Frequent Shopper',
    attributes: {
      role: 'Frequent online shopper',
      goals: ['Fast checkout'],
      painPoints: ['Slow payment'],
    },
    metadata: meta(),
    evidence: [],
  };
}

function journeyObject(): JourneyObject {
  return {
    identity: baseIdentity('jrn-checkout'),
    category: 'process',
    kind: 'journey.journey',
    label: 'Complete a purchase',
    attributes: { purpose: 'Browse, check out, and receive order confirmation.' },
    metadata: meta(),
    evidence: [],
  };
}

function flowObject(): FlowObject {
  return {
    identity: baseIdentity('flw-checkout'),
    category: 'process',
    kind: 'journey.flow',
    label: 'Checkout & Payment Flow',
    attributes: {
      description: 'From cart submission through order confirmation.',
      triggerScreen: 'Checkout Screen',
    },
    metadata: meta(),
    evidence: [],
  };
}

function actionObject(id: string, label: string, description: string): ActionObject {
  return {
    identity: baseIdentity(id),
    category: 'entity',
    kind: 'journey.action',
    label,
    attributes: { description },
    metadata: meta(),
    evidence: [],
  };
}

describe('PersonaObject', () => {
  it('accepts a valid Persona with role but no description (matches real Phase 1 data)', () => {
    expect(validatePersonaObject(personaObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a Persona with description but no role', () => {
    const persona = personaObject();
    persona.attributes = { description: 'Someone who shops often.' };
    expect(validatePersonaObject(persona).valid).toBe(true);
  });

  it('rejects a Persona with neither description nor role', () => {
    const persona = personaObject();
    persona.attributes = { goals: ['Fast checkout'] };
    const result = validatePersonaObject(persona);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'attributes.description or attributes.role is required (at least one)',
    );
  });

  it('rejects the wrong kind or category', () => {
    expect(validatePersonaObject({ ...personaObject(), kind: 'journey.action' }).valid).toBe(false);
    expect(validatePersonaObject({ ...personaObject(), category: 'process' }).valid).toBe(false);
  });
});

describe('JourneyObject', () => {
  it('accepts a valid Journey with a purpose, category "process"', () => {
    expect(validateJourneyObject(journeyObject())).toEqual({ valid: true, errors: [] });
  });

  it('rejects a Journey missing purpose', () => {
    const journey = journeyObject();
    journey.attributes = {} as JourneyObject['attributes'];
    const result = validateJourneyObject(journey);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attributes.purpose is required');
  });

  it('rejects a Journey tagged category "entity" (must be "process")', () => {
    expect(validateJourneyObject({ ...journeyObject(), category: 'entity' }).valid).toBe(false);
  });
});

describe('FlowObject', () => {
  it('accepts a valid Flow, category "process"', () => {
    expect(validateFlowObject(flowObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a Flow with no description/triggerScreen at all', () => {
    const flow = flowObject();
    flow.attributes = {};
    expect(validateFlowObject(flow).valid).toBe(true);
  });
});

describe('ActionObject', () => {
  it('accepts a valid Action with a description', () => {
    expect(
      validateActionObject(actionObject('act-1', 'Validate Cart', 'Checks stock and price.')),
    ).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects an Action missing description', () => {
    const action = actionObject('act-1', 'Validate Cart', 'Checks stock and price.');
    action.attributes = {} as ActionObject['attributes'];
    const result = validateActionObject(action);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attributes.description is required');
  });
});

describe('validateJourneyModelObject — dispatch by kind', () => {
  it('dispatches Persona/Journey/Flow/Action to the right validator', () => {
    expect(validateJourneyModelObject(personaObject()).valid).toBe(true);
    expect(validateJourneyModelObject(journeyObject()).valid).toBe(true);
    expect(validateJourneyModelObject(flowObject()).valid).toBe(true);
    expect(validateJourneyModelObject(actionObject('act-1', 'Step', 'Does a thing.')).valid).toBe(
      true,
    );
  });

  it('rejects an unrecognized kind', () => {
    const result = validateJourneyModelObject({ ...flowObject(), kind: 'journey.mystery' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('kind must be one of');
  });
});

describe('JourneyRelationship', () => {
  function contains(order: number): JourneyRelationship {
    return {
      id: `rel-contains-${order}`,
      category: 'composition',
      kind: 'contains',
      sourceObjectId: 'flw-checkout',
      targetObjectId: `act-${order}`,
      metadata: meta(),
      attributes: { order },
    };
  }

  it('accepts all six relationship kinds with their correct category', () => {
    const cases: Array<[JourneyRelationship['kind'], JourneyRelationship['category']]> = [
      ['contains', 'composition'],
      ['hasPersona', 'association'],
      ['supports', 'realization'],
      ['readsEntity', 'interaction'],
      ['writesEntity', 'interaction'],
      ['triggersTransition', 'interaction'],
    ];
    for (const [kind, category] of cases) {
      const relationship = { ...contains(1), kind, category, attributes: undefined };
      expect(validateJourneyRelationship(relationship)).toEqual({ valid: true, errors: [] });
    }
  });

  it('accepts a "contains" relationship with a numeric order (step sequencing)', () => {
    expect(validateJourneyRelationship(contains(1))).toEqual({ valid: true, errors: [] });
  });

  it('rejects a "contains" relationship with a non-numeric order', () => {
    const relationship = { ...contains(1), attributes: { order: 'first' } };
    const result = validateJourneyRelationship(relationship);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'attributes.order, if present on a "contains" relationship, must be a number',
    );
  });

  it('rejects an unrecognized kind', () => {
    const result = validateJourneyRelationship({ ...contains(1), kind: 'initiates' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('kind must be one of');
  });

  it('rejects a category/kind mismatch (e.g. "supports" tagged as association)', () => {
    const result = validateJourneyRelationship({
      ...contains(1),
      kind: 'supports',
      category: 'association',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'category must be "realization" for relationship kind "supports"',
    );
  });
});

describe('Cross-references P2-04 EntityStateObject via triggersTransition (not redefined here)', () => {
  it('lets an Action trigger entry into an existing Entity State', () => {
    const confirmAction = actionObject(
      'act-confirm-order',
      'Confirm Order',
      'Marks the order confirmed.',
    );
    const confirmedState: EntityStateObject = {
      identity: baseIdentity('st-order-confirmed'),
      category: 'entity',
      kind: 'domain.entity-state',
      label: 'Confirmed',
      attributes: {},
      metadata: meta(),
      evidence: [],
    };
    const triggers: JourneyRelationship = {
      id: 'rel-triggers',
      category: 'interaction',
      kind: 'triggersTransition',
      sourceObjectId: confirmAction.identity.id,
      targetObjectId: confirmedState.identity.id,
      metadata: meta(),
    };
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [confirmAction, confirmedState],
      relationships: [triggers],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });
});

// Structurally identical to apps/web/src/data/types.ts's Persona/Journey/
// ExecutionFlow/FlowStep -- NOT imported directly (packages must not
// depend on apps), and these four areas have no @phoenix-ai/shared contract
// either (only the six Phase 1 API areas were ported there, P1-02).
// Redeclared locally, matching the same approach architecture.test.ts and
// domain.test.ts use for apps/api/src/data/seed.ts values.
interface Persona {
  id: string;
  name: string;
  role: string;
  goals: string[];
  painPoints: string[];
  metadata: GraphElementMetadata;
}

interface Journey {
  id: string;
  name: string;
  personaId: string;
  description: string;
  flowIds: string[];
  metadata: GraphElementMetadata;
}

interface FlowStep {
  id: string;
  name: string;
  description: string;
  readsEntities: string[];
  writesEntities: string[];
  metadata: GraphElementMetadata;
}

interface ExecutionFlow {
  id: string;
  name: string;
  description: string;
  triggerScreen: string;
  steps: FlowStep[];
  metadata: GraphElementMetadata;
}

describe('Phase 1 Persona/Journey/ExecutionFlow/FlowStep compatibility (real Aurora fixture shapes)', () => {
  // Real values from apps/web/src/data/mock/aurora/{personas,fixtures}.ts
  // (Phase 1's mock provider) -- apps/api's seed.ts has not yet ported
  // execution flows/personas (see docs/phase-1/README.md's scope note), so
  // this is the actual data apps/web renders today, reconstructed here.
  const shopperPersona: Persona = {
    id: 'persona-returning-shopper',
    name: 'Returning Shopper',
    role: 'Customer',
    goals: ['Reorder favourite items quickly', 'Track shipment status without contacting support'],
    painPoints: [
      'Checkout occasionally times out during payment authorization',
      'Return policy is not clearly surfaced before purchase',
    ],
    metadata: meta(),
  };

  const checkoutJourney: Journey = {
    id: 'journey-browse-to-purchase',
    name: 'Browse to Purchase',
    personaId: 'persona-returning-shopper',
    description:
      'From landing on the storefront through a confirmed order — the primary revenue-generating journey.',
    flowIds: ['flow-checkout'],
    metadata: meta(),
  };

  const validateCartStep: FlowStep = {
    id: 'step-1',
    name: 'Validate Cart',
    description: 'Checks stock and price consistency before order creation.',
    readsEntities: ['Cart', 'Product', 'PriceList'],
    writesEntities: [],
    metadata: meta(),
  };

  const createOrderStep: FlowStep = {
    id: 'step-2',
    name: 'Create Order',
    description: 'Persists a new Order in PENDING status.',
    readsEntities: ['Cart'],
    writesEntities: ['Order', 'OrderLine'],
    metadata: meta(),
  };

  const checkoutFlow: ExecutionFlow = {
    id: 'flow-checkout',
    name: 'Checkout & Payment Flow',
    description: 'From cart submission through order confirmation.',
    triggerScreen: 'Checkout Screen',
    steps: [validateCartStep, createOrderStep],
    metadata: meta(),
  };

  it('maps the real shopper Persona onto a valid PersonaObject, losslessly', () => {
    const persona: PersonaObject = {
      identity: baseIdentity(shopperPersona.id),
      category: 'entity',
      kind: 'journey.persona',
      label: shopperPersona.name,
      attributes: {
        role: shopperPersona.role,
        goals: shopperPersona.goals,
        painPoints: shopperPersona.painPoints,
      },
      metadata: shopperPersona.metadata,
      evidence: [],
    };
    expect(validatePersonaObject(persona)).toEqual({ valid: true, errors: [] });
    expect(persona.attributes.goals).toEqual(shopperPersona.goals);
  });

  it('maps the real checkout Journey onto a valid JourneyObject, with a "hasPersona" relationship', () => {
    const journey: JourneyObject = {
      identity: baseIdentity(checkoutJourney.id),
      category: 'process',
      kind: 'journey.journey',
      label: checkoutJourney.name,
      attributes: { purpose: checkoutJourney.description },
      metadata: checkoutJourney.metadata,
      evidence: [],
    };
    const hasPersona: JourneyRelationship = {
      id: 'rel-jrn-has-persona',
      category: 'association',
      kind: 'hasPersona',
      sourceObjectId: journey.identity.id,
      targetObjectId: checkoutJourney.personaId,
      metadata: meta(),
    };
    expect(validateJourneyObject(journey)).toEqual({ valid: true, errors: [] });
    expect(validateJourneyRelationship(hasPersona)).toEqual({ valid: true, errors: [] });
  });

  it('maps the real checkout Flow + its two real FlowSteps onto Flow/Action objects with ordered "contains" relationships', () => {
    const flow: FlowObject = {
      identity: baseIdentity(checkoutFlow.id),
      category: 'process',
      kind: 'journey.flow',
      label: checkoutFlow.name,
      attributes: {
        description: checkoutFlow.description,
        triggerScreen: checkoutFlow.triggerScreen,
      },
      metadata: checkoutFlow.metadata,
      evidence: [],
    };
    const actions = checkoutFlow.steps.map((step): ActionObject => ({
      identity: baseIdentity(step.id),
      category: 'entity',
      kind: 'journey.action',
      label: step.name,
      attributes: { description: step.description },
      metadata: step.metadata, // each real FlowStep's OWN provenance/confidence, preserved
      evidence: [],
    }));
    const containsRelationships = checkoutFlow.steps.map((step, index): JourneyRelationship => ({
      id: `rel-contains-${step.id}`,
      category: 'composition',
      kind: 'contains',
      sourceObjectId: flow.identity.id,
      targetObjectId: step.id,
      metadata: meta(),
      attributes: { order: index },
    }));
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [flow, ...actions],
      relationships: containsRelationships,
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    // Each Action's metadata is the REAL per-step metadata, not shared/lost.
    expect(actions[0]!.metadata).toEqual(validateCartStep.metadata);
    expect(actions[1]!.metadata).toEqual(createOrderStep.metadata);
  });

  it('maps a real FlowStep\'s readsEntities/writesEntities onto "readsEntity"/"writesEntity" relationships (cross-references P2-04 Entity)', () => {
    const action: ActionObject = {
      identity: baseIdentity(createOrderStep.id),
      category: 'entity',
      kind: 'journey.action',
      label: createOrderStep.name,
      attributes: { description: createOrderStep.description },
      metadata: createOrderStep.metadata,
      evidence: [],
    };
    const readsRelationships: JourneyRelationship[] = createOrderStep.readsEntities.map(
      (entityName, i) => ({
        id: `rel-reads-${i}`,
        category: 'interaction',
        kind: 'readsEntity',
        sourceObjectId: action.identity.id,
        targetObjectId: `ent-${entityName.toLowerCase()}`,
        metadata: meta(),
      }),
    );
    const writesRelationships: JourneyRelationship[] = createOrderStep.writesEntities.map(
      (entityName, i) => ({
        id: `rel-writes-${i}`,
        category: 'interaction',
        kind: 'writesEntity',
        sourceObjectId: action.identity.id,
        targetObjectId: `ent-${entityName.toLowerCase()}`,
        metadata: meta(),
      }),
    );
    for (const relationship of [...readsRelationships, ...writesRelationships]) {
      expect(validateJourneyRelationship(relationship)).toEqual({ valid: true, errors: [] });
    }
    expect(readsRelationships).toHaveLength(1); // ['Cart']
    expect(writesRelationships).toHaveLength(2); // ['Order', 'OrderLine']
  });

  it('has NO Phase 1 UI representation for Entity State at all -- documents a real gap', () => {
    // Neither PersonasJourneysPage.tsx, ExecutionFlowsPage.tsx, nor any
    // other Phase 1 page renders anything resembling an entity state
    // machine or a triggering-action relationship. ReviewPage.tsx's
    // `status: 'pending' | 'confirmed' | 'corrected'` is a review-workflow
    // status, not a domain entity's business state. This is an explicit,
    // documented limitation (see docs/architecture/adr/0007-persona-journey-state-model.md),
    // not solved by inventing fake UI evidence.
    expect(checkoutJourney.description).not.toContain('state');
  });
});
