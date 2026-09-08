/**
 * P6-01 -- an in-memory document-space connector: the second source-specific
 * narrowing (`SourceDocumentSpaceDescriptor`), proving the P3-01 contract
 * genuinely generalizes past a repository the way ADR 0013 decision 2
 * promised it would -- "a later connector adds its own descriptor narrowing
 * without this interface changing."
 *
 * A document space is unlike a repository in the one way that matters most
 * for `ConnectorCapabilities.revisionPinning`: most wiki/CMS backends have no
 * immutable revision concept at all -- editing a page mutates it in place,
 * there is no SHA to pin to. `createInMemoryRepositoryConnector` (P3-01) and
 * `createGitRepositoryConnector` (P3-02) both declare `revisionPinning: true`
 * unconditionally, so ADR 0013 decision 6's rule -- "a connector declaring
 * `revisionPinning: false` must REJECT a descriptor that pins a revision" --
 * has been documented since P3-01 but never implemented or exercised by any
 * connector in this package. This one defaults to `revisionPinning: false`
 * and actually enforces the rejection at `open`, closing that gap. See
 * `docs/architecture/adr/0026-p6-01-connector-framework-hardening.md`.
 *
 * Not a real wiki/CMS client, matching `reference-connector.ts`'s precedent:
 * it performs no network access and reads only the pages handed to it as
 * options.
 */

import { createHash } from 'node:crypto';
import type { SourceType } from '@phoenix-ai/shared';
import {
  buildArtifactLocator,
  descriptorToSource,
  validateSourceDocumentSpaceDescriptor,
  type SourceDescriptor,
  type SourceDocumentSpaceDescriptor,
} from './descriptor.js';
import type { ArtifactContentEncoding, ArtifactRef, ArtifactReadResult } from './artifact.js';
import { matchesArtifactFilter, matchesPathPattern, type ArtifactFilter } from './filter.js';
import type { ConnectorCapabilities, ConnectorSession, SourceConnector } from './connector.js';

/** One page handed to the document-space connector up front, standing in for a page in a wiki/CMS. */
export interface InMemoryPage {
  /** Page path within the space, e.g. `payments/authorization`. Not a filesystem path. */
  path: string;
  content: string;
  mediaType?: string;
  lastModifiedAt?: string;
}

export interface InMemoryDocumentSpaceConnectorOptions {
  pages: readonly InMemoryPage[];
  /** Defaults to `in-memory-document-space`. Callers record this as `Provenance.derivedBy`. */
  id?: string;
  /** The `SourceType`s this instance accepts. Defaults to `['technical-doc']`. */
  sourceTypes?: readonly SourceType[];
  /**
   * Defaults to `false` -- see the file header. Set `true` only to model a
   * document-space backend that genuinely supports an immutable snapshot
   * (e.g. a static-site export pinned to a build id); when `true` this
   * connector behaves like `createInMemoryRepositoryConnector` with respect
   * to revision resolution.
   */
  revisionPinning?: boolean;
  /** The revision resolved when `revisionPinning` is true and the descriptor did not pin one itself. */
  revision?: string;
  /** Injectable clock so `capturedAt` is deterministic under test. Defaults to the real clock. */
  now?: () => string;
}

export type SourceDocumentSpaceConnector = SourceConnector<SourceDocumentSpaceDescriptor>;

function sha256(content: string): { algorithm: string; value: string } {
  return { algorithm: 'sha256', value: createHash('sha256').update(content, 'utf8').digest('hex') };
}

function toRef(page: InMemoryPage): ArtifactRef {
  return {
    path: page.path,
    sizeBytes: Buffer.byteLength(page.content, 'utf8'),
    ...(page.mediaType === undefined ? {} : { mediaType: page.mediaType }),
    ...(page.lastModifiedAt === undefined ? {} : { lastModifiedAt: page.lastModifiedAt }),
  };
}

/** Creates the in-memory document-space connector. See the file header — a reference/test double, not a real client. */
export function createInMemoryDocumentSpaceConnector(
  options: InMemoryDocumentSpaceConnectorOptions,
): SourceDocumentSpaceConnector {
  const connectorId = options.id ?? 'in-memory-document-space';
  const sourceTypes = options.sourceTypes ?? (['technical-doc'] as const);
  const now = options.now ?? ((): string => new Date().toISOString());
  const revisionPinning = options.revisionPinning ?? false;
  const byPath = new Map(options.pages.map((page) => [page.path, page]));

  // `binaryContent: false` is honest, not a placeholder: every page here is
  // read as `utf-8`, and this is the first connector in the package to
  // declare that flag false rather than leaving the negative path unexercised.
  const capabilities: ConnectorCapabilities = {
    revisionPinning,
    incrementalScan: true,
    subtreeFiltering: true,
    contentHashing: true,
    binaryContent: false,
  };

  return {
    id: connectorId,
    sourceTypes,
    capabilities,

    supports(descriptor: SourceDescriptor): descriptor is SourceDocumentSpaceDescriptor {
      return (
        sourceTypes.includes(descriptor.sourceType) &&
        validateSourceDocumentSpaceDescriptor(descriptor).valid
      );
    },

    async open(descriptor: SourceDocumentSpaceDescriptor): Promise<ConnectorSession> {
      const validation = validateSourceDocumentSpaceDescriptor(descriptor);
      if (!validation.valid) {
        throw new Error(`${connectorId}: invalid descriptor — ${validation.errors.join('; ')}`);
      }

      const requestedRevision = descriptor.documentSpace.revision;
      if (requestedRevision !== undefined && !revisionPinning) {
        throw new Error(
          `${connectorId}: documentSpace.revision ${JSON.stringify(requestedRevision)} was ` +
            `requested but this connector declares capabilities.revisionPinning: false — this ` +
            `document space has no immutable revision to pin to; omit documentSpace.revision and ` +
            `read the live space instead`,
        );
      }

      const revision = revisionPinning ? (options.revision ?? requestedRevision) : undefined;
      const source = descriptorToSource(descriptor, revision);
      const descriptorFilter = descriptor.filter;
      const pathPrefix = descriptor.documentSpace.pathPrefix;
      let closed = false;

      const selected = (extra?: ArtifactFilter): InMemoryPage[] =>
        options.pages.filter((page) => {
          if (pathPrefix !== undefined && !matchesPathPattern(page.path, pathPrefix)) return false;
          const ref = toRef(page);
          return matchesArtifactFilter(ref, descriptorFilter) && matchesArtifactFilter(ref, extra);
        });

      const assertOpen = (): void => {
        if (closed) throw new Error(`${connectorId}: session is closed`);
      };

      return {
        descriptor,
        source,
        ...(revision === undefined ? {} : { revision }),

        list(filter?: ArtifactFilter): AsyncIterable<ArtifactRef> {
          assertOpen();
          const refs = selected(filter).map(toRef);
          return {
            async *[Symbol.asyncIterator]() {
              for (const ref of refs) yield ref;
            },
          };
        },

        async read(ref: ArtifactRef): Promise<ArtifactReadResult> {
          assertOpen();

          const page = byPath.get(ref.path);
          if (page === undefined) {
            return { ok: false, failure: { path: ref.path, reason: 'not-found' } };
          }

          const maxSizeBytes = descriptorFilter?.maxSizeBytes;
          const size = Buffer.byteLength(page.content, 'utf8');
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

          const contentEncoding: ArtifactContentEncoding = 'utf-8';
          return {
            ok: true,
            artifact: {
              ...toRef(page),
              sourceId: descriptor.id,
              locator: buildArtifactLocator(descriptor, page.path),
              content: page.content,
              contentEncoding,
              contentHash: sha256(page.content),
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
