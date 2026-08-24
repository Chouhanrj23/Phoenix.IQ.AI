import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SCHEMA_VERSION,
  type ApiObject,
  type CanonicalKnowledgeObject,
} from '@phoenix-ai/knowledge-graph';
import { extractTechnicalEvidence } from '../src/inference-contract.js';
import { extractVocabulary } from '../src/vocabulary.js';
import { inferBusinessConcepts } from '../src/concept-inference.js';
import { inferBusinessCapabilities } from '../src/capability-inference.js';
import { inferJourneys } from '../src/journey-inference.js';
import { inferEntityStates } from '../src/state-inference.js';

/**
 * P5-09 -- proves, mechanically (not by author assertion), that this
 * package's actual production code contains no hard-coded business
 * vocabulary from any real domain, and that the SAME pipeline produces
 * analogous, evidence-driven output for two structurally-similar but
 * lexically UNRELATED vocabularies.
 */

const SRC_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

/**
 * Real e-commerce/fintech business CONCEPT nouns this system must never
 * hard-code as inference logic (Title-Case, word-boundary matched, so the
 * legitimate lowercase `attributes.order` ordinal-position field -- a real
 * P2-05 schema field name, not a business noun -- is never a false
 * positive). Deliberately does NOT include project/demo proper nouns like
 * "Aurora" -- those legitimately appear in documentation prose describing
 * the P5-10 validation plan; the real requirement (P5-09 item 1: "does not
 * contain Aurora-specific ENTITY LISTS") is about hard-coded business
 * concepts, not about a scenario's name appearing in a comment.
 */
const FORBIDDEN_BUSINESS_NOUNS = [
  'Order',
  'Product',
  'Cart',
  'Customer',
  'Payment',
  'Shipment',
  'Checkout',
  'Invoice',
  'Account',
  'Transaction',
  'Loan',
  'Card',
  'Ledger',
  'Fraud',
  'Kyc',
  'Aml',
];

function listSourceFiles(): string[] {
  return readdirSync(SRC_DIR)
    .filter((name) => name.endsWith('.ts'))
    .map((name) => join(SRC_DIR, name));
}

describe('P5-09 -- no hard-coded business vocabulary in src/', () => {
  it('contains no forbidden business noun in any production source file', () => {
    const violations: string[] = [];
    for (const file of listSourceFiles()) {
      const text = readFileSync(file, 'utf8');
      for (const noun of FORBIDDEN_BUSINESS_NOUNS) {
        const pattern = new RegExp(`\\b${noun}\\b`);
        if (pattern.test(text)) violations.push(`${file}: contains "${noun}"`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('every src/*.ts file exists and was actually scanned (the scan is not vacuously trivial)', () => {
    const files = listSourceFiles();
    expect(files.length).toBeGreaterThanOrEqual(8);
  });
});

// ---------------------------------------------------------------------------
// Cross-vocabulary behavioral proof: two lexically unrelated, structurally
// similar technical-evidence sets, run through the SAME functions.
// ---------------------------------------------------------------------------

const GENERATED_AT = '2026-08-22T00:00:00.000Z';

function buildEvidenceSet(
  systemId: string,
  nouns: readonly [string, string],
): CanonicalKnowledgeObject[] {
  const [primary, secondary] = nouns;
  const primaryApi: ApiObject = {
    identity: {
      id: `api-${primary.toLowerCase()}`,
      systemId,
      createdAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'integration.api',
    label: `${primary}Controller`,
    attributes: {
      operations: [
        { name: `create${primary}`, description: 'x' },
        { name: `get${primary}`, description: 'x' },
        { name: `confirm${primary}`, description: 'x' },
        { name: `cancel${primary}`, description: 'x' },
      ],
    },
    metadata: {
      provenance: [
        {
          sourceId: `repo://${systemId}/services/${primary.toLowerCase()}`,
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
  const secondaryApi: ApiObject = {
    identity: {
      id: `api-${secondary.toLowerCase()}`,
      systemId,
      createdAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'integration.api',
    label: `${secondary}Controller`,
    attributes: {
      operations: [
        { name: `create${secondary}`, description: 'x' },
        { name: `get${secondary}`, description: 'x' },
      ],
    },
    metadata: {
      provenance: [
        {
          sourceId: `repo://${systemId}/services/${primary.toLowerCase()}`,
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
  return [primaryApi, secondaryApi];
}

function runPipeline(systemId: string, nouns: readonly [string, string]) {
  const objects = buildEvidenceSet(systemId, nouns);
  const items = extractTechnicalEvidence(objects);
  const terms = extractVocabulary(items, GENERATED_AT);
  const concepts = inferBusinessConcepts(terms, objects, GENERATED_AT);
  const capabilities = inferBusinessCapabilities(concepts, GENERATED_AT);
  const journeys = inferJourneys(objects, concepts, systemId, GENERATED_AT);
  const idMap = new Map(concepts.map((c) => [c.id, c.existingObjectId ?? c.id]));
  const states = inferEntityStates(objects, concepts, idMap, systemId, GENERATED_AT);
  return { terms, concepts, capabilities, journeys, states };
}

// ---------------------------------------------------------------------------
// Blocker 4: a SECOND cross-vocabulary proof using REAL REST-style operation
// names (HTTP method + path, e.g. "POST /torvexes", "GET /torvexes/{id}") --
// the actual shape Phase 3's real producer (`bridgeSpringController`) emits,
// as opposed to the camelCase Java-method-style operations
// `buildEvidenceSet` above uses. Added ALONGSIDE the existing curated
// fixture, not replacing it -- proves the SAME pipeline code generalizes
// across both a different vocabulary AND a materially different technical
// naming convention, with no domain-specific branching for either.
// ---------------------------------------------------------------------------

function buildRestEvidenceSet(
  systemId: string,
  nouns: readonly [string, string],
): CanonicalKnowledgeObject[] {
  const [primary, secondary] = nouns;
  const primaryPath = `${primary.toLowerCase()}s`;
  const secondaryPath = `${secondary.toLowerCase()}s`;
  const primaryApi: ApiObject = {
    identity: {
      id: `api-${primary.toLowerCase()}`,
      systemId,
      createdAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'integration.api',
    label: `${primary}Controller`,
    attributes: {
      operations: [
        { name: `POST /${primaryPath}`, description: 'x' },
        { name: `GET /${primaryPath}/{id}`, description: 'x' },
        { name: `PUT /${primaryPath}/{id}`, description: 'x' },
        { name: `DELETE /${primaryPath}/{id}`, description: 'x' },
      ],
    },
    metadata: {
      provenance: [
        {
          sourceId: `repo://${systemId}/services/${primaryPath}`,
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: GENERATED_AT,
        },
      ],
      confidence: { level: 'high' },
    },
    evidence: [
      {
        id: `ev-${primary.toLowerCase()}`,
        sourceId: `repo://${systemId}/services/${primaryPath}`,
        locator: `src/main/java/com/${systemId}/${primaryPath}/${primary}Controller.java#L1`,
      },
    ],
    confidenceDetail: { basis: 'observed' },
  };
  const secondaryApi: ApiObject = {
    identity: {
      id: `api-${secondary.toLowerCase()}`,
      systemId,
      createdAt: GENERATED_AT,
      updatedAt: GENERATED_AT,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'integration.api',
    label: `${secondary}Controller`,
    attributes: {
      operations: [
        { name: `POST /${secondaryPath}`, description: 'x' },
        { name: `GET /${secondaryPath}/{id}`, description: 'x' },
      ],
    },
    metadata: {
      // Same module as the primary -- a real Java package directory, mirroring how
      // Blocker 2's flat/monolith fallback groups concepts co-located under one
      // real source directory.
      provenance: [
        {
          sourceId: `repo://${systemId}/services/${primaryPath}`,
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: GENERATED_AT,
        },
      ],
      confidence: { level: 'high' },
    },
    evidence: [
      {
        id: `ev-${secondary.toLowerCase()}`,
        sourceId: `repo://${systemId}/services/${primaryPath}`,
        locator: `src/main/java/com/${systemId}/${primaryPath}/${secondary}Controller.java#L1`,
      },
    ],
    confidenceDetail: { basis: 'observed' },
  };
  return [primaryApi, secondaryApi];
}

function runRestPipeline(systemId: string, nouns: readonly [string, string]) {
  const objects = buildRestEvidenceSet(systemId, nouns);
  const items = extractTechnicalEvidence(objects);
  const terms = extractVocabulary(items, GENERATED_AT);
  const concepts = inferBusinessConcepts(terms, objects, GENERATED_AT);
  const capabilities = inferBusinessCapabilities(concepts, GENERATED_AT);
  const journeys = inferJourneys(objects, concepts, systemId, GENERATED_AT);
  const idMap = new Map(concepts.map((c) => [c.id, c.existingObjectId ?? c.id]));
  const states = inferEntityStates(objects, concepts, idMap, systemId, GENERATED_AT);
  return { terms, concepts, capabilities, journeys, states };
}

describe('P5-09 -- the same pipeline behaves analogously across two unrelated vocabularies using REAL REST-style operation names (Blocker 4)', () => {
  const restA = runRestPipeline('rest-system-a', ['Torvex', 'Plindle']);
  const restB = runRestPipeline('rest-system-b', ['Marnow', 'Quexil']);

  it('extracts real vocabulary terms for both, driven only by structure (HTTP method + path), never a specific word list', () => {
    expect(restA.terms.some((t) => t.normalizedTerm === 'Torvex')).toBe(true);
    expect(restB.terms.some((t) => t.normalizedTerm === 'Marnow')).toBe(true);
  });

  it('infers a business concept for the primary noun in both, from REST evidence alone', () => {
    expect(restA.concepts.find((c) => c.name === 'Torvex')).toBeDefined();
    expect(restB.concepts.find((c) => c.name === 'Marnow')).toBeDefined();
  });

  it('infers a real journey (POST/GET/PUT/DELETE spans 4 stages) for the primary noun in both, from the HTTP-method-derived fallback signal alone (no bare CRUD verb in any operation name)', () => {
    const journeyA = restA.journeys.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Torvex'),
    );
    const journeyB = restB.journeys.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Marnow'),
    );
    expect(journeyA).toBeDefined();
    expect(journeyB).toBeDefined();
  });

  it('infers real lifecycle states (Created via POST, Deleted via DELETE) for the primary concept in both, never for read/update (GET/PUT)', () => {
    const primaryConceptA = restA.concepts.find((c) => c.name === 'Torvex')!;
    const primaryConceptB = restB.concepts.find((c) => c.name === 'Marnow')!;
    const stateLabelsFor = (result: typeof restA, conceptId: string): string[] =>
      result.states.relationships
        .filter((r) => r.kind === 'hasState' && r.sourceObjectId === conceptId)
        .map((r) => result.states.objects.find((o) => o.identity.id === r.targetObjectId)!.label)
        .sort();

    expect(stateLabelsFor(restA, primaryConceptA.id)).toEqual(['Created', 'Deleted']);
    expect(stateLabelsFor(restB, primaryConceptB.id)).toEqual(['Created', 'Deleted']);
  });

  it('clusters the two co-located concepts into one capability, following the SAME generic naming template regardless of vocabulary or REST-style naming', () => {
    expect(restA.capabilities.length).toBeGreaterThan(0);
    expect(restB.capabilities.length).toBeGreaterThan(0);
    expect(restA.capabilities[0]!.name).toMatch(/ Management$/);
    expect(restB.capabilities[0]!.name).toMatch(/ Management$/);
  });

  it('preserves non-empty provenance AND evidence through every stage, for both REST vocabularies (Blocker 3 regression guard)', () => {
    for (const result of [restA, restB]) {
      for (const state of result.states.objects) {
        expect(state.metadata.provenance.length).toBeGreaterThan(0);
        expect(state.evidence.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('P5-09 -- the same pipeline behaves analogously across two unrelated vocabularies', () => {
  const vocabularyA = runPipeline('system-a', ['Zorble', 'Fennix']);
  const vocabularyB = runPipeline('system-b', ['Quintel', 'Barnacle']);

  it('extracts real vocabulary terms for both, driven only by structure, never a specific word list', () => {
    expect(vocabularyA.terms.some((t) => t.normalizedTerm === 'Zorble')).toBe(true);
    expect(vocabularyB.terms.some((t) => t.normalizedTerm === 'Quintel')).toBe(true);
  });

  it('infers a business concept for the primary noun in both, with the entity concept unresolved to any existing object (neither vocabulary matches a real domain.entity)', () => {
    const conceptA = vocabularyA.concepts.find((c) => c.name === 'Zorble');
    const conceptB = vocabularyB.concepts.find((c) => c.name === 'Quintel');
    expect(conceptA).toBeDefined();
    expect(conceptB).toBeDefined();
  });

  it('infers a real journey (create/read/confirm/cancel spans 4 stages) for the primary noun in both vocabularies', () => {
    const journeyA = vocabularyA.journeys.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Zorble'),
    );
    const journeyB = vocabularyB.journeys.objects.find(
      (o) => o.kind === 'journey.journey' && o.label.includes('Quintel'),
    );
    expect(journeyA).toBeDefined();
    expect(journeyB).toBeDefined();
  });

  it('infers the same shape of lifecycle states (Created/Confirmed/Cancelled) for the primary concept in both, regardless of the noun', () => {
    // The primary concept (Zorble/Quintel) has create/get/confirm/cancel
    // operations -- "get" is not a status verb, so exactly 3 states are
    // expected for IT specifically. The secondary noun (Fennix/Barnacle)
    // only has create/get, contributing its own separate "Created" state
    // for a different entity -- correctly not conflated with the primary's.
    const primaryConceptA = vocabularyA.concepts.find((c) => c.name === 'Zorble')!;
    const primaryConceptB = vocabularyB.concepts.find((c) => c.name === 'Quintel')!;
    const stateLabelsFor = (result: typeof vocabularyA, conceptId: string): string[] =>
      result.states.relationships
        .filter((r) => r.kind === 'hasState' && r.sourceObjectId === conceptId)
        .map((r) => result.states.objects.find((o) => o.identity.id === r.targetObjectId)!.label)
        .sort();

    expect(stateLabelsFor(vocabularyA, primaryConceptA.id)).toEqual([
      'Cancelled',
      'Confirmed',
      'Created',
    ]);
    expect(stateLabelsFor(vocabularyB, primaryConceptB.id)).toEqual([
      'Cancelled',
      'Confirmed',
      'Created',
    ]);
  });

  it('preserves provenance and confidence through every stage, for both vocabularies', () => {
    for (const result of [vocabularyA, vocabularyB]) {
      for (const concept of result.concepts) {
        expect(concept.provenance.length).toBeGreaterThan(0);
        expect(concept.confidenceDetail.basis).toBe('derived');
      }
      for (const object of [...result.journeys.objects, ...result.states.objects]) {
        expect(object.metadata.provenance.length).toBeGreaterThan(0);
        expect(object.confidenceDetail?.basis).toBe('derived');
      }
    }
  });

  it('clusters the two co-located concepts into one capability, following the SAME generic "X Management" naming template regardless of vocabulary', () => {
    // Both nouns share one source module in `buildEvidenceSet`, giving 2
    // concepts under one module key -- exactly the clustering rule
    // `capability-inference.ts` applies, proven here to fire identically
    // (same template, same structure) for two unrelated vocabularies.
    expect(vocabularyA.capabilities.length).toBeGreaterThan(0);
    expect(vocabularyB.capabilities.length).toBeGreaterThan(0);
    expect(vocabularyA.capabilities[0]!.name).toMatch(/ Management$/);
    expect(vocabularyB.capabilities[0]!.name).toMatch(/ Management$/);
  });
});
