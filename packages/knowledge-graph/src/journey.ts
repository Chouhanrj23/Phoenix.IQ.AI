/**
 * P2-05 -- the Persona/Journey/State model.
 *
 * Typed extensions of the P2-01 canonical envelope (`canonical-object.ts`,
 * `relationships.ts`), the P2-02 ontology (`ontology.ts`), and P2-04's
 * `EntityStateObject` (`domain.ts`) for Persona, Journey, Action, Flow, and
 * the "triggering action" extension to Entity State. Follows the same
 * pattern `architecture.ts` (P2-03) and `domain.ts` (P2-04) established.
 *
 * This file defines the MODEL only. No journey extraction, no AI inference
 * -- nothing here produces persona/journey data from a real system. It only
 * shapes what a future extraction/inference source would need to produce,
 * and what `apps/web`'s existing `Persona`/`Journey`/`ExecutionFlow`/
 * `FlowStep` types (`apps/web/src/data/types.ts`) can be mapped from -- see
 * `packages/knowledge-graph/tests/journey.test.ts` and
 * `docs/architecture/adr/0007-persona-journey-state-model.md` for the
 * mapping, gaps, and design rationale.
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

export const JOURNEY_OBJECT_KINDS = [
  'journey.persona',
  'journey.journey',
  'journey.flow',
  'journey.action',
] as const;
export type JourneyObjectKind = (typeof JOURNEY_OBJECT_KINDS)[number];

// ---------------------------------------------------------------------------
// Typed attribute bags
// ---------------------------------------------------------------------------

export interface PersonaAttributes {
  [key: string]: KnowledgeValue;
  /** Free-form characterization -- Phase 1 has no equivalent field (see the ADR). */
  description?: string;
  /** Short role/context label, e.g. "Frequent online shopper". */
  role?: string;
  goals?: string[];
  painPoints?: string[];
}

export interface JourneyAttributes {
  [key: string]: KnowledgeValue;
  /** What this journey achieves for its persona. Always expected -- maps to Phase 1's `Journey.description`. */
  purpose: string;
}

export interface FlowAttributes {
  [key: string]: KnowledgeValue;
  description?: string;
  /** The UI screen/entry point that starts this flow, where known. */
  triggerScreen?: string;
}

export interface ActionAttributes {
  [key: string]: KnowledgeValue;
  /** What this action/step does. Always expected -- maps to Phase 1's `FlowStep.description`. */
  description: string;
}

// ---------------------------------------------------------------------------
// Typed objects
// ---------------------------------------------------------------------------

/**
 * Category `entity` -- a persona is a discrete, persistent "thing" (a
 * recovered user role), not a process.
 *
 * At least one of `attributes.description` or `attributes.role` is
 * required (enforced by `validatePersonaObject`, not the type system --
 * see the ADR for why: Phase 1 always has `role` but never `description`,
 * so a single required field would either break real compatibility or
 * force fabricating content).
 */
export interface PersonaObject extends CanonicalKnowledgeObject<PersonaAttributes> {
  category: 'entity';
  kind: 'journey.persona';
}

/**
 * Category `process` -- P2-02's `StructuralCategory.process` doc names
 * "a flow, a journey, a workflow" directly as the category's examples.
 *
 * Its associated persona (`hasPersona`) and the flow(s) that realize it
 * (`supports`, source=Flow per the FRD's documented direction -- see
 * `docs/ontology/README.md`) are relationships, not fields -- same
 * composition-over-embedding convention P2-03/P2-04 established. Journey
 * does NOT embed its own ordered steps: Phase 1's real `Journey` has no
 * inline steps either, only `flowIds` pointing at the `Flow`(s) that
 * realize it, which carry the ordered `Action`s. This is a deliberate
 * structural choice matching Phase 1, not a shortfall -- see the ADR.
 */
export interface JourneyObject extends CanonicalKnowledgeObject<JourneyAttributes> {
  category: 'process';
  kind: 'journey.journey';
}

/**
 * Category `process`, same reasoning as `JourneyObject`. Its ordered
 * `Action`s are `contains` relationships carrying `attributes.order`
 * (see `JourneyRelationship`), not an embedded array -- because, unlike
 * P2-02's original speculation (written before any `process`-category
 * object had real per-step data to consider), Phase 1's `FlowStep`s each
 * carry independent `metadata` (their own provenance/confidence), which
 * only a first-class `CanonicalKnowledgeObject` can represent losslessly.
 * This refines, not contradicts, P2-02 -- see ADR 0007 decision 3.
 */
export interface FlowObject extends CanonicalKnowledgeObject<FlowAttributes> {
  category: 'process';
  kind: 'journey.flow';
}

/**
 * Category `entity` -- a discrete step within a flow, analogous to how
 * P2-03 categorized `Component` (a discrete part of a `Container`, itself
 * `entity` even though containers can be process-adjacent).
 */
export interface ActionObject extends CanonicalKnowledgeObject<ActionAttributes> {
  category: 'entity';
  kind: 'journey.action';
}

export type JourneyModelObject = PersonaObject | JourneyObject | FlowObject | ActionObject;

// ---------------------------------------------------------------------------
// Relationship kinds
// ---------------------------------------------------------------------------

/**
 * - `contains` -- Flow -> Action (composition; the flow's ordered steps).
 *   Order is carried in `attributes.order` (a plain number) on this same
 *   relationship, since the base model has no other ordering mechanism for
 *   relationships between first-class objects.
 * - `hasPersona` -- Journey -> Persona (association; "this journey is
 *   undertaken by this persona").
 * - `supports` -- Flow -> Journey (realization; per the FRD's documented
 *   direction, `docs/ontology/README.md`: "Flow supports Journey" -- the
 *   flow is how the journey's intent actually gets fulfilled).
 * - `readsEntity` / `writesEntity` -- Action -> Entity (interaction; an
 *   action's effects, per the requirements' "resulting effects where
 *   known" -- `writesEntity` is a mutating effect, `readsEntity` is not).
 *   `Entity` here is P2-04's `EntityObject` (`domain.ts`) -- this is where
 *   P2-05 reuses, not duplicates, the existing domain model.
 * - `triggersTransition` -- Action -> EntityState (interaction; "triggering
 *   action/event where supported" -- this action can move an entity into
 *   this state). `EntityState` here is P2-04's `EntityStateObject`
 *   (`domain.ts`), extended with this new relationship kind rather than a
 *   new object type -- P2-05 does not redefine Entity State.
 */
export const JOURNEY_RELATIONSHIP_KINDS = [
  'contains',
  'hasPersona',
  'supports',
  'readsEntity',
  'writesEntity',
  'triggersTransition',
] as const;
export type JourneyRelationshipKind = (typeof JOURNEY_RELATIONSHIP_KINDS)[number];

const JOURNEY_RELATIONSHIP_CATEGORY: Record<
  JourneyRelationshipKind,
  'composition' | 'association' | 'realization' | 'interaction'
> = {
  contains: 'composition',
  hasPersona: 'association',
  supports: 'realization',
  readsEntity: 'interaction',
  writesEntity: 'interaction',
  triggersTransition: 'interaction',
};

export interface JourneyRelationship extends CanonicalKnowledgeRelationship {
  kind: JourneyRelationshipKind;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateJourneyModelEntity(
  candidate: unknown,
  expectedCategory: 'entity' | 'process',
  expectedKind: JourneyObjectKind,
): ValidationResult {
  const base = validateCanonicalKnowledgeObject(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    if (candidate.category !== expectedCategory) {
      errors.push(`category must be "${expectedCategory}" for kind "${expectedKind}"`);
    }
    if (candidate.kind !== expectedKind) {
      errors.push(`kind must be "${expectedKind}"`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a Persona object. Requires at least one of
 * `attributes.description` or `attributes.role` -- see `PersonaObject`'s
 * doc comment for why this is a runtime rule, not a type-level one.
 */
export function validatePersonaObject(candidate: unknown): ValidationResult {
  const result = validateJourneyModelEntity(candidate, 'entity', 'journey.persona');
  const errors = [...result.errors];
  if (isPlainObject(candidate) && isPlainObject(candidate.attributes)) {
    const { description, role } = candidate.attributes;
    if (!isNonEmptyString(description) && !isNonEmptyString(role)) {
      errors.push('attributes.description or attributes.role is required (at least one)');
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Validates a Journey object: also requires `attributes.purpose`. */
export function validateJourneyObject(candidate: unknown): ValidationResult {
  const result = validateJourneyModelEntity(candidate, 'process', 'journey.journey');
  const errors = [...result.errors];
  if (isPlainObject(candidate) && isPlainObject(candidate.attributes)) {
    if (!isNonEmptyString(candidate.attributes.purpose)) {
      errors.push('attributes.purpose is required');
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Validates a Flow object: identity only -- steps are relationships, not fields. */
export function validateFlowObject(candidate: unknown): ValidationResult {
  return validateJourneyModelEntity(candidate, 'process', 'journey.flow');
}

/** Validates an Action object: also requires `attributes.description`. */
export function validateActionObject(candidate: unknown): ValidationResult {
  const result = validateJourneyModelEntity(candidate, 'entity', 'journey.action');
  const errors = [...result.errors];
  if (isPlainObject(candidate) && isPlainObject(candidate.attributes)) {
    if (!isNonEmptyString(candidate.attributes.description)) {
      errors.push('attributes.description is required');
    }
  }
  return { valid: errors.length === 0, errors };
}

/** Dispatches to the right validator based on `kind`. */
export function validateJourneyModelObject(candidate: unknown): ValidationResult {
  if (!isPlainObject(candidate)) return { valid: false, errors: ['must be a non-null object'] };
  switch (candidate.kind) {
    case 'journey.persona':
      return validatePersonaObject(candidate);
    case 'journey.journey':
      return validateJourneyObject(candidate);
    case 'journey.flow':
      return validateFlowObject(candidate);
    case 'journey.action':
      return validateActionObject(candidate);
    default:
      return { valid: false, errors: [`kind must be one of: ${JOURNEY_OBJECT_KINDS.join(', ')}`] };
  }
}

/**
 * Validates a persona/journey-area relationship: kind + its expected
 * category, plus (for `contains`) that `attributes.order`, if present, is
 * a number.
 */
export function validateJourneyRelationship(candidate: unknown): ValidationResult {
  const base = validateCanonicalKnowledgeRelationship(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    const kind = candidate.kind;
    if (
      typeof kind !== 'string' ||
      !JOURNEY_RELATIONSHIP_KINDS.includes(kind as JourneyRelationshipKind)
    ) {
      errors.push(`kind must be one of: ${JOURNEY_RELATIONSHIP_KINDS.join(', ')}`);
    } else {
      const expectedCategory = JOURNEY_RELATIONSHIP_CATEGORY[kind as JourneyRelationshipKind];
      if (candidate.category !== expectedCategory) {
        errors.push(`category must be "${expectedCategory}" for relationship kind "${kind}"`);
      }
      if (
        kind === 'contains' &&
        isPlainObject(candidate.attributes) &&
        'order' in candidate.attributes &&
        candidate.attributes.order !== undefined &&
        typeof candidate.attributes.order !== 'number'
      ) {
        errors.push('attributes.order, if present on a "contains" relationship, must be a number');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
