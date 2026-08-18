/**
 * P3-02 -- the safe `git` invocation layer.
 *
 * Every git operation in this package goes through here, and nothing here
 * ever uses a shell. `spawn` with an explicit argv array means shell
 * metacharacters in a descriptor's locator, revision, or path are inert --
 * there is no shell to interpret them. That removes command injection, but
 * NOT *argument* injection, which is the real risk with git: a revision or
 * path beginning with `-` would be parsed as an option
 * (`--upload-pack=<command>` being the classic), so `assertSafeRevision`/
 * `assertSafePath`/`assertSafeRemote` reject those explicitly and every call
 * site passes `--` before user-supplied paths.
 *
 * See `docs/architecture/adr/0014-git-repository-connector.md` decision 2.
 */

import { spawn } from 'node:child_process';

/**
 * Config overrides applied to every invocation, at the highest precedence
 * `-c` gives them:
 *
 *  - `protocol.ext.allow=never` -- the `ext::` remote transport runs an
 *    arbitrary command as the transport. A descriptor's locator is
 *    caller-supplied, so this must be off.
 *  - `core.fsmonitor=false` -- a checkout Phoenix did not create can set
 *    `core.fsmonitor` to an executable in its own `.git/config`, which git
 *    would then run. Reading an untrusted working tree is exactly what this
 *    connector does.
 *  - `--no-optional-locks` -- every operation here is read-only; taking
 *    optional locks on someone else's checkout is impolite and can fail on a
 *    read-only mount.
 *
 * Deliberately NOT disabled: `credential.helper`. Authentication is git's
 * own job (helper, SSH agent, or a pre-authenticated checkout) — Phoenix
 * never handles the secret. See ADR 0014 decision 4.
 *
 * Hooks are not overridden because none of the commands used here run hooks,
 * and `clone` does not transfer hooks from a remote.
 */
export const GIT_HARDENING_ARGS: readonly string[] = [
  '-c',
  'protocol.ext.allow=never',
  '-c',
  'core.fsmonitor=false',
  '--no-optional-locks',
];

/**
 * `GIT_TERMINAL_PROMPT=0` is the important one: without it, a private
 * repository with no configured credential blocks forever on an interactive
 * username prompt instead of failing. `GIT_ASKPASS`/`SSH_ASKPASS` closed off
 * for the same reason (no GUI prompt), and `GIT_CONFIG_NOSYSTEM` so a
 * machine-level config cannot change behaviour under Phoenix's feet.
 */
const GIT_ENV: Readonly<Record<string, string>> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: '',
  SSH_ASKPASS: '',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_ADVICE: '0',
};

export const DEFAULT_GIT_TIMEOUT_MS = 60_000;
/** 64 MiB. A single artifact larger than this is refused rather than buffered. */
export const DEFAULT_GIT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

export interface GitCommandOptions {
  cwd?: string;
  timeoutMs?: number;
  maxBufferBytes?: number;
}

export interface GitCommandResult {
  stdout: string;
  stderr: string;
}

export interface GitBinaryCommandResult {
  stdout: Buffer;
  stderr: string;
}

/**
 * A failed git invocation. Carries the argv and stderr rather than only a
 * message, because callers classify failures by them — `read` turns a
 * missing blob into a `not-found` `ArtifactFailure`, while `open` lets a
 * clone failure propagate.
 */
export class GitCommandError extends Error {
  readonly args: readonly string[];
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stderr: string;

  constructor(
    message: string,
    details: {
      args: readonly string[];
      exitCode: number | null;
      signal: NodeJS.Signals | null;
      stderr: string;
    },
  ) {
    super(message);
    this.name = 'GitCommandError';
    this.args = details.args;
    this.exitCode = details.exitCode;
    this.signal = details.signal;
    this.stderr = details.stderr;
  }
}

/**
 * Revisions accepted by this connector: SHAs, branch/tag names, and the
 * usual `~`/`^`/`@{...}` navigation. Deliberately narrower than everything
 * `git rev-parse` would take — a leading `-` or an embedded space/NUL is
 * rejected outright rather than passed to git and hoped about.
 */
const SAFE_REVISION = /^[A-Za-z0-9][A-Za-z0-9._/~^@{}-]*$/;

export function assertSafeRevision(revision: string): void {
  if (!SAFE_REVISION.test(revision)) {
    throw new Error(
      `unsafe git revision ${JSON.stringify(revision)}: must start alphanumeric and contain only [A-Za-z0-9._/~^@{}-]`,
    );
  }
}

export function assertSafePath(path: string): void {
  if (path.length === 0) throw new Error('unsafe git path: must not be empty');
  if (path.startsWith('-')) {
    throw new Error(`unsafe git path ${JSON.stringify(path)}: must not start with "-"`);
  }
  if (path.includes('\0')) {
    throw new Error(`unsafe git path ${JSON.stringify(path)}: must not contain NUL`);
  }
  if (path.split(/[/\\]/).includes('..')) {
    throw new Error(`unsafe git path ${JSON.stringify(path)}: must not contain ".." segments`);
  }
}

/**
 * A remote or local path to clone from. `ext::` is refused here as well as by
 * `protocol.ext.allow=never`, so the rejection is visible in Phoenix's own
 * error rather than git's.
 */
export function assertSafeRemote(remote: string): void {
  if (remote.length === 0) throw new Error('unsafe git remote: must not be empty');
  if (remote.startsWith('-')) {
    throw new Error(`unsafe git remote ${JSON.stringify(remote)}: must not start with "-"`);
  }
  if (/^ext::/i.test(remote)) {
    throw new Error(
      `unsafe git remote ${JSON.stringify(remote)}: the ext:: transport executes arbitrary commands and is not allowed`,
    );
  }
  if (remote.includes('\0')) {
    throw new Error(`unsafe git remote ${JSON.stringify(remote)}: must not contain NUL`);
  }
}

function spawnGit(
  args: readonly string[],
  options: GitCommandOptions,
): Promise<GitBinaryCommandResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_GIT_TIMEOUT_MS;
  const maxBufferBytes = options.maxBufferBytes ?? DEFAULT_GIT_MAX_BUFFER_BYTES;
  const argv = [...GIT_HARDENING_ARGS, ...args];

  return new Promise((resolve, reject) => {
    const child = spawn('git', argv, {
      // No shell, ever — see the file header.
      shell: false,
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      env: { ...process.env, ...GIT_ENV },
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderr = '';
    let settled = false;

    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      child.kill('SIGKILL');
      reject(error);
    };

    const timer = setTimeout(() => {
      fail(
        new GitCommandError(`git ${args.join(' ')} timed out after ${timeoutMs}ms`, {
          args,
          exitCode: null,
          signal: 'SIGKILL',
          stderr,
        }),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdoutBytes += chunk.byteLength;
      if (stdoutBytes > maxBufferBytes) {
        fail(
          new GitCommandError(
            `git ${args.join(' ')} produced more than ${maxBufferBytes} bytes of output`,
            { args, exitCode: null, signal: 'SIGKILL', stderr },
          ),
        );
        return;
      }
      stdoutChunks.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      // Bounded: a pathological stderr must not be able to exhaust memory.
      if (stderr.length < 64 * 1024) stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      clearTimeout(timer);
      fail(
        new GitCommandError(`failed to run git (is it installed and on PATH?): ${error.message}`, {
          args,
          exitCode: null,
          signal: null,
          stderr,
        }),
      );
    });

    child.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      if (exitCode === 0) {
        resolve({ stdout: Buffer.concat(stdoutChunks), stderr });
        return;
      }
      reject(
        new GitCommandError(
          `git ${args.join(' ')} exited with ${exitCode ?? signal ?? 'unknown'}: ${stderr.trim()}`,
          { args, exitCode, signal, stderr },
        ),
      );
    });
  });
}

/** Runs git and decodes stdout as UTF-8. Throws `GitCommandError` on a non-zero exit. */
export async function runGit(
  args: readonly string[],
  options: GitCommandOptions = {},
): Promise<GitCommandResult> {
  const result = await spawnGit(args, options);
  return { stdout: result.stdout.toString('utf8'), stderr: result.stderr };
}

/**
 * Runs git and returns stdout as raw bytes. Required for `cat-file blob`:
 * decoding a binary artifact as UTF-8 would silently corrupt it, so the
 * caller decides text vs. base64 from the bytes themselves.
 */
export async function runGitBinary(
  args: readonly string[],
  options: GitCommandOptions = {},
): Promise<GitBinaryCommandResult> {
  return spawnGit(args, options);
}

/** The installed git version string, or throws if git is not usable. */
export async function gitVersion(options: GitCommandOptions = {}): Promise<string> {
  const { stdout } = await runGit(['--version'], { timeoutMs: 10_000, ...options });
  return stdout.trim();
}

/** Non-throwing availability probe, for `supports()`-style checks and clear error messages. */
export async function isGitAvailable(options: GitCommandOptions = {}): Promise<boolean> {
  try {
    await gitVersion(options);
    return true;
  } catch {
    return false;
  }
}
