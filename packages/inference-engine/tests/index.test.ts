import { describe, expect, it } from 'vitest';
import * as inferenceEngine from '../src/index.js';

describe('inference-engine public API', () => {
  it('exposes every Phase 5 stage function', () => {
    expect(typeof inferenceEngine.extractTechnicalEvidence).toBe('function');
    expect(typeof inferenceEngine.extractVocabulary).toBe('function');
    expect(typeof inferenceEngine.inferBusinessConcepts).toBe('function');
    expect(typeof inferenceEngine.materializeBusinessConcepts).toBe('function');
    expect(typeof inferenceEngine.inferBusinessCapabilities).toBe('function');
    expect(typeof inferenceEngine.materializeBusinessCapabilities).toBe('function');
    expect(typeof inferenceEngine.inferJourneys).toBe('function');
    expect(typeof inferenceEngine.inferEntityStates).toBe('function');
    expect(typeof inferenceEngine.mapJourneysToEntitiesAndStates).toBe('function');
    expect(typeof inferenceEngine.explainTraceability).toBe('function');
  });
});
