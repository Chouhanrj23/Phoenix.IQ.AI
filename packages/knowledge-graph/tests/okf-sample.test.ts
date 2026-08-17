import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseAndValidateOkfYaml, parseOkfYaml, type OkfDocument } from '../src/okf.js';

/**
 * P2-11 -- verifies the checked-in sample OKF document
 * (`packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml`)
 * against the REAL P2-10 validator, not a re-implementation of it. This is
 * a pure read/verify test -- generation happens once, via
 * `pnpm --filter @phoenix-ai/knowledge-graph generate:sample`
 * (`samples/generate-sample.ts`), not on every test run.
 */
const SAMPLE_PATH = fileURLToPath(
  new URL('../samples/aurora-commerce.sample.okf.yaml', import.meta.url),
);
const sampleYamlText = readFileSync(SAMPLE_PATH, 'utf-8');

describe('Sample OKF document — schema validation', () => {
  it('validates cleanly against the real OKF validator', () => {
    const result = parseAndValidateOkfYaml(sampleYamlText);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('parses to a well-formed OkfDocument with the expected top-level shape', () => {
    const document = parseOkfYaml(sampleYamlText) as OkfDocument;
    expect(document.okfVersion).toBeTruthy();
    expect(document.systemId).toBe('aurora-commerce');
    expect(Array.isArray(document.sources)).toBe(true);
    expect(Array.isArray(document.objects)).toBe(true);
    expect(Array.isArray(document.relationships)).toBe(true);
  });
});

describe('Sample OKF document — representative coverage', () => {
  const document = parseOkfYaml(sampleYamlText) as OkfDocument;
  const kindsPresent = new Set(document.objects.map((o) => o.kind));

  it.each([
    ['System', 'architecture.system'],
    ['Container', 'architecture.container'],
    ['Component', 'architecture.component'],
    ['Domain', 'domain.domain'],
    ['Entity', 'domain.entity'],
    ['Entity State', 'domain.entity-state'],
    ['Persona', 'journey.persona'],
    ['Journey', 'journey.journey'],
    ['Action', 'journey.action'],
    ['API', 'integration.api'],
    ['Interface', 'integration.interface'],
    ['Integration', 'integration.integration'],
    ['DataFlow', 'integration.dataflow'],
  ])('includes at least one %s object (%s)', (_label, kind) => {
    expect(kindsPresent.has(kind)).toBe(true);
  });

  it('includes a Flow object (journey.flow) — the structural link Action/Journey require', () => {
    expect(kindsPresent.has('journey.flow')).toBe(true);
  });

  it('demonstrates Attribute via at least one Entity with attributes.fields', () => {
    const entity = document.objects.find((o) => o.kind === 'domain.entity');
    expect(Array.isArray(entity?.attributes.fields)).toBe(true);
    expect((entity?.attributes.fields as unknown[]).length).toBeGreaterThan(0);
  });

  it('has at least one Provenance entry on every object (mandatory per the canonical model)', () => {
    for (const object of document.objects) {
      expect(object.metadata.provenance.length).toBeGreaterThan(0);
    }
  });

  it('demonstrates Confidence at more than one level, including a low/disputed real case', () => {
    const levels = new Set(document.objects.map((o) => o.metadata.confidence.level));
    expect(levels.has('high')).toBe(true);
    expect(levels.has('low')).toBe(true);
    const disputed = document.objects.find((o) => o.identity.id === 'ctr-payments');
    expect(disputed?.metadata.confidence.level).toBe('low');
    expect(disputed?.metadata.provenance.length).toBeGreaterThanOrEqual(2);
  });

  it('demonstrates both confidenceDetail bases (observed and derived)', () => {
    const bases = new Set(
      document.objects
        .map((o) => o.confidenceDetail?.basis)
        .filter((b): b is 'observed' | 'derived' => Boolean(b)),
    );
    expect(bases.has('observed')).toBe(true);
    expect(bases.has('derived')).toBe(true);
  });

  it('demonstrates Evidence on at least one object and one relationship', () => {
    expect(document.objects.some((o) => o.evidence.length > 0)).toBe(true);
    expect(document.relationships.some((r) => (r.evidence ?? []).length > 0)).toBe(true);
  });

  it('uses consistent, non-duplicate object ids across every domain area', () => {
    const ids = document.objects.map((o) => o.identity.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every relationship endpoint resolves to a real object in the same document', () => {
    const ids = new Set(document.objects.map((o) => o.identity.id));
    for (const relationship of document.relationships) {
      expect(ids.has(relationship.sourceObjectId)).toBe(true);
      expect(ids.has(relationship.targetObjectId)).toBe(true);
    }
  });

  it('every provenance/evidence sourceId resolves to a registered Source', () => {
    const sourceIds = new Set((document.sources ?? []).map((s) => s.id));
    for (const object of document.objects) {
      for (const entry of object.metadata.provenance)
        expect(sourceIds.has(entry.sourceId)).toBe(true);
      for (const entry of object.evidence) expect(sourceIds.has(entry.sourceId)).toBe(true);
    }
  });

  it("clearly identifies illustrative/no-real-equivalent content (API/Interface, per ADR 0008's documented gap)", () => {
    const api = document.objects.find((o) => o.kind === 'integration.api');
    const iface = document.objects.find((o) => o.kind === 'integration.interface');
    expect(api?.label).toContain('illustrative');
    expect(iface?.label).toContain('illustrative');
    expect(api?.confidenceDetail?.basis).toBe('derived');
  });

  it('never claims real extraction/inference: every provenance entry uses the honest sample-author derivedBy', () => {
    for (const object of document.objects) {
      for (const entry of object.metadata.provenance) {
        expect(entry.derivedBy).toBe('phoenix-sample-author');
      }
    }
  });
});
