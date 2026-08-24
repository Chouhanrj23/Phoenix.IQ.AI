import { describe, expect, it } from 'vitest';
import {
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { inferJourneys } from '../src/journey-inference.js';
import { extractTechnicalEvidence } from '../src/inference-contract.js';
import { extractVocabulary } from '../src/vocabulary.js';
import { inferBusinessConcepts } from '../src/concept-inference.js';
import { CANONICAL_SCHEMA_VERSION, type ApiObject } from '@phoenix-ai/knowledge-graph';
import { GENERATED_AT, SYSTEM_ID, WIDGET_OBJECTS } from './fixtures.js';

function buildJourneys() {
  const items = extractTechnicalEvidence(WIDGET_OBJECTS);
  const terms = extractVocabulary(items, GENERATED_AT);
  const concepts = inferBusinessConcepts(terms, WIDGET_OBJECTS, GENERATED_AT);
  return { concepts, result: inferJourneys(WIDGET_OBJECTS, concepts, SYSTEM_ID, GENERATED_AT) };
}

describe('inferJourneys (P5-05)', () => {
  it('infers a real journey + flow for a concept with operations spanning multiple lifecycle stages (Widget)', () => {
    const { result } = buildJourneys();
    const journey = result.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Widget'),
    );
    const flow = result.objects.find(
      (o) => o.kind === 'journey.flow' && o.label.includes('Widget'),
    );
    expect(journey).toBeDefined();
    expect(flow).toBeDefined();
  });

  it('infers a minimal, real 2-step journey for Component (create then read IS a real 2-stage sequence)', () => {
    const { result } = buildJourneys();
    const flow = result.objects.find(
      (o) => o.kind === 'journey.flow' && o.label.includes('Component'),
    )!;
    const steps = result.relationships.filter(
      (r) => r.kind === 'contains' && r.sourceObjectId === flow.identity.id,
    );
    expect(steps).toHaveLength(2);
  });

  it('does NOT infer a journey when every operation falls in the same single lifecycle stage (all reads, no real sequence)', () => {
    const { concepts } = buildJourneys();
    const readOnlyApi: ApiObject = {
      identity: {
        id: 'api-readonly-controller',
        systemId: SYSTEM_ID,
        createdAt: GENERATED_AT,
        updatedAt: GENERATED_AT,
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      },
      category: 'entity',
      kind: 'integration.api',
      label: 'GizmoController',
      attributes: {
        operations: [
          { name: 'getGizmo', description: 'Reads a gizmo.' },
          { name: 'findGizmo', description: 'Finds a gizmo.' },
          { name: 'listGizmo', description: 'Lists gizmos.' },
        ],
      },
      metadata: {
        provenance: [
          {
            sourceId: 'repo://widget-system/services/gizmos',
            sourceType: 'source-code',
            derivedBy: 'extraction-engine',
            derivedAt: GENERATED_AT,
          },
        ],
        confidence: { level: 'high' },
      },
      evidence: [],
      confidenceDetail: { basis: 'observed' },
    };
    const items = extractTechnicalEvidence([readOnlyApi]);
    const terms = extractVocabulary(items, GENERATED_AT);
    const gizmoConcepts = inferBusinessConcepts(terms, [readOnlyApi], GENERATED_AT);
    const result = inferJourneys(
      [readOnlyApi],
      [...concepts, ...gizmoConcepts],
      SYSTEM_ID,
      GENERATED_AT,
    );
    const journey = result.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Gizmo'),
    );
    expect(journey).toBeUndefined();
  });

  it('orders steps by CRUD/lifecycle stage, never alphabetically', () => {
    const { result } = buildJourneys();
    const flow = result.objects.find(
      (o) => o.kind === 'journey.flow' && o.label.includes('Widget'),
    )!;
    const containsRelationships = result.relationships
      .filter((r) => r.kind === 'contains' && r.sourceObjectId === flow.identity.id)
      .sort((a, b) => (a.attributes?.order as number) - (b.attributes?.order as number));
    const orderedLabels = containsRelationships.map(
      (r) => result.objects.find((o) => o.identity.id === r.targetObjectId)!.label,
    );
    // create < get < confirm/ship < cancel -- alphabetically "cancelWidget" would sort
    // before "confirmWidget" before "createWidget"; this proves it is NOT alphabetical.
    expect(orderedLabels[0]).toBe('createWidget');
    expect(orderedLabels[orderedLabels.length - 1]).toBe('cancelWidget');
  });

  it('produces real, valid journey.action objects and contains/supports relationships', () => {
    const { result } = buildJourneys();
    for (const object of result.objects) {
      expect(validateCanonicalKnowledgeObject(object)).toEqual({ valid: true, errors: [] });
    }
    for (const relationship of result.relationships) {
      expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
        valid: true,
        errors: [],
      });
    }
  });

  it('marks every inferred journey element as derived, never observed', () => {
    const { result } = buildJourneys();
    for (const object of result.objects) {
      expect(object.confidenceDetail?.basis).toBe('derived');
    }
  });

  it('does not fabricate a persona -- no actor evidence exists in the fixture', () => {
    const { result } = buildJourneys();
    expect(result.objects.some((o) => o.kind === 'journey.persona')).toBe(false);
  });

  it('records an action-grounding link back to the real technical API object for every action', () => {
    const { result } = buildJourneys();
    const actionIds = new Set(
      result.objects.filter((o) => o.kind === 'journey.action').map((o) => o.identity.id),
    );
    const realApiObjectIds = new Set(
      WIDGET_OBJECTS.filter((o) => o.kind === 'integration.api').map((o) => o.identity.id),
    );
    expect(result.actionGroundingLinks.length).toBeGreaterThan(0);
    for (const link of result.actionGroundingLinks) {
      expect(actionIds.has(link.actionId)).toBe(true);
      expect(realApiObjectIds.has(link.technicalObjectId)).toBe(true);
    }
  });

  it('grounds every Widget action specifically in the real WidgetController object', () => {
    const { result } = buildJourneys();
    const widgetActionIds = new Set(
      result.objects
        .filter((o) => o.kind === 'journey.action' && o.label.toLowerCase().includes('widget'))
        .map((o) => o.identity.id),
    );
    const widgetLinks = result.actionGroundingLinks.filter((l) => widgetActionIds.has(l.actionId));
    expect(widgetLinks.length).toBeGreaterThan(0);
    for (const link of widgetLinks) expect(link.technicalObjectId).toBe('api-widget-controller');
  });
});
