import { describe, expect, it } from 'vitest';
import {
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { extractTechnicalEvidence } from '../src/inference-contract.js';
import { extractVocabulary } from '../src/vocabulary.js';
import { inferBusinessConcepts, type BusinessConceptCandidate } from '../src/concept-inference.js';
import { inferEntityStates } from '../src/state-inference.js';
import { GENERATED_AT, SYSTEM_ID, WIDGET_OBJECTS } from './fixtures.js';

function entityObjectIdMap(concepts: readonly BusinessConceptCandidate[]): Map<string, string> {
  return new Map(concepts.map((c) => [c.id, c.existingObjectId ?? c.id]));
}

function buildStates() {
  const items = extractTechnicalEvidence(WIDGET_OBJECTS);
  const terms = extractVocabulary(items, GENERATED_AT);
  const concepts = inferBusinessConcepts(terms, WIDGET_OBJECTS, GENERATED_AT);
  const result = inferEntityStates(
    WIDGET_OBJECTS,
    concepts,
    entityObjectIdMap(concepts),
    SYSTEM_ID,
    GENERATED_AT,
  );
  return { concepts, result };
}

describe('inferEntityStates (P5-06)', () => {
  it('infers real states from status-verb operations (create/confirm/ship/cancel -> Created/Confirmed/Shipped/Cancelled)', () => {
    const { result } = buildStates();
    const stateLabels = result.objects
      .filter((o) => o.kind === 'domain.entity-state')
      .map((o) => o.label);
    expect(stateLabels).toEqual(
      expect.arrayContaining(['Created', 'Confirmed', 'Shipped', 'Cancelled']),
    );
  });

  it('creates hasState relationships from the real Widget entity to each of ITS inferred states', () => {
    const { result } = buildStates();
    const widgetHasState = result.relationships.filter(
      (r) => r.kind === 'hasState' && r.sourceObjectId === 'entity-widget',
    );
    expect(widgetHasState).toHaveLength(4);
    const stateLabels = widgetHasState.map(
      (r) => result.objects.find((o) => o.identity.id === r.targetObjectId)!.label,
    );
    expect(stateLabels.sort()).toEqual(['Cancelled', 'Confirmed', 'Created', 'Shipped']);
  });

  it('creates hasState relationships for other entities too (Gadget), not just Widget', () => {
    const { result } = buildStates();
    const hasState = result.relationships.filter((r) => r.kind === 'hasState');
    const distinctSources = new Set(hasState.map((r) => r.sourceObjectId));
    expect(distinctSources.size).toBeGreaterThan(1);
  });

  it('creates transitions only between states with real evidence, ordered by lifecycle stage, never alphabetically', () => {
    const { result } = buildStates();
    const transitions = result.relationships.filter((r) => r.kind === 'transitionsTo');
    const objectsById = new Map(result.objects.map((o) => [o.identity.id, o]));
    const labeledTransitions = transitions.map((t) => ({
      from: objectsById.get(t.sourceObjectId)?.label,
      to: objectsById.get(t.targetObjectId)?.label,
    }));
    // Alphabetically, "Cancelled" < "Confirmed" < "Created" < "Shipped" -- the
    // real transition chain (Created -> Confirmed -> Shipped -> Cancelled)
    // is NOT alphabetical, proving the ordering is stage-based.
    expect(labeledTransitions).toContainEqual({ from: 'Created', to: 'Confirmed' });
    expect(labeledTransitions).toContainEqual({ from: 'Confirmed', to: 'Shipped' });
    expect(labeledTransitions).toContainEqual({ from: 'Shipped', to: 'Cancelled' });
  });

  it('does not create a transition for an entity with only one observed state (Component)', () => {
    const { result } = buildStates();
    const componentStates = result.objects.filter(
      (o) =>
        o.kind === 'domain.entity-state' &&
        o.attributes.description?.toString().includes('Component'),
    );
    // Component only has "createComponent" (a status verb) -- one state, no transition.
    const transitionsInvolvingComponentStates = result.relationships.filter(
      (r) =>
        r.kind === 'transitionsTo' &&
        componentStates.some((s) => s.identity.id === r.sourceObjectId),
    );
    expect(transitionsInvolvingComponentStates).toEqual([]);
  });

  it('produces valid objects/relationships, all marked derived', () => {
    const { result } = buildStates();
    for (const object of result.objects) {
      expect(validateCanonicalKnowledgeObject(object)).toEqual({ valid: true, errors: [] });
      expect(object.confidenceDetail?.basis).toBe('derived');
    }
    for (const relationship of result.relationships) {
      expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
        valid: true,
        errors: [],
      });
    }
  });
});
