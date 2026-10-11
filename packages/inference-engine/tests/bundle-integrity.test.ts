import { describe, expect, it } from 'vitest';
import {
  validateCanonicalKnowledgeBundle,
  validateSourceReferences,
  type CanonicalKnowledgeObject,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import { extractTechnicalEvidence } from '../src/inference-contract.js';
import { extractVocabulary } from '../src/vocabulary.js';
import { inferBusinessConcepts, materializeBusinessConcepts } from '../src/concept-inference.js';
import {
  buildCapabilityRelationships,
  inferBusinessCapabilities,
  materializeBusinessCapabilities,
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
 * P8 -- inference output must be admissible to a real, validated bundle.
 *
 * Every earlier inference test checked inferred objects one by one; none put
 * them in a bundle whose `sources` registry contains only the sources the
 * input was actually extracted from. Doing so (as the end-to-end pipeline
 * does) exposed two defects:
 *
 *  1. `comprises` edges targeted the CONCEPT id even when that concept had
 *     been resolved to an already-extracted object and was therefore never
 *     materialised -- a dangling edge for every resolved concept.
 *  2. journeys/flows/actions claimed provenance from `sourceId: systemId`, a
 *     source no registry contains, and carried no evidence at all although
 *     every step is grounded in a real, evidenced API operation.
 */

function inferAll(objects: readonly CanonicalKnowledgeObject[], systemId: string) {
  const terms = extractVocabulary(extractTechnicalEvidence(objects), GENERATED_AT);
  const concepts = inferBusinessConcepts(terms, objects, GENERATED_AT);
  const capabilities = inferBusinessCapabilities(concepts, GENERATED_AT);
  const journeys = inferJourneys(objects, concepts, systemId, GENERATED_AT);
  const idMap = new Map(concepts.map((c) => [c.id, c.existingObjectId ?? c.id]));
  const states = inferEntityStates(objects, concepts, idMap, systemId, GENERATED_AT);
  const mapping = mapJourneysToEntitiesAndStates(journeys.objects, states.objects, concepts, idMap);
  const actions = new Map(
    journeys.objects.filter((o) => o.kind === 'journey.action').map((o) => [o.identity.id, o]),
  );
  const stateObjects = new Map(states.objects.map((o) => [o.identity.id, o]));
  return {
    concepts,
    journeys,
    objects: [
      ...objects,
      ...materializeBusinessConcepts(concepts, systemId, GENERATED_AT),
      ...materializeBusinessCapabilities(capabilities, systemId, GENERATED_AT),
      ...journeys.objects,
      ...states.objects,
    ],
    relationships: [
      ...buildCapabilityRelationships(capabilities),
      ...journeys.relationships,
      ...states.relationships,
      ...mapping.relationships,
      ...buildConceptGroundingRelationships(concepts),
      ...buildActionGroundingRelationships(journeys.actionGroundingLinks, actions),
      ...buildStateGroundingRelationships(states.stateGroundingLinks, stateObjects),
    ],
  };
}

/** The registry a real run would have: exactly the sources the INPUT objects came from. */
function registryOf(objects: readonly CanonicalKnowledgeObject[]): Source[] {
  const byId = new Map<string, Source>();
  for (const object of objects) {
    for (const entry of object.metadata.provenance) {
      byId.set(entry.sourceId, {
        id: entry.sourceId,
        type: entry.sourceType,
        label: entry.sourceId,
      });
    }
    for (const entry of object.evidence) {
      if (!byId.has(entry.sourceId)) {
        byId.set(entry.sourceId, {
          id: entry.sourceId,
          type: 'source-code',
          label: entry.sourceId,
        });
      }
    }
  }
  return [...byId.values()];
}

describe.each([
  ['Aurora', AURORA_OBJECTS, AURORA_SYSTEM_ID],
  ['Aurora (REST-shaped)', AURORA_REST_OBJECTS, AURORA_SYSTEM_ID],
  ['Fintech', FINTECH_OBJECTS, FINTECH_SYSTEM_ID],
  ['Fintech (REST-shaped)', FINTECH_REST_OBJECTS, FINTECH_SYSTEM_ID],
])('%s — inference output is admissible to a validated bundle (P8)', (_name, input, systemId) => {
  const result = inferAll(input, systemId);
  const bundle = {
    systemId,
    generatedAt: GENERATED_AT,
    objects: result.objects,
    relationships: result.relationships,
    sources: registryOf(input),
  };

  it('validates: no dangling relationship endpoints', () => {
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('every provenance and evidence source is one the input was actually extracted from', () => {
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('comprises edges target the object a resolved concept IS, never an unmaterialised concept id', () => {
    const ids = new Set(bundle.objects.map((o) => o.identity.id));
    const comprises = bundle.relationships.filter((r) => r.kind === 'comprises');
    for (const edge of comprises)
      expect(ids.has(edge.targetObjectId), edge.targetObjectId).toBe(true);
  });

  it('journey objects carry the evidence of the operations they were inferred from', () => {
    const inputEvidenceIds = new Set(input.flatMap((o) => o.evidence.map((e) => e.id)));
    for (const object of result.journeys.objects) {
      for (const entry of object.evidence) expect(inputEvidenceIds.has(entry.id)).toBe(true);
      expect(object.metadata.provenance.every((p) => p.derivedBy === 'inference-engine')).toBe(
        true,
      );
    }
  });
});

describe('a journey never cites a source that was not observed (P8)', () => {
  it('uses the grounding API sources, not the systemId', () => {
    const result = inferAll(AURORA_OBJECTS, AURORA_SYSTEM_ID);
    for (const object of result.journeys.objects) {
      for (const entry of object.metadata.provenance) {
        expect(entry.sourceId).not.toBe(AURORA_SYSTEM_ID);
      }
    }
  });
});
