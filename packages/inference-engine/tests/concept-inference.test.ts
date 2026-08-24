import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SCHEMA_VERSION,
  validateCanonicalKnowledgeObject,
  type EntityObject,
} from '@phoenix-ai/knowledge-graph';
import { extractTechnicalEvidence } from '../src/inference-contract.js';
import { extractVocabulary } from '../src/vocabulary.js';
import {
  existingEntityResolutionProvider,
  inferBusinessConcepts,
  materializeBusinessConcepts,
} from '../src/concept-inference.js';
import { GENERATED_AT, SYSTEM_ID, WIDGET_OBJECTS } from './fixtures.js';

function buildConcepts() {
  const items = extractTechnicalEvidence(WIDGET_OBJECTS);
  const terms = extractVocabulary(items, GENERATED_AT);
  return inferBusinessConcepts(terms, WIDGET_OBJECTS, GENERATED_AT);
}

describe('inferBusinessConcepts (P5-03)', () => {
  it('recognizes a term that already matches a real domain.entity object, without duplicating it', () => {
    const concepts = buildConcepts();
    const widget = concepts.find((c) => c.name === 'Widget')!;
    expect(widget.existingObjectId).toBe('entity-widget');
  });

  it('infers a genuinely new concept for a term with no existing technical entity (Gadget has only an API, no domain.entity)', () => {
    const concepts = buildConcepts();
    const gadget = concepts.find((c) => c.name === 'Gadget')!;
    expect(gadget.existingObjectId).toBeUndefined();
  });

  it('retains evidence, provenance, confidence, and a rationale for every candidate', () => {
    const concepts = buildConcepts();
    for (const concept of concepts) {
      expect(concept.provenance.length).toBeGreaterThan(0);
      expect(concept.confidenceDetail.basis).toBe('derived');
      expect(concept.rationale.length).toBeGreaterThan(0);
    }
  });

  it('gives a concept backed by a real technical entity higher confidence than one without', () => {
    const concepts = buildConcepts();
    const widget = concepts.find((c) => c.name === 'Widget')!;
    const gadget = concepts.find((c) => c.name === 'Gadget')!;
    expect(widget.confidence.score!).toBeGreaterThan(gadget.confidence.score!);
  });

  it('does not simply map every Java class 1:1 to a concept -- WidgetController and Widget collapse into one "Widget" concept, not two', () => {
    const concepts = buildConcepts();
    const widgetConcepts = concepts.filter((c) => c.name === 'Widget');
    expect(widgetConcepts).toHaveLength(1);
  });
});

// Blocker 5 -- P5-01's InferenceProvider/ambiguity contract, wired through
// entity resolution: two real, distinct entity-like objects that happen to
// share the same label are a genuine ambiguity case (e.g. two bounded
// contexts each with their own "Order") -- both must surface as candidates,
// never silently collapsed to whichever happened to come first.
function ambiguousEntityObjects(): EntityObject[] {
  const base = {
    identity: {
      systemId: SYSTEM_ID,
      createdAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity' as const,
    kind: 'domain.entity' as const,
    attributes: { fields: [] },
    confidenceDetail: { basis: 'observed' as const },
  };
  return [
    {
      ...base,
      identity: { ...base.identity, id: 'entity-order-sales' },
      label: 'Order',
      metadata: {
        provenance: [
          {
            sourceId: 'repo://x/services/sales',
            sourceType: 'source-code',
            derivedBy: 'extraction-engine',
            derivedAt: GENERATED_AT,
          },
        ],
        confidence: { level: 'high' },
      },
      evidence: [
        {
          id: 'ev-order-sales',
          sourceId: 'repo://x/services/sales',
          locator: 'sales/Order.java#L1',
        },
      ],
    },
    {
      ...base,
      identity: { ...base.identity, id: 'entity-order-warehouse' },
      label: 'Order',
      metadata: {
        provenance: [
          {
            sourceId: 'repo://x/services/warehouse',
            sourceType: 'source-code',
            derivedBy: 'extraction-engine',
            derivedAt: GENERATED_AT,
          },
        ],
        confidence: { level: 'high' },
      },
      evidence: [
        {
          id: 'ev-order-warehouse',
          sourceId: 'repo://x/services/warehouse',
          locator: 'warehouse/Order.java#L1',
        },
      ],
    },
  ];
}

describe('existingEntityResolutionProvider (P5-01 contract, Blocker 5)', () => {
  it('is a genuine InferenceProvider: async infer(), stable name', async () => {
    expect(existingEntityResolutionProvider.name).toBe('existing-entity-resolution');
    const result = await existingEntityResolutionProvider.infer({
      normalizedTerm: 'Widget',
      objects: WIDGET_OBJECTS,
    });
    expect(result.candidates).toBeInstanceOf(Array);
  });

  it('returns exactly one candidate for an unambiguous label match', async () => {
    const result = await existingEntityResolutionProvider.infer({
      normalizedTerm: 'Widget',
      objects: WIDGET_OBJECTS,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]!.value.identity.id).toBe('entity-widget');
    expect(result.candidates[0]!.confidence.score).toBeGreaterThan(0);
    expect(result.candidates[0]!.rationale.length).toBeGreaterThan(0);
  });

  it('returns an empty candidate list, never throwing, for a term with no match', async () => {
    const result = await existingEntityResolutionProvider.infer({
      normalizedTerm: 'Nonexistent',
      objects: WIDGET_OBJECTS,
    });
    expect(result.candidates).toEqual([]);
  });

  it('surfaces genuine ambiguity: two real entity objects sharing a label both appear as candidates, sorted by confidence, not silently collapsed to one', async () => {
    const objects = ambiguousEntityObjects();
    const result = await existingEntityResolutionProvider.infer({
      normalizedTerm: 'Order',
      objects,
    });
    expect(result.candidates.length).toBe(2);
    const ids = result.candidates.map((c) => c.value.identity.id).sort();
    expect(ids).toEqual(['entity-order-sales', 'entity-order-warehouse']);
    for (const candidate of result.candidates) {
      expect(candidate.rationale).toContain('ambiguous');
      expect(candidate.provenance.length).toBeGreaterThan(0);
    }
    // Sorted highest-confidence-first, and scores are non-increasing.
    expect(result.candidates[0]!.confidence.score!).toBeGreaterThanOrEqual(
      result.candidates[1]!.confidence.score!,
    );
  });

  it('inferBusinessConcepts resolves the ambiguous case deterministically (picks the top-ranked candidate) and records the ambiguity in its rationale', () => {
    const objects = ambiguousEntityObjects();
    const items = extractTechnicalEvidence(objects);
    const terms = extractVocabulary(items, GENERATED_AT);
    const concepts = inferBusinessConcepts(terms, objects, GENERATED_AT);
    const order = concepts.find((c) => c.name === 'Order')!;
    expect(order).toBeDefined();
    expect(['entity-order-sales', 'entity-order-warehouse']).toContain(order.existingObjectId);
    expect(order.rationale).toContain('Ambiguous');
  });
});

describe('materializeBusinessConcepts', () => {
  it('creates a real, valid domain.entity object for a new concept, with basis "derived"', () => {
    const concepts = buildConcepts();
    const materialized = materializeBusinessConcepts(concepts, SYSTEM_ID, GENERATED_AT);
    const gadget = materialized.find((o) => o.label === 'Gadget')!;
    expect(gadget).toBeDefined();
    expect(gadget.kind).toBe('domain.entity');
    expect(gadget.confidenceDetail?.basis).toBe('derived');
    expect(validateCanonicalKnowledgeObject(gadget)).toEqual({ valid: true, errors: [] });
  });

  it('does not create a duplicate object for a concept that already exists (Widget)', () => {
    const concepts = buildConcepts();
    const materialized = materializeBusinessConcepts(concepts, SYSTEM_ID, GENERATED_AT);
    expect(materialized.find((o) => o.label === 'Widget')).toBeUndefined();
  });
});
