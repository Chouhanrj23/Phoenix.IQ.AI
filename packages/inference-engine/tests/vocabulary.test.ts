import { describe, expect, it } from 'vitest';
import { extractTechnicalEvidence } from '../src/inference-contract.js';
import { extractVocabulary, normalizeIdentifierText } from '../src/vocabulary.js';
import { GENERATED_AT, WIDGET_OBJECTS } from './fixtures.js';

describe('normalizeIdentifierText', () => {
  it('strips a leading CRUD verb and trailing technical suffix, singularizing what remains (bare-word identifiers -- existing behavior, unchanged by the REST fallback)', () => {
    expect(normalizeIdentifierText('createWidget')).toEqual({
      normalizedTerm: 'Widget',
      leadingVerb: 'create',
    });
    expect(normalizeIdentifierText('WidgetController')).toEqual({ normalizedTerm: 'Widget' });
    expect(normalizeIdentifierText('WidgetRepository')).toEqual({ normalizedTerm: 'Widget' });
  });

  it('returns undefined for pure technical noise', () => {
    expect(normalizeIdentifierText('Config')).toBeUndefined();
    expect(normalizeIdentifierText('AbstractBaseTest')).toBeUndefined();
  });

  // Blocker 1: real REST operation names (Phase 3's actual `bridgeSpringController`
  // output shape, e.g. "GET /owners/{id}") have no bare leading verb -- the
  // HTTP method itself becomes the fallback CRUD/action signal instead. The
  // original identifier/path/method are preserved, never discarded.
  describe('REST-style operation names (Blocker 1: HTTP-method-derived fallback)', () => {
    it('GET -> read-stage, path preserved, no bare leadingVerb', () => {
      expect(normalizeIdentifierText('GET /owners/{id}')).toEqual({
        normalizedTerm: 'Owner',
        httpMethod: 'GET',
        path: '/owners/{id}',
        normalizedAction: 'read',
      });
    });

    it('POST -> create-stage', () => {
      expect(normalizeIdentifierText('POST /orders')).toEqual({
        normalizedTerm: 'Order',
        httpMethod: 'POST',
        path: '/orders',
        normalizedAction: 'create',
      });
    });

    it('PUT -> update-stage', () => {
      expect(normalizeIdentifierText('PUT /owners/{id}')).toEqual({
        normalizedTerm: 'Owner',
        httpMethod: 'PUT',
        path: '/owners/{id}',
        normalizedAction: 'update',
      });
    });

    it('PATCH -> update-stage (same tier as PUT)', () => {
      expect(normalizeIdentifierText('PATCH /accounts/{id}')).toEqual({
        normalizedTerm: 'Account',
        httpMethod: 'PATCH',
        path: '/accounts/{id}',
        normalizedAction: 'update',
      });
    });

    it('DELETE -> terminate-stage', () => {
      expect(normalizeIdentifierText('DELETE /owners/{id}')).toEqual({
        normalizedTerm: 'Owner',
        httpMethod: 'DELETE',
        path: '/owners/{id}',
        normalizedAction: 'terminate',
      });
    });

    it('never assumes a specific business action beyond the generic normalized signal -- GET carries only "read", nothing more specific', () => {
      const result = normalizeIdentifierText('GET /owners/{ownerId}/pets/new')!;
      expect(result.normalizedAction).toBe('read');
      expect(result.leadingVerb).toBeUndefined();
    });

    it('a bare leading verb still wins over the HTTP method when both are present (no normalizedAction)', () => {
      const result = normalizeIdentifierText('GET confirmWidget')!;
      expect(result.leadingVerb).toBe('confirm');
      expect(result.normalizedAction).toBeUndefined();
    });
  });
});

describe('extractVocabulary (P5-02)', () => {
  it('extracts and normalizes real vocabulary from technical evidence, deduplicating occurrences of the same term', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const terms = extractVocabulary(items, GENERATED_AT);
    const widget = terms.find((t) => t.normalizedTerm === 'Widget');
    expect(widget).toBeDefined();
    expect(widget!.occurrenceCount).toBeGreaterThan(1);
  });

  it('links each term back to every distinct technical object that produced it (provenance preserved)', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const terms = extractVocabulary(items, GENERATED_AT);
    const widget = terms.find((t) => t.normalizedTerm === 'Widget')!;
    expect(widget.relatedTechnicalObjectIds).toContain('api-widget-controller');
    expect(widget.relatedTechnicalObjectIds).toContain('entity-widget');
    expect(widget.provenance.length).toBeGreaterThan(0);
    expect(widget.evidence.length).toBeGreaterThan(0);
  });

  it('produces higher confidence for a term corroborated by more distinct technical objects', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const terms = extractVocabulary(items, GENERATED_AT);
    const widget = terms.find((t) => t.normalizedTerm === 'Widget')!; // 2 distinct source objects
    const gadget = terms.find((t) => t.normalizedTerm === 'Gadget')!; // 1 distinct source object
    expect(widget.confidence.score!).toBeGreaterThan(gadget.confidence.score!);
  });

  it('never fabricates a term with zero evidence', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const terms = extractVocabulary(items, GENERATED_AT);
    for (const term of terms)
      expect(term.evidence.length + term.relatedTechnicalObjectIds.length).toBeGreaterThan(0);
  });

  it('is deterministic -- identical input produces byte-identical output', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const first = extractVocabulary(items, GENERATED_AT);
    const second = extractVocabulary(items, GENERATED_AT);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('merges synonymous surface forms (e.g. a controller name and its own operation names) into one term, not duplicates', () => {
    const items = extractTechnicalEvidence(WIDGET_OBJECTS);
    const terms = extractVocabulary(items, GENERATED_AT);
    const widgetTerms = terms.filter((t) => t.normalizedTerm === 'Widget');
    expect(widgetTerms).toHaveLength(1);
  });
});
