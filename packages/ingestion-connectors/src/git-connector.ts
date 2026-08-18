/**
 * P3-02 -- the git repository connector: the first REAL connector, reading
 * repository metadata, revisions, and source files.
 *
 * Implements P3-01's `SourceRepositoryConnector` with no change to that
 * interface beyond the two additive amendments this ticket found it needed
 * (`ConnectorSession.sourceMetadata`, `RawArtifact.attributes` -- see
 * `docs/architecture/adr/0014-git-repository-connector.md`).
 *
 * How the three things this ticket is about are obtained:
 *
 *  - **Revisions.** `git rev-parse` resolves whatever the descriptor asked
 *    for (a branch, a tag, a SHA, or `HEAD`) to an immutable full SHA once,
 *    at `open`. Every subsequent read is against that SHA, so a branch moving
 *    mid-run cannot produce a bundle mixing two revisions -- and the SHA is
 *    what lands in `Source.version`/`Evidence.sourceVersion`.
 *  - **Repository metadata.** One `git log -1` and a small number of
 *    `rev-parse`/`tag`/`remote` calls at `open`, surfaced as
 *    `ConnectorSession.sourceMetadata`.
 *  - **Source files.** `git ls-tree -r -l <sha>` lists the tree AT that
 *    revision (not the working directory, so uncommitted edits and untracked
 *    junk are invisible by construction), and `git cat-file blob` reads each
 *    one. Both are revision-addressed, which is what makes the read
 *    reproducible.
 *
 * Nothing here parses a source file. That remains extraction's job (P3-03
 * onward); this file's output is `RawArtifact`, exactly as P3-01 defined.
 */

import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SourceType } from '@phoenix-ai/shared';
import type { KnowledgeValue } from '@phoenix-ai/knowledge-graph';
import {
  assertSafePath,
  assertSafeRemote,
  assertSafeRevision,
  GitCommandError,
  runGit,
  runGitBinary,
  type GitCommandOptions,
} from './git-command.js';
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
  ArtifactReadResult,
  ArtifactRef,
} from './artifact.js';
import { matchesArtifactFilter, type ArtifactFilter } from './filter.js';
import type {
  ConnectorCapabilities,
  ConnectorSession,
  SourceRepositoryConnector,
} from './connector.js';

export const GIT_CONNECTOR_ID = 'git-repository';

/**
 * What this connector observes about a repository, beyond the artifacts
 * themselves. Every field is what git actually reported -- nothing is
 * inferred or defaulted.
 *
 * Indexed by `KnowledgeValue` so it is directly assignable to
 * `ConnectorSession.sourceMetadata` without a cast.
 */
export interface GitRepositoryMetadata {
  [key: string]: KnowledgeValue;
  /** The immutable full SHA every artifact in this session was read from. */
  headRevision: string;
  /** Abbreviated form of `headRevision`, as git itself abbreviates it. */
  shortRevision: string;
  /** ISO-8601 committer date of `headRevision`. */
  committedAt: string;
  /** First line of the commit message. */
  commitSubject: string;
  /** The branch the descriptor asked for, when it named one. */
  requestedRef?: string;
  /** The repository's own default branch, when it can be determined. */
  defaultBranch?: string;
  /** Tags pointing at `headRevision`, sorted. Empty when none do. */
  tagsAtHead: string[];
  /** `origin`'s fetch URL, when the repository has one. */
  remoteUrl?: string;
  /** True when this is a shallow clone -- history-based analysis must not assume full history. */
  shallow: boolean;
  /** Number of tracked files in the tree at `headRevision`. */
  trackedFileCount: number;
  /** Commit author name/email, only when `includeAuthorMetadata` is enabled. See ADR 0014 decision 6. */
  commitAuthor?: string;
}

export interface GitConnectorOptions {
  /** Where temporary clones are created. Defaults to the OS temp directory. */
  workDir?: string;
  /**
   * Clone depth for a remote `kind: 'git'` descriptor. Defaults to 1 --
   * ingestion reads one revision, so fetching full history by default would
   * be paying for data nothing consumes. Pass 0 for a full clone (needed once
   * something wants real history), which also clears `metadata.shallow`.
   */
  cloneDepth?: number;
  /** Per-command timeout for everything except cloning. Defaults to the git-command default. */
  commandTimeoutMs?: number;
  /** Clone/fetch timeout. Defaults to 300000 (5 min) — network-bound, unlike every other call. */
  cloneTimeoutMs?: number;
  /**
   * Populate each artifact's `lastModifiedAt`/`attributes.lastCommitRevision`
   * from git history. Defaults to true, and costs exactly ONE extra
   * `git log --name-only` pass for the whole repository -- not one call per
   * file, which is what makes it affordable. Disable for the fastest possible
   * listing, at the cost of `ArtifactFilter.changedSince` having nothing to
   * filter on.
   */
  includeFileHistory?: boolean;
  /**
   * Include the HEAD commit's author name and email in `sourceMetadata`.
   * Defaults to FALSE: author identity is personal data, and this package
   * sits upstream of `packages/redaction-hardening`. Opt in only when the
   * consumer genuinely needs attribution. See ADR 0014 decision 6.
   */
  includeAuthorMetadata?: boolean;
  /** Refuse any single artifact larger than this. Defaults to 16 MiB. */
  maxArtifactBytes?: number;
}

const DEFAULT_CLONE_TIMEOUT_MS = 300_000;
const DEFAULT_MAX_ARTIFACT_BYTES = 16 * 1024 * 1024;

/**
 * ASCII unit separator, used as the field delimiter in `git log --format`
 * strings (`%x1f`). Chosen because a commit subject, an author name, and a
 * file path can all legitimately contain any printable character a more
 * obvious delimiter might use.
 */
const UNIT_SEPARATOR = '';

/**
 * `incrementalScan` and the rest are all true because git genuinely supports
 * them: `changedSince` resolves against real commit dates, path filters are
 * pushed down as pathspecs, `contentHashing` reports git's own blob object
 * ids (not a digest this connector computed), and binary artifacts come back
 * base64-encoded.
 */
const CAPABILITIES: ConnectorCapabilities = {
  revisionPinning: true,
  incrementalScan: true,
  subtreeFiltering: true,
  contentHashing: true,
  binaryContent: true,
};

/** Every `SourceType` a repository can plausibly be described as. See ADR 0014 amendment 2. */
const SUPPORTED_SOURCE_TYPES: readonly SourceType[] = [
  'source-code',
  'data-model',
  'technical-doc',
  'business-doc',
  'test',
  'other',
];

/** One row of `git ls-tree -r -l`. */
interface TreeEntry {
  path: string;
  objectId: string;
  sizeBytes: number;
}

/**
 * `git ls-tree -r -l -z` emits `<mode> SP <type> SP <oid> SP <size> TAB <path>`
 * per NUL-terminated record. `-z` (rather than newline-separated) is what
 * makes a path containing a newline parse correctly instead of splitting into
 * two bogus entries, and it also stops git from quoting non-ASCII paths.
 */
function parseTreeEntries(stdout: string): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const record of stdout.split('\0')) {
    if (record.length === 0) continue;
    const tabIndex = record.indexOf('\t');
    if (tabIndex === -1) continue;
    const meta = record.slice(0, tabIndex).trim().split(/\s+/);
    const path = record.slice(tabIndex + 1);
    const [, type, objectId, size] = meta;
    // `blob` only: `tree` rows do not appear under -r, and `commit` rows are
    // submodule pointers, which have no content to read here.
    if (type !== 'blob' || objectId === undefined || size === undefined) continue;
    const sizeBytes = Number.parseInt(size, 10);
    entries.push({ path, objectId, sizeBytes: Number.isNaN(sizeBytes) ? 0 : sizeBytes });
  }
  return entries;
}

/**
 * Maps each tracked path to the committer date and SHA of the most recent
 * commit that touched it, in a single `git log` pass.
 *
 * A merge commit is skipped (`--no-merges` is implied by `--name-only`
 * showing nothing for merges), and the first commit seen for a path wins
 * because `git log` walks newest-first.
 */
function parseFileHistory(stdout: string): Map<string, { committedAt: string; revision: string }> {
  const history = new Map<string, { committedAt: string; revision: string }>();
  let current: { committedAt: string; revision: string } | undefined;

  for (const line of stdout.split('\n')) {
    if (line.length === 0) continue;
    // Commit header lines are emitted as `<sha>\x1f<iso-date>` by the format
    // string below; anything else is a path.
    const separator = line.indexOf(UNIT_SEPARATOR);
    if (separator !== -1) {
      current = { revision: line.slice(0, separator), committedAt: line.slice(separator + 1) };
      continue;
    }
    if (current !== undefined && !history.has(line)) history.set(line, current);
  }

  return history;
}

/** git's own binary heuristic: a NUL byte in the first 8000 bytes means binary. */
function looksBinary(content: Buffer): boolean {
  return content.subarray(0, 8_000).includes(0);
}

function classifyReadFailure(error: unknown): ArtifactFailureReason {
  if (!(error instanceof GitCommandError)) return 'unreadable';
  const stderr = error.stderr.toLowerCase();
  if (stderr.includes('does not exist') || stderr.includes('not a valid object'))
    return 'not-found';
  if (stderr.includes('permission denied')) return 'access-denied';
  if (error.signal !== null) return 'transport-error';
  return 'unreadable';
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/**
 * The path or URL git should actually be pointed at, which is deliberately
 * not always `descriptor.locator`:
 *
 *  - `repository.workingTreePath` wins when set, which is what lets `locator`
 *    stay a stable identifier while git reads a checkout at some
 *    machine-local path. See its doc comment for why provenance needs that.
 *  - `repo://` is a Phoenix identifier, not a location git can resolve, so it
 *    is only usable together with `workingTreePath`. Saying so explicitly
 *    beats stripping the scheme and letting git fail on a relative path.
 *  - `file://<path>` is reduced to `<path>` for `local-directory`, because
 *    `git -C` takes a filesystem path and not a URL -- but it is passed
 *    through UNTOUCHED for a clone. `file://` selects git's file transport;
 *    rewriting it to a bare path silently opts into git's local-clone
 *    optimization instead, which ignores `--depth` ("warning: --depth is
 *    ignored in local clones") and would hand back full history the caller
 *    did not ask for, with `metadata.shallow` correctly but confusingly false.
 */
function gitTargetFor(descriptor: SourceRepositoryDescriptor): string {
  const { kind, workingTreePath } = descriptor.repository;
  if (workingTreePath !== undefined) {
    if (kind !== 'local-directory') {
      throw new Error(
        `${GIT_CONNECTOR_ID}: repository.workingTreePath is only valid with kind "local-directory", ` +
          `not "${kind}" — a remote clone needs a git URL in the locator`,
      );
    }
    return workingTreePath;
  }

  const locator = descriptor.locator;
  const schemeEnd = locator.indexOf('://');
  const scheme = locator.slice(0, schemeEnd);

  if (scheme === 'repo') {
    throw new Error(
      `${GIT_CONNECTOR_ID}: locator ${JSON.stringify(locator)} is a Phoenix identifier, not a git ` +
        `location — set repository.workingTreePath to the checkout git should read`,
    );
  }
  if (scheme === 'file' && kind === 'local-directory') return locator.slice(schemeEnd + 3);
  // https://, ssh://, git://, and file:// for a clone are all real git URLs.
  return locator;
}

/** Creates the git repository connector. Requires the `git` binary on PATH. */
export function createGitRepositoryConnector(
  options: GitConnectorOptions = {},
): SourceRepositoryConnector {
  const cloneDepth = options.cloneDepth ?? 1;
  const includeFileHistory = options.includeFileHistory ?? true;
  const includeAuthorMetadata = options.includeAuthorMetadata ?? false;
  const maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
  const commandOptions = (cwd: string): GitCommandOptions => ({
    cwd,
    ...(options.commandTimeoutMs === undefined ? {} : { timeoutMs: options.commandTimeoutMs }),
  });

  return {
    id: GIT_CONNECTOR_ID,
    sourceTypes: SUPPORTED_SOURCE_TYPES,
    capabilities: CAPABILITIES,

    supports(descriptor: SourceDescriptor): descriptor is SourceRepositoryDescriptor {
      if (!SUPPORTED_SOURCE_TYPES.includes(descriptor.sourceType)) return false;
      if (!validateSourceRepositoryDescriptor(descriptor).valid) return false;
      const kind = (descriptor as SourceRepositoryDescriptor).repository.kind;
      // `archive` is a valid descriptor kind this connector does not serve —
      // saying so here is what lets `selectConnector` pass it to a future one.
      return kind === 'git' || kind === 'local-directory';
    },

    async open(descriptor: SourceRepositoryDescriptor): Promise<ConnectorSession> {
      const validation = validateSourceRepositoryDescriptor(descriptor);
      if (!validation.valid) {
        throw new Error(
          `${GIT_CONNECTOR_ID}: invalid descriptor — ${validation.errors.join('; ')}`,
        );
      }

      const { kind, branch, revision: requestedRevision, subpaths } = descriptor.repository;
      if (kind === 'archive') {
        throw new Error(
          `${GIT_CONNECTOR_ID}: repository.kind "archive" is not supported by this connector`,
        );
      }

      // Phoenix never handles a credential — git's own credential helper, an
      // SSH agent, or a pre-authenticated checkout does. See ADR 0014 decision 4.
      const credentialScheme = descriptor.credential?.scheme ?? 'none';
      if (credentialScheme !== 'none') {
        throw new Error(
          `${GIT_CONNECTOR_ID}: credential.scheme "${credentialScheme}" is not resolved by this connector — ` +
            `authenticate git itself (credential helper or SSH agent) and use scheme "none"`,
        );
      }

      const target = gitTargetFor(descriptor);
      let repoPath: string;
      let temporaryClone: string | undefined;

      if (kind === 'local-directory') {
        assertSafePath(target);
        if (!(await isDirectory(target))) {
          throw new Error(
            `${GIT_CONNECTOR_ID}: ${JSON.stringify(target)} is not an existing directory`,
          );
        }
        repoPath = target;
      } else {
        assertSafeRemote(target);
        // A local const, not the mutable `temporaryClone`, because `cleanup`
        // captures the latter and sets it back to undefined — which loses the
        // narrowing TypeScript would otherwise give us here.
        const clonePath = await mkdtemp(join(options.workDir ?? tmpdir(), 'phoenix-git-'));
        temporaryClone = clonePath;
        const cloneArgs = ['clone', '--quiet', '--no-tags', '--no-checkout'];
        if (cloneDepth > 0) cloneArgs.push('--depth', String(cloneDepth));
        if (branch !== undefined && requestedRevision === undefined) {
          assertSafeRevision(branch);
          cloneArgs.push('--branch', branch, '--single-branch');
        }
        cloneArgs.push('--', target, clonePath);
        try {
          await runGit(cloneArgs, {
            timeoutMs: options.cloneTimeoutMs ?? DEFAULT_CLONE_TIMEOUT_MS,
          });
        } catch (error) {
          await rm(clonePath, { recursive: true, force: true });
          temporaryClone = undefined;
          throw error;
        }
        repoPath = clonePath;
      }

      const git = commandOptions(repoPath);
      const cleanup = async (): Promise<void> => {
        if (temporaryClone !== undefined) {
          await rm(temporaryClone, { recursive: true, force: true });
          temporaryClone = undefined;
        }
      };

      try {
        // `--no-checkout` above means no working tree exists in a clone; every
        // read below is revision-addressed, so none is needed.
        const requestedRef = requestedRevision ?? branch;
        if (requestedRef !== undefined) assertSafeRevision(requestedRef);
        const revisionish = requestedRef ?? 'HEAD';

        const headRevision = (
          await runGit(['rev-parse', '--verify', `${revisionish}^{commit}`], git)
        ).stdout.trim();
        const shortRevision = (
          await runGit(['rev-parse', '--short', headRevision], git)
        ).stdout.trim();

        // %x1f is a unit separator: a commit subject can contain anything,
        // including whatever delimiter one might naively pick.
        const logFormat = includeAuthorMetadata ? '%cI%x1f%s%x1f%an <%ae>' : '%cI%x1f%s';
        const [committedAt = '', commitSubject = '', commitAuthor] = (
          await runGit(['log', '-1', `--format=${logFormat}`, headRevision], git)
        ).stdout
          .replace(/\n$/, '')
          .split(UNIT_SEPARATOR);

        const tagsAtHead = (await runGit(['tag', '--points-at', headRevision], git)).stdout
          .split('\n')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0)
          .sort();

        const remoteUrl = await runGit(['remote', 'get-url', 'origin'], git)
          .then(({ stdout }) => stdout.trim())
          .catch(() => undefined);
        const defaultBranch = await runGit(
          ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'],
          git,
        )
          .then(({ stdout }) => stdout.trim().replace(/^origin\//, ''))
          .catch(() => undefined);
        const shallow = await runGit(['rev-parse', '--is-shallow-repository'], git)
          .then(({ stdout }) => stdout.trim() === 'true')
          .catch(() => false);

        // Pathspecs push `subpaths` down to git rather than listing the whole
        // tree and discarding most of it (`subtreeFiltering: true`).
        const pathspec: string[] = [];
        if (subpaths !== undefined && subpaths.length > 0) {
          for (const subpath of subpaths) assertSafePath(subpath);
          pathspec.push('--', ...subpaths);
        }

        const entries = parseTreeEntries(
          (await runGit(['ls-tree', '-r', '-l', '-z', headRevision, ...pathspec], git)).stdout,
        );

        const history = includeFileHistory
          ? parseFileHistory(
              (
                await runGit(
                  [
                    'log',
                    '--format=%H%x1f%cI',
                    '--name-only',
                    '--no-renames',
                    headRevision,
                    ...pathspec,
                  ],
                  git,
                )
              ).stdout,
            )
          : new Map<string, { committedAt: string; revision: string }>();

        const toRef = (entry: TreeEntry): ArtifactRef => {
          const fileHistory = history.get(entry.path);
          return {
            path: entry.path,
            sizeBytes: entry.sizeBytes,
            ...(fileHistory === undefined ? {} : { lastModifiedAt: fileHistory.committedAt }),
          };
        };

        const byPath = new Map(entries.map((entry) => [entry.path, entry]));
        const descriptorFilter = descriptor.filter;
        const source = descriptorToSource(descriptor, headRevision);
        const sourceMetadata: GitRepositoryMetadata = {
          headRevision,
          shortRevision,
          committedAt,
          commitSubject,
          tagsAtHead,
          shallow,
          trackedFileCount: entries.length,
          ...(requestedRef === undefined ? {} : { requestedRef }),
          ...(defaultBranch === undefined ? {} : { defaultBranch }),
          ...(remoteUrl === undefined ? {} : { remoteUrl }),
          ...(commitAuthor === undefined ? {} : { commitAuthor }),
        };

        let closed = false;
        const assertOpen = (): void => {
          if (closed) throw new Error(`${GIT_CONNECTOR_ID}: session is closed`);
        };

        return {
          descriptor,
          source,
          revision: headRevision,
          sourceMetadata,

          list(filter?: ArtifactFilter): AsyncIterable<ArtifactRef> {
            assertOpen();
            const refs = entries
              .map(toRef)
              .filter(
                (ref) =>
                  matchesArtifactFilter(ref, descriptorFilter) &&
                  matchesArtifactFilter(ref, filter),
              );
            return {
              async *[Symbol.asyncIterator]() {
                for (const ref of refs) yield ref;
              },
            };
          },

          async read(ref: ArtifactRef): Promise<ArtifactReadResult> {
            assertOpen();

            const entry = byPath.get(ref.path);
            if (entry === undefined) {
              return { ok: false, failure: { path: ref.path, reason: 'not-found' } };
            }

            // The connector's own ceiling and the descriptor's, whichever is
            // tighter. Both are finite, so `limit` always is.
            const limit = Math.min(
              maxArtifactBytes,
              descriptorFilter?.maxSizeBytes ?? maxArtifactBytes,
            );
            if (entry.sizeBytes > limit) {
              return {
                ok: false,
                failure: {
                  path: ref.path,
                  reason: 'too-large',
                  detail: `${entry.sizeBytes} bytes exceeds the ${limit}-byte limit`,
                },
              };
            }

            let content: Buffer;
            try {
              // Addressed by object id, not `<rev>:<path>` — a path is
              // user-supplied and an oid is not, and git has already told us
              // this oid exists.
              content = (
                await runGitBinary(['cat-file', 'blob', entry.objectId], {
                  ...git,
                  maxBufferBytes: limit + 1,
                })
              ).stdout;
            } catch (error) {
              return {
                ok: false,
                failure: {
                  path: ref.path,
                  reason: classifyReadFailure(error),
                  detail: error instanceof Error ? error.message : String(error),
                },
              };
            }

            const binary = looksBinary(content);
            const contentEncoding: ArtifactContentEncoding = binary ? 'base64' : 'utf-8';
            const fileHistory = history.get(entry.path);

            return {
              ok: true,
              artifact: {
                ...toRef(entry),
                sourceId: descriptor.id,
                locator: buildArtifactLocator(descriptor, entry.path),
                content: content.toString(binary ? 'base64' : 'utf8'),
                contentEncoding,
                // git's own blob object id — not a digest this connector
                // computed, so it matches what `git ls-tree`/`git cat-file`
                // report and is verifiable outside Phoenix.
                contentHash: { algorithm: 'git-blob-sha1', value: entry.objectId },
                revision: headRevision,
                capturedAt: new Date().toISOString(),
                ...(fileHistory === undefined
                  ? {}
                  : { attributes: { lastCommitRevision: fileHistory.revision } }),
              },
            };
          },

          async close(): Promise<void> {
            closed = true;
            await cleanup();
          },
        };
      } catch (error) {
        await cleanup();
        throw error;
      }
    },
  };
}
