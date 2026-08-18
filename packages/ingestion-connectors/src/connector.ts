/**
 * P3-01 -- the connector contract itself.
 *
 * One interface every source connector implements, so the orchestration
 * layer can drive a repository, a documentation space, or a ticket system
 * through identical code. The generic `SourceConnector` is the contract;
 * `SourceRepositoryDescriptor` (`descriptor.ts`) is the only source-specific
 * narrowing P3-01 defines, and a later connector adds its own descriptor
 * narrowing without this interface changing -- see
 * `docs/architecture/adr/0013-source-connector-contract.md` decision 2.
 *
 * The lifecycle is deliberately three steps, not one:
 *
 *     open(descriptor) -> list(filter) -> read(ref) -> close()
 *
 * `open` is where authentication, checkout, and revision resolution happen
 * once instead of per artifact, and where a descriptor a connector cannot
 * honour is rejected loudly. `list` is an `AsyncIterable` so a large source
 * streams rather than materializing every path in memory. `read` is separate
 * from `list` so a caller can skip an artifact by path/size/mtime without
 * paying to read its content. `close` releases whatever `open` acquired.
 */

import type { SourceType } from '@phoenix-ai/shared';
import {
  isNonEmptyString,
  isPlainObject,
  type KnowledgeValue,
  type Source,
  type ValidationResult,
} from '@phoenix-ai/knowledge-graph';
import type { ArtifactFailure, ArtifactRef, ArtifactReadResult, RawArtifact } from './artifact.js';
import { matchesArtifactFilter, type ArtifactFilter } from './filter.js';
import type { SourceDescriptor, SourceRepositoryDescriptor } from './descriptor.js';

/**
 * What a connector can actually do. Declared rather than assumed because
 * sources differ irreducibly: git can pin an immutable revision, a wiki
 * usually cannot; a repository has content digests, a live configuration
 * endpoint may not.
 *
 * A capability flag is a promise about behaviour, not a hint: a connector
 * declaring `revisionPinning: false` must REJECT a descriptor that pins a
 * revision (see `open`), never silently read the tip -- otherwise the
 * provenance it produces would name a revision the artifacts did not come
 * from. A connector declaring `subtreeFiltering: false` must still honour
 * the filter by applying `matchesArtifactFilter` itself; the flag says the
 * filter cannot be pushed down to the source for efficiency, never that it
 * may be ignored.
 */
export interface ConnectorCapabilities {
  /** Can read a caller-specified immutable revision, and report which one it read. */
  revisionPinning: boolean;
  /** Can honour `ArtifactFilter.changedSince` at the source, i.e. supports differential scans. */
  incrementalScan: boolean;
  /** Can push path filtering down to the source instead of listing everything and filtering locally. */
  subtreeFiltering: boolean;
  /** Populates `RawArtifact.contentHash`. */
  contentHashing: boolean;
  /** Can return non-text artifacts (as `contentEncoding: 'base64'`). */
  binaryContent: boolean;
}

/**
 * An open connection to one source. Stateful and single-source by design: a
 * session is where a resolved revision, an authenticated client, and a
 * temporary checkout live, all of which are per-source and none of which
 * belong on the stateless `SourceConnector`.
 */
export interface ConnectorSession {
  readonly descriptor: SourceDescriptor;
  /**
   * The P2-07 `Source` record for this session, with `version` set to the
   * revision actually resolved (see `revision`). Exposed on the session, not
   * built by the caller, so every consumer of this session registers the
   * same source record and `validateSourceReferences` resolves cleanly.
   */
  readonly source: Source;
  /** The revision actually read, when the connector pinned one. Undefined when unpinnable. */
  readonly revision?: string;
  /**
   * Source-level metadata the connector OBSERVED, as distinct from the
   * coordinates the descriptor requested — a repository's resolved HEAD and
   * commit timestamp, its default branch, its tags, whether the checkout is
   * shallow. Free-form because it is irreducibly source-kind-specific: a
   * repository, a wiki space, and a ticket project have almost nothing in
   * common here, and a closed shape would either be empty or wrong.
   *
   * Added in P3-02 (ADR 0014 amendment 1) — the first real connector needed
   * somewhere to report "read repository metadata", and P3-01's shapes had
   * no such place. A connector for a source with no meaningful metadata
   * simply omits it.
   */
  readonly sourceMetadata?: Record<string, KnowledgeValue>;
  /**
   * Streams the artifacts selected by the session's descriptor filter,
   * further narrowed by `filter` when given (both apply; neither replaces
   * the other).
   */
  list(filter?: ArtifactFilter): AsyncIterable<ArtifactRef>;
  /** Reads one listed artifact. Never throws for a per-artifact problem -- returns `ok: false` instead. */
  read(ref: ArtifactRef): Promise<ArtifactReadResult>;
  /** Idempotent -- calling it twice must not throw. */
  close(): Promise<void>;
}

/**
 * A source connector: stateless, reusable across descriptors and across
 * sessions. All per-source state lives in the `ConnectorSession` `open`
 * returns.
 *
 * `TDescriptor` lets a connector require its own descriptor narrowing
 * (`SourceRepositoryConnector = SourceConnector<SourceRepositoryDescriptor>`)
 * while `supports` still accepts the generic `SourceDescriptor` -- a
 * registry has to be able to ask "can you handle this?" about a descriptor
 * whose specific type it does not yet know.
 */
export interface SourceConnector<TDescriptor extends SourceDescriptor = SourceDescriptor> {
  /** Stable connector identifier, e.g. `git-repository`. Recorded by callers as `Provenance.derivedBy`. */
  readonly id: string;
  /**
   * The `SourceType`s (`@phoenix-ai/shared`) this connector can serve — a
   * set, not a single value, because one connector legitimately covers
   * several: a git repository may hold source code, a data model, tests, or
   * documentation, and the descriptor says which. P3-01 modelled this as one
   * `sourceType`; P3-02's real git connector proved that wrong (ADR 0014
   * amendment 2).
   *
   * `descriptorToSource` always records `descriptor.sourceType`, never this
   * — the descriptor is the authority on what a given source *is*; this
   * only says what the connector is willing to be asked for.
   */
  readonly sourceTypes: readonly SourceType[];
  readonly capabilities: ConnectorCapabilities;
  /** Type guard: true when this connector can handle the descriptor. Must not perform I/O. */
  supports(descriptor: SourceDescriptor): descriptor is TDescriptor;
  /**
   * Authenticates, resolves the revision, and returns a session. Rejects
   * (throws) for a descriptor-level problem -- an invalid descriptor, a
   * capability it does not have, an unreachable source. This is the one
   * place the contract uses exceptions rather than result objects: a source
   * that cannot be opened at all is a run-level failure, not a
   * per-artifact one.
   */
  open(descriptor: TDescriptor): Promise<ConnectorSession>;
}

/**
 * A repository connector -- the first, and in P3-01 only, specialization.
 * Exists so an implementation states its input shape once, in its type,
 * rather than every call site re-parameterizing `SourceConnector`.
 */
export type SourceRepositoryConnector = SourceConnector<SourceRepositoryDescriptor>;

/** Everything one ingestion pass produced, successes and failures side by side. */
export interface ArtifactCollection {
  artifacts: RawArtifact[];
  /**
   * Per-artifact failures. Always present (possibly empty) so a caller
   * cannot mistake a partially-failed run for a complete one -- the coverage
   * question ("what did we NOT read?") is answerable from the result itself.
   */
  failures: ArtifactFailure[];
}

/**
 * Drives `list` -> `read` over a whole session, accumulating successes and
 * failures rather than aborting on the first problem.
 *
 * Does NOT close the session -- the caller owns the lifecycle and may want
 * several passes with different filters. Use `withConnectorSession` when a
 * single pass is all that's needed.
 */
export async function collectArtifacts(
  session: ConnectorSession,
  filter?: ArtifactFilter,
): Promise<ArtifactCollection> {
  const artifacts: RawArtifact[] = [];
  const failures: ArtifactFailure[] = [];

  for await (const ref of session.list(filter)) {
    // Defence in depth: a connector is required to apply the filter itself,
    // but re-checking here means a connector bug narrows to a missed
    // optimization instead of a wrong artifact set reaching extraction.
    if (!matchesArtifactFilter(ref, filter)) continue;

    const result = await session.read(ref);
    if (result.ok) {
      artifacts.push(result.artifact);
    } else {
      failures.push(result.failure);
    }
  }

  return { artifacts, failures };
}

/**
 * Opens a session, runs `use`, and closes the session even if `use` throws.
 * Exists because `close` releases real resources (a temporary checkout, an
 * authenticated client) and a `try/finally` written by hand at every call
 * site is a leak waiting to happen.
 */
export async function withConnectorSession<TDescriptor extends SourceDescriptor, TResult>(
  connector: SourceConnector<TDescriptor>,
  descriptor: TDescriptor,
  use: (session: ConnectorSession) => Promise<TResult>,
): Promise<TResult> {
  const session = await connector.open(descriptor);
  try {
    return await use(session);
  } finally {
    await session.close();
  }
}

/**
 * Picks the first connector that reports it can handle `descriptor`.
 *
 * First-match, not best-match: with no scoring concept in the contract,
 * "best" would be undefined, and registration order is at least explicit
 * and deterministic. A full registry with precedence rules belongs to
 * `packages/orchestration`, not here.
 */
export function selectConnector<TDescriptor extends SourceDescriptor>(
  connectors: readonly SourceConnector<TDescriptor>[],
  descriptor: SourceDescriptor,
): SourceConnector<TDescriptor> | undefined {
  return connectors.find((connector) => connector.supports(descriptor));
}

/**
 * Structural check that an object satisfies the `SourceConnector` shape at
 * runtime. TypeScript already enforces this at compile time; this exists for
 * the boundary where it cannot -- a connector loaded dynamically, or one
 * written in plain JavaScript -- so a malformed implementation fails with a
 * specific message instead of a `TypeError` mid-ingestion.
 */
export function validateSourceConnector(candidate: unknown): ValidationResult {
  if (!isPlainObject(candidate)) return { valid: false, errors: ['must be a non-null object'] };

  const errors: string[] = [];
  if (!isNonEmptyString(candidate.id)) errors.push('id is required');
  const sourceTypes = candidate.sourceTypes;
  if (!Array.isArray(sourceTypes) || sourceTypes.length === 0) {
    errors.push('sourceTypes must be a non-empty array');
  } else if (!sourceTypes.every(isNonEmptyString)) {
    errors.push('sourceTypes entries must be non-empty strings');
  }
  for (const method of ['supports', 'open'] as const) {
    if (typeof candidate[method] !== 'function') errors.push(`${method} must be a function`);
  }

  const capabilities = candidate.capabilities;
  if (!isPlainObject(capabilities)) {
    errors.push('capabilities is required');
  } else {
    for (const flag of [
      'revisionPinning',
      'incrementalScan',
      'subtreeFiltering',
      'contentHashing',
      'binaryContent',
    ] as const) {
      if (typeof capabilities[flag] !== 'boolean') {
        errors.push(`capabilities.${flag} must be a boolean`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
