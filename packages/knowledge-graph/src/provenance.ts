/**
 * P2-07 -- the provenance model.
 *
 * Formalizes how any canonical knowledge item traces back to where it came
 * from. This is deliberately a small ADDITION, not a rewrite: Phase 1
 * already defined `Provenance` (source id, source type, deriving agent,
 * timestamp) and `Confidence` in `@phoenix-ai/shared`, reused as-is by
 * `CanonicalKnowledgeObject.metadata`/`CanonicalKnowledgeRelationship.metadata`
 * since P2-01 (see ADR 0003 decision 2) -- untouched here too, so no Phase 1
 * contract changes. P2-01 also already added `Evidence` (`evidence.ts`):
 * the concrete excerpt/locator a claim was captured from.
 *
 * What was missing, and what this file adds:
 *   - A resolvable description of the source ITSELF (`Source`) -- until now,
 *     `Provenance.sourceId`/`Evidence.sourceId` were floating strings with
 *     nothing in the model describing what they actually name, or letting
 *     one source be referenced consistently by many objects/evidence
 *     entries without repeating its details.
 *   - Source version/revision ("where applicable") -- no existing field
 *     captures which revision of a source a claim came from.
 *
 * See `docs/architecture/adr/0009-provenance-model.md` for the full design
 * rationale, and `packages/knowledge-graph/tests/provenance.test.ts` for how
 * `Source`, `Provenance`, and `Evidence` compose end to end.
 */

import type { SourceType } from '@phoenix-ai/shared';
import { isNonEmptyString, isPlainObject, type ValidationResult } from './validation.js';

/**
 * A structured description of a single origin artifact that canonical
 * knowledge can be traced back to -- a specific repository, document,
 * project/issue-system item, configuration file, or (in the future) an
 * inference-engine run. NOT a `CanonicalKnowledgeObject`: a source is meta
 * information about where knowledge came from, not knowledge about the
 * analyzed system itself -- the FRD's own node-type list
 * (`docs/ontology/README.md`) has no "Source" node; §4.3 treats
 * provenance/confidence as metadata every node/edge carries, not a node in
 * its own right. `Evidence` (P2-01) follows the same non-object precedent.
 *
 * `id` is the same identifier space as `Provenance.sourceId`
 * (`@phoenix-ai/shared`) and `Evidence.sourceId` (`evidence.ts`) --
 * deliberately not a new key space, so one `Source` record can be resolved
 * from any number of `Provenance`/`Evidence` entries that reference it,
 * without repeating its `type`/`label`/`locator`/`version` on every one.
 */
export interface Source {
  /** Matches `Provenance.sourceId` / `Evidence.sourceId` -- the join key. */
  id: string;
  /**
   * Reuses Phase 1's exact closed vocabulary (`@phoenix-ai/shared`), not a
   * competing enum. Future source kinds map onto it without extension:
   * a source repository or config file -> `source-code`/`data-model`;
   * documentation -> `technical-doc`/`business-doc`; a project/issue
   * system -> `ticket`; a future inference engine's output -> `other`
   * (inference is a *deriving agent*, captured in `Provenance.derivedBy`,
   * not a source-type of its own -- an inference engine still derives from
   * some underlying source).
   */
  type: SourceType;
  /** Human-readable name, e.g. "aurora-commerce/checkout-service" or "Confluence: Payments Architecture". */
  label: string;
  /**
   * Where the source itself lives -- a URL, file path, or system-specific
   * reference. Distinct from `Evidence.locator` (where *within* the source
   * a specific excerpt was found). Optional: not always resolvable before
   * a real connector exists (none is implemented here).
   */
  locator?: string;
  /**
   * Version/revision of the source, where applicable -- a git commit SHA,
   * a document revision id, a ticket's last-updated snapshot, an
   * API/schema version. Free-text: the format is source-type-specific and
   * deliberately not standardized here (no real source has been read yet
   * to know what formats matter). Omitted when the source has no
   * meaningful notion of a version (e.g. a live config value read once).
   */
  version?: string;
}

/** Validates a single `Source` record. */
export function validateSource(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(candidate)) {
    return { valid: false, errors: ['must be a non-null object'] };
  }

  if (!isNonEmptyString(candidate.id)) errors.push('id is required');
  if (!isNonEmptyString(candidate.type)) errors.push('type is required');
  if (!isNonEmptyString(candidate.label)) errors.push('label is required');
  if (
    'locator' in candidate &&
    candidate.locator !== undefined &&
    !isNonEmptyString(candidate.locator)
  ) {
    errors.push('locator, if present, must be a non-empty string');
  }
  if (
    'version' in candidate &&
    candidate.version !== undefined &&
    !isNonEmptyString(candidate.version)
  ) {
    errors.push('version, if present, must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a `Source[]` array: each entry individually, plus no duplicate ids. */
export function validateSources(candidate: unknown): ValidationResult {
  if (!Array.isArray(candidate)) return { valid: false, errors: ['must be an array'] };

  const errors: string[] = [];
  const seenIds = new Set<string>();
  candidate.forEach((source, index) => {
    const result = validateSource(source);
    errors.push(...result.errors.map((e) => `[${index}]: ${e}`));
    if (isPlainObject(source) && isNonEmptyString(source.id)) {
      if (seenIds.has(source.id)) errors.push(`[${index}]: duplicate source id "${source.id}"`);
      seenIds.add(source.id);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Cross-checks a bundle-shaped candidate's optional `sources` registry
 * against every `sourceId` referenced by its objects' and relationships'
 * `metadata.provenance` and `evidence` -- "relationship between knowledge
 * and its source", made concretely traceable and deterministic rather than
 * left as an unverified floating string. The same kind of check
 * `validateCanonicalKnowledgeBundle` (`validation.ts`) already runs for
 * relationship endpoints against `objects`, applied here to sources
 * instead. Kept as its own function, not folded into
 * `validateCanonicalKnowledgeBundle`, following the same layering every
 * domain file (P2-03 onward) already uses on top of the base validators --
 * see ADR 0009.
 *
 * Accepts a loosely-typed `unknown` (like every other validator here, and
 * like `validateCanonicalKnowledgeBundle` itself) rather than importing
 * `CanonicalKnowledgeBundle` from `bundle.ts`, which would create a circular
 * module dependency (`bundle.ts` already imports `Source` from this file).
 *
 * When `sources` is omitted entirely, only the shape of each referenced
 * `sourceId` is checked (must be a non-empty string) -- resolving them
 * against a registry is optional, not mandatory, since no real extraction
 * source populates one yet.
 */
export function validateSourceReferences(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(candidate)) return { valid: false, errors: ['must be a non-null object'] };

  const objects = Array.isArray(candidate.objects) ? candidate.objects : [];
  const relationships = Array.isArray(candidate.relationships) ? candidate.relationships : [];
  const sources = candidate.sources;

  let knownSourceIds: Set<string> | undefined;
  if (sources !== undefined) {
    const sourcesResult = validateSources(sources);
    errors.push(...sourcesResult.errors.map((e) => `sources${e}`));
    knownSourceIds = new Set(
      Array.isArray(sources)
        ? sources
            .filter(isPlainObject)
            .map((s) => s.id)
            .filter(isNonEmptyString)
        : [],
    );
  }

  const checkSourceId = (label: string, sourceId: unknown): void => {
    if (!isNonEmptyString(sourceId)) {
      errors.push(`${label} must be a non-empty string`);
    } else if (knownSourceIds && !knownSourceIds.has(sourceId)) {
      errors.push(`${label} "${sourceId}" does not reference a known source`);
    }
  };

  objects.forEach((object, index) => {
    if (!isPlainObject(object)) return;
    const metadata = object.metadata;
    if (isPlainObject(metadata) && Array.isArray(metadata.provenance)) {
      metadata.provenance.forEach((entry, pIndex) => {
        if (isPlainObject(entry)) {
          checkSourceId(
            `objects[${index}].metadata.provenance[${pIndex}].sourceId`,
            entry.sourceId,
          );
        }
      });
    }
    const evidence = object.evidence;
    if (Array.isArray(evidence)) {
      evidence.forEach((entry, eIndex) => {
        if (isPlainObject(entry)) {
          checkSourceId(`objects[${index}].evidence[${eIndex}].sourceId`, entry.sourceId);
        }
      });
    }
  });

  relationships.forEach((relationship, index) => {
    if (!isPlainObject(relationship)) return;
    const metadata = relationship.metadata;
    if (isPlainObject(metadata) && Array.isArray(metadata.provenance)) {
      metadata.provenance.forEach((entry, pIndex) => {
        if (isPlainObject(entry)) {
          checkSourceId(
            `relationships[${index}].metadata.provenance[${pIndex}].sourceId`,
            entry.sourceId,
          );
        }
      });
    }
  });

  return { valid: errors.length === 0, errors };
}
