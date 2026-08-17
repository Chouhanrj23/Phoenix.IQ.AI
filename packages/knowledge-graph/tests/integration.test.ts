import { describe, expect, it } from 'vitest';
import type { Integration } from '@phoenix-ai/shared';
import type { ContainerObject } from '../src/architecture.js';
import type {
  ApiObject,
  DataFlowObject,
  IntegrationObject,
  IntegrationRelationship,
  InterfaceObject,
} from '../src/integration.js';
import {
  validateApiObject,
  validateDataFlowObject,
  validateIntegrationModelObject,
  validateIntegrationObject,
  validateIntegrationRelationship,
  validateInterfaceObject,
} from '../src/integration.js';
import { validateCanonicalKnowledgeBundle } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function meta() {
  return {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce/services/payments-adapter',
        sourceType: 'source-code' as const,
        derivedBy: 'extraction-engine',
        derivedAt: '2026-08-01T00:00:00.000Z',
      },
    ],
    confidence: { level: 'high' as const, score: 0.9 },
  };
}

function baseIdentity(id: string) {
  return {
    id,
    systemId: 'aurora-commerce',
    createdAt: '2026-08-01T00:00:00.000Z',
    updatedAt: '2026-08-01T00:00:00.000Z',
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  };
}

function apiObject(): ApiObject {
  return {
    identity: baseIdentity('api-meridian-pay'),
    category: 'entity',
    kind: 'integration.api',
    label: 'Meridian Pay Payments API',
    attributes: {
      description: 'Authorization and capture endpoints.',
      operations: [
        { name: 'authorize', description: 'Authorize a card for a given amount.' },
        { name: 'capture' },
      ],
    },
    metadata: meta(),
    evidence: [],
  };
}

function interfaceObject(): InterfaceObject {
  return {
    identity: baseIdentity('iface-payment-authorization'),
    category: 'entity',
    kind: 'integration.interface',
    label: 'Payment Authorization',
    attributes: { description: 'Authorizes a card payment.', protocol: 'REST/HTTPS (synchronous)' },
    metadata: meta(),
    evidence: [],
  };
}

function integrationObject(): IntegrationObject {
  return {
    identity: baseIdentity('int-meridian-pay'),
    category: 'entity',
    kind: 'integration.integration',
    label: 'Meridian Pay',
    attributes: {
      interactionType: 'outbound',
      protocol: 'REST/HTTPS (synchronous)',
      counterpartDescription: 'External payment processor',
    },
    metadata: meta(),
    evidence: [],
  };
}

function dataFlowObject(): DataFlowObject {
  return {
    identity: baseIdentity('flow-payment-request'),
    category: 'entity',
    kind: 'integration.dataflow',
    label: 'Payment authorization request/response',
    attributes: {
      data: 'Card token, amount, currency, order reference → authorization/capture result',
      direction: 'outbound',
    },
    metadata: meta(),
    evidence: [],
  };
}

describe('ApiObject', () => {
  it('accepts a valid API with operations', () => {
    expect(validateApiObject(apiObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts an API with no operations at all ("where available")', () => {
    const api = apiObject();
    api.attributes = { description: 'Some API.' };
    expect(validateApiObject(api).valid).toBe(true);
  });

  it('accepts an operation with description omitted', () => {
    const api = apiObject();
    api.attributes = { operations: [{ name: 'authorize' }] };
    expect(validateApiObject(api).valid).toBe(true);
  });

  it('rejects an operation missing name', () => {
    const api = apiObject();
    api.attributes = {
      operations: [{ description: 'Authorize a payment.' }],
    } as ApiObject['attributes'];
    const result = validateApiObject(api);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attributes.operations[0].name is required');
  });
});

describe('InterfaceObject', () => {
  it('accepts a valid Interface with protocol known', () => {
    expect(validateInterfaceObject(interfaceObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts an Interface with protocol unknown', () => {
    const iface = interfaceObject();
    iface.attributes = { description: 'Some capability.' };
    expect(validateInterfaceObject(iface).valid).toBe(true);
  });
});

describe('IntegrationObject', () => {
  it('accepts a valid Integration with interactionType/protocol/counterpartDescription', () => {
    expect(validateIntegrationObject(integrationObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts an Integration with protocol/counterpartDescription omitted ("where known")', () => {
    const integration = integrationObject();
    integration.attributes = { interactionType: 'inbound' };
    expect(validateIntegrationObject(integration).valid).toBe(true);
  });

  it('accepts all three interactionType values', () => {
    for (const interactionType of ['outbound', 'inbound', 'bidirectional'] as const) {
      const integration = integrationObject();
      integration.attributes = { ...integration.attributes, interactionType };
      expect(validateIntegrationObject(integration).valid).toBe(true);
    }
  });

  it('rejects a missing or invalid interactionType', () => {
    const missing = integrationObject();
    missing.attributes = { protocol: 'REST' } as IntegrationObject['attributes'];
    expect(validateIntegrationObject(missing).valid).toBe(false);

    const invalid = integrationObject();
    invalid.attributes = { ...invalid.attributes, interactionType: 'sideways' as never };
    const result = validateIntegrationObject(invalid);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'attributes.interactionType must be one of: outbound, inbound, bidirectional',
    );
  });
});

describe('DataFlowObject', () => {
  it('accepts a valid DataFlow with data/direction', () => {
    expect(validateDataFlowObject(dataFlowObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a DataFlow with no attributes at all', () => {
    const flow = dataFlowObject();
    flow.attributes = {};
    expect(validateDataFlowObject(flow).valid).toBe(true);
  });
});

describe('validateIntegrationModelObject — dispatch by kind', () => {
  it('dispatches API/Interface/Integration/DataFlow to the right validator', () => {
    expect(validateIntegrationModelObject(apiObject()).valid).toBe(true);
    expect(validateIntegrationModelObject(interfaceObject()).valid).toBe(true);
    expect(validateIntegrationModelObject(integrationObject()).valid).toBe(true);
    expect(validateIntegrationModelObject(dataFlowObject()).valid).toBe(true);
  });

  it('rejects an unrecognized kind', () => {
    const result = validateIntegrationModelObject({ ...apiObject(), kind: 'integration.mystery' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('kind must be one of');
  });
});

describe('IntegrationRelationship', () => {
  function hasIntegration(): IntegrationRelationship {
    return {
      id: 'rel-has-integration',
      category: 'association',
      kind: 'hasIntegration',
      sourceObjectId: 'ctr-payments',
      targetObjectId: 'int-meridian-pay',
      metadata: meta(),
    };
  }

  it('accepts all five relationship kinds with their correct category', () => {
    const cases: Array<[IntegrationRelationship['kind'], IntegrationRelationship['category']]> = [
      ['hasIntegration', 'association'],
      ['carries', 'composition'],
      ['exposes', 'interaction'],
      ['consumes', 'interaction'],
      ['realizes', 'realization'],
    ];
    for (const [kind, category] of cases) {
      expect(validateIntegrationRelationship({ ...hasIntegration(), kind, category })).toEqual({
        valid: true,
        errors: [],
      });
    }
  });

  it('rejects an unrecognized kind', () => {
    const result = validateIntegrationRelationship({ ...hasIntegration(), kind: 'callsVia' });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('kind must be one of');
  });

  it('rejects a category/kind mismatch (e.g. "carries" tagged as association)', () => {
    const result = validateIntegrationRelationship({
      ...hasIntegration(),
      kind: 'carries',
      category: 'association',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'category must be "composition" for relationship kind "carries"',
    );
  });
});

describe('Phase 1 Integration compatibility (real Aurora fixture shapes)', () => {
  // Real values from apps/api/src/data/seed.ts's `integrations` export (also
  // present in apps/web/src/data/mock/aurora/integrations.ts) -- not
  // imported directly (packages must not depend on apps), reconstructed
  // here via the real @phoenix-ai/shared `Integration` type.
  const meridianPayIntegration: Integration = {
    id: 'int-meridian-pay',
    name: 'Meridian Pay',
    counterpart: 'External payment processor',
    direction: 'outbound',
    protocol: 'REST/HTTPS (synchronous)',
    dataExchanged: 'Card token, amount, currency, order reference → authorization/capture result',
    metadata: meta(),
  };

  const warehouseIntegration: Integration = {
    id: 'int-warehouse-3pl',
    name: 'Warehouse & 3PL System',
    counterpart: 'External logistics provider',
    direction: 'bidirectional',
    protocol: 'REST/HTTPS + nightly SFTP batch',
    dataExchanged: 'Outbound: shipment requests. Inbound: stock levels, tracking events.',
    metadata: meta(),
  };

  function toIntegrationObject(integration: Integration): IntegrationObject {
    return {
      identity: baseIdentity(integration.id),
      category: 'entity',
      kind: 'integration.integration',
      label: integration.name,
      attributes: {
        interactionType: integration.direction,
        protocol: integration.protocol,
        counterpartDescription: integration.counterpart,
      },
      metadata: integration.metadata,
      evidence: [],
    };
  }

  function toDataFlowObject(integration: Integration): DataFlowObject {
    return {
      identity: baseIdentity(`${integration.id}-dataflow`),
      category: 'entity',
      kind: 'integration.dataflow',
      label: `${integration.name} data exchange`,
      attributes: { data: integration.dataExchanged, direction: integration.direction },
      metadata: integration.metadata,
      evidence: [],
    };
  }

  it('maps the real Meridian Pay integration onto a valid IntegrationObject, losslessly', () => {
    const integration = toIntegrationObject(meridianPayIntegration);
    expect(validateIntegrationObject(integration)).toEqual({ valid: true, errors: [] });
    expect(integration.attributes.interactionType).toBe('outbound');
    expect(integration.attributes.counterpartDescription).toBe('External payment processor');
    expect(integration.metadata).toEqual(meridianPayIntegration.metadata);
  });

  it('maps the real bidirectional Warehouse & 3PL integration, preserving direction', () => {
    const integration = toIntegrationObject(warehouseIntegration);
    expect(validateIntegrationObject(integration)).toEqual({ valid: true, errors: [] });
    expect(integration.attributes.interactionType).toBe('bidirectional');
  });

  it('maps Integration.dataExchanged onto a DataFlowObject, connected via a "carries" relationship', () => {
    const integration = toIntegrationObject(meridianPayIntegration);
    const dataFlow = toDataFlowObject(meridianPayIntegration);
    const carries: IntegrationRelationship = {
      id: 'rel-int-carries-dataflow',
      category: 'composition',
      kind: 'carries',
      sourceObjectId: integration.identity.id,
      targetObjectId: dataFlow.identity.id,
      metadata: meta(),
    };
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [integration, dataFlow],
      relationships: [carries],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(dataFlow.attributes.data).toBe(meridianPayIntegration.dataExchanged);
  });

  it('has NO Phase 1 equivalent for API or Interface -- documents a real gap', () => {
    // IntegrationsPage.tsx and the Integration contract have no concept of
    // named operations or a separate "interface" boundary — Phase 1 only
    // ever captures the coarse integration fact (name, counterpart,
    // direction, protocol, one dataExchanged string). There is no real
    // Phase 1 data to adapt into an ApiObject or InterfaceObject; the unit
    // tests above use hand-built, clearly-labeled examples instead — an
    // explicit, documented limitation (see
    // docs/architecture/adr/0008-integration-api-model.md), not solved by
    // inventing fake source data.
    expect(Object.keys(meridianPayIntegration)).not.toContain('operations');
    expect(Object.keys(meridianPayIntegration)).not.toContain('interface');
  });

  it('demonstrates cross-domain composability: a real P2-03 Container has this Integration, whose API realizes an Interface', () => {
    // Real "Payments Gateway Adapter" container (P2-03, architecture.ts) --
    // included as a real object here, not just referenced by id, so the
    // bundle is genuinely self-consistent (every relationship endpoint
    // resolves to a real object in the same bundle).
    const paymentsContainer: ContainerObject = {
      identity: baseIdentity('ctr-payments'),
      category: 'entity',
      kind: 'architecture.container',
      label: 'Payments Gateway Adapter',
      attributes: { responsibility: 'Adapts checkout requests to the Meridian Pay API.' },
      metadata: meta(),
      evidence: [],
    };
    const integration = toIntegrationObject(meridianPayIntegration);
    const api = apiObject();
    const iface = interfaceObject();
    const hasIntegration: IntegrationRelationship = {
      id: 'rel-ctr-has-integration',
      category: 'association',
      kind: 'hasIntegration',
      sourceObjectId: paymentsContainer.identity.id,
      targetObjectId: integration.identity.id,
      metadata: meta(),
    };
    const realizes: IntegrationRelationship = {
      id: 'rel-api-realizes-interface',
      category: 'realization',
      kind: 'realizes',
      sourceObjectId: api.identity.id,
      targetObjectId: iface.identity.id,
      metadata: meta(),
    };
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [paymentsContainer, integration, api, iface],
      relationships: [hasIntegration, realizes],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });
});
