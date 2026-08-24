/**
 * Shared test fixture for P5-02 through P5-08's unit tests. Deliberately
 * uses a generic, nonsense placeholder noun ("Widget") rather than a real
 * business domain -- proving each stage's logic is driven by STRUCTURE
 * (naming convention, CRUD verbs, module co-location), not by recognizing
 * a specific business word. Real Aurora/fintech validation lives in
 * `aurora-fintech-validation.test.ts` (P5-10), never here.
 */

import {
  CANONICAL_SCHEMA_VERSION,
  type ApiObject,
  type CanonicalKnowledgeObject,
  type EntityObject,
} from '@phoenix-ai/knowledge-graph';

const GENERATED_AT = '2026-08-22T00:00:00.000Z';
const SYSTEM_ID = 'widget-system';
const SOURCE_ID = 'repo://widget-system/services/widgets';

function provenance() {
  return [
    {
      sourceId: SOURCE_ID,
      sourceType: 'source-code' as const,
      derivedBy: 'extraction-engine',
      derivedAt: GENERATED_AT,
    },
  ];
}

export const WIDGET_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-widget-controller',
    systemId: SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'WidgetController',
  attributes: {
    operations: [
      { name: 'createWidget', description: 'Creates a widget.' },
      { name: 'getWidget', description: 'Reads a widget.' },
      { name: 'confirmWidget', description: 'Confirms a widget.' },
      { name: 'shipWidget', description: 'Ships a widget.' },
      { name: 'cancelWidget', description: 'Cancels a widget.' },
    ],
  },
  metadata: { provenance: provenance(), confidence: { level: 'high' } },
  evidence: [
    { id: 'ev-widget-controller', sourceId: SOURCE_ID, locator: 'WidgetController.java#L1' },
  ],
  confidenceDetail: { basis: 'observed' },
};

export const WIDGET_ENTITY: EntityObject = {
  identity: {
    id: 'entity-widget',
    systemId: SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'domain.entity',
  label: 'Widget',
  attributes: {
    fields: [{ name: 'id', type: 'uuid', required: true }],
  },
  metadata: { provenance: provenance(), confidence: { level: 'high' } },
  evidence: [{ id: 'ev-widget-entity', sourceId: SOURCE_ID, locator: 'Widget.java#L1' }],
  confidenceDetail: { basis: 'observed' },
};

export const WIDGET_REPOSITORY_LIKE_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-gadget-controller',
    systemId: SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'GadgetController',
  attributes: {
    operations: [
      { name: 'createGadget', description: 'Creates a gadget.' },
      { name: 'activateGadget', description: 'Activates a gadget.' },
      { name: 'suspendGadget', description: 'Suspends a gadget.' },
    ],
  },
  metadata: {
    provenance: [
      {
        sourceId: 'repo://widget-system/services/gadgets',
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

/** Co-located with `WIDGET_ENTITY` under the same source module (`services/widgets`) so `capability-inference.ts` has two distinct concepts to cluster into one capability. */
export const COMPONENT_ENTITY: EntityObject = {
  identity: {
    id: 'entity-component',
    systemId: SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'domain.entity',
  label: 'Component',
  attributes: {
    fields: [{ name: 'id', type: 'uuid', required: true }],
  },
  metadata: { provenance: provenance(), confidence: { level: 'high' } },
  evidence: [{ id: 'ev-component-entity', sourceId: SOURCE_ID, locator: 'Component.java#L1' }],
  confidenceDetail: { basis: 'observed' },
};

export const COMPONENT_CONTROLLER: ApiObject = {
  identity: {
    id: 'api-component-controller',
    systemId: SYSTEM_ID,
    createdAt: GENERATED_AT,
    updatedAt: GENERATED_AT,
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'integration.api',
  label: 'ComponentController',
  attributes: {
    operations: [
      { name: 'createComponent', description: 'Creates a component.' },
      { name: 'getComponent', description: 'Reads a component.' },
    ],
  },
  metadata: { provenance: provenance(), confidence: { level: 'high' } },
  evidence: [],
  confidenceDetail: { basis: 'observed' },
};

export const WIDGET_OBJECTS: CanonicalKnowledgeObject[] = [
  WIDGET_CONTROLLER,
  WIDGET_ENTITY,
  WIDGET_REPOSITORY_LIKE_CONTROLLER,
  COMPONENT_ENTITY,
  COMPONENT_CONTROLLER,
];

export { GENERATED_AT, SYSTEM_ID };
