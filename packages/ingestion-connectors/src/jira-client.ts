/**
 * P6-02 -- the hardened Jira REST API client layer, playing the same role
 * for the Jira connector that `git-command.ts` plays for the git one: every
 * HTTP call this package makes to Jira goes through here.
 *
 * The one place this deliberately diverges from `git-command.ts`'s stance is
 * authentication. ADR 0014 decision 4 established "Phoenix never handles a
 * credential" for git, because git has its own working authentication
 * mechanisms (a credential helper, an SSH agent) to delegate to. An HTTP API
 * has no equivalent running in this environment -- there is no "Jira
 * credential helper" -- so building the `Authorization` header is
 * unavoidably this connector's own job. `resolveAuthorization` is the one
 * function that does it, reading a token from `process.env` (never from a
 * value embedded in the descriptor itself -- `credential.ref` names the
 * variable, ADR 0013 decision 8) and only for `credential.scheme:
 * 'environment'`; `'secret-store'` is refused outright because no
 * secret-store backend is integrated anywhere in this repository yet. See
 * `docs/architecture/adr/0027-p6-02-jira-connector.md` decision 2.
 */

import type { CredentialReference } from './descriptor.js';

export const DEFAULT_JIRA_TIMEOUT_MS = 30_000;
/** 8 MiB. A single response larger than this is refused rather than kept in memory indefinitely. */
export const DEFAULT_JIRA_MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

export type JiraApiErrorReason = 'http-status' | 'network' | 'invalid-json' | 'too-large';

/**
 * A failed Jira API call. Carries a closed `reason` plus the HTTP status
 * (when there was a response at all) so `jira-connector.ts` can classify a
 * per-issue failure without pattern-matching a message string, the same
 * separation `GitCommandError` gives the git connector.
 */
export class JiraApiError extends Error {
  readonly reason: JiraApiErrorReason;
  readonly status: number | undefined;
  readonly url: string;
  readonly body: string | undefined;

  constructor(
    message: string,
    details: { reason: JiraApiErrorReason; url: string; status?: number; body?: string },
  ) {
    super(message);
    this.name = 'JiraApiError';
    this.reason = details.reason;
    this.url = details.url;
    this.status = details.status;
    this.body = details.body;
  }
}

/** The slice of the global `fetch` signature this client needs — narrow enough for a test to fake easily. */
export type JiraFetch = (input: string, init: RequestInit) => Promise<Response>;

export interface JiraClientOptions {
  baseUrl: string;
  credential?: CredentialReference;
  accountEmail?: string;
  fetchImpl?: JiraFetch;
  timeoutMs?: number;
  maxResponseBytes?: number;
}

/**
 * Builds the `Authorization` header value, or `undefined` for `scheme:
 * 'none'` (no header at all -- e.g. a Jira instance behind network-level
 * auth Phoenix does not need to add its own layer on top of). Basic auth
 * (`accountEmail` + token) is Jira Cloud's API-token scheme; a bearer token
 * with no paired email is Jira Server/Data Center's personal-access-token
 * scheme -- both are the SAME `credential.scheme: 'environment'` reference,
 * distinguished only by whether `ticketTracker.accountEmail` (not a secret)
 * is set.
 */
function resolveAuthorization(
  credential: CredentialReference | undefined,
  accountEmail: string | undefined,
): string | undefined {
  const scheme = credential?.scheme ?? 'none';
  if (scheme === 'none') return undefined;

  if (scheme === 'secret-store') {
    throw new Error(
      'jira: credential.scheme "secret-store" is not resolved by this connector — no secret-store ' +
        'backend is integrated yet; use scheme "environment" with an API-token/PAT environment variable',
    );
  }

  const ref = credential?.ref;
  if (ref === undefined) {
    throw new Error('jira: credential.ref is required when credential.scheme is "environment"');
  }
  const token = process.env[ref];
  if (token === undefined || token.length === 0) {
    throw new Error(
      `jira: environment variable ${JSON.stringify(ref)} named by credential.ref is not set`,
    );
  }

  return accountEmail === undefined
    ? `Bearer ${token}`
    : `Basic ${Buffer.from(`${accountEmail}:${token}`, 'utf8').toString('base64')}`;
}

async function boundedText(response: Response, maxBytes: number, url: string): Promise<string> {
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > maxBytes) {
    throw new JiraApiError(`jira: response from ${url} exceeded ${maxBytes} bytes`, {
      reason: 'too-large',
      url,
    });
  }
  return text;
}

/**
 * GETs one Jira REST API endpoint and returns the parsed JSON body.
 *
 * Throws `JiraApiError` for every failure mode: a non-2xx status
 * (`reason: 'http-status'`, with `status` set), a network/timeout failure
 * (`reason: 'network'`), an oversized response (`reason: 'too-large'`), or a
 * body that is not valid JSON (`reason: 'invalid-json'`) -- `open()` lets
 * this propagate as a source-level failure (ADR 0013 decision 7), while
 * `read()` classifies it into an `ArtifactFailureReason`.
 */
export async function jiraGet(
  path: string,
  query: Readonly<Record<string, string | undefined>>,
  options: JiraClientOptions,
): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const authorization = resolveAuthorization(options.credential, options.accountEmail);

  const url = new URL(`${options.baseUrl}${path}`);
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  const href = url.toString();

  const timeoutMs = options.timeoutMs ?? DEFAULT_JIRA_TIMEOUT_MS;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(href, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        ...(authorization === undefined ? {} : { Authorization: authorization }),
      },
      signal: controller.signal,
    });
  } catch (error) {
    throw new JiraApiError(
      `jira: request to ${url.pathname} failed: ${error instanceof Error ? error.message : String(error)}`,
      { reason: 'network', url: href },
    );
  } finally {
    clearTimeout(timer);
  }

  const maxBytes = options.maxResponseBytes ?? DEFAULT_JIRA_MAX_RESPONSE_BYTES;
  const body = await boundedText(response, maxBytes, href);

  if (!response.ok) {
    throw new JiraApiError(`jira: ${response.status} ${response.statusText} from ${url.pathname}`, {
      reason: 'http-status',
      status: response.status,
      url: href,
      body: body.slice(0, 2000),
    });
  }

  try {
    return JSON.parse(body) as unknown;
  } catch {
    throw new JiraApiError(`jira: response from ${url.pathname} was not valid JSON`, {
      reason: 'invalid-json',
      url: href,
      body: body.slice(0, 2000),
    });
  }
}
