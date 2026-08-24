import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SCHEMA_VERSION,
  validateCanonicalKnowledgeRelationship,
  type ApiObject,
  type EntityObject,
} from '@phoenix-ai/knowledge-graph';
import { extractTechnicalEvidence } from '../src/inference-contract.js';
import { extractVocabulary } from '../src/vocabulary.js';
import { inferBusinessConcepts } from '../src/concept-inference.js';
import {
  buildCapabilityRelationships,
  inferBusinessCapabilities,
  materializeBusinessCapabilities,
} from '../src/capability-inference.js';
import { GENERATED_AT, SYSTEM_ID, WIDGET_OBJECTS } from './fixtures.js';

function buildCapabilities() {
  const items = extractTechnicalEvidence(WIDGET_OBJECTS);
  const terms = extractVocabulary(items, GENERATED_AT);
  const concepts = inferBusinessConcepts(terms, WIDGET_OBJECTS, GENERATED_AT);
  return { concepts, capabilities: inferBusinessCapabilities(concepts, GENERATED_AT) };
}

describe('inferBusinessCapabilities (P5-04)', () => {
  it('clusters concepts co-located under the same source module into one capability', () => {
    const { capabilities } = buildCapabilities();
    const capability = capabilities.find((c) => c.moduleKey === 'services/widgets');
    expect(capability).toBeDefined();
    expect(capability!.conceptIds.length).toBeGreaterThanOrEqual(2);
  });

  it('does not create a capability from a single, unclustered concept (Gadget is alone in its module)', () => {
    const { capabilities } = buildCapabilities();
    const gadgetCapability = capabilities.find((c) => c.moduleKey === 'services/gadgets');
    expect(gadgetCapability).toBeUndefined();
  });

  it('retains evidence, provenance, and confidence for every capability candidate', () => {
    const { capabilities } = buildCapabilities();
    for (const capability of capabilities) {
      expect(capability.provenance.length).toBeGreaterThan(0);
      expect(capability.confidenceDetail.basis).toBe('derived');
      expect(capability.supportingTechnicalObjectIds.length).toBeGreaterThan(0);
    }
  });

  it('names the capability generically from the module segment, not a hardcoded business name', () => {
    const { capabilities } = buildCapabilities();
    const capability = capabilities.find((c) => c.moduleKey === 'services/widgets')!;
    expect(capability.name).toBe('Widgets Management');
  });
});

// Blocker 2: a flat/monolith repository -- a single `repo://x` sourceId
// with NO further path segments (the real shape of Phase 3's actual
// `spring-petclinic` extraction's provenance) -- carries no PRIMARY module
// signal at all. The SECONDARY fallback must derive a module key from real
// `Evidence.locator` file paths instead (a Java-package-style directory
// grouping), never a fabricated constant.
const FLAT_REPO_SYSTEM_ID = 'flat-monolith';
const FLAT_REPO_SOURCE_ID = 'repo://flat-monolith';

function flatRepoProvenance() {
  return [
    {
      sourceId: FLAT_REPO_SOURCE_ID,
      sourceType: 'source-code' as const,
      derivedBy: 'extraction-engine',
      derivedAt: GENERATED_AT,
    },
  ];
}

const FLAT_WIDGET_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-flat-widget-controller',
    systemId: FLAT_REPO_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'WidgetController',
  attributes: { operations: [{ name: 'createWidget', description: 'Creates a widget.' }] },
  metadata: { provenance: flatRepoProvenance(), confidence: { level: 'high' } },
  evidence: [
    {
      id: 'ev-flat-widget-controller',
      sourceId: FLAT_REPO_SOURCE_ID,
      locator: 'src/main/java/com/example/flatapp/widgets/WidgetController.java#L1-L40',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

/** Co-located with `FLAT_WIDGET_CONTROLLER` under the SAME real package directory (`com/example/flatapp/widgets`) -- 2 concepts, meeting `MIN_CONCEPTS_PER_CAPABILITY` via the locator-derived fallback alone. */
const FLAT_WIDGET_HISTORY_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-flat-widget-history-controller',
    systemId: FLAT_REPO_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'WidgetHistoryController',
  attributes: {
    operations: [{ name: 'createWidgetHistory', description: 'Records widget history.' }],
  },
  metadata: { provenance: flatRepoProvenance(), confidence: { level: 'high' } },
  evidence: [
    {
      id: 'ev-flat-widget-history-controller',
      sourceId: FLAT_REPO_SOURCE_ID,
      locator: 'src/main/java/com/example/flatapp/widgets/WidgetHistoryController.java#L1-L20',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

const FLAT_GADGET_ENTITY: EntityObject = {
  identity: {
    id: 'entity-flat-gadget',
    systemId: FLAT_REPO_SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'domain.entity',
  label: 'Gadget',
  attributes: { fields: [{ name: 'id', type: 'uuid', required: true }] },
  // Different real package directory (`com/example/flatapp/gadgets`) -- must NOT cluster with the widgets pair above.
  metadata: { provenance: flatRepoProvenance(), confidence: { level: 'high' } },
  evidence: [
    {
      id: 'ev-flat-gadget',
      sourceId: FLAT_REPO_SOURCE_ID,
      locator: 'src/main/java/com/example/flatapp/gadgets/Gadget.java#L1-L10',
    },
  ],
  confidenceDetail: { basis: 'observed' },
};

function buildFlatRepoCapabilities() {
  const objects = [FLAT_WIDGET_CONTROLLER, FLAT_WIDGET_HISTORY_CONTROLLER, FLAT_GADGET_ENTITY];
  const items = extractTechnicalEvidence(objects);
  const terms = extractVocabulary(items, GENERATED_AT);
  const concepts = inferBusinessConcepts(terms, objects, GENERATED_AT);
  return { concepts, capabilities: inferBusinessCapabilities(concepts, GENERATED_AT) };
}

describe('inferBusinessCapabilities -- module-key fallback for flat/monolith repositories (Blocker 2)', () => {
  it('microservice-style path (repo://x/services/y) still uses the PRIMARY signal, unchanged', () => {
    const { capabilities } = buildCapabilities();
    expect(capabilities.some((c) => c.moduleKey === 'services/widgets')).toBe(true);
  });

  it('a flat repo://x provenance alone (no service path) resolves via the SECONDARY, locator-derived fallback (real Java package directory)', () => {
    const { capabilities } = buildFlatRepoCapabilities();
    const capability = capabilities.find((c) => c.moduleKey === 'flatapp/widgets');
    expect(capability).toBeDefined();
    expect(capability!.conceptIds.length).toBeGreaterThanOrEqual(2);
  });

  it('derives the module key from the real Java package directory in Evidence.locator, not a fabricated constant', () => {
    const { capabilities } = buildFlatRepoCapabilities();
    expect(
      capabilities.every((c) => c.moduleKey !== 'default-module' && c.moduleKey.length > 0),
    ).toBe(true);
  });

  it('does not cluster concepts from a different real package directory (Gadget stays unclustered, alone)', () => {
    const { capabilities } = buildFlatRepoCapabilities();
    const gadgetCapability = capabilities.find((c) => c.moduleKey.includes('gadgets'));
    expect(gadgetCapability).toBeUndefined();
  });
});

describe('materializeBusinessCapabilities / buildCapabilityRelationships', () => {
  it('creates a real business.capability object, distinct from any existing OKF kind', () => {
    const { capabilities } = buildCapabilities();
    const objects = materializeBusinessCapabilities(capabilities, SYSTEM_ID, GENERATED_AT);
    expect(objects.length).toBe(capabilities.length);
    for (const object of objects) expect(object.kind).toBe('business.capability');
  });

  it('builds valid comprises (capability -> concept) and realizedBy (capability -> technical object) relationships', () => {
    const { capabilities } = buildCapabilities();
    const relationships = buildCapabilityRelationships(capabilities);
    expect(relationships.some((r) => r.kind === 'comprises')).toBe(true);
    expect(relationships.some((r) => r.kind === 'realizedBy')).toBe(true);
    for (const relationship of relationships) {
      expect(validateCanonicalKnowledgeRelationship(relationship)).toEqual({
        valid: true,
        errors: [],
      });
    }
  });
});
