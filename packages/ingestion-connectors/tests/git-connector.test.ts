import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  validateCanonicalKnowledgeBundle,
  validateOkfDocument,
  validateSource,
  validateSourceReferences,
  serializeOkfYaml,
  parseAndValidateOkfYaml,
  toOkfDocument,
  CANONICAL_SCHEMA_VERSION,
  type CanonicalKnowledgeBundle,
  type ContainerObject,
} from '@phoenix-ai/knowledge-graph';
import {
  createGitRepositoryConnector,
  GIT_CONNECTOR_ID,
  type GitRepositoryMetadata,
} from '../src/git-connector.js';
import { collectArtifacts, withConnectorSession, type ConnectorSession } from '../src/connector.js';
import { artifactToEvidence, validateRawArtifact } from '../src/artifact.js';
import type { SourceRepositoryDescriptor } from '../src/descriptor.js';

// A real git repository, built here rather than mocked: P3-02's premise is
// that git is the implementation (ADR 0014 decision 1), so a fake git would
// prove nothing. The fixture is deliberately Java-shaped, since P3-03 onward
// targets Java — the same tree those tickets will parse.

const FIRST_COMMIT_DATE = '2026-06-01T09:15:00+00:00';
const SECOND_COMMIT_DATE = '2026-08-10T09:15:00+00:00';

const POM_CONTENT = '<project><artifactId>checkout</artifactId></project>\n';

let repoRoot: string;
let firstRevision: string;
let secondRevision: string;

/**
 * Compares timestamps as INSTANTS, not strings. git renders `%cI` with a `Z`
 * suffix for a zero UTC offset from 2.42 onward and `+00:00` before it, so
 * asserting the exact text would pin this suite to a git version while
 * proving nothing extra — `ArtifactFilter.changedSince` compares with
 * `Date.parse` too.
 */
function expectSameInstant(actual: string | undefined, expected: string): void {
  expect(actual).toBeTypeOf('string');
  expect(Date.parse(actual as string)).toBe(Date.parse(expected));
}

function git(args: readonly string[], cwd: string, date?: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Phoenix Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Phoenix Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
      ...(date === undefined ? {} : { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }),
    },
  });
}

function write(relativePath: string, content: string | Buffer): void {
  const absolute = join(repoRoot, relativePath);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content);
}

/** A `file://` locator for a local path — the descriptor contract requires `<scheme>://<rest>`. */
function fileLocator(path: string): string {
  return `file://${path.replace(/\\/g, '/')}`;
}

function descriptor(
  overrides: Partial<SourceRepositoryDescriptor> = {},
): SourceRepositoryDescriptor {
  return {
    id: 'repo://aurora-commerce/services/checkout',
    sourceType: 'source-code',
    label: 'aurora-commerce/services/checkout',
    locator: fileLocator(repoRoot),
    repository: { kind: 'local-directory' },
    ...overrides,
  };
}

async function paths(session: ConnectorSession, filter?: Parameters<ConnectorSession['list']>[0]) {
  const listed: string[] = [];
  for await (const ref of session.list(filter)) listed.push(ref.path);
  return listed.sort();
}

beforeAll(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'phoenix-git-fixture-'));

  git(['init', '-b', 'main'], repoRoot);
  git(['config', 'user.name', 'Phoenix Test'], repoRoot);
  git(['config', 'user.email', 'test@example.invalid'], repoRoot);

  write('pom.xml', POM_CONTENT);
  write('README.md', '# Checkout Service\n');
  write(
    'src/main/java/com/aurora/checkout/CheckoutController.java',
    'package com.aurora.checkout;\n\npublic class CheckoutController { }\n',
  );
  write(
    'src/main/java/com/aurora/checkout/PaymentClient.java',
    'package com.aurora.checkout;\n\npublic class PaymentClient { }\n',
  );
  git(['add', '--all'], repoRoot);
  git(['commit', '-m', 'Initial checkout service'], repoRoot, FIRST_COMMIT_DATE);
  firstRevision = git(['rev-parse', 'HEAD'], repoRoot).trim();

  write(
    'src/main/java/com/aurora/checkout/CheckoutController.java',
    'package com.aurora.checkout;\n\npublic class CheckoutController {\n  void placeOrder() { }\n}\n',
  );
  write('src/main/resources/application.yml', 'server:\n  port: 8080\n');
  write('node_modules/left-pad/index.js', 'module.exports = () => {};\n');
  // Real binary content: a NUL byte in the first 8000 is exactly git's own
  // binary heuristic, which the connector reuses.
  write('target/checkout.jar', Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01, 0x02]));
  git(['add', '--all'], repoRoot);
  git(['commit', '-m', 'Add order placement and packaging'], repoRoot, SECOND_COMMIT_DATE);
  git(['tag', 'v1.0.0'], repoRoot);
  secondRevision = git(['rev-parse', 'HEAD'], repoRoot).trim();

  // Uncommitted and untracked content, to prove the connector reads the TREE
  // at a revision and not the working directory.
  write('README.md', '# Checkout Service (uncommitted edit)\n');
  write('scratch.txt', 'untracked\n');
});

afterAll(() => {
  if (repoRoot !== undefined) rmSync(repoRoot, { recursive: true, force: true });
});

describe('supports', () => {
  const connector = createGitRepositoryConnector();

  it('accepts a git and a local-directory descriptor', () => {
    expect(connector.supports(descriptor())).toBe(true);
    expect(connector.supports(descriptor({ repository: { kind: 'git' } }))).toBe(true);
  });

  it('declines an archive descriptor, leaving it for a future connector', () => {
    expect(connector.supports(descriptor({ repository: { kind: 'archive' } }))).toBe(false);
  });

  it('serves several source types, because a repository can be any of them', () => {
    expect(connector.sourceTypes).toContain('source-code');
    expect(connector.sourceTypes).toContain('technical-doc');
    expect(connector.sourceTypes).toContain('data-model');
    expect(connector.supports(descriptor({ sourceType: 'technical-doc' }))).toBe(true);
  });

  it('declines a source type no repository produces', () => {
    expect(connector.supports(descriptor({ sourceType: 'recording' }))).toBe(false);
  });

  it('declines a structurally invalid descriptor', () => {
    expect(connector.supports({ ...descriptor(), locator: 'not-a-locator' })).toBe(false);
  });
});

describe('repository metadata', () => {
  it('reports what git actually says about the repository', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    const metadata = session.sourceMetadata as GitRepositoryMetadata;

    expect(metadata.headRevision).toBe(secondRevision);
    expect(metadata.headRevision).toMatch(/^[0-9a-f]{40}$/);
    expect(secondRevision.startsWith(metadata.shortRevision)).toBe(true);
    expectSameInstant(metadata.committedAt, SECOND_COMMIT_DATE);
    expect(metadata.commitSubject).toBe('Add order placement and packaging');
    expect(metadata.tagsAtHead).toEqual(['v1.0.0']);
    expect(metadata.shallow).toBe(false);
    // The 7 committed files — the uncommitted README edit and untracked
    // scratch.txt are not among them, which is the point of reading the tree.
    expect(metadata.trackedFileCount).toBe(7);
    expect(metadata.trackedFileCount).toBe((await paths(session)).length);
    await session.close();
  });

  it('omits author identity by default — it is personal data upstream of redaction', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    expect(session.sourceMetadata).not.toHaveProperty('commitAuthor');
    await session.close();
  });

  it('includes author identity only on explicit opt-in', async () => {
    const session = await createGitRepositoryConnector({ includeAuthorMetadata: true }).open(
      descriptor(),
    );
    expect(session.sourceMetadata?.commitAuthor).toBe('Phoenix Test <test@example.invalid>');
    await session.close();
  });

  it('records the ref the descriptor asked for, separately from what it resolved to', async () => {
    const session = await createGitRepositoryConnector().open(
      descriptor({ repository: { kind: 'local-directory', revision: 'v1.0.0' } }),
    );
    expect(session.sourceMetadata?.requestedRef).toBe('v1.0.0');
    expect(session.revision).toBe(secondRevision);
    await session.close();
  });

  it('omits remoteUrl and defaultBranch for a repository that has neither', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    expect(session.sourceMetadata).not.toHaveProperty('remoteUrl');
    expect(session.sourceMetadata).not.toHaveProperty('defaultBranch');
    await session.close();
  });
});

describe('revisions', () => {
  it('resolves a branch to an immutable SHA and records it as Source.version', async () => {
    const session = await createGitRepositoryConnector().open(
      descriptor({ repository: { kind: 'local-directory', branch: 'main' } }),
    );
    expect(session.revision).toBe(secondRevision);
    expect(session.source.version).toBe(secondRevision);
    expect(validateSource(session.source)).toEqual({ valid: true, errors: [] });
    await session.close();
  });

  it('resolves a tag to the same SHA the branch points at', async () => {
    const session = await createGitRepositoryConnector().open(
      descriptor({ repository: { kind: 'local-directory', revision: 'v1.0.0' } }),
    );
    expect(session.revision).toBe(secondRevision);
    await session.close();
  });

  it('reads an older revision as it was, not as HEAD is', async () => {
    const session = await createGitRepositoryConnector().open(
      descriptor({ repository: { kind: 'local-directory', revision: firstRevision } }),
    );
    expect(session.revision).toBe(firstRevision);
    // The four files of the first commit, and none of the second's.
    expect(await paths(session)).toEqual([
      'README.md',
      'pom.xml',
      'src/main/java/com/aurora/checkout/CheckoutController.java',
      'src/main/java/com/aurora/checkout/PaymentClient.java',
    ]);

    const result = await session.read({
      path: 'src/main/java/com/aurora/checkout/CheckoutController.java',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // `placeOrder` only exists in the second commit.
    expect(result.artifact.content).not.toContain('placeOrder');
    await session.close();
  });

  it('rejects an unknown revision at open, not silently falling back to HEAD', async () => {
    await expect(
      createGitRepositoryConnector().open(
        descriptor({ repository: { kind: 'local-directory', revision: 'no-such-ref' } }),
      ),
    ).rejects.toThrow();
  });

  it('rejects an option-shaped revision before git ever sees it', async () => {
    await expect(
      createGitRepositoryConnector().open(
        descriptor({
          repository: { kind: 'local-directory', revision: '--upload-pack=touch /tmp/pwned' },
        }),
      ),
    ).rejects.toThrow(/unsafe git revision/);
  });
});

describe('source files', () => {
  it('lists the tracked tree at the revision', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    expect(await paths(session)).toEqual([
      'README.md',
      'node_modules/left-pad/index.js',
      'pom.xml',
      'src/main/java/com/aurora/checkout/CheckoutController.java',
      'src/main/java/com/aurora/checkout/PaymentClient.java',
      'src/main/resources/application.yml',
      'target/checkout.jar',
    ]);
    await session.close();
  });

  it('ignores uncommitted edits and untracked files by construction', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    expect(await paths(session)).not.toContain('scratch.txt');

    const result = await session.read({ path: 'README.md' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.content).toBe('# Checkout Service\n');
    expect(result.artifact.content).not.toContain('uncommitted');
    await session.close();
  });

  it('produces a RawArtifact that passes the real validator', async () => {
    // `workingTreePath` keeps the locator a stable identifier while git reads
    // the temp checkout, which is what makes the expected locator below
    // machine-independent — see the descriptor field's doc comment.
    const session = await createGitRepositoryConnector().open(
      descriptor({
        locator: 'repo://aurora-commerce/services/checkout',
        repository: { kind: 'local-directory', workingTreePath: repoRoot },
      }),
    );
    const result = await session.read({
      path: 'src/main/java/com/aurora/checkout/CheckoutController.java',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(validateRawArtifact(result.artifact)).toEqual({ valid: true, errors: [] });
    expect(result.artifact).toMatchObject({
      sourceId: 'repo://aurora-commerce/services/checkout',
      locator:
        'repo://aurora-commerce/services/checkout/src/main/java/com/aurora/checkout/CheckoutController.java',
      contentEncoding: 'utf-8',
      revision: secondRevision,
    });
    expect(result.artifact.content).toContain('class CheckoutController');
    await session.close();
  });

  it("reports git's own blob object id as the content hash, verifiable outside Phoenix", async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    const result = await session.read({ path: 'pom.xml' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const expectedOid = git(['rev-parse', `${secondRevision}:pom.xml`], repoRoot).trim();
    expect(result.artifact.contentHash).toEqual({
      algorithm: 'git-blob-sha1',
      value: expectedOid,
    });
    await session.close();
  });

  it('base64-encodes a binary artifact instead of corrupting it', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    const result = await session.read({ path: 'target/checkout.jar' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.artifact.contentEncoding).toBe('base64');
    expect([...Buffer.from(result.artifact.content, 'base64')]).toEqual([
      0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0x01, 0x02,
    ]);
    await session.close();
  });

  it('reports each artifact size before it is read, so a caller can skip it', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    for await (const ref of session.list({ includePaths: ['pom.xml'] })) {
      // Derived from the fixture content rather than written out, so the
      // assertion cannot drift from (or miscount) what was committed.
      expect(ref.sizeBytes).toBe(Buffer.byteLength(POM_CONTENT));
    }
    await session.close();
  });
});

describe('file history', () => {
  it('dates each artifact from the last commit that touched it', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    const dates = new Map<string, string | undefined>();
    for await (const ref of session.list()) dates.set(ref.path, ref.lastModifiedAt);

    // Touched only in the first commit.
    expectSameInstant(
      dates.get('src/main/java/com/aurora/checkout/PaymentClient.java'),
      FIRST_COMMIT_DATE,
    );
    // Modified in the second.
    expectSameInstant(
      dates.get('src/main/java/com/aurora/checkout/CheckoutController.java'),
      SECOND_COMMIT_DATE,
    );
    await session.close();
  });

  it('records the last commit that touched each artifact', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    const result = await session.read({
      path: 'src/main/java/com/aurora/checkout/PaymentClient.java',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.attributes?.lastCommitRevision).toBe(firstRevision);
    await session.close();
  });

  it('supports an incremental scan via changedSince', async () => {
    const session = await createGitRepositoryConnector().open(
      descriptor({ filter: { changedSince: '2026-07-01T00:00:00.000Z' } }),
    );
    expect(await paths(session)).toEqual([
      'node_modules/left-pad/index.js',
      'src/main/java/com/aurora/checkout/CheckoutController.java',
      'src/main/resources/application.yml',
      'target/checkout.jar',
    ]);
    await session.close();
  });

  it('leaves lastModifiedAt unset when history is switched off', async () => {
    const session = await createGitRepositoryConnector({ includeFileHistory: false }).open(
      descriptor(),
    );
    for await (const ref of session.list()) expect(ref.lastModifiedAt).toBeUndefined();
    await session.close();
  });
});

describe('filtering', () => {
  it('pushes subpaths down to git as a pathspec', async () => {
    const session = await createGitRepositoryConnector().open(
      descriptor({ repository: { kind: 'local-directory', subpaths: ['src/main/java'] } }),
    );
    expect(await paths(session)).toEqual([
      'src/main/java/com/aurora/checkout/CheckoutController.java',
      'src/main/java/com/aurora/checkout/PaymentClient.java',
    ]);
    // The pathspec really narrowed the tree, so metadata reflects it too.
    expect(session.sourceMetadata?.trackedFileCount).toBe(2);
    await session.close();
  });

  it('applies the descriptor filter with the shared semantics', async () => {
    const session = await createGitRepositoryConnector().open(
      descriptor({
        filter: { includePaths: ['**/*.java'], excludePaths: ['node_modules', 'target'] },
      }),
    );
    expect(await paths(session)).toEqual([
      'src/main/java/com/aurora/checkout/CheckoutController.java',
      'src/main/java/com/aurora/checkout/PaymentClient.java',
    ]);
    await session.close();
  });

  it('excludes build output with a bare directory name', async () => {
    const session = await createGitRepositoryConnector().open(
      descriptor({ filter: { excludePaths: ['target', 'node_modules'] } }),
    );
    expect(await paths(session)).not.toContain('target/checkout.jar');
    await session.close();
  });
});

describe('failures', () => {
  it('reports not-found rather than throwing for a path not in the tree', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    expect(await session.read({ path: 'src/main/java/com/aurora/Missing.java' })).toEqual({
      ok: false,
      failure: { path: 'src/main/java/com/aurora/Missing.java', reason: 'not-found' },
    });
    await session.close();
  });

  it('refuses an over-large artifact instead of buffering it', async () => {
    const session = await createGitRepositoryConnector({ maxArtifactBytes: 8 }).open(descriptor());
    const result = await session.read({ path: 'pom.xml' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('too-large');
    expect(result.failure.detail).toContain('exceeds');
    await session.close();
  });

  it('rejects a directory that does not exist', async () => {
    await expect(
      createGitRepositoryConnector().open(
        descriptor({ locator: fileLocator(join(repoRoot, 'no-such-dir')) }),
      ),
    ).rejects.toThrow(/is not an existing directory/);
  });

  it("refuses to resolve a credential itself, pointing at git's own auth", async () => {
    await expect(
      createGitRepositoryConnector().open(
        descriptor({ credential: { scheme: 'environment', ref: 'AURORA_REPO_TOKEN' } }),
      ),
    ).rejects.toThrow(/authenticate git itself/);
  });

  it('rejects the archive kind with a specific message', async () => {
    await expect(
      createGitRepositoryConnector().open(descriptor({ repository: { kind: 'archive' } })),
    ).rejects.toThrow(/"archive" is not supported/);
  });
});

describe('identity vs. location', () => {
  it('keeps machine-local paths out of artifact locators when workingTreePath is used', async () => {
    const session = await createGitRepositoryConnector().open(
      descriptor({
        locator: 'repo://aurora-commerce/services/checkout',
        repository: { kind: 'local-directory', workingTreePath: repoRoot },
      }),
    );

    // The identity a consumer sees is the stable one, in Source...
    expect(session.source.locator).toBe('repo://aurora-commerce/services/checkout');
    const result = await session.read({ path: 'pom.xml' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // ...and on the artifact, which becomes Evidence.locator in OKF output.
    expect(result.artifact.locator).toBe('repo://aurora-commerce/services/checkout/pom.xml');
    expect(result.artifact.locator).not.toContain(repoRoot.replace(/\\/g, '/'));
    await session.close();
  });

  it('refuses a repo:// locator with no workingTreePath instead of guessing a path', async () => {
    await expect(
      createGitRepositoryConnector().open(
        descriptor({ locator: 'repo://aurora-commerce/services/checkout' }),
      ),
    ).rejects.toThrow(/is a Phoenix identifier, not a git location/);
  });

  it('refuses workingTreePath on a remote clone, where a git URL is required', async () => {
    await expect(
      createGitRepositoryConnector().open(
        descriptor({ repository: { kind: 'git', workingTreePath: repoRoot } }),
      ),
    ).rejects.toThrow(/only valid with kind "local-directory"/);
  });
});

describe('lifecycle', () => {
  it('close is idempotent and blocks further use', async () => {
    const session = await createGitRepositoryConnector().open(descriptor());
    await session.close();
    await expect(session.close()).resolves.toBeUndefined();
    expect(() => session.list()).toThrow(/session is closed/);
    await expect(session.read({ path: 'pom.xml' })).rejects.toThrow(/session is closed/);
  });

  it('clones a repository and removes the temporary checkout on close', async () => {
    // `kind: 'git'` against a local path exercises the real clone path with no
    // network dependency.
    const collection = await withConnectorSession(
      createGitRepositoryConnector(),
      descriptor({ repository: { kind: 'git', branch: 'main' } }),
      (session) => collectArtifacts(session, { includePaths: ['pom.xml'] }),
    );
    expect(collection.artifacts.map((artifact) => artifact.path)).toEqual(['pom.xml']);
    expect(collection.failures).toEqual([]);
  });

  it('reports a shallow clone as shallow, so history-based analysis cannot assume otherwise', async () => {
    // Depends on the connector passing the `file://` locator through to git
    // rather than reducing it to a bare path: git ignores `--depth` for a
    // local-path clone (`warning: --depth is ignored in local clones`), so a
    // rewritten URL would silently produce a FULL clone here.
    const session = await createGitRepositoryConnector({ cloneDepth: 1 }).open(
      descriptor({ repository: { kind: 'git', branch: 'main' } }),
    );
    expect(session.sourceMetadata?.shallow).toBe(true);
    await session.close();
  });

  it('a full clone is not reported as shallow', async () => {
    const session = await createGitRepositoryConnector({ cloneDepth: 0 }).open(
      descriptor({ repository: { kind: 'git', branch: 'main' } }),
    );
    expect(session.sourceMetadata?.shallow).toBe(false);
    await session.close();
  });
});

describe('end to end — a real repository into a valid OKF document', () => {
  it('ingests, bridges to Source/Evidence, and validates as OKF', async () => {
    const target = descriptor({
      filter: { includePaths: ['**/*.java'], excludePaths: ['node_modules', 'target'] },
    });
    const connector = createGitRepositoryConnector();
    const session = await connector.open(target);
    const collection = await collectArtifacts(session);
    const capturedRevision = session.revision;
    const source = session.source;
    await session.close();

    expect(collection.artifacts).toHaveLength(2);
    expect(collection.failures).toEqual([]);
    expect(capturedRevision).toBe(secondRevision);

    const container: ContainerObject = {
      identity: {
        id: 'ctr-checkout',
        systemId: 'aurora-commerce',
        createdAt: '2026-08-18T00:00:00.000Z',
        updatedAt: '2026-08-18T00:00:00.000Z',
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      },
      category: 'entity',
      kind: 'architecture.container',
      label: 'Checkout Service',
      attributes: { responsibility: 'Orchestrates cart validation and order creation.' },
      metadata: {
        provenance: [
          {
            sourceId: source.id,
            sourceType: target.sourceType,
            derivedBy: GIT_CONNECTOR_ID,
            derivedAt: '2026-08-18T00:00:00.000Z',
          },
        ],
        confidence: { level: 'high', score: 0.9 },
      },
      evidence: collection.artifacts.map((artifact, index) =>
        artifactToEvidence(artifact, { id: `ev-checkout-${index}` }),
      ),
      confidenceDetail: { basis: 'observed' },
    };

    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-18T00:00:00.000Z',
      sources: [source],
      objects: [container],
      relationships: [],
    };

    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });

    const document = toOkfDocument(bundle);
    expect(validateOkfDocument(document)).toEqual({ valid: true, errors: [] });
    expect(parseAndValidateOkfYaml(serializeOkfYaml(document))).toEqual({
      valid: true,
      errors: [],
    });

    // The real git SHA is what every piece of evidence is pinned to — the
    // whole point of resolving the revision once at open.
    for (const evidence of container.evidence) {
      expect(evidence.sourceVersion).toBe(secondRevision);
    }
  });
});
