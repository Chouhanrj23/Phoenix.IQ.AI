/**
 * P2-06 -- the Integration/API model.
 *
 * Typed extensions of the P2-01 canonical envelope (`canonical-object.ts`,
 * `relationships.ts`) and the P2-02 ontology (`ontology.ts`) for API,
 * Interface, Integration, and DataFlow -- the FRD's "Integration/API" area,
 * and the last of the four domain areas planned for Phase 2. Follows the
 * same pattern `architecture.ts` (P2-03), `domain.ts` (P2-04), and
 * `journey.ts` (P2-05) established.
 *
 * This file defines the MODEL only. No API discovery, no repository
 * scanning, no Jira/Git connectors -- nothing here produces integration
 * data from a real system. It only shapes what a future extraction/
 * inference source would need to produce, and what `apps/api`'s existing
 * `Integration` contract (`packages/shared/src/contracts.ts`, P1-02) can
 * be mapped from -- see `packages/knowledge-graph/tests/integration.test.ts`
 * and `docs/architecture/adr/0008-integration-api-model.md` for the
 * mapping, gaps, and design rationale.
 *
 * Per the FRD's own node-type list (`docs/ontology/README.md`), `Interface`,
 * `Integration`, and `DataFlow` are all NODES, not edges -- `API`/
 * `Interface`/`Integration`/`DataFlow` are therefore all modeled as
 * `CanonicalKnowledgeObject`s here, connected by relationships, matching
 * how `Component`/`Container`/`System` (P2-03) were modeled, not as
 * relationships themselves despite the requirements phrasing "source,
 * target" for a couple of them (that phrasing describes what each node
 * *connects to*, via relationships -- see ADR 0008 decision 1).
 */

import type { CanonicalKnowledgeObject } from './canonical-object.js';
import type { CanonicalKnowledgeRelationship } from './relationships.js';
import type { KnowledgeValue } from './identity.js';
import {
  isNonEmptyString,
  isPlainObject,
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
  type ValidationResult,
} from './validation.js';

// ---------------------------------------------------------------------------
// Object kinds
// ---------------------------------------------------------------------------

export const INTEGRATION_OBJECT_KINDS = [
  'integration.api',
  'integration.interface',
  'integration.integration',
  'integration.dataflow',
] as const;
export type IntegrationObjectKind = (typeof INTEGRATION_OBJECT_KINDS)[number];

/** Reuses Phase 1's exact domain-neutral vocabulary (`IntegrationDirection`, `packages/shared/src/contracts.ts`). */
export type InteractionDirection = 'outbound' | 'inbound' | 'bidirectional';

// ---------------------------------------------------------------------------
// Operation -- deliberately NOT a CanonicalKnowledgeObject, same rationale
// as P2-04's AttributeDefinition: a lightweight descriptor embedded in an
// API's `attributes.operations`, not a first-class node.
// ---------------------------------------------------------------------------

export interface OperationDefinition {
  [key: string]: KnowledgeValue;
  name: string;
  description?: string;
}

// ---------------------------------------------------------------------------
// Typed attribute bags
// ---------------------------------------------------------------------------

export interface ApiAttributes {
  [key: string]: KnowledgeValue;
  description?: string;
  /** Operation/interface information, where available. Omitted if not yet determined. */
  operations?: OperationDefinition[];
}

export interface InterfaceAttributes {
  [key: string]: KnowledgeValue;
  /** The capability this interface exposes or consumes. */
  description?: string;
  /** Protocol, where known (e.g. "REST/HTTPS", "AMQP"). No specific technology assumed. */
  protocol?: string;
}

export interface IntegrationAttributes {
  [key: string]: KnowledgeValue;
  /** Always expected -- maps to Phase 1's `Integration.direction`. */
  interactionType: InteractionDirection;
  /** Protocol/channel, where known -- maps to Phase 1's `Integration.protocol`. */
  protocol?: string;
  /**
   * Free-text description of the counterpart's role (e.g. "External
   * payment processor"), used when the counterpart has no resolved object
   * of its own -- which Phase 1 never has (see the ADR: this is the same
   * "external actor" gap P2-03 flagged and left open, not solved here
   * either, just no longer silently dropped).
   */
  counterpartDescription?: string;
}

export interface DataFlowAttributes {
  [key: string]: KnowledgeValue;
  /** What data moves. Maps to Phase 1's `Integration.dataExchanged`. */
  data?: string;
  direction?: InteractionDirection;
}

// ---------------------------------------------------------------------------
// Typed objects
// ---------------------------------------------------------------------------

/** Category `entity` -- a specific, named API is a discrete, persistent thing. */
export interface ApiObject extends CanonicalKnowledgeObject<ApiAttributes> {
  category: 'entity';
  kind: 'integration.api';
}

/**
 * Category `entity`. What an `ApiObject` (or a non-API boundary, e.g. a
 * queue topic) realizes -- see `realizes` in `IntegrationRelationship`.
 */
export interface InterfaceObject extends CanonicalKnowledgeObject<InterfaceAttributes> {
  category: 'entity';
  kind: 'integration.interface';
}

/**
 * Category `entity`. Represents "this system integrates with X" -- the
 * counterpart itself is described in `attributes.counterpartDescription`
 * plus this object's own `label` (matching Phase 1's `Integration.name`),
 * not a separate resolved object -- see the ADR for why.
 */
export interface IntegrationObject extends CanonicalKnowledgeObject<IntegrationAttributes> {
  category: 'entity';
  kind: 'integration.integration';
}

/**
 * Category `entity`. Connected to its owning `IntegrationObject` via
 * `carries` (composition), per the FRD: "Integration carries DataFlow".
 */
export interface DataFlowObject extends CanonicalKnowledgeObject<DataFlowAttributes> {
  category: 'entity';
  kind: 'integration.dataflow';
}

export type IntegrationModelObject =
  ApiObject | InterfaceObject | IntegrationObject | DataFlowObject;

// ---------------------------------------------------------------------------
// Relationship kinds
// ---------------------------------------------------------------------------

/**
 * - `hasIntegration` -- an internal object (e.g. a P2-03 `ContainerObject`)
 *   -> Integration (association; the requirements' "source" of the
 *   integration).
 * - `carries` -- Integration -> DataFlow (composition; FRD: "Integration
 *   carries DataFlow").
 * - `exposes` / `consumes` -- an internal object -> Interface (interaction;
 *   FRD: "Interface exposes/consumes DataFlow" -- categorized `interaction`
 *   per the P2-02/ADR-0004 FRD-verb mapping already established).
 * - `realizes` -- API -> Interface (realization; the API is the concrete
 *   technical implementation of the interface's contract).
 */
export const INTEGRATION_RELATIONSHIP_KINDS = [
  'hasIntegration',
  'carries',
  'exposes',
  'consumes',
  'realizes',
] as const;
export type IntegrationRelationshipKind = (typeof INTEGRATION_RELATIONSHIP_KINDS)[number];

const INTEGRATION_RELATIONSHIP_CATEGORY: Record<
  IntegrationRelationshipKind,
  'composition' | 'association' | 'interaction' | 'realization'
> = {
  hasIntegration: 'association',
  carries: 'composition',
  exposes: 'interaction',
  consumes: 'interaction',
  realizes: 'realization',
};

export interface IntegrationRelationship extends CanonicalKnowledgeRelationship {
  kind: IntegrationRelationshipKind;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateOperationDefinitions(candidate: unknown): string[] {
  if (candidate === undefined) return [];
  if (!Array.isArray(candidate)) return ['attributes.operations, if present, must be an array'];
  const errors: string[] = [];
  candidate.forEach((operation, index) => {
    if (!isPlainObject(operation)) {
      errors.push(`attributes.operations[${index}] must be an object`);
      return;
    }
    if (!isNonEmptyString(operation.name)) {
      errors.push(`attributes.operations[${index}].name is required`);
    }
    if (
      'description' in operation &&
      operation.description !== undefined &&
      !isNonEmptyString(operation.description)
    ) {
      errors.push(
        `attributes.operations[${index}].description, if present, must be a non-empty string`,
      );
    }
  });
  return errors;
}

const INTERACTION_DIRECTIONS: readonly InteractionDirection[] = [
  'outbound',
  'inbound',
  'bidirectional',
];

function validateIntegrationModelEntity(
  candidate: unknown,
  expectedKind: IntegrationObjectKind,
): ValidationResult {
  const base = validateCanonicalKnowledgeObject(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    if (candidate.category !== 'entity') {
      errors.push('category must be "entity" for an integration/API-area object');
    }
    if (candidate.kind !== expectedKind) {
      errors.push(`kind must be "${expectedKind}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates an API object: also validates `attributes.operations`, if present. */
export function validateApiObject(candidate: unknown): ValidationResult {
  const result = validateIntegrationModelEntity(candidate, 'integration.api');
  const errors = [...result.errors];
  if (isPlainObject(candidate) && isPlainObject(candidate.attributes)) {
    errors.push(...validateOperationDefinitions(candidate.attributes.operations));
  }
  return { valid: errors.length === 0, errors };
}

/** Validates an Interface object: identity only -- both fields are optional ("where known"). */
export function validateInterfaceObject(candidate: unknown): ValidationResult {
  return validateIntegrationModelEntity(candidate, 'integration.interface');
}

/** Validates an Integration object: also requires `attributes.interactionType`. */
export function validateIntegrationObject(candidate: unknown): ValidationResult {
  const result = validateIntegrationModelEntity(candidate, 'integration.integration');
  const errors = [...result.errors];
  if (isPlainObject(candidate) && isPlainObject(candidate.attributes)) {
    const interactionType = candidate.attributes.interactionType;
    if (
      typeof interactionType !== 'string' ||
      !INTERACTION_DIRECTIONS.includes(interactionType as InteractionDirection)
    ) {
      errors.push(
        `attributes.interactionType must be one of: ${INTERACTION_DIRECTIONS.join(', ')}`,
      );
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Validates a DataFlow object: identity only -- both fields are optional. */
export function validateDataFlowObject(candidate: unknown): ValidationResult {
  return validateIntegrationModelEntity(candidate, 'integration.dataflow');
}

/** Dispatches to the right validator based on `kind`. */
export function validateIntegrationModelObject(candidate: unknown): ValidationResult {
  if (!isPlainObject(candidate)) return { valid: false, errors: ['must be a non-null object'] };
  switch (candidate.kind) {
    case 'integration.api':
      return validateApiObject(candidate);
    case 'integration.interface':
      return validateInterfaceObject(candidate);
    case 'integration.integration':
      return validateIntegrationObject(candidate);
    case 'integration.dataflow':
      return validateDataFlowObject(candidate);
    default:
      return {
        valid: false,
        errors: [`kind must be one of: ${INTEGRATION_OBJECT_KINDS.join(', ')}`],
      };
  }
}

/** Validates an integration/API-area relationship: kind + its expected category. */
export function validateIntegrationRelationship(candidate: unknown): ValidationResult {
  const base = validateCanonicalKnowledgeRelationship(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    const kind = candidate.kind;
    if (
      typeof kind !== 'string' ||
      !INTEGRATION_RELATIONSHIP_KINDS.includes(kind as IntegrationRelationshipKind)
    ) {
      errors.push(`kind must be one of: ${INTEGRATION_RELATIONSHIP_KINDS.join(', ')}`);
    } else {
      const expectedCategory =
        INTEGRATION_RELATIONSHIP_CATEGORY[kind as IntegrationRelationshipKind];
      if (candidate.category !== expectedCategory) {
        errors.push(`category must be "${expectedCategory}" for relationship kind "${kind}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
