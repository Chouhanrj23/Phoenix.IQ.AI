import { describe, expect, it } from 'vitest';
import type { InferenceProvider } from '../src/inference-contract.js';
import {
  deriveEvidenceFrom,
  deriveInferenceConfidence,
  deriveProvenanceFrom,
  deterministicId,
  extractTechnicalEvidence,
} from '../src/inference-contract.js';
import { WIDGET_OBJECTS } from './fixtures.js';

describe('InferenceProvider contract (P5-01)', () => {
  it('is satisfiable by a synchronous, deterministic heuristic implementation', async () => {
    const provider: InferenceProvider<number, number> = {
      name: 'test-doubling-provider',
      infer: (input) => Promise.resolve(input * 2),
    };
    await expect(provider.infer(21)).resolves.toBe(42);
    expect(provider.name).toBe('test-doubling-provider');
  });
});

describe('deterministicId', () => {
  it('is stable across repeated calls over identical input -- never random', () => {
    expect(deterministicId('concept', 'widget')).toBe(deterministicId('concept', 'widget'));
  });

  it('differs when the prefix or parts differ', () => {
    expect(deterministicId('concept', 'widget')).not.toBe(deterministicId('capability', 'widget'));
    expect(deterministicId('concept', 'widget')).not.toBe(deterministicId('concept', 'gadget'));
  });
});

describe('extractTechnicalEvidence', () => {
  it('extracts an object-label item for every object', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const labels = items.filter((i) => i.kind === 'object-label').map((i) => i.text);
    expect(labels).toContain('WidgetController');
    expect(labels).toContain('Widget');
  });

  it('extracts an operation-name item for every API operation', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const operationNames = items.filter((i) => i.kind === 'operation-name').map((i) => i.text);
    expect(operationNames).toContain('createWidget');
    expect(operationNames).toContain('confirmWidget');
  });

  it('preserves the source object id and provenance on every extracted item', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    for (const item of items) {
      expect(item.sourceObjectId.length).toBeGreaterThan(0);
      expect(item.provenance.length).toBeGreaterThan(0);
    }
  });
});

describe('deriveInferenceConfidence', () => {
  it('always marks derived confidence with basis "derived", never "observed"', () => {
    const { confidenceDetail } = deriveInferenceConfidence(
      3,
      'test-method',
      '2026-08-22T00:00:00.000Z',
    );
    expect(confidenceDetail.basis).toBe('derived');
  });

  it('increases score with more corroborating signals, deterministically', () => {
    const one = deriveInferenceConfidence(1, 'm', '2026-08-22T00:00:00.000Z');
    const three = deriveInferenceConfidence(3, 'm', '2026-08-22T00:00:00.000Z');
    expect(three.confidence.score!).toBeGreaterThan(one.confidence.score!);
  });

  it('never exceeds a score of 1', () => {
    const { confidence } = deriveInferenceConfidence(1000, 'm', '2026-08-22T00:00:00.000Z');
    expect(confidence.score!).toBeLessThanOrEqual(1);
  });

  it('records the calculation method and signal count, never a hand-typed number with no explanation', () => {
    const { confidenceDetail } = deriveInferenceConfidence(
      2,
      'method-x',
      '2026-08-22T00:00:00.000Z',
      { extra: 'y' },
    );
    expect(confidenceDetail.calculation?.method).toBe('method-x');
    expect(confidenceDetail.calculation?.inputs).toMatchObject({ signalCount: 2, extra: 'y' });
  });
});

describe('deriveProvenanceFrom / deriveEvidenceFrom', () => {
  it('deduplicates provenance across many items citing the same source', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const provenance = deriveProvenanceFrom(items, '2026-08-22T00:00:00.000Z');
    const uniqueSourceIds = new Set(provenance.map((p) => p.sourceId));
    expect(provenance.length).toBe(uniqueSourceIds.size);
  });

  it('stamps derivedBy as inference-engine, distinct from the original extraction-engine provenance', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const provenance = deriveProvenanceFrom(items, '2026-08-22T00:00:00.000Z');
    for (const p of provenance) expect(p.derivedBy).toBe('inference-engine');
  });

  it('deduplicates evidence by id', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const evidence = deriveEvidenceFrom(items);
    const ids = evidence.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
