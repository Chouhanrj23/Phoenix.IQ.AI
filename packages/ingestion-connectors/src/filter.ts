/**
 * P3-01 -- artifact filtering, the one piece of connector *semantics* (not
 * just types) this contract defines centrally.
 *
 * Every source has far more artifacts than an extraction run wants, so every
 * connector needs a filter. Left to each connector, `includePaths`/
 * `excludePaths` would mean subtly different things per implementation (does
 * `node_modules` exclude the directory's contents? is `*` allowed to cross a
 * `/`?) and a descriptor written against one connector would silently select
 * a different artifact set under another. `matchesArtifactFilter` is the
 * single shared implementation of those semantics: a connector that cannot
 * push a filter down to its source (see `ConnectorCapabilities.subtreeFiltering`
 * in `connector.ts`) is still required to apply the filter itself, using this
 * function, so the observable result is identical either way.
 *
 * See `docs/architecture/adr/0013-source-connector-contract.md` decision 5.
 */

import { isIsoTimestamp, isPlainObject } from '@phoenix-ai/knowledge-graph';

/**
 * Narrows which artifacts a connector should surface. Every field is
 * optional; an omitted filter (or an empty one) selects everything the
 * source exposes.
 */
export interface ArtifactFilter {
  /**
   * Glob patterns; an artifact is selected when it matches at least one.
   * Omitted (or empty) means "no include restriction", NOT "match nothing" --
   * an empty array is treated the same as omitting the field, since a
   * caller building a pattern list dynamically should not accidentally
   * select zero artifacts.
   */
  includePaths?: string[];
  /** Glob patterns; a matching artifact is dropped. Exclusion always wins over inclusion. */
  excludePaths?: string[];
  /**
   * Drop artifacts larger than this. A connector that does not know an
   * artifact's size before reading it (`ArtifactRef.sizeBytes` omitted)
   * cannot apply this at listing time; it must then enforce it at read time
   * and report a `too-large` `ArtifactFailure` rather than silently
   * truncating.
   */
  maxSizeBytes?: number;
  /**
   * ISO-8601 timestamp -- select only artifacts modified at or after this
   * instant. Requires `ConnectorCapabilities.incrementalScan`; an artifact
   * whose `lastModifiedAt` is unknown is KEPT, never dropped (absence of a
   * timestamp is not evidence that nothing changed).
   */
  changedSince?: string;
}

/** The minimum shape `matchesArtifactFilter` needs. `ArtifactRef` and `RawArtifact` both satisfy it. */
export interface FilterablePath {
  path: string;
  sizeBytes?: number;
  lastModifiedAt?: string;
}

function segmentsOf(value: string): string[] {
  return value.split('/').filter((segment) => segment.length > 0);
}

/**
 * Matches one path segment. `*` matches any run of characters within a
 * single segment (never across `/`), `?` matches exactly one character;
 * every other regex metacharacter is escaped, so a pattern is a glob, not a
 * regular expression.
 */
function matchesSegment(value: string, pattern: string): boolean {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '[^/]');
  return new RegExp(`^${source}$`).test(value);
}

function matchesFrom(
  pathSegments: readonly string[],
  pathIndex: number,
  patternSegments: readonly string[],
  patternIndex: number,
): boolean {
  if (patternIndex === patternSegments.length) return pathIndex === pathSegments.length;

  const patternSegment = patternSegments[patternIndex];
  if (patternSegment === undefined) return false;

  // `**` matches zero or more whole segments.
  if (patternSegment === '**') {
    for (let skipTo = pathIndex; skipTo <= pathSegments.length; skipTo += 1) {
      if (matchesFrom(pathSegments, skipTo, patternSegments, patternIndex + 1)) return true;
    }
    return false;
  }

  if (pathIndex === pathSegments.length) return false;
  const pathSegment = pathSegments[pathIndex];
  if (pathSegment === undefined) return false;
  if (!matchesSegment(pathSegment, patternSegment)) return false;
  return matchesFrom(pathSegments, pathIndex + 1, patternSegments, patternIndex + 1);
}

/**
 * Matches a repository-relative path against a glob pattern.
 *
 * Two documented rules, both deliberate:
 *
 *  1. `*`/`?` stay within one segment; `**` spans segments. Standard glob
 *     semantics, so `services/*` does not match `services/checkout/Main.java`
 *     but `services/**` does.
 *  2. **A WILDCARD-FREE pattern that matches an ancestor directory also
 *     matches everything beneath it.** So `node_modules` excludes
 *     `node_modules/x/y.js`, and `services/checkout` selects the whole
 *     service subtree, without the caller having to remember a trailing
 *     `/**`. Without this rule the single most common real filter
 *     (`excludePaths: ['node_modules']`) would silently do nothing -- the
 *     kind of footgun a shared contract exists to remove.
 *
 *     Restricting rule 2 to literal patterns is what keeps it from
 *     swallowing rule 1: if it applied to wildcards too, `services/*` would
 *     match `services/checkout/Main.java` (via the directory
 *     `services/checkout`) and there would be no way left to express
 *     "direct children only". A caller who wants a wildcarded subtree writes
 *     `services/**`, which is unambiguous.
 */
export function matchesPathPattern(path: string, pattern: string): boolean {
  const pathSegments = segmentsOf(path);
  const patternSegments = segmentsOf(pattern);
  if (patternSegments.length === 0) return false;

  if (matchesFrom(pathSegments, 0, patternSegments, 0)) return true;

  // Rule 2: a literal (wildcard-free) pattern also matches any descendant of
  // the directory it names.
  if (/[*?]/.test(pattern)) return false;
  for (let end = pathSegments.length - 1; end > 0; end -= 1) {
    if (matchesFrom(pathSegments.slice(0, end), 0, patternSegments, 0)) return true;
  }
  return false;
}

/** True when `candidate` should be surfaced under `filter`. An omitted filter selects everything. */
export function matchesArtifactFilter(candidate: FilterablePath, filter?: ArtifactFilter): boolean {
  if (filter === undefined) return true;

  const { includePaths, excludePaths, maxSizeBytes, changedSince } = filter;

  if (excludePaths?.some((pattern) => matchesPathPattern(candidate.path, pattern)) === true) {
    return false;
  }

  if (
    includePaths !== undefined &&
    includePaths.length > 0 &&
    !includePaths.some((pattern) => matchesPathPattern(candidate.path, pattern))
  ) {
    return false;
  }

  if (
    maxSizeBytes !== undefined &&
    candidate.sizeBytes !== undefined &&
    candidate.sizeBytes > maxSizeBytes
  ) {
    return false;
  }

  if (changedSince !== undefined && candidate.lastModifiedAt !== undefined) {
    if (Date.parse(candidate.lastModifiedAt) < Date.parse(changedSince)) return false;
  }

  return true;
}

/**
 * Validates an `ArtifactFilter`'s shape. Returns raw error strings (prefixed
 * by the caller) rather than a `ValidationResult`, matching how
 * `packages/knowledge-graph/src/validation.ts` composes its own field-level
 * helpers into object-level validators.
 */
export function collectArtifactFilterErrors(candidate: unknown, prefix: string): string[] {
  if (!isPlainObject(candidate)) return [`${prefix}, if present, must be an object`];

  const errors: string[] = [];
  for (const field of ['includePaths', 'excludePaths'] as const) {
    const value = candidate[field];
    if (value === undefined) continue;
    if (!Array.isArray(value)) {
      errors.push(`${prefix}.${field}, if present, must be an array of glob patterns`);
      continue;
    }
    value.forEach((pattern, index) => {
      if (typeof pattern !== 'string' || pattern.length === 0) {
        errors.push(`${prefix}.${field}[${index}] must be a non-empty string`);
      }
    });
  }

  const maxSizeBytes = candidate.maxSizeBytes;
  if (maxSizeBytes !== undefined) {
    if (typeof maxSizeBytes !== 'number' || !Number.isInteger(maxSizeBytes) || maxSizeBytes <= 0) {
      errors.push(`${prefix}.maxSizeBytes, if present, must be a positive integer`);
    }
  }

  const changedSince = candidate.changedSince;
  if (changedSince !== undefined && !isIsoTimestamp(changedSince)) {
    errors.push(`${prefix}.changedSince, if present, must be an ISO-8601 timestamp`);
  }

  return errors;
}
