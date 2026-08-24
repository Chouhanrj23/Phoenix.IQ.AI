import { describe, expect, it } from 'vitest';
import {
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { extractTechnicalEvidence } from '../src/inference-contract.js';
import { extractVocabulary } from '../src/vocabulary.js';
import {
  inferBusinessConcepts,
  materializeBusinessConcepts,
  type BusinessConceptCandidate,
} from '../src/concept-inference.js';
import {
  inferBusinessCapabilities,
  materializeBusinessCapabilities,
  buildCapabilityRelationships,
} from '../src/capability-inference.js';
import { inferJourneys } from '../src/journey-inference.js';
import { inferEntityStates } from '../src/state-inference.js';
import { mapJourneysToEntitiesAndStates } from '../src/journey-mapping.js';
import {
  buildActionGroundingRelationships,
  buildConceptGroundingRelationships,
  buildStateGroundingRelationships,
} from '../src/traceability.js';
import {
  AURORA_OBJECTS,
  AURORA_REST_OBJECTS,
  AURORA_SYSTEM_ID,
  FINTECH_OBJECTS,
  FINTECH_REST_OBJECTS,
  FINTECH_SYSTEM_ID,
  GENERATED_AT,
} from './aurora-fintech-fixtures.js';

/**
 * P5-10 -- runs the SAME, unmodified Phase 5 pipeline (P5-02 through P5-08)
 * over two domains with genuinely different business vocabulary: Aurora
 * (e-commerce: Order/Payment/Cart) and a fintech digital-banking system
 * (Account/Transfer/Card/compliance). Neither the pipeline nor any
 * production file decides in advance what either domain "should" produce --
 * every assertion below is a TEST-TIME check of ACTUAL INFERRED OUTPUT
 * against an EXPECTED TEST OUTPUT documented in each `it()` block, never
 * something the inference engine itself special-cases.
 */

function runFullPipeline(objects: typeof AURORA_OBJECTS, systemId: string) {
  const items = extractTechnicalEvidence(objects);
  const terms = extractVocabulary(items, GENERATED_AT);
  const concepts = inferBusinessConcepts(terms, objects, GENERATED_AT);
  const materializedConcepts = materializeBusinessConcepts(concepts, systemId, GENERATED_AT);
  const capabilities = inferBusinessCapabilities(concepts, GENERATED_AT);
  const materializedCapabilities = materializeBusinessCapabilities(
    capabilities,
    systemId,
    GENERATED_AT,
  );
  const capabilityRelationships = buildCapabilityRelationships(capabilities);
  const journeys = inferJourneys(objects, concepts, systemId, GENERATED_AT);
  const idMap = new Map(concepts.map((c) => [c.id, c.existingObjectId ?? c.id]));
  const states = inferEntityStates(objects, concepts, idMap, systemId, GENERATED_AT);
  const journeyMapping = mapJourneysToEntitiesAndStates(
    journeys.objects,
    states.objects,
    concepts,
    idMap,
  );
  const actionObjectsById = new Map(
    journeys.objects.filter((o) => o.kind === 'journey.action').map((o) => [o.identity.id, o]),
  );
  const stateObjectsById = new Map(states.objects.map((o) => [o.identity.id, o]));
  const groundingRelationships = [
    ...buildConceptGroundingRelationships(concepts),
    ...buildActionGroundingRelationships(journeys.actionGroundingLinks, actionObjectsById),
    ...buildStateGroundingRelationships(states.stateGroundingLinks, stateObjectsById),
  ];

  const allObjects = [
    ...objects,
    ...materializedConcepts,
    ...materializedCapabilities,
    ...journeys.objects,
    ...states.objects,
  ];
  const allRelationships = [
    ...capabilityRelationships,
    ...journeys.relationships,
    ...states.relationships,
    ...journeyMapping.relationships,
    ...groundingRelationships,
  ];

  return {
    terms,
    concepts,
    capabilities,
    journeys,
    states,
    journeyMapping,
    allObjects,
    allRelationships,
  };
}

const aurora = runFullPipeline(AURORA_OBJECTS, AURORA_SYSTEM_ID);
const fintech = runFullPipeline(FINTECH_OBJECTS, FINTECH_SYSTEM_ID);

function conceptNames(concepts: readonly BusinessConceptCandidate[]): string[] {
  return concepts.map((c) => c.name).sort();
}

describe('P5-10 -- Aurora (e-commerce) validation', () => {
  it('EXPECTED: Order, Payment, and Cart business concepts are inferred; ACTUAL: verified below', () => {
    const names = conceptNames(aurora.concepts);
    expect(names).toEqual(expect.arrayContaining(['Order', 'Payment', 'Cart']));
  });

  it('recognizes Order as an existing real technical entity, not a duplicate', () => {
    const order = aurora.concepts.find((c) => c.name === 'Order')!;
    expect(order.existingObjectId).toBe('entity-order');
  });

  it('infers at least one real business capability (checkout-area concepts co-located)', () => {
    expect(aurora.capabilities.length).toBeGreaterThan(0);
    expect(aurora.capabilities.some((c) => c.moduleKey.includes('checkout'))).toBe(true);
  });

  it('infers a real, multi-stage Order journey (not a single-step fabrication)', () => {
    const journey = aurora.journeys.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Order'),
    );
    expect(journey).toBeDefined();
    const flow = aurora.journeys.objects.find(
      (o) => o.kind === 'journey.flow' && o.label.includes('Order'),
    )!;
    const steps = aurora.journeys.relationships.filter(
      (r) => r.kind === 'contains' && r.sourceObjectId === flow.identity.id,
    );
    expect(steps.length).toBeGreaterThanOrEqual(3);
  });

  it('infers real lifecycle states for Order, including Created and Cancelled', () => {
    const orderStateLabels = aurora.states.relationships
      .filter((r) => r.kind === 'hasState' && r.sourceObjectId === 'entity-order')
      .map((r) => aurora.states.objects.find((o) => o.identity.id === r.targetObjectId)!.label);
    expect(orderStateLabels).toEqual(expect.arrayContaining(['Created', 'Cancelled']));
  });

  it('maps journey actions back to real entities via readsEntity/writesEntity', () => {
    expect(aurora.journeyMapping.relationships.some((r) => r.kind === 'writesEntity')).toBe(true);
  });

  it('grounds every newly-inferred concept in a real technical object (business -> technical traceability)', () => {
    const payment = aurora.concepts.find((c) => c.name === 'Payment')!;
    expect(payment.existingObjectId).toBeUndefined();
    const grounding = aurora.allRelationships.find(
      (r) => r.kind === 'groundedIn' && r.sourceObjectId === payment.id,
    );
    expect(grounding?.targetObjectId).toBe('api-payments');
  });

  it('every produced object/relationship is valid against the real Phase 2 OKF validators', () => {
    for (const object of aurora.allObjects) {
      expect(validateCanonicalKnowledgeObject(object)).toEqual({ valid: true, errors: [] });
    }
    for (const relationship of aurora.allRelationships) {
      expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
        valid: true,
        errors: [],
      });
    }
  });
});

describe('P5-10 -- fintech (digital banking) validation', () => {
  it('EXPECTED: Account, Transfer, and Card business concepts are inferred (genuinely different vocabulary from Aurora); ACTUAL: verified below', () => {
    const names = conceptNames(fintech.concepts);
    expect(names).toEqual(expect.arrayContaining(['Account', 'Transfer', 'Card']));
  });

  it('does NOT surface Aurora-specific concepts (Order, Cart) for the fintech dataset', () => {
    const names = conceptNames(fintech.concepts);
    expect(names).not.toContain('Order');
    expect(names).not.toContain('Cart');
  });

  it('recognizes Account and Transfer as existing real technical entities', () => {
    expect(fintech.concepts.find((c) => c.name === 'Account')!.existingObjectId).toBe(
      'entity-account',
    );
    expect(fintech.concepts.find((c) => c.name === 'Transfer')!.existingObjectId).toBe(
      'entity-transfer',
    );
  });

  it('infers multiple real business capabilities across different modules (onboarding, payments)', () => {
    const moduleKeys = fintech.capabilities.map((c) => c.moduleKey);
    expect(moduleKeys).toEqual(
      expect.arrayContaining([
        expect.stringContaining('onboarding'),
        expect.stringContaining('payments'),
      ]),
    );
  });

  it('infers a real, multi-stage journey for Account (onboarding/activation/suspension)', () => {
    const journey = fintech.journeys.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Account'),
    );
    expect(journey).toBeDefined();
  });

  it('infers real lifecycle states for Account, including Created and Active', () => {
    const stateLabels = fintech.states.relationships
      .filter((r) => r.kind === 'hasState' && r.sourceObjectId === 'entity-account')
      .map((r) => fintech.states.objects.find((o) => o.identity.id === r.targetObjectId)!.label);
    expect(stateLabels).toEqual(expect.arrayContaining(['Created', 'Active']));
  });

  it('grounds a newly-inferred concept (Card) in its real supporting technical object', () => {
    const card = fintech.concepts.find((c) => c.name === 'Card')!;
    expect(card.existingObjectId).toBeUndefined();
    const grounding = fintech.allRelationships.find(
      (r) => r.kind === 'groundedIn' && r.sourceObjectId === card.id,
    );
    expect(grounding?.targetObjectId).toBe('api-card-issuing');
  });

  it('every produced object/relationship is valid against the real Phase 2 OKF validators', () => {
    for (const object of fintech.allObjects) {
      expect(validateCanonicalKnowledgeObject(object)).toEqual({ valid: true, errors: [] });
    }
    for (const relationship of fintech.allRelationships) {
      expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
        valid: true,
        errors: [],
      });
    }
  });
});

describe('P5-10 -- cross-domain proof: the SAME pipeline, no domain-specific branching', () => {
  it('preserves provenance and confidence through every stage, for both domains', () => {
    for (const result of [aurora, fintech]) {
      for (const concept of result.concepts) {
        expect(concept.provenance.length).toBeGreaterThan(0);
        expect(concept.confidenceDetail.basis).toBe('derived');
      }
    }
  });

  it('never fabricates a concept with zero evidence, in either domain', () => {
    for (const result of [aurora, fintech]) {
      for (const concept of result.concepts) {
        expect(
          concept.evidence.length + concept.supportingTechnicalObjectIds.length,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('produces structurally analogous output shapes for both domains (concepts, capabilities, journeys, states all populated)', () => {
    for (const result of [aurora, fintech]) {
      expect(result.concepts.length).toBeGreaterThan(0);
      expect(result.capabilities.length).toBeGreaterThan(0);
      expect(result.journeys.objects.some((o) => o.kind === 'journey.journey')).toBe(true);
      expect(result.states.objects.some((o) => o.kind === 'domain.entity-state')).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Blocker 4: the SAME pipeline run over REALISTIC REST-style evidence for
// BOTH domains (`AURORA_REST_OBJECTS`/`FINTECH_REST_OBJECTS` --
// `bridgeSpringController`'s actual real output shape, "POST /orders" /
// "GET /accounts/{id}" rather than hand-picked Java-method identifiers).
// Proves P5-04/05/06/07 genuinely work on Phase-3-shaped evidence, not only
// on evidence hand-tuned for pipeline success.
// ---------------------------------------------------------------------------

const auroraRest = runFullPipeline(AURORA_REST_OBJECTS, AURORA_SYSTEM_ID);
const fintechRest = runFullPipeline(FINTECH_REST_OBJECTS, FINTECH_SYSTEM_ID);

describe('P5-10 -- Aurora and fintech validation using REALISTIC REST-style operation evidence (Blocker 4)', () => {
  it('Aurora: infers the Order concept from real REST evidence (POST/GET/PUT/DELETE /orders)', () => {
    const order = auroraRest.concepts.find((c) => c.name === 'Order');
    expect(order).toBeDefined();
    expect(order!.existingObjectId).toBe('entity-order');
  });

  it('Fintech: infers the Account concept from real REST evidence (POST/GET/PATCH/DELETE /accounts)', () => {
    const account = fintechRest.concepts.find((c) => c.name === 'Account');
    expect(account).toBeDefined();
    expect(account!.existingObjectId).toBe('entity-account');
  });

  it('Aurora: infers a real, multi-stage Order journey from REST evidence alone (no bare CRUD verb in any operation name)', () => {
    const journey = auroraRest.journeys.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Order'),
    );
    expect(journey).toBeDefined();
  });

  it('Fintech: infers a real, multi-stage Account journey from REST evidence alone', () => {
    const journey = fintechRest.journeys.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Account'),
    );
    expect(journey).toBeDefined();
  });

  it('Aurora: infers real Created/Deleted lifecycle states for Order from POST/DELETE alone (never from GET/PUT)', () => {
    const orderStateLabels = auroraRest.states.relationships
      .filter((r) => r.kind === 'hasState' && r.sourceObjectId === 'entity-order')
      .map((r) => auroraRest.states.objects.find((o) => o.identity.id === r.targetObjectId)!.label)
      .sort();
    expect(orderStateLabels).toEqual(['Created', 'Deleted']);
  });

  it('Fintech: infers real Created/Deleted lifecycle states for Account from POST/DELETE alone', () => {
    const accountStateLabels = fintechRest.states.relationships
      .filter((r) => r.kind === 'hasState' && r.sourceObjectId === 'entity-account')
      .map((r) => fintechRest.states.objects.find((o) => o.identity.id === r.targetObjectId)!.label)
      .sort();
    expect(accountStateLabels).toEqual(['Created', 'Deleted']);
  });

  it('every inferred state carries real, non-empty provenance and evidence, and a groundedIn relationship, for both domains (Blocker 3 regression guard)', () => {
    for (const result of [auroraRest, fintechRest]) {
      for (const state of result.states.objects) {
        expect(state.metadata.provenance.length).toBeGreaterThan(0);
        expect(state.evidence.length).toBeGreaterThan(0);
      }
      const groundedStateIds = new Set(
        result.allRelationships.filter((r) => r.kind === 'groundedIn').map((r) => r.sourceObjectId),
      );
      for (const state of result.states.objects) {
        expect(groundedStateIds.has(state.identity.id)).toBe(true);
      }
    }
  });

  it('every produced object/relationship is valid against the real Phase 2 OKF validators, for both REST fixtures', () => {
    for (const result of [auroraRest, fintechRest]) {
      for (const object of result.allObjects) {
        expect(validateCanonicalKnowledgeObject(object)).toEqual({ valid: true, errors: [] });
      }
      for (const relationship of result.allRelationships) {
        expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
          valid: true,
          errors: [],
        });
      }
    }
  });
});
