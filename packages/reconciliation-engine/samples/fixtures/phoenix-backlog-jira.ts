/**
 * P6-09 -- a REPRESENTATIVE Jira dataset, not a live one. This repository has
 * no real Jira instance or credentials available to test against (every
 * prior Jira ADR in this project says the same -- see
 * `docs/architecture/adr/0027-p6-02-jira-connector.md` "Limitations"). Asked
 * to choose between a representative offline dataset and a real instance for
 * this POC, the answer was: representative, clearly labelled as such.
 *
 * What makes it representative rather than arbitrary: it models the ACTUAL
 * Phase 6 backlog this project executed -- the real ticket titles and real
 * completion state as of this run, one issue per P6-0X ticket plus an Epic
 * grouping them. It is not live data, but it is not invented busywork either.
 *
 * `createPhoenixBacklogJiraFetch()` returns a `JiraFetch` implementation
 * (the exact injection point `createJiraConnector`'s tests already use) that
 * serves this dataset -- so the POC runs the REAL Jira connector code
 * (real HTTP-shaped requests, real pagination, real ADF rendering) against
 * representative response bodies, not a hand-built `RawArtifact` bypass.
 */

export const PHOENIX_JIRA_BASE_URL = 'https://phoenix-internal.atlassian.net';
export const PHOENIX_JIRA_PROJECT_KEY = 'PHX';
export const PHOENIX_JIRA_PROJECT = {
  id: '10100',
  key: PHOENIX_JIRA_PROJECT_KEY,
  name: 'Phoenix.ai-1 Backlog',
};

interface AdfDoc {
  type: 'doc';
  content: Array<{ type: 'paragraph'; content: Array<{ type: 'text'; text: string }> }>;
}

function paragraph(text: string): AdfDoc['content'][number] {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function adf(...paragraphs: string[]): AdfDoc {
  return { type: 'doc', content: paragraphs.map(paragraph) };
}

/** One issue's full detail, in the exact shape `GET /rest/api/3/issue/{key}` returns. */
interface FixtureIssue {
  key: string;
  fields: {
    summary: string;
    description: AdfDoc | string;
    issuetype: { name: string };
    status: { name: string };
    priority?: { name: string };
    labels: string[];
    created: string;
    updated: string;
    parent?: { key: string };
    issuelinks: Array<{
      type: { name: string; inward: string; outward: string };
      outwardIssue?: { key: string };
      inwardIssue?: { key: string };
    }>;
  };
}

const DAY = '2026-09-08';

export const PHOENIX_JIRA_ISSUES: readonly FixtureIssue[] = [
  {
    key: 'PHX-1',
    fields: {
      summary: 'Phase 6 — Connector Framework Hardening & Reconciliation',
      description: adf(
        'Harden the ingestion-connectors framework for multiple source layouts, connect a second ' +
          'real evidence source (Jira), represent what it produces in the common model, and build ' +
          'source-to-source reconciliation over both.',
      ),
      issuetype: { name: 'Epic' },
      status: { name: 'In Progress' },
      labels: ['phase-6'],
      created: `${DAY}T09:00:00.000+0000`,
      updated: `${DAY}T18:00:00.000+0000`,
      issuelinks: [],
    },
  },
  {
    key: 'PHX-2',
    fields: {
      summary: 'P6-01 — Harden the connector abstraction for multiple source layouts',
      description: adf(
        'Add a ConnectorRegistry that rejects a duplicate connector id or an ambiguous descriptor ' +
          'match instead of resolving either silently, and a second descriptor narrowing ' +
          '(document-space) proving the contract generalizes past a repository.',
      ),
      issuetype: { name: 'Story' },
      status: { name: 'Done' },
      priority: { name: 'High' },
      labels: ['connector-framework'],
      created: `${DAY}T09:05:00.000+0000`,
      updated: `${DAY}T10:30:00.000+0000`,
      parent: { key: 'PHX-1' },
      issuelinks: [],
    },
  },
  {
    key: 'PHX-3',
    fields: {
      summary: 'P6-02 — Jira connector: connect Phoenix to Jira as a second evidence source',
      description: adf(
        'Extract issues, project metadata, and issue-to-issue relationships from a Jira Cloud/Server ' +
          'instance over REST API v3, using an injectable HTTP transport since no real instance is ' +
          'available to test against here.',
      ),
      issuetype: { name: 'Story' },
      status: { name: 'Done' },
      priority: { name: 'High' },
      labels: ['connector-framework', 'jira'],
      created: `${DAY}T10:35:00.000+0000`,
      updated: `${DAY}T11:50:00.000+0000`,
      parent: { key: 'PHX-1' },
      issuelinks: [
        {
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          outwardIssue: { key: 'PHX-4' },
        },
      ],
    },
  },
  {
    key: 'PHX-4',
    fields: {
      summary: 'P6-04 — OKF mapping: represent Jira-derived facts in the common model',
      description: adf(
        'Add the Work Item canonical model (workitem.issue) and bridge Jira RawArtifacts into it, ' +
          'deliberately keeping issue type as a free-text attribute rather than a closed kind ' +
          'vocabulary.',
      ),
      issuetype: { name: 'Story' },
      status: { name: 'Done' },
      priority: { name: 'Medium' },
      labels: ['knowledge-model', 'jira'],
      created: `${DAY}T11:55:00.000+0000`,
      updated: `${DAY}T12:40:00.000+0000`,
      parent: { key: 'PHX-1' },
      issuelinks: [
        {
          type: { name: 'Blocks', inward: 'is blocked by', outward: 'blocks' },
          inwardIssue: { key: 'PHX-3' },
        },
      ],
    },
  },
  {
    key: 'PHX-5',
    fields: {
      summary: 'P6-05 — Source-to-source reconciliation: compare claims, retain contradictions',
      description: adf(
        'Fill the observation structural category reserved since P2-02: a real ConflictObject ' +
          'kind that retains every disputed position and its sources rather than silently picking ' +
          'a winner.',
      ),
      issuetype: { name: 'Story' },
      status: { name: 'Done' },
      priority: { name: 'High' },
      labels: ['reconciliation'],
      created: `${DAY}T12:45:00.000+0000`,
      updated: `${DAY}T13:40:00.000+0000`,
      parent: { key: 'PHX-1' },
      issuelinks: [],
    },
  },
  {
    key: 'PHX-6',
    fields: {
      summary: 'P6-06 — Confidence calculation from source agreement/corroboration',
      description: adf(
        'Extract and generalize the confidence formula so every retained conflict position gets ' +
          'its own differentiated confidence, not just the agreement path.',
      ),
      issuetype: { name: 'Story' },
      status: { name: 'Done' },
      priority: { name: 'Medium' },
      labels: ['reconciliation'],
      created: `${DAY}T13:45:00.000+0000`,
      updated: `${DAY}T14:30:00.000+0000`,
      parent: { key: 'PHX-1' },
      issuelinks: [
        {
          type: { name: 'Relates', inward: 'relates to', outward: 'relates to' },
          outwardIssue: { key: 'PHX-5' },
        },
      ],
    },
  },
  {
    key: 'PHX-7',
    fields: {
      summary: 'P6-08 — Evidence aggregation: aggregate supporting evidence for each claim',
      description: adf(
        'Deduplicate and aggregate the evidence behind an agreed claim and behind each retained ' +
          'conflict position, referenced by id rather than duplicated.',
      ),
      issuetype: { name: 'Story' },
      status: { name: 'Done' },
      priority: { name: 'Medium' },
      labels: ['reconciliation'],
      created: `${DAY}T14:35:00.000+0000`,
      updated: `${DAY}T15:20:00.000+0000`,
      parent: { key: 'PHX-1' },
      issuelinks: [
        {
          type: { name: 'Relates', inward: 'relates to', outward: 'relates to' },
          outwardIssue: { key: 'PHX-5' },
        },
      ],
    },
  },
  {
    key: 'PHX-8',
    fields: {
      summary: 'P6-09 — POC: Phoenix repo and Jira analysis using real data sources',
      description: adf(
        'Run the real git connector against this repository and the real Jira connector against a ' +
          'representative dataset, bridge both, and reconcile claims across them end to end.',
        'Still being written up as this very issue is read — see whether the reconciliation output ' +
          'below agrees.',
      ),
      issuetype: { name: 'Story' },
      status: { name: 'In Progress' },
      priority: { name: 'High' },
      labels: ['poc', 'reconciliation', 'jira'],
      created: `${DAY}T15:25:00.000+0000`,
      updated: `${DAY}T15:25:00.000+0000`,
      parent: { key: 'PHX-1' },
      issuelinks: [
        {
          type: { name: 'Relates', inward: 'relates to', outward: 'relates to' },
          outwardIssue: { key: 'PHX-7' },
        },
      ],
    },
  },
];

/** Lightweight fields for `/search` — the connector requests only these at listing time. */
function listFields(issue: FixtureIssue) {
  return {
    key: issue.key,
    fields: {
      summary: issue.fields.summary,
      issuetype: issue.fields.issuetype,
      status: issue.fields.status,
      updated: issue.fields.updated,
    },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * Builds a `JiraFetch` (`@phoenix-ai/ingestion-connectors`'s injection point)
 * serving this fixture set -- the real `createJiraConnector` runs its real
 * request-building/pagination/ADF-rendering logic against it, exactly as
 * `jira-connector.test.ts` already does for unit tests.
 */
export function createPhoenixBacklogJiraFetch(): (
  input: string,
  init: RequestInit,
) => Promise<Response> {
  return async (input: string) => {
    const url = new URL(input);

    if (url.pathname === `/rest/api/3/project/${PHOENIX_JIRA_PROJECT_KEY}`) {
      return jsonResponse(PHOENIX_JIRA_PROJECT);
    }

    if (url.pathname === '/rest/api/3/search') {
      const startAt = Number(url.searchParams.get('startAt') ?? '0');
      const maxResults = Number(url.searchParams.get('maxResults') ?? '50');
      const page = PHOENIX_JIRA_ISSUES.slice(startAt, startAt + maxResults).map(listFields);
      return jsonResponse({ issues: page, total: PHOENIX_JIRA_ISSUES.length, startAt, maxResults });
    }

    const issueMatch = /^\/rest\/api\/3\/issue\/([^/]+)$/.exec(url.pathname);
    if (issueMatch) {
      const key = decodeURIComponent(issueMatch[1] ?? '');
      const issue = PHOENIX_JIRA_ISSUES.find((candidate) => candidate.key === key);
      if (issue === undefined) return jsonResponse({ errorMessages: ['issue not found'] }, 404);
      return jsonResponse(issue);
    }

    return jsonResponse({ errorMessages: [`unhandled fixture endpoint: ${url.pathname}`] }, 404);
  };
}
