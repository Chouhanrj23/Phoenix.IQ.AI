/**
 * P2-03 -- the Architecture model.
 *
 * Typed extensions of the P2-01 canonical envelope (`canonical-object.ts`,
 * `relationships.ts`) and the P2-02 ontology (`ontology.ts`) for System,
 * Container, and Component -- the FRD's "Architecture & Design" area.
 *
 * This file defines the MODEL only. No architecture discovery, no
 * repository scanning, no Java parsing, no Neo4j -- nothing here produces
 * architecture data from a real system. It only shapes what a future
 * extraction source (a later phase's repository connector) would need to
 * produce, and what `apps/api`'s existing `C4Node`/`C4Edge` contract
 * (`packages/shared/src/contracts.ts`, P1-02) can be losslessly mapped
 * into -- see `packages/knowledge-graph/tests/architecture.test.ts` and
 * `docs/architecture/adr/0005-architecture-model.md` for the mapping and
 * design rationale.
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

export const ARCHITECTURE_OBJECT_KINDS = [
  'architecture.system',
  'architecture.container',
  'architecture.component',
] as const;
export type ArchitectureObjectKind = (typeof ARCHITECTURE_OBJECT_KINDS)[number];

// ---------------------------------------------------------------------------
// Typed attribute bags -- the "domain-specific information" P2-02 deferred
// ---------------------------------------------------------------------------

export interface SystemAttributes {
  [key: string]: KnowledgeValue;
  /** Purpose/description, where a source could determine one -- not always known. */
  description?: string;
}

export interface ContainerAttributes {
  [key: string]: KnowledgeValue;
  /** What this container is responsible for. Always expected -- even a
   * low-confidence guess is preferable to omitting it entirely; epistemic
   * uncertainty belongs in `metadata.confidence`, not in optionality here. */
  responsibility: string;
  /** Implementation technology, where available (e.g. "Node.js"). */
  technology?: string;
  /** Runtime/hosting technology, where available (e.g. "ECS Fargate") -- distinct from `technology`. */
  runtime?: string;
}

export interface ComponentAttributes {
  [key: string]: KnowledgeValue;
  /** What this component is responsible for. Same rationale as Container's. */
  responsibility: string;
}

// ---------------------------------------------------------------------------
// Typed objects
// ---------------------------------------------------------------------------

export interface SystemObject extends CanonicalKnowledgeObject<SystemAttributes> {
  category: 'entity';
  kind: 'architecture.system';
}

export interface ContainerObject extends CanonicalKnowledgeObject<ContainerAttributes> {
  category: 'entity';
  kind: 'architecture.container';
}

export interface ComponentObject extends CanonicalKnowledgeObject<ComponentAttributes> {
  category: 'entity';
  kind: 'architecture.component';
}

export type ArchitectureObject = SystemObject | ContainerObject | ComponentObject;

// ---------------------------------------------------------------------------
// Relationship kinds
// ---------------------------------------------------------------------------

/**
 * Deliberately minimal and technology-agnostic: no protocol names (REST,
 * gRPC, ...), no vendor names, no language-specific concepts.
 *
 * - `contains` -- structural containment (System->Container,
 *   Container->Component). Category: `composition`. Per P2-02's
 *   directionality convention, `sourceObjectId` is the containing/parent
 *   object, `targetObjectId` is the contained/child object.
 * - `communicatesWith` -- any runtime interaction between two
 *   containers/components, regardless of mechanism. Category:
 *   `interaction`. The specific mechanism, if known (e.g. "authorizes
 *   payment"), belongs in `attributes.description` (free text), not in
 *   `kind` -- this is what keeps the vocabulary technology-agnostic while
 *   not losing the source-specific detail Phase 1's `C4Edge.label` carries.
 */
export const ARCHITECTURE_RELATIONSHIP_KINDS = ['contains', 'communicatesWith'] as const;
export type ArchitectureRelationshipKind = (typeof ARCHITECTURE_RELATIONSHIP_KINDS)[number];

const ARCHITECTURE_RELATIONSHIP_CATEGORY: Record<
  ArchitectureRelationshipKind,
  'composition' | 'interaction'
> = {
  contains: 'composition',
  communicatesWith: 'interaction',
};

export interface ArchitectureRelationship extends CanonicalKnowledgeRelationship {
  kind: ArchitectureRelationshipKind;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateArchitectureEntity(
  candidate: unknown,
  expectedKind: ArchitectureObjectKind,
  requireResponsibility: boolean,
): ValidationResult {
  const base = validateCanonicalKnowledgeObject(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    if (candidate.category !== 'entity') {
      errors.push('category must be "entity" for an architecture object');
    }
    if (candidate.kind !== expectedKind) {
      errors.push(`kind must be "${expectedKind}"`);
    }
    if (requireResponsibility && isPlainObject(candidate.attributes)) {
      if (!isNonEmptyString(candidate.attributes.responsibility)) {
        errors.push('attributes.responsibility is required');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a System object: identity + category "entity" + kind "architecture.system". */
export function validateSystemObject(candidate: unknown): ValidationResult {
  return validateArchitectureEntity(candidate, 'architecture.system', false);
}

/** Validates a Container object: also requires `attributes.responsibility`. */
export function validateContainerObject(candidate: unknown): ValidationResult {
  return validateArchitectureEntity(candidate, 'architecture.container', true);
}

/** Validates a Component object: same rules as Container. */
export function validateComponentObject(candidate: unknown): ValidationResult {
  return validateArchitectureEntity(candidate, 'architecture.component', true);
}

/** Dispatches to the right validator based on `kind`. */
export function validateArchitectureObject(candidate: unknown): ValidationResult {
  if (!isPlainObject(candidate)) return { valid: false, errors: ['must be a non-null object'] };
  switch (candidate.kind) {
    case 'architecture.system':
      return validateSystemObject(candidate);
    case 'architecture.container':
      return validateContainerObject(candidate);
    case 'architecture.component':
      return validateComponentObject(candidate);
    default:
      return {
        valid: false,
        errors: [`kind must be one of: ${ARCHITECTURE_OBJECT_KINDS.join(', ')}`],
      };
  }
}

/** Validates an architecture relationship: kind + its expected category. */
export function validateArchitectureRelationship(candidate: unknown): ValidationResult {
  const base = validateCanonicalKnowledgeRelationship(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    const kind = candidate.kind;
    if (
      typeof kind !== 'string' ||
      !ARCHITECTURE_RELATIONSHIP_KINDS.includes(kind as ArchitectureRelationshipKind)
    ) {
      errors.push(`kind must be one of: ${ARCHITECTURE_RELATIONSHIP_KINDS.join(', ')}`);
    } else {
      const expectedCategory =
        ARCHITECTURE_RELATIONSHIP_CATEGORY[kind as ArchitectureRelationshipKind];
      if (candidate.category !== expectedCategory) {
        errors.push(`category must be "${expectedCategory}" for relationship kind "${kind}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
