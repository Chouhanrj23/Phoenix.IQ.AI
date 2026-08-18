/**
 * P3-01 -- an in-memory reference connector.
 *
 * NOT a real repository connector: it performs no filesystem, network, or
 * git access whatsoever, and reads only the artifacts handed to it as
 * options. It exists for two reasons, both about the contract rather than
 * about ingesting anything:
 *
 *  1. **Proof the contract is implementable.** A connector interface nothing
 *     implements is a guess. This is the smallest complete implementation of
 *     `SourceConnector` -- lifecycle, filtering, revision pinning, content
 *     hashing, partial failure -- and it is what
 *     `tests/connector.test.ts` drives end to end.
 *  2. **A test double for downstream packages.** `extraction-engine` and
 *     `orchestration` will need to be testable without a fixture repository
 *     on disk. That is exactly this.
 *
 * A real git connector (`P3-02` onward) replaces the option-supplied
 * artifacts with a checkout and this file's `sha256` with git's own object
 * ids; everything else about the shape stays as it is here.
 */

import { createHash } from 'node:crypto';
import type { SourceType } from '@phoenix-ai/shared';
import {
  buildArtifactLocator,
  descriptorToSource,
  validateSourceRepositoryDescriptor,
  type SourceDescriptor,
  type SourceRepositoryDescriptor,
} from './descriptor.js';
import type {
  ArtifactContentEncoding,
  ArtifactFailureReason,
  ArtifactRef,
  ArtifactReadResult,
} from './artifact.js';
import { matchesArtifactFilter, type ArtifactFilter } from './filter.js';
import type {
  ConnectorCapabilities,
  ConnectorSession,
  SourceRepositoryConnector,
} from './connector.js';

/** One artifact handed to the reference connector up front, standing in for a file in a checkout. */
export interface InMemoryArtifact {
  path: string;
  content: string;
  contentEncoding?: ArtifactContentEncoding;
  mediaType?: string;
  lastModifiedAt?: string;
}

export interface InMemoryConnectorOptions {
  artifacts: readonly InMemoryArtifact[];
  /** Defaults to `in-memory-reference`. Callers record this as `Provenance.derivedBy`. */
  id?: string;
  /**
   * The `SourceType`s this instance accepts. Defaults to `['source-code']`.
   * Singular in P3-01, widened to a set in P3-02 — see ADR 0014 amendment 2.
   */
  sourceTypes?: readonly SourceType[];
  /**
   * The revision this connector resolves to, standing in for a git SHA.
   * When omitted, the connector still declares `revisionPinning: true` but
   * resolves to whatever the descriptor pinned -- mirroring a real connector
   * reading the tip of a branch and reporting the SHA it landed on.
   */
  revision?: string;
  /**
   * Paths that exist but cannot be read, keyed to the failure reason. Lets a
   * test exercise the partial-failure path (`ArtifactReadResult.ok === false`)
   * without which the contract's most important error-handling rule would be
   * untested.
   */
  unreadablePaths?: Readonly<Record<string, ArtifactFailureReason>>;
  /** Injectable clock so `capturedAt` is deterministic under test. Defaults to the real clock. */
  now?: () => string;
}

const CAPABILITIES: ConnectorCapabilities = {
  revisionPinning: true,
  incrementalScan: true,
  subtreeFiltering: true,
  contentHashing: true,
  binaryContent: true,
};

function sha256(content: string): { algorithm: string; value: string } {
  return { algorithm: 'sha256', value: createHash('sha256').update(content, 'utf8').digest('hex') };
}

function byteLength(content: string, encoding: ArtifactContentEncoding): number {
  return encoding === 'base64'
    ? Buffer.from(content, 'base64').byteLength
    : Buffer.byteLength(content, 'utf8');
}

function toRef(artifact: InMemoryArtifact): ArtifactRef {
  const encoding = artifact.contentEncoding ?? 'utf-8';
  return {
    path: artifact.path,
    sizeBytes: byteLength(artifact.content, encoding),
    ...(artifact.mediaType === undefined ? {} : { mediaType: artifact.mediaType }),
    ...(artifact.lastModifiedAt === undefined ? {} : { lastModifiedAt: artifact.lastModifiedAt }),
  };
}

/** Creates the in-memory reference connector. See the file header — this is a test/reference double, not a real connector. */
export function createInMemoryRepositoryConnector(
  options: InMemoryConnectorOptions,
): SourceRepositoryConnector {
  const connectorId = options.id ?? 'in-memory-reference';
  const sourceTypes = options.sourceTypes ?? (['source-code'] as const);
  const now = options.now ?? ((): string => new Date().toISOString());
  const unreadable = options.unreadablePaths ?? {};
  const byPath = new Map(options.artifacts.map((artifact) => [artifact.path, artifact]));

  return {
    id: connectorId,
    sourceTypes,
    capabilities: CAPABILITIES,

    supports(descriptor: SourceDescriptor): descriptor is SourceRepositoryDescriptor {
      return (
        sourceTypes.includes(descriptor.sourceType) &&
        validateSourceRepositoryDescriptor(descriptor).valid
      );
    },

    async open(descriptor: SourceRepositoryDescriptor): Promise<ConnectorSession> {
      const validation = validateSourceRepositoryDescriptor(descriptor);
      if (!validation.valid) {
        throw new Error(`${connectorId}: invalid descriptor — ${validation.errors.join('; ')}`);
      }

      const revision = options.revision ?? descriptor.repository.revision;
      const source = descriptorToSource(descriptor, revision);
      const descriptorFilter = descriptor.filter;
      const subpaths = descriptor.repository.subpaths;
      let closed = false;

      const selected = (extra?: ArtifactFilter): InMemoryArtifact[] =>
        options.artifacts.filter((artifact) => {
          const ref = toRef(artifact);
          if (
            subpaths !== undefined &&
            subpaths.length > 0 &&
            !matchesArtifactFilter(ref, { includePaths: [...subpaths] })
          ) {
            return false;
          }
          return matchesArtifactFilter(ref, descriptorFilter) && matchesArtifactFilter(ref, extra);
        });

      return {
        descriptor,
        source,
        ...(revision === undefined ? {} : { revision }),

        list(filter?: ArtifactFilter): AsyncIterable<ArtifactRef> {
          if (closed) throw new Error(`${connectorId}: session is closed`);
          const refs = selected(filter).map(toRef);
          return {
            async *[Symbol.asyncIterator]() {
              for (const ref of refs) yield ref;
            },
          };
        },

        async read(ref: ArtifactRef): Promise<ArtifactReadResult> {
          if (closed) throw new Error(`${connectorId}: session is closed`);

          const failureReason = unreadable[ref.path];
          if (failureReason !== undefined) {
            return {
              ok: false,
              failure: { path: ref.path, reason: failureReason, detail: 'simulated read failure' },
            };
          }

          const artifact = byPath.get(ref.path);
          if (artifact === undefined) {
            return { ok: false, failure: { path: ref.path, reason: 'not-found' } };
          }

          const encoding = artifact.contentEncoding ?? 'utf-8';
          const maxSizeBytes = descriptorFilter?.maxSizeBytes;
          const size = byteLength(artifact.content, encoding);
          if (maxSizeBytes !== undefined && size > maxSizeBytes) {
            return {
              ok: false,
              failure: {
                path: ref.path,
                reason: 'too-large',
                detail: `${size} bytes exceeds maxSizeBytes ${maxSizeBytes}`,
              },
            };
          }

          return {
            ok: true,
            artifact: {
              ...toRef(artifact),
              sourceId: descriptor.id,
              locator: buildArtifactLocator(descriptor, artifact.path),
              content: artifact.content,
              contentEncoding: encoding,
              contentHash: sha256(artifact.content),
              capturedAt: now(),
              ...(revision === undefined ? {} : { revision }),
            },
          };
        },

        async close(): Promise<void> {
          closed = true;
        },
      };
    },
  };
}
