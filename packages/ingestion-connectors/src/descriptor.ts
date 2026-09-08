/**
 * P3-01 -- what a source is, as an *input* to ingestion.
 *
 * `SourceDescriptor` is the caller-supplied request ("read this thing");
 * `Source` (P2-07, `@phoenix-ai/knowledge-graph`) is the resulting
 * registry record ("knowledge came from this thing"). They are deliberately
 * two types, not one: a descriptor carries things a knowledge bundle must
 * never contain (a credential reference, a filter, a branch to resolve),
 * and a `Source` carries a RESOLVED version a descriptor may not know yet.
 * `descriptorToSource` is the one-way bridge between them, so a connector
 * never hand-assembles a `Source` and no second identifier space is
 * introduced -- `SourceDescriptor.id` IS `Source.id` IS
 * `Provenance.sourceId` IS `Evidence.sourceId`.
 *
 * `SourceRepositoryDescriptor` was the first narrowing (P3-01): a repository
 * is one source kind whose coordinates are specified here.
 * `SourceDocumentSpaceDescriptor` is the second (P6-01), covering a wiki or
 * documentation site -- deliberately unlike a repository (no filesystem tree,
 * usually no immutable revision), which is the point: it proves the same
 * `SourceConnector` interface holds without change across two irreducibly
 * different source shapes. `SourceTicketTrackerDescriptor` is the third
 * (P6-02), covering an issue tracker (Jira) -- addressed by issue key rather
 * than by path, and with no `revision` concept at all, unlike the first two.
 * Log stores and gateways remain unnarrowed and reuse the generic
 * `SourceDescriptor` until a connector needs their coordinates. See
 * `docs/architecture/adr/0013-source-connector-contract.md` decisions 2 and 3,
 * `docs/architecture/adr/0026-p6-01-connector-framework-hardening.md`, and
 * `docs/architecture/adr/0027-p6-02-jira-connector.md`.
 */

import type { SourceType } from '@phoenix-ai/shared';
import {
  isNonEmptyString,
  isPlainObject,
  type Source,
  type ValidationResult,
} from '@phoenix-ai/knowledge-graph';
import { collectArtifactFilterErrors, type ArtifactFilter } from './filter.js';

/**
 * `<scheme>://<rest>` -- the locator shape Phase 1's own fixtures and the
 * P2-11 sample OKF already use (`repo://aurora-commerce/services/checkout`,
 * `data-model://aurora-schema.sql`, `openapi://aurora-commerce/...`). Made a
 * validated rule here rather than a convention honoured by hand, so
 * `Source.locator`/`Evidence.locator` stay resolvable across connectors.
 */
export const SOURCE_LOCATOR_PATTERN = /^[a-z][a-z0-9+.-]*:\/\/\S+$/;

export function isSourceLocator(value: unknown): value is string {
  return isNonEmptyString(value) && SOURCE_LOCATOR_PATTERN.test(value);
}

export const CREDENTIAL_SCHEMES = ['none', 'environment', 'secret-store'] as const;
export type CredentialScheme = (typeof CREDENTIAL_SCHEMES)[number];

/**
 * How a connector obtains access, WITHOUT the contract ever carrying the
 * secret itself: `scheme` says where to look and `ref` names the entry (an
 * environment variable name, a secret-store key). Resolving `ref` into an
 * actual credential is out of scope for this package and belongs behind
 * `packages/redaction-hardening`'s trust boundary.
 */
export interface CredentialReference {
  scheme: CredentialScheme;
  /** Required unless `scheme` is `'none'` -- the name/key to resolve, never the value. */
  ref?: string;
}

/**
 * Field names that would mean a caller pasted a live secret into a
 * descriptor. Rejected by validation at any depth of the descriptor: a
 * descriptor is routinely logged, cached, and echoed back in run summaries,
 * so a token smuggled into one is a real leak, not a style violation. This
 * is a structural guard, not a secret *scanner* -- it cannot catch a secret
 * stored under an innocent key name.
 */
export const FORBIDDEN_SECRET_KEYS = [
  'token',
  'accessToken',
  'password',
  'passphrase',
  'secret',
  'apiKey',
  'privateKey',
  'credentials',
] as const;

/**
 * A source to ingest from. `id`/`sourceType`/`label`/`locator` map 1:1 onto
 * `Source` (P2-07); `credential`/`filter` are ingestion-time concerns that
 * deliberately do NOT survive into the knowledge bundle.
 *
 * Note what is absent: no `systemId`. A repository is a repository
 * regardless of which analyzed system it feeds, and `identity.systemId` is
 * assigned when raw artifacts become canonical objects -- extraction's job,
 * not ingestion's. See ADR 0013 "Limitations".
 */
export interface SourceDescriptor {
  /** Join key into `Provenance.sourceId`/`Evidence.sourceId`/`Source.id` -- one identifier space, not a new one. */
  id: string;
  /** Reuses Phase 1's closed vocabulary (`@phoenix-ai/shared`); no connector-specific enum. */
  sourceType: SourceType;
  /** Human-readable name, e.g. `aurora-commerce/services/checkout`. Becomes `Source.label`. */
  label: string;
  /** `<scheme>://<rest>` -- see `SOURCE_LOCATOR_PATTERN`. Becomes `Source.locator`. */
  locator: string;
  credential?: CredentialReference;
  filter?: ArtifactFilter;
}

export const SOURCE_REPOSITORY_KINDS = ['git', 'local-directory', 'archive'] as const;
export type SourceRepositoryKind = (typeof SOURCE_REPOSITORY_KINDS)[number];

/**
 * Where in a repository's history to read from. `branch` is a moving
 * pointer, `revision` is an immutable one; when both are given `revision`
 * wins and `branch` is retained only as human context. A connector that
 * cannot pin a revision (`ConnectorCapabilities.revisionPinning === false`)
 * must reject a descriptor that specifies one rather than silently reading
 * the tip -- otherwise provenance would claim a revision the artifacts did
 * not come from.
 */
export interface RepositoryCoordinates {
  kind: SourceRepositoryKind;
  branch?: string;
  /** Commit SHA, tag, or archive digest. Free-text, matching `Source.version` (ADR 0009 decision 3). */
  revision?: string;
  /**
   * Repository-relative roots to read. A convenience over
   * `filter.includePaths` for the common monorepo case, and a hint a
   * connector can push down to a sparse/partial checkout; semantically
   * equivalent to including those subtrees. Both may be set -- `subpaths`
   * narrows what is fetched, `filter` narrows what is surfaced.
   */
  subpaths?: string[];
  /**
   * Where the repository actually is ON DISK, for `kind: 'local-directory'`.
   *
   * Its whole purpose is to decouple identity from location. `locator` is what
   * lands on `Source.locator` and, composed with each path, on every
   * `Evidence.locator` -- so putting a machine-local absolute path there makes
   * OKF output differ per build agent, which P2-10's determinism requirement
   * does not allow. Set `locator` to the stable identifier
   * (`repo://aurora-commerce/services/checkout`) and `workingTreePath` to
   * wherever the checkout happens to live, and provenance stays reproducible.
   *
   * When omitted, the connector derives the location from `locator`, which
   * must then be a `file://` URL (local) or a real git URL (remote).
   */
  workingTreePath?: string;
}

export interface SourceRepositoryDescriptor extends SourceDescriptor {
  repository: RepositoryCoordinates;
}

export const SOURCE_DOCUMENT_SPACE_KINDS = ['wiki', 'static-site'] as const;
export type SourceDocumentSpaceKind = (typeof SOURCE_DOCUMENT_SPACE_KINDS)[number];

/**
 * P6-01 -- the second source-specific narrowing, proving ADR 0013 decision
 * 2's promise that "a later connector adds its own descriptor narrowing
 * without this interface changing." A document space (a wiki, a static
 * documentation site) is unlike a repository in the way that matters most:
 * there is usually no filesystem tree and no immutable revision to pin --
 * editing a page mutates it in place. `revision` is still modelled here
 * (mirroring `RepositoryCoordinates.revision`) because SOME backends genuinely
 * support a snapshot (a static-site build id, an export), but a connector for
 * a backend that does not must declare `ConnectorCapabilities.revisionPinning:
 * false` and reject a descriptor that sets it -- see
 * `document-space-connector.ts`, the first connector in this package to
 * actually enforce that rule rather than merely documenting it.
 */
export interface DocumentSpaceCoordinates {
  kind: SourceDocumentSpaceKind;
  /** The space/site identifier at the source, e.g. a wiki space key. */
  spaceId: string;
  /**
   * Restrict to pages whose path starts under this prefix. A convenience over
   * `filter.includePaths`, mirroring `RepositoryCoordinates.subpaths` --
   * `pathPrefix` narrows what a connector fetches, `filter` narrows what it
   * surfaces.
   */
  pathPrefix?: string;
  /** A snapshot identifier, only meaningful when the backend has one. See the interface doc comment. */
  revision?: string;
}

export interface SourceDocumentSpaceDescriptor extends SourceDescriptor {
  documentSpace: DocumentSpaceCoordinates;
}

function collectForbiddenSecretKeyErrors(
  candidate: Record<string, unknown>,
  path: string,
): string[] {
  const errors: string[] = [];
  for (const [key, value] of Object.entries(candidate)) {
    if ((FORBIDDEN_SECRET_KEYS as readonly string[]).includes(key)) {
      errors.push(
        `${path}${key} is not allowed — a descriptor must reference a credential (credential.ref), never carry one`,
      );
    }
    if (isPlainObject(value)) {
      errors.push(...collectForbiddenSecretKeyErrors(value, `${path}${key}.`));
    }
  }
  return errors;
}

function collectCredentialErrors(candidate: unknown): string[] {
  if (!isPlainObject(candidate)) return ['credential, if present, must be an object'];

  const errors: string[] = [];
  const scheme = candidate.scheme;
  if (!isNonEmptyString(scheme) || !(CREDENTIAL_SCHEMES as readonly string[]).includes(scheme)) {
    errors.push(`credential.scheme must be one of: ${CREDENTIAL_SCHEMES.join(', ')}`);
    return errors;
  }

  const ref = candidate.ref;
  if (scheme === 'none') {
    if (ref !== undefined) errors.push('credential.ref must be omitted when scheme is "none"');
  } else if (!isNonEmptyString(ref)) {
    errors.push(`credential.ref is required when scheme is "${scheme}"`);
  }

  return errors;
}

/** Validates the generic `SourceDescriptor` fields every source kind shares. */
export function validateSourceDescriptor(candidate: unknown): ValidationResult {
  if (!isPlainObject(candidate)) return { valid: false, errors: ['must be a non-null object'] };

  const errors: string[] = [];
  if (!isNonEmptyString(candidate.id)) errors.push('id is required');
  if (!isNonEmptyString(candidate.sourceType)) errors.push('sourceType is required');
  if (!isNonEmptyString(candidate.label)) errors.push('label is required');
  if (!isSourceLocator(candidate.locator)) {
    errors.push('locator must match <scheme>://<rest>, e.g. "repo://aurora-commerce"');
  }

  if (candidate.credential !== undefined) {
    errors.push(...collectCredentialErrors(candidate.credential));
  }
  if (candidate.filter !== undefined) {
    errors.push(...collectArtifactFilterErrors(candidate.filter, 'filter'));
  }

  errors.push(...collectForbiddenSecretKeyErrors(candidate, ''));

  return { valid: errors.length === 0, errors };
}

/** Validates a `SourceRepositoryDescriptor` -- the generic fields plus `repository`. */
export function validateSourceRepositoryDescriptor(candidate: unknown): ValidationResult {
  const base = validateSourceDescriptor(candidate);
  if (!isPlainObject(candidate)) return base;

  const errors = [...base.errors];
  const repository = candidate.repository;
  if (!isPlainObject(repository)) {
    errors.push('repository is required');
    return { valid: false, errors };
  }

  const kind = repository.kind;
  if (!isNonEmptyString(kind) || !(SOURCE_REPOSITORY_KINDS as readonly string[]).includes(kind)) {
    errors.push(`repository.kind must be one of: ${SOURCE_REPOSITORY_KINDS.join(', ')}`);
  }
  for (const field of ['branch', 'revision', 'workingTreePath'] as const) {
    const value = repository[field];
    if (value !== undefined && !isNonEmptyString(value)) {
      errors.push(`repository.${field}, if present, must be a non-empty string`);
    }
  }
  const subpaths = repository.subpaths;
  if (subpaths !== undefined) {
    if (!Array.isArray(subpaths)) {
      errors.push('repository.subpaths, if present, must be an array');
    } else {
      subpaths.forEach((subpath, index) => {
        if (typeof subpath !== 'string' || subpath.length === 0) {
          errors.push(`repository.subpaths[${index}] must be a non-empty string`);
        } else if (subpath.startsWith('/')) {
          errors.push(`repository.subpaths[${index}] must be repository-relative (no leading "/")`);
        }
      });
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a `SourceDocumentSpaceDescriptor` -- the generic fields plus `documentSpace`. */
export function validateSourceDocumentSpaceDescriptor(candidate: unknown): ValidationResult {
  const base = validateSourceDescriptor(candidate);
  if (!isPlainObject(candidate)) return base;

  const errors = [...base.errors];
  const documentSpace = candidate.documentSpace;
  if (!isPlainObject(documentSpace)) {
    errors.push('documentSpace is required');
    return { valid: false, errors };
  }

  const kind = documentSpace.kind;
  if (
    !isNonEmptyString(kind) ||
    !(SOURCE_DOCUMENT_SPACE_KINDS as readonly string[]).includes(kind)
  ) {
    errors.push(`documentSpace.kind must be one of: ${SOURCE_DOCUMENT_SPACE_KINDS.join(', ')}`);
  }
  if (!isNonEmptyString(documentSpace.spaceId)) {
    errors.push('documentSpace.spaceId is required');
  }
  for (const field of ['pathPrefix', 'revision'] as const) {
    const value = documentSpace[field];
    if (value !== undefined && !isNonEmptyString(value)) {
      errors.push(`documentSpace.${field}, if present, must be a non-empty string`);
    }
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Reads whatever declared (unresolved) revision a descriptor's source-specific
 * narrowing carries. Written against `SourceRepositoryDescriptor` alone in
 * P3-01; generalized here in P6-01 for `SourceDocumentSpaceDescriptor` rather
 * than adding a second special case at the `descriptorToSource` call site --
 * a repository-shaped assumption baked into an otherwise-generic bridge is
 * exactly the kind of thing "harden the abstraction" means to catch, and the
 * next narrowing after this one gets the same fallback for free only if this
 * stays a single, extensible lookup.
 */
function declaredRevisionOf(descriptor: SourceDescriptor): string | undefined {
  const repository = (descriptor as Partial<SourceRepositoryDescriptor>).repository;
  if (repository?.revision !== undefined) return repository.revision;
  const documentSpace = (descriptor as Partial<SourceDocumentSpaceDescriptor>).documentSpace;
  return documentSpace?.revision;
}

/**
 * The descriptor -> `Source` bridge (P2-07). `resolvedVersion` is what the
 * connector actually read (a git SHA it resolved a branch to, an archive
 * digest); when omitted, a descriptor-supplied `repository.revision` is
 * used, and when neither exists `Source.version` is left off rather than
 * filled with a placeholder -- an unversioned source is honest, a fake
 * version is not.
 *
 * `credential` and `filter` are dropped by construction: neither is
 * knowledge about the analyzed system, and a credential reference has no
 * business inside a bundle that gets serialized to OKF YAML.
 */
export function descriptorToSource(descriptor: SourceDescriptor, resolvedVersion?: string): Source {
  const version = resolvedVersion ?? declaredRevisionOf(descriptor);
  return {
    id: descriptor.id,
    type: descriptor.sourceType,
    label: descriptor.label,
    locator: descriptor.locator,
    ...(version === undefined ? {} : { version }),
  };
}

/**
 * Composes a descriptor's locator with an artifact's repository-relative
 * path into the locator recorded on `RawArtifact.locator` (and, downstream,
 * on `Evidence.locator`). Normalizes the join so a descriptor written as
 * `repo://aurora-commerce/` and one written as `repo://aurora-commerce`
 * produce byte-identical locators -- OKF output has to be deterministic
 * (P2-10), which means locators cannot vary with how a caller typed a
 * trailing slash.
 */
export function buildArtifactLocator(descriptor: SourceDescriptor, path: string): string {
  const base = descriptor.locator.replace(/\/+$/, '');
  const relative = path.replace(/^\/+/, '');
  return relative.length === 0 ? base : `${base}/${relative}`;
}
