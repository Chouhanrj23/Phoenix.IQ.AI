import { afterEach, describe, expect, it } from 'vitest';
import { validateSourceReferences } from '@phoenix-ai/knowledge-graph';
import { validateSourceConnector } from '../src/connector.js';
import { validateRawArtifact } from '../src/artifact.js';
import { artifactToEvidence } from '../src/artifact.js';
import { createJiraConnector, JIRA_CONNECTOR_ID } from '../src/jira-connector.js';
import type { JiraFetch } from '../src/jira-client.js';
import type { SourceTicketTrackerDescriptor } from '../src/descriptor.js';

// A continuation of this repo's own Aurora e-commerce fixture world (see
// packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml) into
// Jira, illustrative rather than drawn from a real Jira tenant — the same
// status descriptor.test.ts already gives its `docs://confluence/...` fixture.

const BASE_URL = 'https://acme.atlassian.net';
const ENV_VAR = 'PHOENIX_TEST_JIRA_TOKEN';
const CAPTURED_AT = '2026-09-08T00:00:00.000Z';

const PROJECT = { key: 'AUR', id: '10000', name: 'Aurora Commerce' };

const REFUND_DESCRIPTION_ADF = {
  type: 'doc',
  content: [
    {
      type: 'paragraph',
      content: [{ type: 'text', text: 'Customers cannot request a partial refund.' }],
    },
  ],
};

const SEARCH_RESULTS = [
  {
    key: 'AUR-101',
    fields: {
      summary: 'Support partial refunds',
      issuetype: { name: 'Story' },
      status: { name: 'In Progress' },
      updated: '2026-09-01T10:00:00.000+0000',
    },
  },
  {
    key: 'AUR-102',
    fields: {
      summary: 'Refund exceeds order total',
      issuetype: { name: 'Bug' },
      status: { name: 'Done' },
      updated: '2026-08-15T09:00:00.000+0000',
    },
  },
];

const ISSUES: Record<string, unknown> = {
  'AUR-101': {
    key: 'AUR-101',
    fields: {
      summary: 'Support partial refunds',
      description: REFUND_DESCRIPTION_ADF,
      issuetype: { name: 'Story' },
      status: { name: 'In Progress' },
      priority: { name: 'High' },
      labels: ['checkout', 'payments'],
      created: '2026-08-01T08:00:00.000+0000',
      updated: '2026-09-01T10:00:00.000+0000',
      parent: { key: 'AUR-100' },
      issuelinks: [
        {
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          outwardIssue: { key: 'AUR-102' },
        },
      ],
      assignee: { displayName: 'Priya Shah', accountId: 'acc-1' },
      reporter: { displayName: 'Sam Lee', accountId: 'acc-2' },
    },
  },
  'AUR-102': {
    key: 'AUR-102',
    fields: {
      summary: 'Refund exceeds order total',
      description: 'Plain-text description from an older Jira Server API.',
      issuetype: { name: 'Bug' },
      status: { name: 'Done' },
      labels: [],
      created: '2026-07-01T08:00:00.000+0000',
      updated: '2026-08-15T09:00:00.000+0000',
      issuelinks: [],
    },
  },
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function createFakeJiraFetch(): { fetchImpl: JiraFetch; calls: string[] } {
  const calls: string[] = [];
  const fetchImpl: JiraFetch = async (input) => {
    calls.push(input);
    const url = new URL(input);

    if (url.pathname.startsWith('/rest/api/3/project/')) {
      const key = decodeURIComponent(url.pathname.slice('/rest/api/3/project/'.length));
      if (key !== PROJECT.key) return jsonResponse({ errorMessages: ['no such project'] }, 404);
      return jsonResponse({ id: PROJECT.id, key: PROJECT.key, name: PROJECT.name });
    }

    if (url.pathname === '/rest/api/3/search') {
      const startAt = Number(url.searchParams.get('startAt') ?? '0');
      const maxResults = Number(url.searchParams.get('maxResults') ?? '50');
      const page = SEARCH_RESULTS.slice(startAt, startAt + maxResults);
      return jsonResponse({ issues: page, total: SEARCH_RESULTS.length, startAt, maxResults });
    }

    if (url.pathname.startsWith('/rest/api/3/issue/')) {
      const key = decodeURIComponent(url.pathname.slice('/rest/api/3/issue/'.length));
      const issue = ISSUES[key];
      if (issue === undefined) return jsonResponse({ errorMessages: ['issue not found'] }, 404);
      return jsonResponse(issue);
    }

    return jsonResponse({ errorMessages: ['unknown endpoint'] }, 404);
  };
  return { fetchImpl, calls };
}

function descriptor(
  overrides: Partial<SourceTicketTrackerDescriptor> = {},
): SourceTicketTrackerDescriptor {
  return {
    id: 'ticket://acme-jira/AUR',
    sourceType: 'ticket',
    label: 'Jira: Aurora Commerce (AUR)',
    locator: 'ticket://acme-jira/AUR',
    ticketTracker: { kind: 'jira', baseUrl: BASE_URL, projectKeys: ['AUR'] },
    ...overrides,
  };
}

afterEach(() => {
  delete process.env[ENV_VAR];
});

describe('createJiraConnector — shape', () => {
  it('satisfies the runtime contract check', () => {
    const { fetchImpl } = createFakeJiraFetch();
    expect(validateSourceConnector(createJiraConnector({ fetchImpl }))).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('declares capabilities honestly: no revision pinning, no pushed-down path filtering', () => {
    expect(createJiraConnector().capabilities).toEqual({
      revisionPinning: false,
      incrementalScan: true,
      subtreeFiltering: false,
      contentHashing: true,
      binaryContent: false,
    });
  });

  it('id is "jira"', () => {
    expect(createJiraConnector().id).toBe(JIRA_CONNECTOR_ID);
  });
});

describe('createJiraConnector — supports', () => {
  it('supports a jira ticketTracker descriptor with sourceType "ticket"', () => {
    expect(createJiraConnector().supports(descriptor())).toBe(true);
  });

  it('rejects a non-ticket sourceType', () => {
    expect(createJiraConnector().supports({ ...descriptor(), sourceType: 'technical-doc' })).toBe(
      false,
    );
  });

  it('rejects a structurally invalid descriptor', () => {
    expect(createJiraConnector().supports({ ...descriptor(), locator: 'not-a-locator' })).toBe(
      false,
    );
  });
});

describe('createJiraConnector — open()', () => {
  it('resolves each configured project and records it as sourceMetadata', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    expect(session.sourceMetadata).toMatchObject({
      baseUrl: BASE_URL,
      projectKeys: ['AUR'],
      projects: [{ key: 'AUR', id: '10000', name: 'Aurora Commerce' }],
    });
    await session.close();
  });

  it('throws (a source-level failure) when a configured project does not exist', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    await expect(
      createJiraConnector({ fetchImpl }).open(
        descriptor({ ticketTracker: { kind: 'jira', baseUrl: BASE_URL, projectKeys: ['NOPE'] } }),
      ),
    ).rejects.toThrow(/no such project|404/);
  });

  it('never resolves a revision — there is no revision concept to pin', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    expect(session.revision).toBeUndefined();
    expect(session.source).not.toHaveProperty('version');
    await session.close();
  });
});

describe('createJiraConnector — list() pagination', () => {
  it('pages through /search lazily, one page per iteration step', async () => {
    const { fetchImpl, calls } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl, pageSize: 1 }).open(descriptor());

    const listed: string[] = [];
    for await (const ref of session.list()) listed.push(ref.path);
    await session.close();

    expect(listed).toEqual(['AUR-101', 'AUR-102']);
    // 1 project lookup + 2 search pages (pageSize: 1, 2 issues) = 3 calls.
    expect(calls.filter((url) => url.includes('/rest/api/3/search'))).toHaveLength(2);
  });

  it('includes mediaType and lastModifiedAt on each listed ref', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    const refs: Array<{ path: string; mediaType?: string; lastModifiedAt?: string }> = [];
    for await (const ref of session.list()) refs.push(ref);
    await session.close();

    expect(refs[0]).toMatchObject({ path: 'AUR-101', mediaType: 'application/json' });
    expect(refs[0]?.lastModifiedAt).toBe('2026-09-01T10:00:00.000Z');
  });

  it('applies the descriptor filter', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(
      descriptor({ filter: { excludePaths: ['AUR-102'] } }),
    );
    const listed: string[] = [];
    for await (const ref of session.list()) listed.push(ref.path);
    await session.close();
    expect(listed).toEqual(['AUR-101']);
  });

  it('builds JQL from projectKeys, issueTypes, and extra jql, ANDed together', async () => {
    const { fetchImpl, calls } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(
      descriptor({
        ticketTracker: {
          kind: 'jira',
          baseUrl: BASE_URL,
          projectKeys: ['AUR'],
          issueTypes: ['Story', 'Bug'],
          jql: 'status != Done',
        },
      }),
    );
    const listed: string[] = [];
    for await (const ref of session.list()) listed.push(ref.path);
    expect(listed.length).toBeGreaterThan(0);
    await session.close();

    const searchCall = calls.find((url) => url.includes('/rest/api/3/search'));
    const jql = new URL(searchCall ?? '').searchParams.get('jql');
    expect(jql).toBe('project in ("AUR") AND issuetype in ("Story", "Bug") AND (status != Done)');
  });
});

describe('createJiraConnector — read()', () => {
  it('produces a RawArtifact that passes the real validator', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl, now: () => CAPTURED_AT }).open(
      descriptor(),
    );
    const result = await session.read({ path: 'AUR-101' });
    await session.close();

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateRawArtifact(result.artifact)).toEqual({ valid: true, errors: [] });
    expect(result.artifact).toMatchObject({
      sourceId: 'ticket://acme-jira/AUR',
      locator: 'ticket://acme-jira/AUR/AUR-101',
      mediaType: 'application/json',
      contentEncoding: 'utf-8',
      capturedAt: CAPTURED_AT,
    });
    expect(result.artifact.revision).toBeUndefined();
  });

  it('renders the ADF description into the artifact content as plain text', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    const result = await session.read({ path: 'AUR-101' });
    await session.close();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.artifact.content) as { description: string };
    expect(parsed.description).toBe('Customers cannot request a partial refund.');
  });

  it('passes a plain-text description (older Jira API shape) straight through', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    const result = await session.read({ path: 'AUR-102' });
    await session.close();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = JSON.parse(result.artifact.content) as { description: string };
    expect(parsed.description).toBe('Plain-text description from an older Jira Server API.');
  });

  it('reports the issue link and parent as raw relationship facts in attributes, not as canonical relationships', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    const result = await session.read({ path: 'AUR-101' });
    await session.close();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.attributes).toMatchObject({
      issueType: 'Story',
      status: 'In Progress',
      priority: 'High',
      labels: ['checkout', 'payments'],
      parentKey: 'AUR-100',
      issueLinks: [{ type: 'blocks', direction: 'outward', targetKey: 'AUR-102' }],
    });
  });

  it('omits assignee/reporter from attributes by default — personal data, opt-in only', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    const result = await session.read({ path: 'AUR-101' });
    await session.close();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.attributes).not.toHaveProperty('assignee');
    expect(result.artifact.attributes).not.toHaveProperty('reporter');
  });

  it('includes assignee/reporter when includeUserIdentity is opted into', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl, includeUserIdentity: true }).open(
      descriptor(),
    );
    const result = await session.read({ path: 'AUR-101' });
    await session.close();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.attributes).toMatchObject({
      assignee: 'Priya Shah',
      reporter: 'Sam Lee',
    });
  });

  it('hashes content deterministically', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    const first = await session.read({ path: 'AUR-101' });
    const second = await session.read({ path: 'AUR-101' });
    await session.close();
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.artifact.contentHash).toEqual(second.artifact.contentHash);
    expect(first.artifact.contentHash?.algorithm).toBe('sha256');
  });

  it('reports not-found rather than throwing for an unknown issue key', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    const result = await session.read({ path: 'AUR-999' });
    await session.close();
    expect(result).toEqual({
      ok: false,
      failure: { path: 'AUR-999', reason: 'not-found', detail: expect.stringContaining('404') },
    });
  });

  it('reports too-large instead of returning an oversized artifact', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl, maxArtifactBytes: 10 }).open(
      descriptor(),
    );
    const result = await session.read({ path: 'AUR-101' });
    await session.close();
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('too-large');
  });
});

describe('ConnectorSession — lifecycle', () => {
  it('close is idempotent', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    await session.close();
    await expect(session.close()).resolves.toBeUndefined();
  });

  it('refuses to list or read after close', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl }).open(descriptor());
    await session.close();
    expect(() => session.list()).toThrow(/session is closed/);
    await expect(session.read({ path: 'AUR-101' })).rejects.toThrow(/session is closed/);
  });
});

describe('end to end — Jira output feeds real Evidence', () => {
  it('produces evidence and a source registry that resolve against each other', async () => {
    const { fetchImpl } = createFakeJiraFetch();
    const session = await createJiraConnector({ fetchImpl, now: () => CAPTURED_AT }).open(
      descriptor(),
    );
    const result = await session.read({ path: 'AUR-101' });
    await session.close();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const evidence = artifactToEvidence(result.artifact, { id: 'ev-aur-101' });
    expect(evidence.sourceVersion).toBeUndefined();

    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: CAPTURED_AT,
      sources: [session.source],
      objects: [],
      relationships: [],
    };
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });
});
