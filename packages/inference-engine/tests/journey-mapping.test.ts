import { describe, expect, it } from 'vitest';
import { validateCanonicalKnowledgeRelationship } from '@phoenix-ai/knowledge-graph';
import { extractTechnicalEvidence } from '../src/inference-contract.js';
import { extractVocabulary } from '../src/vocabulary.js';
import { inferBusinessConcepts, type BusinessConceptCandidate } from '../src/concept-inference.js';
import { inferJourneys } from '../src/journey-inference.js';
import { inferEntityStates } from '../src/state-inference.js';
import { mapJourneysToEntitiesAndStates } from '../src/journey-mapping.js';
import { GENERATED_AT, SYSTEM_ID, WIDGET_OBJECTS } from './fixtures.js';

function entityObjectIdMap(concepts: readonly BusinessConceptCandidate[]): Map<string, string> {
  return new Map(concepts.map((c) => [c.id, c.existingObjectId ?? c.id]));
}

function buildMapping() {
  const items = extractTechnicalEvidence(WIDGET_OBJECTS);
  const terms = extractVocabulary(items, GENERATED_AT);
  const concepts = inferBusinessConcepts(terms, WIDGET_OBJECTS, GENERATED_AT);
  const idMap = entityObjectIdMap(concepts);
  const journeys = inferJourneys(WIDGET_OBJECTS, concepts, SYSTEM_ID, GENERATED_AT);
  const states = inferEntityStates(WIDGET_OBJECTS, concepts, idMap, SYSTEM_ID, GENERATED_AT);
  const mapping = mapJourneysToEntitiesAndStates(journeys.objects, states.objects, concepts, idMap);
  return { journeys, states, mapping };
}

describe('mapJourneysToEntitiesAndStates (P5-07)', () => {
  it('maps a read-only action (getWidget) to readsEntity, not writesEntity', () => {
    const { journeys, mapping } = buildMapping();
    const getAction = journeys.objects.find(
      (o) => o.kind === 'journey.action' && o.label === 'getWidget',
    )!;
    const relationship = mapping.relationships.find(
      (r) =>
        r.sourceObjectId === getAction.identity.id &&
        (r.kind === 'readsEntity' || r.kind === 'writesEntity'),
    );
    expect(relationship?.kind).toBe('readsEntity');
    expect(relationship?.targetObjectId).toBe('entity-widget');
  });

  it('maps a mutating action (createWidget) to writesEntity', () => {
    const { journeys, mapping } = buildMapping();
    const createAction = journeys.objects.find(
      (o) => o.kind === 'journey.action' && o.label === 'createWidget',
    )!;
    const relationship = mapping.relationships.find(
      (r) => r.sourceObjectId === createAction.identity.id,
    );
    expect(relationship?.kind).toBe('writesEntity');
  });

  it('maps a status-changing action (confirmWidget) to triggersTransition, pointing at the real inferred state', () => {
    const { journeys, states, mapping } = buildMapping();
    const confirmAction = journeys.objects.find(
      (o) => o.kind === 'journey.action' && o.label === 'confirmWidget',
    )!;
    const transition = mapping.relationships.find(
      (r) => r.sourceObjectId === confirmAction.identity.id && r.kind === 'triggersTransition',
    );
    expect(transition).toBeDefined();
    const targetState = states.objects.find((o) => o.identity.id === transition!.targetObjectId);
    expect(targetState?.label).toBe('Confirmed');
  });

  it('supports multiple journey actions writing to the same entity without collapsing them', () => {
    const { mapping } = buildMapping();
    const writesToWidget = mapping.relationships.filter(
      (r) => r.kind === 'writesEntity' && r.targetObjectId === 'entity-widget',
    );
    expect(writesToWidget.length).toBeGreaterThan(1);
  });

  it('produces only valid relationships', () => {
    const { mapping } = buildMapping();
    for (const relationship of mapping.relationships) {
      expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
        valid: true,
        errors: [],
      });
    }
  });
});
