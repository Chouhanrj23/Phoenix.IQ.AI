/**
 * Plain, zero-dependency structural validators for the canonical model.
 *
 * No schema-validation library is introduced here -- this mirrors the rest
 * of the project (apps/api validates its one query param via Fastify's
 * built-in JSON-schema support, not a new dependency) and keeps this
 * package dependency-free beyond @phoenix-ai/shared.
 */

import { RELATIONSHIP_CATEGORIES, STRUCTURAL_CATEGORIES } from './ontology.js';
import { CONFIDENCE_BASES, type ConfidenceBasis } from './confidence.js';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// Exported (not just used internally) so domain-specific validators (P2-03
// onward, e.g. architecture.ts) can build on the same primitives instead of
// redefining them.
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

export function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function objectId(candidate: unknown): string | undefined {
  if (!isPlainObject(candidate)) return undefined;
  const identity = candidate.identity;
  if (!isPlainObject(identity)) return undefined;
  return typeof identity.id === 'string' ? identity.id : undefined;
}

/**
 * Validates the shape of each entry in a `metadata.provenance` array (P2-07)
 * -- `Provenance` itself is defined in `@phoenix-ai/shared` and reused as-is
 * (not redefined here, see ADR 0003 decision 2), but nothing previously
 * checked that each entry actually had a well-formed `sourceId`/
 * `sourceType`/`derivedBy`/valid ISO `derivedAt`, only that the array was
 * non-empty. Kept in this base file (not a domain-specific `.ts`) because
 * `Provenance` is foundational, like `identity`/`evidence`/`ontology`, not
 * domain-specific like architecture/domain/journey/integration.
 */
function validateProvenanceEntries(candidate: unknown): string[] {
  if (!Array.isArray(candidate) || candidate.length === 0) {
    return [
      'metadata.provenance must be a non-empty array — every canonical object must trace to at least one source',
    ];
  }
  const errors: string[] = [];
  candidate.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`metadata.provenance[${index}] must be an object`);
      return;
    }
    if (!isNonEmptyString(entry.sourceId))
      errors.push(`metadata.provenance[${index}].sourceId is required`);
    if (!isNonEmptyString(entry.sourceType))
      errors.push(`metadata.provenance[${index}].sourceType is required`);
    if (!isNonEmptyString(entry.derivedBy))
      errors.push(`metadata.provenance[${index}].derivedBy is required`);
    if (!isIsoTimestamp(entry.derivedAt))
      errors.push(`metadata.provenance[${index}].derivedAt must be an ISO-8601 timestamp`);
  });
  return errors;
}

/** Validates the `metadata: GraphElementMetadata` bag shared by objects and relationships. */
function validateGraphElementMetadata(candidate: unknown): string[] {
  if (!isPlainObject(candidate)) return ['metadata is required'];
  const errors = validateProvenanceEntries(candidate.provenance);
  const confidence = candidate.confidence;
  if (!isPlainObject(confidence) || !isNonEmptyString(confidence.level)) {
    errors.push('metadata.confidence.level is required');
  }
  return errors;
}

/**
 * Validates the shape of each entry in an `evidence` array (P2-09) --
 * `id`/`sourceId` required, `excerpt`/`locator`/`sourceVersion` non-empty
 * strings if present, `capturedAt` a valid ISO-8601 timestamp if present.
 * Nothing previously checked entry shape at all, only that the array
 * existed -- same gap P2-07 found and fixed for `metadata.provenance[]`
 * (`validateProvenanceEntries` above), fixed here for `evidence[]` too.
 * `prefix` lets the same helper report `evidence[N]...` for objects and
 * relationships alike.
 */
function validateEvidenceEntries(candidate: unknown, prefix: string): string[] {
  if (!Array.isArray(candidate)) return [`${prefix} must be an array (may be empty)`];
  const errors: string[] = [];
  candidate.forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`${prefix}[${index}] must be an object`);
      return;
    }
    if (!isNonEmptyString(entry.id)) errors.push(`${prefix}[${index}].id is required`);
    if (!isNonEmptyString(entry.sourceId)) errors.push(`${prefix}[${index}].sourceId is required`);
    for (const field of ['excerpt', 'locator', 'sourceVersion'] as const) {
      if (field in entry && entry[field] !== undefined && !isNonEmptyString(entry[field])) {
        errors.push(`${prefix}[${index}].${field}, if present, must be a non-empty string`);
      }
    }
    if (
      'capturedAt' in entry &&
      entry.capturedAt !== undefined &&
      !isIsoTimestamp(entry.capturedAt)
    ) {
      errors.push(`${prefix}[${index}].capturedAt, if present, must be an ISO-8601 timestamp`);
    }
  });
  return errors;
}

/**
 * Validates the optional `confidenceDetail: ConfidenceDetail` field (P2-08)
 * shared by objects and relationships -- `basis` is required whenever
 * `confidenceDetail` is present at all, so a claim can never carry
 * confidence strength without declaring whether it was observed or
 * derived/inferred. Kept in this base file, not `confidence.ts`, so
 * `confidence.ts` stays free of any dependency on this file (avoiding a
 * circular import) -- same reasoning as `validateProvenanceEntries` above.
 */
function validateConfidenceDetail(candidate: unknown): string[] {
  if (!isPlainObject(candidate)) return ['confidenceDetail, if present, must be an object'];

  const errors: string[] = [];
  if (
    !isNonEmptyString(candidate.basis) ||
    !CONFIDENCE_BASES.includes(candidate.basis as ConfidenceBasis)
  ) {
    errors.push(`confidenceDetail.basis must be one of: ${CONFIDENCE_BASES.join(', ')}`);
  }

  if ('calculation' in candidate && candidate.calculation !== undefined) {
    const calculation = candidate.calculation;
    if (!isPlainObject(calculation)) {
      errors.push('confidenceDetail.calculation, if present, must be an object');
    } else {
      if (!isNonEmptyString(calculation.method)) {
        errors.push('confidenceDetail.calculation.method is required when calculation is present');
      }
      if (!isIsoTimestamp(calculation.calculatedAt)) {
        errors.push(
          'confidenceDetail.calculation.calculatedAt must be an ISO-8601 timestamp when calculation is present',
        );
      }
      if (
        'inputs' in calculation &&
        calculation.inputs !== undefined &&
        !isPlainObject(calculation.inputs)
      ) {
        errors.push('confidenceDetail.calculation.inputs, if present, must be an object');
      }
    }
  }

  return errors;
}

/** Validates the shape of a single CanonicalKnowledgeObject. */
export function validateCanonicalKnowledgeObject(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(candidate)) {
    return { valid: false, errors: ['must be a non-null object'] };
  }

  const identity = candidate.identity;
  if (!isPlainObject(identity)) {
    errors.push('identity is required');
  } else {
    if (!isNonEmptyString(identity.id)) errors.push('identity.id is required');
    if (!isNonEmptyString(identity.systemId)) errors.push('identity.systemId is required');
    if (!isIsoTimestamp(identity.createdAt))
      errors.push('identity.createdAt must be an ISO-8601 timestamp');
    if (!isIsoTimestamp(identity.updatedAt))
      errors.push('identity.updatedAt must be an ISO-8601 timestamp');
    if (!isNonEmptyString(identity.schemaVersion))
      errors.push('identity.schemaVersion is required');
  }

  if (
    !isNonEmptyString(candidate.category) ||
    !STRUCTURAL_CATEGORIES.includes(candidate.category as (typeof STRUCTURAL_CATEGORIES)[number])
  ) {
    errors.push(`category must be one of: ${STRUCTURAL_CATEGORIES.join(', ')}`);
  }
  if (!isNonEmptyString(candidate.kind)) errors.push('kind is required');
  if (!isNonEmptyString(candidate.label)) errors.push('label is required');
  if (!isPlainObject(candidate.attributes))
    errors.push('attributes must be an object (may be empty)');

  errors.push(...validateGraphElementMetadata(candidate.metadata));

  errors.push(...validateEvidenceEntries(candidate.evidence, 'evidence'));

  if ('lifecycle' in candidate && candidate.lifecycle !== undefined) {
    const lifecycle = candidate.lifecycle;
    if (!isPlainObject(lifecycle)) {
      errors.push('lifecycle, if present, must be an object');
    } else {
      if (!isNonEmptyString(lifecycle.status))
        errors.push('lifecycle.status is required when lifecycle is present');
      if (!isIsoTimestamp(lifecycle.since))
        errors.push('lifecycle.since must be an ISO-8601 timestamp when lifecycle is present');
      if (
        'previousStatus' in lifecycle &&
        lifecycle.previousStatus !== undefined &&
        !isNonEmptyString(lifecycle.previousStatus)
      ) {
        errors.push('lifecycle.previousStatus, if present, must be a non-empty string');
      }
    }
  }

  if ('confidenceDetail' in candidate && candidate.confidenceDetail !== undefined) {
    errors.push(...validateConfidenceDetail(candidate.confidenceDetail));
  }

  return { valid: errors.length === 0, errors };
}

/** Validates the shape of a single CanonicalKnowledgeRelationship. */
export function validateCanonicalKnowledgeRelationship(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(candidate)) {
    return { valid: false, errors: ['must be a non-null object'] };
  }

  if (!isNonEmptyString(candidate.id)) errors.push('id is required');
  if (
    !isNonEmptyString(candidate.category) ||
    !RELATIONSHIP_CATEGORIES.includes(
      candidate.category as (typeof RELATIONSHIP_CATEGORIES)[number],
    )
  ) {
    errors.push(`category must be one of: ${RELATIONSHIP_CATEGORIES.join(', ')}`);
  }
  if (!isNonEmptyString(candidate.kind)) errors.push('kind is required');
  if (!isNonEmptyString(candidate.sourceObjectId)) errors.push('sourceObjectId is required');
  if (!isNonEmptyString(candidate.targetObjectId)) errors.push('targetObjectId is required');
  if (
    isNonEmptyString(candidate.sourceObjectId) &&
    isNonEmptyString(candidate.targetObjectId) &&
    candidate.sourceObjectId === candidate.targetObjectId
  ) {
    errors.push(
      'sourceObjectId and targetObjectId must differ (no self-referencing relationships)',
    );
  }

  errors.push(...validateGraphElementMetadata(candidate.metadata));

  if (
    'attributes' in candidate &&
    candidate.attributes !== undefined &&
    !isPlainObject(candidate.attributes)
  ) {
    errors.push('attributes, if present, must be an object');
  }

  if ('confidenceDetail' in candidate && candidate.confidenceDetail !== undefined) {
    errors.push(...validateConfidenceDetail(candidate.confidenceDetail));
  }

  if ('evidence' in candidate && candidate.evidence !== undefined) {
    errors.push(...validateEvidenceEntries(candidate.evidence, 'evidence'));
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validates a full bundle: every object and relationship individually, plus
 * bundle-level composition rules (no duplicate object ids, no relationship
 * pointing at an object that isn't in the bundle).
 */
export function validateCanonicalKnowledgeBundle(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(candidate)) {
    return { valid: false, errors: ['must be a non-null object'] };
  }

  if (!isNonEmptyString(candidate.systemId)) errors.push('systemId is required');
  if (!isIsoTimestamp(candidate.generatedAt))
    errors.push('generatedAt must be an ISO-8601 timestamp');

  const objects = candidate.objects;
  const relationships = candidate.relationships;
  if (!Array.isArray(objects)) errors.push('objects must be an array');
  if (!Array.isArray(relationships)) errors.push('relationships must be an array');
  if (!Array.isArray(objects) || !Array.isArray(relationships)) {
    return { valid: false, errors };
  }

  const seenIds = new Set<string>();
  objects.forEach((object, index) => {
    const result = validateCanonicalKnowledgeObject(object);
    errors.push(...result.errors.map((e) => `objects[${index}]: ${e}`));
    const id = objectId(object);
    if (id) {
      if (seenIds.has(id)) errors.push(`objects[${index}]: duplicate object id "${id}"`);
      seenIds.add(id);
    }
  });

  relationships.forEach((relationship, index) => {
    const result = validateCanonicalKnowledgeRelationship(relationship);
    errors.push(...result.errors.map((e) => `relationships[${index}]: ${e}`));
    if (isPlainObject(relationship)) {
      const { sourceObjectId, targetObjectId } = relationship;
      if (isNonEmptyString(sourceObjectId) && !seenIds.has(sourceObjectId)) {
        errors.push(
          `relationships[${index}]: sourceObjectId "${sourceObjectId}" does not reference a known object`,
        );
      }
      if (isNonEmptyString(targetObjectId) && !seenIds.has(targetObjectId)) {
        errors.push(
          `relationships[${index}]: targetObjectId "${targetObjectId}" does not reference a known object`,
        );
      }
    }
  });

  return { valid: errors.length === 0, errors };
}
