import { describe, expect, it } from 'vitest';
import {
  assertSafePath,
  assertSafeRemote,
  assertSafeRevision,
  GIT_HARDENING_ARGS,
  GitCommandError,
  gitVersion,
  isGitAvailable,
  runGit,
  runGitBinary,
} from '../src/git-command.js';

// These run against the real `git` binary — P3-02's whole premise (ADR 0014
// decision 1) is that git itself is the implementation, so mocking it here
// would test nothing.

describe('git availability', () => {
  it('reports the installed version', async () => {
    await expect(gitVersion()).resolves.toMatch(/^git version \d+\.\d+/);
  });

  it('probes availability without throwing', async () => {
    await expect(isGitAvailable()).resolves.toBe(true);
  });
});

describe('hardening', () => {
  it('blocks the ext:: transport and repo-supplied fsmonitor on every invocation', () => {
    expect(GIT_HARDENING_ARGS).toEqual([
      '-c',
      'protocol.ext.allow=never',
      '-c',
      'core.fsmonitor=false',
      '--no-optional-locks',
    ]);
  });

  it("does not disable credential.helper — authentication is git's job, not Phoenix's", () => {
    expect(GIT_HARDENING_ARGS.join(' ')).not.toContain('credential');
  });
});

describe('argument-injection guards', () => {
  it('accepts real revisions', () => {
    for (const revision of [
      'HEAD',
      'main',
      'v1.0.0',
      'HEAD~2',
      'HEAD^{commit}',
      'a1b2c3d4',
      'main@{u}',
    ]) {
      expect(() => assertSafeRevision(revision)).not.toThrow();
    }
  });

  it('rejects an option-shaped revision', () => {
    // The classic: git would read this as an option, not a revision.
    expect(() => assertSafeRevision('--upload-pack=touch /tmp/pwned')).toThrow(
      /unsafe git revision/,
    );
    expect(() => assertSafeRevision('-v')).toThrow(/unsafe git revision/);
  });

  it('rejects shell metacharacters in a revision even though no shell is used', () => {
    expect(() => assertSafeRevision('main; rm -rf /')).toThrow(/unsafe git revision/);
    expect(() => assertSafeRevision('main$(id)')).toThrow(/unsafe git revision/);
    expect(() => assertSafeRevision('main`id`')).toThrow(/unsafe git revision/);
  });

  it('rejects option-shaped, traversing, and NUL-bearing paths', () => {
    expect(() => assertSafePath('--output=/etc/passwd')).toThrow(/must not start with "-"/);
    expect(() => assertSafePath('src/../../etc/passwd')).toThrow(/".." segments/);
    expect(() => assertSafePath('src/Main.java\0')).toThrow(/NUL/);
    expect(() => assertSafePath('')).toThrow(/must not be empty/);
  });

  it('accepts ordinary and absolute paths', () => {
    expect(() => assertSafePath('src/main/java/com/aurora/Checkout.java')).not.toThrow();
    expect(() => assertSafePath('D:/repos/aurora')).not.toThrow();
    expect(() => assertSafePath('/home/ci/aurora')).not.toThrow();
  });

  it("rejects the ext:: transport by name, so the error is Phoenix's and not git's", () => {
    expect(() => assertSafeRemote('ext::sh -c "id >&2"')).toThrow(/executes arbitrary commands/);
    expect(() => assertSafeRemote('EXT::sh -c id')).toThrow(/executes arbitrary commands/);
  });

  it('accepts real remotes', () => {
    for (const remote of [
      'https://github.com/example/aurora.git',
      'ssh://git@github.com/example/aurora.git',
      'git@github.com:example/aurora.git',
      '/srv/git/aurora.git',
    ]) {
      expect(() => assertSafeRemote(remote)).not.toThrow();
    }
  });
});

describe('runGit', () => {
  it('returns decoded stdout', async () => {
    const { stdout } = await runGit(['--version']);
    expect(stdout).toContain('git version');
  });

  it('throws a GitCommandError carrying argv, exit code, and stderr', async () => {
    // Not a repository, so this fails wherever the test runs from.
    const error = await runGit(['rev-parse', '--verify', 'refs/heads/definitely-not-a-ref'], {
      cwd: process.platform === 'win32' ? 'C:\\' : '/',
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitCommandError);
    if (!(error instanceof GitCommandError)) return;
    expect(error.exitCode).not.toBe(0);
    expect(error.args).toEqual(['rev-parse', '--verify', 'refs/heads/definitely-not-a-ref']);
    expect(error.stderr.length).toBeGreaterThan(0);
  });

  it('runGitBinary returns raw bytes, not a lossy UTF-8 decode', async () => {
    const { stdout } = await runGitBinary(['--version']);
    expect(Buffer.isBuffer(stdout)).toBe(true);
  });

  it('enforces a stdout ceiling rather than buffering without limit', async () => {
    await expect(runGit(['--version'], { maxBufferBytes: 1 })).rejects.toThrow(/more than 1 bytes/);
  });

  it('times out instead of hanging', async () => {
    // 1ms is unmeetable even for `git --version`, which is the point: the
    // timeout path is real, not decorative.
    await expect(runGit(['--version'], { timeoutMs: 1 })).rejects.toThrow(/timed out after 1ms/);
  });
});
