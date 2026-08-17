/**
 * P2-10 -- the OKF (Open Knowledge Format) YAML schema.
 *
 * This is NOT a second canonical model. `OkfDocument` is
 * `CanonicalKnowledgeBundle` (P2-01, `bundle.ts`) with its optional
 * `okfVersion` narrowed to required -- every object kind (P2-03 through
 * P2-06), every provenance/evidence/confidence field (P2-07/P2-08/P2-09),
 * and every validator this file calls already exist; this file only adds
 * the YAML serialization envelope and a deterministic key order on top of
 * them. See `docs/architecture/adr/0012-okf-yaml-schema.md` for the full
 * design rationale, `docs/okf/README.md` for the authoritative field-level
 * contract (naming conventions, required/optional fields, versioning,
 * extensibility rules), and `tests/okf.test.ts` for a full multi-domain
 * reconciliation example.
 *
 * Uses the `yaml` package (already present in this monorepo's dependency
 * graph -- pulled in transitively before this file ever needed it) rather
 * than hand-rolling a YAML parser: parsing real YAML syntax correctly
 * (multi-line strings, anchors, flow vs. block style, and so on) is a
 * solved problem inappropriate to reinvent for a schema-definition ticket.
 * This is a different call than `validation.ts`'s "no schema-validation
 * library" stance -- that was about not outsourcing validation of THIS
 * project's own types; parsing the YAML *text* itself is a lower-level,
 * universally-solved concern.
 */

import { isScalar, parse as parseYamlText, stringify as stringifyToYaml, type Pair } from 'yaml';
import type { CanonicalKnowledgeBundle } from './bundle.js';
import { CANONICAL_SCHEMA_VERSION } from './identity.js';
import { validateSourceReferences } from './provenance.js';
import {
  isNonEmptyString,
  isPlainObject,
  validateCanonicalKnowledgeBundle,
  type ValidationResult,
} from './validation.js';

/**
 * A `CanonicalKnowledgeBundle` with `okfVersion` required -- the "top-level
 * version/schema metadata" the objective calls for. Deliberately reuses
 * `CANONICAL_SCHEMA_VERSION` as its default value rather than introducing a
 * second, independently-incrementing version counter: the OKF envelope and
 * the object/relationship shapes it carries have evolved in lockstep since
 * P2-01, and nothing has yet required them to diverge. See ADR 0012
 * decision 1 and "Open questions" for when that might change.
 */
export interface OkfDocument extends CanonicalKnowledgeBundle {
  okfVersion: string;
}

/** Stamps a bundle as an OKF document, defaulting `okfVersion` to the current canonical schema version. */
export function toOkfDocument(
  bundle: CanonicalKnowledgeBundle,
  okfVersion: string = CANONICAL_SCHEMA_VERSION,
): OkfDocument {
  return { ...bundle, okfVersion };
}

// ---------------------------------------------------------------------------
// Deterministic, readable key ordering
// ---------------------------------------------------------------------------

/**
 * Canonical field order for YAML serialization -- "deterministic" and
 * "readable" both, per the objective. A fixed, hand-authored priority list
 * (not alphabetical) so identity/type fields read first and metadata/
 * evidence trail last, matching how every ADR in this project already
 * presents these shapes. Applied globally by the `yaml` schema's
 * `sortMapEntries`, so it governs every map at every depth (bundle,
 * object, relationship, provenance entry, evidence entry, ...) with one
 * list -- see "YAML conventions: naming" in `docs/okf/README.md`. Fields
 * not listed here (free-form `attributes`/`calculation.inputs` keys, which
 * are domain/source-specific and cannot be pre-ranked) sort alphabetically
 * after every listed field, not interleaved with them.
 */
const FIELD_ORDER: readonly string[] = [
  'okfVersion',
  'id',
  'systemId',
  'generatedAt',
  'identity',
  'createdAt',
  'updatedAt',
  'schemaVersion',
  'category',
  'kind',
  'label',
  'sourceObjectId',
  'targetObjectId',
  'attributes',
  'metadata',
  'provenance',
  'confidence',
  'level',
  'score',
  'rationale',
  'sourceId',
  'sourceType',
  'derivedBy',
  'derivedAt',
  'evidence',
  'excerpt',
  'locator',
  'capturedAt',
  'sourceVersion',
  'lifecycle',
  'status',
  'since',
  'previousStatus',
  'confidenceDetail',
  'basis',
  'calculation',
  'method',
  'calculatedAt',
  'inputs',
  'type',
  'version',
  'sources',
  'objects',
  'relationships',
];

function fieldRank(key: string): number {
  const index = FIELD_ORDER.indexOf(key);
  return index === -1 ? FIELD_ORDER.length : index;
}

function keyText(node: unknown): string {
  return isScalar(node) ? String(node.value) : String(node);
}

function sortMapEntries(a: Pair, b: Pair): number {
  const keyA = keyText(a.key);
  const keyB = keyText(b.key);
  const rankDelta = fieldRank(keyA) - fieldRank(keyB);
  if (rankDelta !== 0) return rankDelta;
  return keyA < keyB ? -1 : keyA > keyB ? 1 : 0;
}

// ---------------------------------------------------------------------------
// Serialize / parse
// ---------------------------------------------------------------------------

/**
 * Serializes an `OkfDocument` to a deterministic YAML string: identical
 * input always produces byte-identical output, regardless of the source
 * object's own key insertion order, via `FIELD_ORDER` above.
 * `lineWidth: 0` disables line-folding so long strings (excerpts,
 * rationale) stay on one line rather than being wrapped in a way that
 * depends on their exact length -- another determinism/readability trade
 * resolved in favor of both here.
 */
export function serializeOkfYaml(document: OkfDocument): string {
  return stringifyToYaml(document, { sortMapEntries, lineWidth: 0 });
}

/** Parses YAML text into a plain JS structure. Throws on invalid YAML syntax -- see `parseAndValidateOkfYaml` for a non-throwing alternative. */
export function parseOkfYaml(yamlText: string): unknown {
  return parseYamlText(yamlText);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/**
 * Validates a candidate OKF document. Deliberately thin: `okfVersion` is
 * the only field this function checks directly -- everything else
 * (required fields, ids, types, relationships, provenance, confidence,
 * evidence) is delegated to the already-existing base validators
 * (`validateCanonicalKnowledgeBundle`, `validateSourceReferences`), which
 * in turn already validate every object/relationship via
 * `validateCanonicalKnowledgeObject`/`validateCanonicalKnowledgeRelationship`
 * (P2-01 through P2-09). No new validation logic is reimplemented here --
 * see ADR 0012 decision 4 for why duplicating any of it here would be
 * exactly the "second competing model" the objective forbids.
 */
export function validateOkfDocument(candidate: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isPlainObject(candidate)) {
    return { valid: false, errors: ['must be a non-null object'] };
  }

  if (!isNonEmptyString(candidate.okfVersion)) errors.push('okfVersion is required');

  errors.push(...validateCanonicalKnowledgeBundle(candidate).errors);
  errors.push(...validateSourceReferences(candidate).errors);

  return { valid: errors.length === 0, errors };
}

/**
 * Parses and validates YAML text in one step, never throwing -- malformed
 * YAML syntax is reported as a validation error (`valid: false`) rather
 * than an exception, so callers get one consistent non-throwing interface
 * for "reject invalid structures" whether the input is syntactically
 * broken YAML or syntactically valid YAML describing an invalid document.
 */
export function parseAndValidateOkfYaml(yamlText: string): ValidationResult {
  let parsed: unknown;
  try {
    parsed = parseYamlText(yamlText);
  } catch (error) {
    return {
      valid: false,
      errors: [`invalid YAML syntax: ${error instanceof Error ? error.message : String(error)}`],
    };
  }
  return validateOkfDocument(parsed);
}
