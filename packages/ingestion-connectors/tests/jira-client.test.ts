import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_JIRA_MAX_RESPONSE_BYTES,
  JiraApiError,
  jiraGet,
  type JiraClientOptions,
} from '../src/jira-client.js';

const BASE_URL = 'https://acme.atlassian.net';
const ENV_VAR = 'PHOENIX_TEST_JIRA_TOKEN';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

afterEach(() => {
  delete process.env[ENV_VAR];
});

describe('jiraGet — request construction', () => {
  it('GETs the given path against baseUrl and returns the parsed JSON body', async () => {
    let capturedUrl: string | undefined;
    const fetchImpl = vi.fn(async (input: string) => {
      capturedUrl = input;
      return jsonResponse({ ok: true });
    });

    const result = await jiraGet('/rest/api/3/project/AUR', {}, { baseUrl: BASE_URL, fetchImpl });

    expect(result).toEqual({ ok: true });
    expect(capturedUrl).toBe('https://acme.atlassian.net/rest/api/3/project/AUR');
  });

  it('appends only the query params that are defined', async () => {
    let capturedUrl: string | undefined;
    const fetchImpl = vi.fn(async (input: string) => {
      capturedUrl = input;
      return jsonResponse({ issues: [], total: 0 });
    });

    await jiraGet(
      '/rest/api/3/search',
      { jql: 'project = AUR', startAt: '0', maxResults: undefined },
      { baseUrl: BASE_URL, fetchImpl },
    );

    const url = new URL(capturedUrl ?? '');
    expect(url.searchParams.get('jql')).toBe('project = AUR');
    expect(url.searchParams.get('startAt')).toBe('0');
    expect(url.searchParams.has('maxResults')).toBe(false);
  });

  it('sends an Accept: application/json header', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_input: string, init: RequestInit) => {
      capturedInit = init;
      return jsonResponse({});
    });

    await jiraGet('/rest/api/3/project/AUR', {}, { baseUrl: BASE_URL, fetchImpl });

    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('Accept')).toBe('application/json');
  });
});

describe('jiraGet — authorization (ADR 0027 decision 2)', () => {
  it('sends no Authorization header for credential.scheme "none" (the default)', async () => {
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_input: string, init: RequestInit) => {
      capturedInit = init;
      return jsonResponse({});
    });

    await jiraGet('/rest/api/3/project/AUR', {}, { baseUrl: BASE_URL, fetchImpl });

    const headers = new Headers(capturedInit?.headers);
    expect(headers.has('Authorization')).toBe(false);
  });

  it('builds a Bearer header from the env var named by credential.ref when no accountEmail is set', async () => {
    process.env[ENV_VAR] = 'pat-secret-value';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_input: string, init: RequestInit) => {
      capturedInit = init;
      return jsonResponse({});
    });

    const options: JiraClientOptions = {
      baseUrl: BASE_URL,
      credential: { scheme: 'environment', ref: ENV_VAR },
      fetchImpl,
    };
    await jiraGet('/rest/api/3/project/AUR', {}, options);

    const headers = new Headers(capturedInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer pat-secret-value');
  });

  it('builds a Basic header from accountEmail + the resolved token when accountEmail is set', async () => {
    process.env[ENV_VAR] = 'api-token-value';
    let capturedInit: RequestInit | undefined;
    const fetchImpl = vi.fn(async (_input: string, init: RequestInit) => {
      capturedInit = init;
      return jsonResponse({});
    });

    const options: JiraClientOptions = {
      baseUrl: BASE_URL,
      credential: { scheme: 'environment', ref: ENV_VAR },
      accountEmail: 'bot@acme.example',
      fetchImpl,
    };
    await jiraGet('/rest/api/3/project/AUR', {}, options);

    const headers = new Headers(capturedInit?.headers);
    const expected = `Basic ${Buffer.from('bot@acme.example:api-token-value', 'utf8').toString('base64')}`;
    expect(headers.get('Authorization')).toBe(expected);
  });

  it('throws when credential.scheme is "environment" but the named env var is unset', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const options: JiraClientOptions = {
      baseUrl: BASE_URL,
      credential: { scheme: 'environment', ref: ENV_VAR },
      fetchImpl,
    };
    await expect(jiraGet('/rest/api/3/project/AUR', {}, options)).rejects.toThrow(
      /environment variable "PHOENIX_TEST_JIRA_TOKEN".*is not set/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('throws for credential.scheme "secret-store" — no backend is integrated', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}));
    const options: JiraClientOptions = {
      baseUrl: BASE_URL,
      credential: { scheme: 'secret-store', ref: 'jira/api-token' },
      fetchImpl,
    };
    await expect(jiraGet('/rest/api/3/project/AUR', {}, options)).rejects.toThrow(
      /"secret-store" is not resolved by this connector/,
    );
  });

  it('never puts the resolved token in a thrown error message', async () => {
    process.env[ENV_VAR] = 'super-secret-value';
    const fetchImpl = vi.fn(async () => jsonResponse({}, 403));
    const options: JiraClientOptions = {
      baseUrl: BASE_URL,
      credential: { scheme: 'environment', ref: ENV_VAR },
      fetchImpl,
    };
    let caught: unknown;
    try {
      await jiraGet('/rest/api/3/project/AUR', {}, options);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiraApiError);
    expect(String(caught)).not.toContain('super-secret-value');
  });
});

describe('jiraGet — failure classification', () => {
  it('throws JiraApiError with reason "http-status" and the status code for a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errorMessages: ['no such project'] }, 404));
    let caught: unknown;
    try {
      await jiraGet('/rest/api/3/project/NOPE', {}, { baseUrl: BASE_URL, fetchImpl });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiraApiError);
    const error = caught as JiraApiError;
    expect(error.reason).toBe('http-status');
    expect(error.status).toBe(404);
  });

  it('throws JiraApiError with reason "invalid-json" for a non-JSON body', async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response('<html>not json</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    );
    let caught: unknown;
    try {
      await jiraGet('/rest/api/3/project/AUR', {}, { baseUrl: BASE_URL, fetchImpl });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiraApiError);
    expect((caught as JiraApiError).reason).toBe('invalid-json');
  });

  it('throws JiraApiError with reason "network" when fetch itself rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND acme.atlassian.net');
    });
    let caught: unknown;
    try {
      await jiraGet('/rest/api/3/project/AUR', {}, { baseUrl: BASE_URL, fetchImpl });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiraApiError);
    expect((caught as JiraApiError).reason).toBe('network');
  });

  it('throws JiraApiError with reason "too-large" when the response exceeds maxResponseBytes', async () => {
    const fetchImpl = vi.fn(async () => new Response('x'.repeat(100), { status: 200 }));
    let caught: unknown;
    try {
      await jiraGet(
        '/rest/api/3/project/AUR',
        {},
        { baseUrl: BASE_URL, fetchImpl, maxResponseBytes: 10 },
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(JiraApiError);
    expect((caught as JiraApiError).reason).toBe('too-large');
  });

  it('defaults maxResponseBytes to DEFAULT_JIRA_MAX_RESPONSE_BYTES', () => {
    expect(DEFAULT_JIRA_MAX_RESPONSE_BYTES).toBe(8 * 1024 * 1024);
  });
});
