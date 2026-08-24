/**
 * P5-02 -- business vocabulary extraction.
 *
 * Turns `TechnicalEvidenceItem[]` (raw identifiers/operation names/field
 * names read from the OKF, `inference-contract.ts`) into `VocabularyTerm[]`
 * -- normalized candidate business terms, deduplicated, with technical
 * noise filtered out. Every rule here is STRUCTURAL (naming convention,
 * word-shape, a fixed technical-suffix/stop-word list) -- never a business
 * word. The same code runs unchanged over e-commerce, fintech, or any other
 * domain's evidence; see `docs/phase-5/README.md` "Domain neutrality".
 */

import type { Confidence, Provenance } from '@phoenix-ai/shared';
import type { ConfidenceDetail, Evidence } from '@phoenix-ai/knowledge-graph';
import {
  deriveEvidenceFrom,
  deriveInferenceConfidence,
  deriveProvenanceFrom,
  type TechnicalEvidenceItem,
} from './inference-contract.js';

export interface VocabularyTerm {
  /** The original surface form that produced this term, e.g. `"createWidget"`. */
  readonly term: string;
  /** The stripped, business-facing candidate noun, e.g. `"Widget"`. */
  readonly normalizedTerm: string;
  /** A plain-language guess at what this term denotes, derived only from HOW it was observed (never a business-specific lookup table). */
  readonly candidateMeaning: string;
  readonly occurrenceCount: number;
  readonly relatedTechnicalObjectIds: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly provenance: readonly Provenance[];
  readonly confidence: Confidence;
  readonly confidenceDetail: ConfidenceDetail;
}

// ---------------------------------------------------------------------------
// Structural, domain-neutral naming-convention tables. Every entry here
// describes a TECHNICAL SHAPE (a common OO/REST suffix, a CRUD verb, an
// infrastructure noise-word) -- never a business noun. This is the whole
// mechanism that keeps vocabulary extraction domain-agnostic: it recognizes
// what kind of word a class/method/endpoint fragment structurally IS, not
// what a specific business happens to call things.
// ---------------------------------------------------------------------------

/** Common technical suffixes stripped from class-shaped identifiers, regardless of business domain. */
const TECHNICAL_SUFFIXES = [
  'controller',
  'service',
  'serviceimpl',
  'repository',
  'repositoryimpl',
  'impl',
  'dto',
  'dao',
  'entity',
  'manager',
  'handler',
  'adapter',
  'client',
  'config',
  'configuration',
  'test',
  'tests',
  'facade',
  'factory',
  'builder',
  'listener',
  'validator',
  'serializer',
  'mapper',
  'provider',
  'resource',
  'endpoint',
  'exception',
  'form',
  'view',
  'response',
  'request',
  'orchestrator',
  'coordinator',
];

/**
 * Common CRUD/HTTP/lifecycle verb prefixes stripped from method-shaped
 * identifiers to recover the noun they operate on. Not itself a business
 * word -- a generic verb vocabulary, deliberately kept as the SAME set
 * `state-inference.ts`'s `STATUS_VERBS` keys are drawn from (superset),
 * so a status-changing operation (e.g. `activateGadget`) normalizes to its
 * noun here exactly as consistently as a plain CRUD operation does --
 * two independent verb lists would risk drifting apart and stripping
 * inconsistently.
 */
const VERB_PREFIXES = [
  'create',
  'get',
  'find',
  'fetch',
  'list',
  'view',
  'save',
  'update',
  'modify',
  'delete',
  'remove',
  'add',
  'put',
  'post',
  'patch',
  'cancel',
  'confirm',
  'close',
  'open',
  'submit',
  'process',
  'validate',
  'check',
  'is',
  'has',
  'activate',
  'deactivate',
  'suspend',
  'approve',
  'reject',
  'ship',
  'deliver',
  'complete',
];

/** Pure infrastructure noise -- discarded entirely once stripped, in any domain. */
const NOISE_WORDS = new Set([
  'config',
  'util',
  'utils',
  'helper',
  'helpers',
  'base',
  'abstract',
  'common',
  'shared',
  'test',
  'tests',
  'main',
  'index',
  'constants',
  'exception',
  'error',
  'app',
  'application',
  'api',
  'id',
  'ids',
  'data',
  'info',
  'item',
  'items',
  'object',
  'value',
  'type',
  'status',
]);

/** Splits a camelCase/PascalCase/snake_case/kebab-case/REST-path identifier into lowercase words. Purely structural -- no business vocabulary. */
function splitIntoWords(raw: string): string[] {
  return raw
    .replace(/[{}]/g, '') // REST path params, e.g. "{id}"
    .replace(/[_\-/.]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/\s+/)
    .map((word) => word.toLowerCase())
    .filter((word) => word.length > 0 && /[a-z]/.test(word));
}

/** Crude, domain-neutral singularization -- strips a trailing "s" (but not "ss"/"us"), e.g. "widgets" -> "widget", "status" is left alone. */
function singularize(word: string): string {
  if (word.length > 3 && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) {
    return word.slice(0, -1);
  }
  return word;
}

function toTitleCase(word: string): string {
  return word.length === 0 ? word : word[0]!.toUpperCase() + word.slice(1);
}

/** A real REST HTTP method, recognized as a leading token on an operation name (e.g. `"GET /owners/{id}"`) -- Phase 3's real producer (`bridgeSpringController`) emits operation names in exactly this shape, never a bare Java-method-verbNoun identifier. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * A generic, structural CRUD-stage signal derived ONLY from the HTTP method
 * itself -- used as a fallback when the identifier has no bare leading verb
 * to draw `leadingVerb` from (the real case for REST-path operation names).
 * Deliberately a small, closed, GENERIC vocabulary describing WHAT KIND of
 * operation this is (create/read/update/terminate), never a specific
 * business action -- "every GET" carries no meaning beyond "this reads
 * something"; see `state-inference.ts` for exactly how far (and how little)
 * further this signal is allowed to go toward naming a lifecycle state.
 */
export type NormalizedAction = 'create' | 'read' | 'update' | 'terminate';

/** The one, documented HTTP-method -> generic-action mapping every Phase 5 stage that needs a REST-evidence fallback reuses -- never redefined per-stage. */
const HTTP_METHOD_ACTION: Readonly<Record<HttpMethod, NormalizedAction>> = {
  GET: 'read',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'terminate',
};

const HTTP_METHOD_PATTERN = /^(GET|POST|PUT|PATCH|DELETE)\s+(.*)$/i;

export interface IdentifierNormalization {
  readonly normalizedTerm: string;
  /** The CRUD/lifecycle verb stripped from the front, when present -- e.g. `"confirm"` from `"confirmOrder"`. Reused by `journey-inference.ts`/`state-inference.ts` to detect action ordering and status-changing operations. Populated only for bare, Java-method-style identifiers -- never inferred from an HTTP method (see `normalizedAction` for that). */
  readonly leadingVerb?: string;
  /** The HTTP method this identifier was prefixed with, when present -- preserved (never discarded) so a caller can distinguish a real REST operation from a bare identifier. */
  readonly httpMethod?: HttpMethod;
  /** The original path/identifier text with the HTTP method stripped, when present -- the real path is never discarded, only the noun/verb-normalization derived FROM it. */
  readonly path?: string;
  /**
   * A generic create/read/update/terminate signal derived ONLY from
   * `httpMethod`, populated ONLY when no bare `leadingVerb` was found in the
   * identifier itself -- the fallback signal `journey-inference.ts`/
   * `state-inference.ts`/`journey-mapping.ts` use for real REST-shaped
   * operation names where no CRUD verb prefixes the identifier text.
   */
  readonly normalizedAction?: NormalizedAction;
}

/**
 * The one, shared, domain-neutral identifier-normalization rule every
 * Phase 5 stage that touches raw identifier text builds on: strips a
 * leading HTTP method, a leading CRUD/lifecycle verb, trailing technical
 * suffixes, and infrastructure noise words, then singularizes what's left.
 * Returns `undefined` when nothing but noise remains. Exported so
 * `journey-inference.ts`/`state-inference.ts` recover the SAME normalized
 * term `extractVocabulary` already grouped by, without re-implementing (or
 * silently drifting from) this rule.
 *
 * Handles two real identifier shapes: a bare Java-method-style identifier
 * (`"confirmOrder"`, `leadingVerb: "confirm"`), and a real REST operation
 * name (`"GET /owners/{id}"`, Phase 3's actual output shape) -- for the
 * latter, no bare leading verb exists, so `httpMethod`/`path`/
 * `normalizedAction` are populated instead, from the HTTP method alone.
 */
export function normalizeIdentifierText(rawText: string): IdentifierNormalization | undefined {
  const methodMatch = HTTP_METHOD_PATTERN.exec(rawText);
  const httpMethod =
    methodMatch !== null ? (methodMatch[1]!.toUpperCase() as HttpMethod) : undefined;
  const path = methodMatch !== null ? methodMatch[2] : undefined;
  const withoutHttpMethod = methodMatch !== null ? methodMatch[2]! : rawText;

  let words = splitIntoWords(withoutHttpMethod);
  if (words.length === 0) return undefined;

  let leadingVerb: string | undefined;
  if (VERB_PREFIXES.includes(words[0]!) && words.length > 1) {
    leadingVerb = words[0];
    words = words.slice(1);
  }

  while (words.length > 1 && TECHNICAL_SUFFIXES.includes(words[words.length - 1]!)) {
    words = words.slice(0, -1);
  }

  words = words.filter((word) => !NOISE_WORDS.has(word)).map(singularize);
  if (words.length === 0) return undefined;
  if (
    words.length === 1 &&
    (NOISE_WORDS.has(words[0]!) || TECHNICAL_SUFFIXES.includes(words[0]!))
  ) {
    return undefined;
  }

  const normalizedTerm = words.map(toTitleCase).join(' ');
  const normalizedAction =
    leadingVerb === undefined && httpMethod !== undefined
      ? HTTP_METHOD_ACTION[httpMethod]
      : undefined;

  return {
    normalizedTerm,
    ...(leadingVerb === undefined ? {} : { leadingVerb }),
    ...(httpMethod === undefined ? {} : { httpMethod, path: path! }),
    ...(normalizedAction === undefined ? {} : { normalizedAction }),
  };
}

interface NormalizationResult {
  readonly normalizedTerm: string;
  readonly candidateMeaning: string;
}

/**
 * Reduces one raw identifier/operation-name/field-name to a normalized
 * candidate business term plus a human-readable rationale, or `undefined`
 * when nothing but technical noise remains. HTTP-method-prefixed operation
 * names (e.g. `"GET /orders/{id}"`) have their method stripped first.
 */
function normalize(item: TechnicalEvidenceItem): NormalizationResult | undefined {
  const normalized = normalizeIdentifierText(item.text);
  if (normalized === undefined) return undefined;
  const { normalizedTerm, leadingVerb } = normalized;
  const shapeNote =
    item.kind === 'operation-name'
      ? leadingVerb !== undefined
        ? `an operation ("${leadingVerb} ${normalizedTerm}") acting on`
        : 'an operation acting on'
      : item.kind === 'field-name'
        ? 'a field referencing'
        : item.kind === 'attribute-value'
          ? 'a descriptive attribute mentioning'
          : 'a named technical object representing';

  return { normalizedTerm, candidateMeaning: `Observed via ${shapeNote} "${normalizedTerm}".` };
}

/**
 * Extracts and normalizes business vocabulary from technical evidence,
 * deduplicating by normalized term (case-insensitive) and merging
 * provenance/evidence/related-object-ids across every occurrence. Confidence
 * grows with the number of DISTINCT source objects corroborating a term --
 * one class name alone is weaker evidence than the same noun recurring
 * across a controller, a repository, and an entity.
 */
export function extractVocabulary(
  items: readonly TechnicalEvidenceItem[],
  generatedAt: string,
): VocabularyTerm[] {
  interface Bucket {
    readonly normalizedTerm: string;
    readonly candidateMeaning: string;
    readonly items: TechnicalEvidenceItem[];
    readonly surfaceForms: Set<string>;
  }

  const buckets = new Map<string, Bucket>();

  for (const item of items) {
    const normalized = normalize(item);
    if (normalized === undefined) continue;
    const key = normalized.normalizedTerm.toLowerCase();
    const existing = buckets.get(key);
    if (existing === undefined) {
      buckets.set(key, {
        normalizedTerm: normalized.normalizedTerm,
        candidateMeaning: normalized.candidateMeaning,
        items: [item],
        surfaceForms: new Set([item.text]),
      });
    } else {
      existing.items.push(item);
      existing.surfaceForms.add(item.text);
    }
  }

  const terms: VocabularyTerm[] = [];
  for (const bucket of buckets.values()) {
    const distinctSourceObjects = new Set(bucket.items.map((item) => item.sourceObjectId));
    const { confidence, confidenceDetail } = deriveInferenceConfidence(
      distinctSourceObjects.size,
      'vocabulary-term-corroboration',
      generatedAt,
      { occurrenceCount: bucket.items.length },
    );

    terms.push({
      term: [...bucket.surfaceForms][0]!,
      normalizedTerm: bucket.normalizedTerm,
      candidateMeaning: bucket.candidateMeaning,
      occurrenceCount: bucket.items.length,
      relatedTechnicalObjectIds: [...distinctSourceObjects].sort(),
      evidence: deriveEvidenceFrom(bucket.items),
      provenance: deriveProvenanceFrom(bucket.items, generatedAt),
      confidence,
      confidenceDetail,
    });
  }

  return terms.sort((a, b) => a.normalizedTerm.localeCompare(b.normalizedTerm));
}
