import { describe, expect, it } from 'vitest';
import type { C4Edge, C4Node } from '@phoenix-ai/shared';
import type {
  ArchitectureRelationship,
  ComponentObject,
  ContainerObject,
  SystemObject,
} from '../src/architecture.js';
import {
  validateArchitectureObject,
  validateArchitectureRelationship,
  validateComponentObject,
  validateContainerObject,
  validateSystemObject,
} from '../src/architecture.js';
import { validateCanonicalKnowledgeBundle } from '../src/validation.js';
import { CANONICAL_SCHEMA_VERSION } from '../src/identity.js';

function meta() {
  return {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce',
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

function systemObject(): SystemObject {
  return {
    identity: baseIdentity('sys-aurora'),
    category: 'entity',
    kind: 'architecture.system',
    label: 'Aurora Commerce Platform',
    attributes: { description: 'The system under analysis.' },
    metadata: meta(),
    evidence: [],
  };
}

function containerObject(): ContainerObject {
  return {
    identity: baseIdentity('ctr-checkout'),
    category: 'entity',
    kind: 'architecture.container',
    label: 'Checkout Service',
    attributes: {
      responsibility: 'Orchestrates cart validation, order creation, and payment/fraud calls.',
      technology: 'Node.js',
    },
    metadata: meta(),
    evidence: [],
  };
}

function componentObject(): ComponentObject {
  return {
    identity: baseIdentity('cmp-cart-validator'),
    category: 'entity',
    kind: 'architecture.component',
    label: 'Cart Validator',
    attributes: { responsibility: 'Checks stock and price consistency before order creation.' },
    metadata: meta(),
    evidence: [],
  };
}

describe('SystemObject', () => {
  it('accepts a valid System with an optional description', () => {
    expect(validateSystemObject(systemObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a System with no description at all (not always known)', () => {
    const system = systemObject();
    system.attributes = {};
    expect(validateSystemObject(system).valid).toBe(true);
  });

  it('rejects the wrong kind or category', () => {
    const wrongKind = { ...systemObject(), kind: 'architecture.container' };
    expect(validateSystemObject(wrongKind).valid).toBe(false);

    const wrongCategory = { ...systemObject(), category: 'process' };
    expect(validateSystemObject(wrongCategory).valid).toBe(false);
  });
});

describe('ContainerObject', () => {
  it('accepts a valid Container with technology/runtime present', () => {
    expect(validateContainerObject(containerObject())).toEqual({ valid: true, errors: [] });
  });

  it('accepts a Container with technology/runtime omitted ("where available")', () => {
    const container = containerObject();
    container.attributes = { responsibility: containerObject().attributes.responsibility };
    expect(validateContainerObject(container).valid).toBe(true);
  });

  it('rejects a Container missing responsibility', () => {
    const container = containerObject();
    container.attributes = { technology: 'Node.js' } as ContainerObject['attributes'];
    const result = validateContainerObject(container);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attributes.responsibility is required');
  });
});

describe('ComponentObject', () => {
  it('accepts a valid Component', () => {
    expect(validateComponentObject(componentObject())).toEqual({ valid: true, errors: [] });
  });

  it('rejects a Component missing responsibility', () => {
    const component = componentObject();
    component.attributes = {} as ComponentObject['attributes'];
    const result = validateComponentObject(component);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('attributes.responsibility is required');
  });
});

describe('validateArchitectureObject — dispatch by kind', () => {
  it('dispatches System/Container/Component to the right validator', () => {
    expect(validateArchitectureObject(systemObject()).valid).toBe(true);
    expect(validateArchitectureObject(containerObject()).valid).toBe(true);
    expect(validateArchitectureObject(componentObject()).valid).toBe(true);
  });

  it('rejects an unrecognized kind', () => {
    const result = validateArchitectureObject({
      ...containerObject(),
      kind: 'architecture.mystery',
    });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain('kind must be one of');
  });
});

describe('ArchitectureRelationship', () => {
  function containsRelationship(): ArchitectureRelationship {
    return {
      id: 'rel-1',
      category: 'composition',
      kind: 'contains',
      sourceObjectId: 'sys-aurora',
      targetObjectId: 'ctr-checkout',
      metadata: meta(),
    };
  }

  function communicatesWithRelationship(): ArchitectureRelationship {
    return {
      id: 'rel-2',
      category: 'interaction',
      kind: 'communicatesWith',
      sourceObjectId: 'ctr-checkout',
      targetObjectId: 'ctr-payments',
      metadata: meta(),
      attributes: { description: 'authorizes payment' },
    };
  }

  it('accepts a valid "contains" relationship (composition)', () => {
    expect(validateArchitectureRelationship(containsRelationship())).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('accepts a valid "communicatesWith" relationship with free-text detail', () => {
    expect(validateArchitectureRelationship(communicatesWithRelationship())).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects an unrecognized kind', () => {
    const result = validateArchitectureRelationship({
      ...containsRelationship(),
      kind: 'usesDatabase',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('kind must be one of: contains, communicatesWith');
  });

  it('rejects a category/kind mismatch (e.g. "contains" tagged as interaction)', () => {
    const result = validateArchitectureRelationship({
      ...containsRelationship(),
      category: 'interaction',
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'category must be "composition" for relationship kind "contains"',
    );
  });
});

describe('Phase 1 C4Node/C4Edge compatibility (real Aurora fixture shapes)', () => {
  // Real values from apps/api/src/data/seed.ts's contextNodes/containerNodes/
  // containerEdges — not imported directly (packages must not depend on
  // apps), but structurally identical.
  const auroraSystemNode: C4Node = {
    id: 'ctx-aurora',
    level: 'context',
    name: 'Aurora Commerce Platform',
    description: 'The system under analysis: storefront, checkout, payments, fraud, fulfillment.',
    metadata: meta(),
  };

  const checkoutContainerNode: C4Node = {
    id: 'ctr-checkout',
    level: 'container',
    name: 'Checkout Service',
    technology: 'Node.js',
    description: 'Orchestrates cart validation, order creation, and payment/fraud calls.',
    metadata: meta(),
  };

  const startsWorkflowEdge: C4Edge = {
    id: 'e-2',
    source: 'ctr-checkout',
    target: 'ctr-order-orch',
    label: 'starts order workflow',
    level: 'container',
    metadata: meta(),
  };

  it('maps the real "Aurora Commerce Platform" context node onto a valid SystemObject', () => {
    const system: SystemObject = {
      identity: baseIdentity(auroraSystemNode.id),
      category: 'entity',
      kind: 'architecture.system',
      label: auroraSystemNode.name,
      attributes: { description: auroraSystemNode.description },
      metadata: auroraSystemNode.metadata,
      evidence: [],
    };
    expect(validateSystemObject(system)).toEqual({ valid: true, errors: [] });
    expect(system.metadata).toEqual(auroraSystemNode.metadata);
  });

  it('maps the real "Checkout Service" container node onto a valid ContainerObject, losslessly', () => {
    const container: ContainerObject = {
      identity: baseIdentity(checkoutContainerNode.id),
      category: 'entity',
      kind: 'architecture.container',
      label: checkoutContainerNode.name,
      attributes: {
        responsibility: checkoutContainerNode.description,
        technology: checkoutContainerNode.technology,
      },
      metadata: checkoutContainerNode.metadata,
      evidence: [],
    };
    expect(validateContainerObject(container)).toEqual({ valid: true, errors: [] });
    expect(container.attributes.responsibility).toBe(checkoutContainerNode.description);
    expect(container.attributes.technology).toBe(checkoutContainerNode.technology);
  });

  it('maps a real container-level C4Edge onto a valid "communicatesWith" ArchitectureRelationship', () => {
    const relationship: ArchitectureRelationship = {
      id: startsWorkflowEdge.id,
      category: 'interaction',
      kind: 'communicatesWith',
      sourceObjectId: startsWorkflowEdge.source,
      targetObjectId: startsWorkflowEdge.target,
      metadata: startsWorkflowEdge.metadata,
      attributes: { description: startsWorkflowEdge.label },
    };
    expect(validateArchitectureRelationship(relationship)).toEqual({ valid: true, errors: [] });
    expect(relationship.attributes?.description).toBe('starts order workflow');
  });

  it('does NOT have a Phase 1 Component-level equivalent -- there is no real fixture data for this level', () => {
    // apps/api's architecture.service.ts and apps/web's mock provider both
    // explicitly fall back to the container view for level=component: no
    // Phase 1 seed data exists at Component granularity (see
    // apps/api/src/services/architecture.service.ts and the Gap Analysis
    // page, which calls this out as a known gap). ComponentObject above is
    // therefore validated against a hand-built example, not a real Phase 1
    // mapping -- this is an explicit, documented limitation, not an
    // oversight (see docs/architecture/adr/0005-architecture-model.md).
    expect(componentObject().identity.id).not.toMatch(/^ctr-|^ctx-/);
  });

  it('assembles System + Container + "contains" relationship into a valid bundle', () => {
    const system: SystemObject = {
      identity: baseIdentity(auroraSystemNode.id),
      category: 'entity',
      kind: 'architecture.system',
      label: auroraSystemNode.name,
      attributes: { description: auroraSystemNode.description },
      metadata: auroraSystemNode.metadata,
      evidence: [],
    };
    const container: ContainerObject = {
      identity: baseIdentity(checkoutContainerNode.id),
      category: 'entity',
      kind: 'architecture.container',
      label: checkoutContainerNode.name,
      attributes: { responsibility: checkoutContainerNode.description },
      metadata: checkoutContainerNode.metadata,
      evidence: [],
    };
    const contains: ArchitectureRelationship = {
      id: 'rel-sys-contains-checkout',
      category: 'composition',
      kind: 'contains',
      sourceObjectId: system.identity.id,
      targetObjectId: container.identity.id,
      metadata: meta(),
    };
    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-01T00:00:00.000Z',
      objects: [system, container],
      relationships: [contains],
    };
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
  });
});
