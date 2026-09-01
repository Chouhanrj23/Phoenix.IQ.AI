import { describe, expect, it } from 'vitest';
import type { Provenance } from '@phoenix-ai/shared';
import { distinctSourceTypes, SOURCE_TYPE_LABEL } from '../src/lib/evidence.js';

function prov(sourceId: string, sourceType: Provenance['sourceType']): Provenance {
  return {
    sourceId,
    sourceType,
    derivedBy: 'extraction-engine',
    derivedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('distinctSourceTypes (PC-HR-04) — real, deduplicated evidence source types', () => {
  it('lists each real source type once, in first-appearance order — real Aurora "Payments Gateway Adapter" case', () => {
    // ctr-payments' real provenance: repo:// (source-code) + docs/architecture-2024.pdf (technical-doc).
    const provenance = [
      prov('repo://aurora-commerce/services/payments-adapter', 'source-code'),
      prov('docs/architecture-2024.pdf', 'technical-doc'),
    ];
    const result = distinctSourceTypes(provenance);
    expect(result).toEqual([
      { type: 'source-code', label: 'Source Code' },
      { type: 'technical-doc', label: 'Technical Documentation' },
    ]);
  });

  it('deduplicates repeated citations of the same real source type, never double-counting', () => {
    const provenance = [
      prov('repo://a', 'source-code'),
      prov('repo://a/sub', 'source-code'),
      prov('repo://a/sub2', 'source-code'),
    ];
    expect(distinctSourceTypes(provenance)).toEqual([
      { type: 'source-code', label: 'Source Code' },
    ]);
  });

  it('returns an empty list — never an invented source — for an object with no provenance', () => {
    expect(distinctSourceTypes([])).toEqual([]);
  });

  it('has a real human label for every SourceType the shared contract defines', () => {
    const types: Provenance['sourceType'][] = [
      'source-code',
      'technical-doc',
      'business-doc',
      'ticket',
      'log',
      'data-model',
      'test',
      'recording',
      'other',
    ];
    for (const type of types) {
      expect(SOURCE_TYPE_LABEL[type]).toBeTruthy();
    }
  });
});
