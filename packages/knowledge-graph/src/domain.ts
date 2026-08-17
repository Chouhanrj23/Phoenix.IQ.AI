/**
 * P2-04 -- the Domain/Entity model.
 *
 * Typed extensions of the P2-01 canonical envelope (`canonical-object.ts`,
 * `relationships.ts`) and the P2-02 ontology (`ontology.ts`) for Domain,
 * Entity, Aggregate, and Entity State -- the FRD's "Domain/Entity" area.
 * Follows the same pattern `architecture.ts` (P2-03) established.
 *
 * This file defines the MODEL only. No domain inference, no repository
 * scanning, no schema discovery -- nothing here produces domain data from a
 * real system. It only shapes what a future extraction/inference source
 * would need to produce, and what `apps/api`'s existing `Domain`/`Aggregate`
 * contract (`packages/shared/src/contracts.ts`, P1-02) can be mapped from --
 * see `packages/knowledge-graph/tests/domain.test.ts` and
 * `docs/architecture/adr/0006-domain-entity-model.md` for the mapping,
 * gaps, and design rationale.
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

export const DOMAIN_OBJECT_KINDS = [
  'domain.domain',
  'domain.entity',
  'domain.aggregate',
  'domain.entity-state',
] as const;
export type DomainObjectKind = (typeof DOMAIN_OBJECT_KINDS)[number];

// ---------------------------------------------------------------------------
// Attribute -- deliberately NOT a CanonicalKnowledgeObject: no identity, no
// independent provenance was asked for, just a lightweight field
// descriptor embedded in an Entity's `attributes.fields`.
// ---------------------------------------------------------------------------

export interface AttributeDefinition {
  [key: string]: KnowledgeValue;
  name: string;
  /** Data type, where known (e.g. "string", "uuid", "decimal"). No specific type system assumed. */
  type?: string;
  /** Whether this field must always be present, where known. Omitted = not determined (not "false"). */
  required?: boolean;
}

// ---------------------------------------------------------------------------
// Typed attribute bags
// ---------------------------------------------------------------------------

export interface DomainAttributes {
  [key: string]: KnowledgeValue;
  /** Description/context for the domain -- what it covers, its boundary. */
  description?: string;
}

export interface EntityAttributes {
  [key: string]: KnowledgeValue;
  description?: string;
  /** Field-level schema, where known. Omitted/empty if not yet determined. */
  fields?: AttributeDefinition[];
}

export interface AggregateAttributes {
  [key: string]: KnowledgeValue;
  description?: string;
}

export interface EntityStateAttributes {
  [key: string]: KnowledgeValue;
  description?: string;
}

// ---------------------------------------------------------------------------
// Typed objects
// ---------------------------------------------------------------------------

export interface DomainObject extends CanonicalKnowledgeObject<DomainAttributes> {
  category: 'entity';
  kind: 'domain.domain';
}

/**
 * Domain association (per the requirements) is expressed as a relationship
 * (`contains`, Domain -> Entity), not a field on the entity itself -- same
 * convention P2-03 used for Container/Component belonging to a System, and
 * what keeps hierarchy uniformly walkable via `category: 'composition'`
 * relationships (P2-02).
 */
export interface EntityObject extends CanonicalKnowledgeObject<EntityAttributes> {
  category: 'entity';
  kind: 'domain.entity';
}

/**
 * "Root entity" and "member entities" (per the requirements) are also
 * relationships (`aggregateRoot`/`aggregateMember`), not fields here --
 * same reasoning as `EntityObject`'s domain association.
 */
export interface AggregateObject extends CanonicalKnowledgeObject<AggregateAttributes> {
  category: 'entity';
  kind: 'domain.aggregate';
}

/**
 * One possible state an entity's lifecycle can be in (e.g. "pending"),
 * distinct from `LifecycleState` (P2-02): `LifecycleState` records what
 * state *a specific instance* is currently in; `EntityStateObject` defines
 * *a state that exists in the entity type's state machine at all* -- the
 * schema, not the instance value. "Where supported" per the requirements:
 * most entities won't have any `EntityStateObject`s or `transitionsTo`
 * relationships at all.
 */
export interface EntityStateObject extends CanonicalKnowledgeObject<EntityStateAttributes> {
  category: 'entity';
  kind: 'domain.entity-state';
}

export type DomainModelObject = DomainObject | EntityObject | AggregateObject | EntityStateObject;

// ---------------------------------------------------------------------------
// Relationship kinds
// ---------------------------------------------------------------------------

/**
 * - `contains` -- Domain -> Entity (composition; entity's domain association).
 * - `aggregateRoot` -- Aggregate -> Entity (composition; the aggregate's root).
 * - `aggregateMember` -- Aggregate -> Entity (composition; a non-root member).
 * - `hasState` -- Entity -> EntityState (association; one of the entity's
 *   legal states -- a loose reference, not ownership).
 * - `transitionsTo` -- EntityState -> EntityState (interaction; a legal
 *   transition. Categorized as `interaction`, not `association`, because a
 *   transition represents a triggered move, not a static reference).
 * - `relatesTo` -- Entity -> Entity (association; a generic domain
 *   relationship with no assumed business meaning, e.g. "Order relatesTo
 *   Customer" -- deliberately the least specific kind, so this doesn't
 *   invent business semantics per entity pair).
 */
export const DOMAIN_RELATIONSHIP_KINDS = [
  'contains',
  'aggregateRoot',
  'aggregateMember',
  'hasState',
  'transitionsTo',
  'relatesTo',
] as const;
export type DomainRelationshipKind = (typeof DOMAIN_RELATIONSHIP_KINDS)[number];

const DOMAIN_RELATIONSHIP_CATEGORY: Record<
  DomainRelationshipKind,
  'composition' | 'association' | 'interaction'
> = {
  contains: 'composition',
  aggregateRoot: 'composition',
  aggregateMember: 'composition',
  hasState: 'association',
  transitionsTo: 'interaction',
  relatesTo: 'association',
};

export interface DomainRelationship extends CanonicalKnowledgeRelationship {
  kind: DomainRelationshipKind;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateAttributeDefinitions(candidate: unknown): string[] {
  if (candidate === undefined) return [];
  if (!Array.isArray(candidate)) return ['attributes.fields, if present, must be an array'];
  const errors: string[] = [];
  candidate.forEach((field, index) => {
    if (!isPlainObject(field)) {
      errors.push(`attributes.fields[${index}] must be an object`);
      return;
    }
    if (!isNonEmptyString(field.name)) {
      errors.push(`attributes.fields[${index}].name is required`);
    }
    if ('type' in field && field.type !== undefined && !isNonEmptyString(field.type)) {
      errors.push(`attributes.fields[${index}].type, if present, must be a non-empty string`);
    }
    if (
      'required' in field &&
      field.required !== undefined &&
      typeof field.required !== 'boolean'
    ) {
      errors.push(`attributes.fields[${index}].required, if present, must be a boolean`);
    }
  });
  return errors;
}

function validateDomainEntity(
  candidate: unknown,
  expectedKind: DomainObjectKind,
): ValidationResult {
  const base = validateCanonicalKnowledgeObject(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    if (candidate.category !== 'entity') {
      errors.push('category must be "entity" for a domain/entity-area object');
    }
    if (candidate.kind !== expectedKind) {
      errors.push(`kind must be "${expectedKind}"`);
    }
    if (expectedKind === 'domain.entity' && isPlainObject(candidate.attributes)) {
      errors.push(...validateAttributeDefinitions(candidate.attributes.fields));
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a Domain object: identity + category "entity" + kind "domain.domain". */
export function validateDomainObject(candidate: unknown): ValidationResult {
  return validateDomainEntity(candidate, 'domain.domain');
}

/** Validates an Entity object: also validates `attributes.fields`, if present. */
export function validateEntityObject(candidate: unknown): ValidationResult {
  return validateDomainEntity(candidate, 'domain.entity');
}

/** Validates an Aggregate object: identity only -- root/members are relationships, not fields. */
export function validateAggregateObject(candidate: unknown): ValidationResult {
  return validateDomainEntity(candidate, 'domain.aggregate');
}

/** Validates an Entity State object: identity only. */
export function validateEntityStateObject(candidate: unknown): ValidationResult {
  return validateDomainEntity(candidate, 'domain.entity-state');
}

/** Dispatches to the right validator based on `kind`. */
export function validateDomainModelObject(candidate: unknown): ValidationResult {
  if (!isPlainObject(candidate)) return { valid: false, errors: ['must be a non-null object'] };
  switch (candidate.kind) {
    case 'domain.domain':
      return validateDomainObject(candidate);
    case 'domain.entity':
      return validateEntityObject(candidate);
    case 'domain.aggregate':
      return validateAggregateObject(candidate);
    case 'domain.entity-state':
      return validateEntityStateObject(candidate);
    default:
      return { valid: false, errors: [`kind must be one of: ${DOMAIN_OBJECT_KINDS.join(', ')}`] };
  }
}

/** Validates a domain/entity-area relationship: kind + its expected category. */
export function validateDomainRelationship(candidate: unknown): ValidationResult {
  const base = validateCanonicalKnowledgeRelationship(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    const kind = candidate.kind;
    if (
      typeof kind !== 'string' ||
      !DOMAIN_RELATIONSHIP_KINDS.includes(kind as DomainRelationshipKind)
    ) {
      errors.push(`kind must be one of: ${DOMAIN_RELATIONSHIP_KINDS.join(', ')}`);
    } else {
      const expectedCategory = DOMAIN_RELATIONSHIP_CATEGORY[kind as DomainRelationshipKind];
      if (candidate.category !== expectedCategory) {
        errors.push(`category must be "${expectedCategory}" for relationship kind "${kind}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
