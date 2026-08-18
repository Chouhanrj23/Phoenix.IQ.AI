/**
 * P3-01 -- what a connector produces: the common intermediate
 * representation (CIR) this package's README has named as its output since
 * the original scaffold.
 *
 * The central boundary decision of the whole contract lives here: a
 * connector emits RAW ARTIFACTS plus the metadata needed to trace them, and
 * nothing else. It does not emit `CanonicalKnowledgeObject`s. Deciding that
 * a file describes an `architecture.container` requires parsing and
 * inference -- `packages/extraction-engine`'s and
 * `packages/inference-engine`'s job. If the connector contract returned
 * canonical objects, every future connector would have to embed extraction
 * logic, and the pipeline layering (`docs/architecture/adr/0013-source-connector-contract.md`
 * decision 1) would collapse into it.
 *
 * What a connector DOES know, and therefore must record, is exactly the
 * provenance/evidence substrate: which source (`sourceId`), where within it
 * (`locator`), at which revision, captured when. `artifactToEvidence` is
 * the bridge that turns that into a P2-09 `Evidence` record without the
 * caller re-deriving any of it.
 */

import {
  isIsoTimestamp,
  isNonEmptyString,
  isPlainObject,
  type Evidence,
  type KnowledgeValue,
  type ValidationResult,
} from '@phoenix-ai/knowledge-graph';

export const ARTIFACT_CONTENT_ENCODINGS = ['utf-8', 'base64'] as const;
/**
 * Text or binary, without the contract depending on a runtime-specific
 * byte type (`Buffer`, `Uint8Array`). `base64` keeps a binary artifact
 * representable and, critically, keeps `RawArtifact` losslessly
 * JSON-serializable -- an ingestion result has to survive being written to
 * disk or passed between processes.
 */
export type ArtifactContentEncoding = (typeof ARTIFACT_CONTENT_ENCODINGS)[number];

/**
 * A content digest. `algorithm` is free-text rather than a closed enum, for
 * the same reason `Source.version` is (ADR 0009 decision 3): no real
 * connector has been implemented yet to know which digests matter, and a
 * `local-directory` connector may legitimately have none at all -- hence
 * `RawArtifact.contentHash` is optional and gated behind
 * `ConnectorCapabilities.contentHashing`.
 */
export interface ArtifactContentHash {
  algorithm: string;
  value: string;
}

/**
 * What listing an artifact yields, before its content is read. Kept
 * separate from `RawArtifact` on purpose: a caller must be able to skip an
 * artifact by path, size, or mtime WITHOUT paying to read it, which is what
 * makes `list` -> `read` (see `ConnectorSession`) safe to run against a
 * large repository.
 */
export interface ArtifactRef {
  /**
   * Source-relative path with `/` separators and no leading slash. Normalized
   * by the connector, not the caller -- a Windows connector reading
   * `services\checkout\Main.java` must surface `services/checkout/Main.java`,
   * so that a descriptor's glob patterns and the resulting locators are
   * platform-independent.
   */
  path: string;
  sizeBytes?: number;
  /** IANA media type where the connector can determine one, e.g. `text/x-java-source`. */
  mediaType?: string;
  /** ISO-8601. Required for `ArtifactFilter.changedSince` to have any effect on this artifact. */
  lastModifiedAt?: string;
}

/** An artifact plus its content -- one unit of the CIR. */
export interface RawArtifact extends ArtifactRef {
  /** `SourceDescriptor.id` -- the join key into `Source`/`Provenance`/`Evidence`. */
  sourceId: string;
  /** Fully-qualified `<scheme>://<source>/<path>`, from `buildArtifactLocator`. */
  locator: string;
  content: string;
  contentEncoding: ArtifactContentEncoding;
  contentHash?: ArtifactContentHash;
  /** The revision actually read, when the connector can pin one. Becomes `Evidence.sourceVersion`. */
  revision?: string;
  /** ISO-8601 -- when this content was read. Becomes `Evidence.capturedAt`. */
  capturedAt: string;
  /**
   * Per-artifact metadata the connector observed that the fields above do not
   * cover -- e.g. the git commit a file was last changed in. Free-form and
   * source-kind-specific, mirroring `ConnectorSession.sourceMetadata` and the
   * `attributes` bag P2-03 added to `CanonicalKnowledgeRelationship`.
   *
   * Added in P3-02 (ADR 0014 amendment 1). NOT a place for extracted
   * meaning: a parsed class name belongs on a `CanonicalKnowledgeObject`, not
   * here. This is for facts about the artifact as an artifact.
   */
  attributes?: Record<string, KnowledgeValue>;
}

export const ARTIFACT_FAILURE_REASONS = [
  'not-found',
  'access-denied',
  'too-large',
  'unreadable',
  'transport-error',
  'other',
] as const;
export type ArtifactFailureReason = (typeof ARTIFACT_FAILURE_REASONS)[number];

/**
 * One artifact that could not be read. A closed `reason` vocabulary so a
 * caller can act on the category (retry a `transport-error`, raise a
 * coverage gap for `access-denied`) without string-matching `detail`.
 */
export interface ArtifactFailure {
  path: string;
  reason: ArtifactFailureReason;
  /** Human-readable specifics. Must not contain credential material. */
  detail?: string;
}

/**
 * The result of reading one artifact. A discriminated union rather than a
 * thrown exception, matching this project's existing non-throwing
 * `ValidationResult` convention: one unreadable file in a 40,000-file
 * repository must not abort the run, and the caller needs the failure as
 * *data* so it can be reported as a coverage gap rather than swallowed.
 */
export type ArtifactReadResult =
  { ok: true; artifact: RawArtifact } | { ok: false; failure: ArtifactFailure };

/** Validates an `ArtifactRef`. */
export function validateArtifactRef(candidate: unknown): ValidationResult {
  if (!isPlainObject(candidate)) return { valid: false, errors: ['must be a non-null object'] };

  const errors: string[] = [];
  const path = candidate.path;
  if (!isNonEmptyString(path)) {
    errors.push('path is required');
  } else {
    if (path.startsWith('/')) errors.push('path must be source-relative (no leading "/")');
    if (path.includes('\\')) errors.push('path must use "/" separators, not "\\"');
    if (path.split('/').includes('..')) errors.push('path must not contain ".." segments');
  }

  const sizeBytes = candidate.sizeBytes;
  if (sizeBytes !== undefined) {
    if (typeof sizeBytes !== 'number' || !Number.isInteger(sizeBytes) || sizeBytes < 0) {
      errors.push('sizeBytes, if present, must be a non-negative integer');
    }
  }
  if (candidate.mediaType !== undefined && !isNonEmptyString(candidate.mediaType)) {
    errors.push('mediaType, if present, must be a non-empty string');
  }
  if (candidate.lastModifiedAt !== undefined && !isIsoTimestamp(candidate.lastModifiedAt)) {
    errors.push('lastModifiedAt, if present, must be an ISO-8601 timestamp');
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a `RawArtifact` -- the `ArtifactRef` fields plus content, locator, and capture metadata. */
export function validateRawArtifact(candidate: unknown): ValidationResult {
  const base = validateArtifactRef(candidate);
  if (!isPlainObject(candidate)) return base;

  const errors = [...base.errors];
  if (!isNonEmptyString(candidate.sourceId)) errors.push('sourceId is required');
  if (!isNonEmptyString(candidate.locator)) errors.push('locator is required');
  // An empty file is legitimate content, so this checks the type, not the length.
  if (typeof candidate.content !== 'string') errors.push('content must be a string');
  if (
    !isNonEmptyString(candidate.contentEncoding) ||
    !(ARTIFACT_CONTENT_ENCODINGS as readonly string[]).includes(candidate.contentEncoding)
  ) {
    errors.push(`contentEncoding must be one of: ${ARTIFACT_CONTENT_ENCODINGS.join(', ')}`);
  }
  if (!isIsoTimestamp(candidate.capturedAt)) {
    errors.push('capturedAt must be an ISO-8601 timestamp');
  }
  if (candidate.revision !== undefined && !isNonEmptyString(candidate.revision)) {
    errors.push('revision, if present, must be a non-empty string');
  }

  if (candidate.attributes !== undefined && !isPlainObject(candidate.attributes)) {
    errors.push('attributes, if present, must be an object');
  }

  const contentHash = candidate.contentHash;
  if (contentHash !== undefined) {
    if (!isPlainObject(contentHash)) {
      errors.push('contentHash, if present, must be an object');
    } else {
      if (!isNonEmptyString(contentHash.algorithm))
        errors.push('contentHash.algorithm is required');
      if (!isNonEmptyString(contentHash.value)) errors.push('contentHash.value is required');
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates an `ArtifactFailure`. */
export function validateArtifactFailure(candidate: unknown): ValidationResult {
  if (!isPlainObject(candidate)) return { valid: false, errors: ['must be a non-null object'] };

  const errors: string[] = [];
  if (!isNonEmptyString(candidate.path)) errors.push('path is required');
  if (
    !isNonEmptyString(candidate.reason) ||
    !(ARTIFACT_FAILURE_REASONS as readonly string[]).includes(candidate.reason)
  ) {
    errors.push(`reason must be one of: ${ARTIFACT_FAILURE_REASONS.join(', ')}`);
  }
  if (candidate.detail !== undefined && !isNonEmptyString(candidate.detail)) {
    errors.push('detail, if present, must be a non-empty string');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Turns an artifact into a P2-09 `Evidence` record, filling only the fields
 * a connector legitimately knows: which source, where in it, when captured,
 * and at which revision. `excerpt` is the caller's to supply -- choosing the
 * relevant lines is an extraction judgement, and a whole file is not an
 * excerpt.
 *
 * `id` is required rather than derived from the path: `Evidence.id` must be
 * stable and unique across a whole bundle, and only the assembling caller
 * knows what else is already in that bundle.
 */
export function artifactToEvidence(
  artifact: RawArtifact,
  options: { id: string; excerpt?: string; locator?: string },
): Evidence {
  return {
    id: options.id,
    sourceId: artifact.sourceId,
    locator: options.locator ?? artifact.locator,
    capturedAt: artifact.capturedAt,
    ...(options.excerpt === undefined ? {} : { excerpt: options.excerpt }),
    ...(artifact.revision === undefined ? {} : { sourceVersion: artifact.revision }),
  };
}
