/**
 * P6-02 -- the Jira connector: Phoenix's second REAL connector (after
 * `createGitRepositoryConnector`, P3-02) and its first for a source that is
 * not a repository. Connects to a Jira Cloud or Server/Data Center instance
 * over its REST API v3, and reads issues, their metadata, and their
 * relationships to other issues as raw artifacts.
 *
 * Implements `SourceConnector<SourceTicketTrackerDescriptor>` (P6-02's
 * narrowing, `descriptor.ts`) with no change to the shared contract:
 *
 *  - **Issues.** `list()` pages through `GET /rest/api/3/search` lazily, one
 *    page per iteration step, so a project with thousands of issues is
 *    genuinely streamed rather than materialized up front (ADR 0013
 *    decision 4). `read()` then fetches one issue's full fields.
 *  - **Metadata.** `open()` resolves each configured project once
 *    (`GET /rest/api/3/project/{key}`), surfaced as
 *    `ConnectorSession.sourceMetadata`; per-issue metadata (status, issue
 *    type, priority, labels) lands in `RawArtifact.attributes`.
 *  - **Relationships.** Jira's `issuelinks` (blocks/relates-to/duplicates/…)
 *    and `parent` (subtask/epic-child) are reported as raw facts in
 *    `RawArtifact.attributes.issueLinks`/`attributes.parentKey` -- NOT as
 *    canonical `CanonicalKnowledgeRelationship` objects. ADR 0013 decision 1
 *    draws that boundary for every connector: turning a raw link into a
 *    canonical relationship is extraction's job, not ingestion's.
 *
 * `capabilities.revisionPinning` is `false` and, unlike
 * `document-space-connector.ts` (P6-01), there is nothing to reject at
 * `open()` -- `TicketTrackerCoordinates` has no `revision` field at all, so
 * the violation ADR 0013 decision 6 cares about is unrepresentable rather
 * than merely refused. See
 * `docs/architecture/adr/0027-p6-02-jira-connector.md`.
 */

import { createHash } from 'node:crypto';
import type { SourceType } from '@phoenix-ai/shared';
import { isNonEmptyString, isPlainObject, type KnowledgeValue } from '@phoenix-ai/knowledge-graph';
import {
  buildArtifactLocator,
  descriptorToSource,
  validateSourceTicketTrackerDescriptor,
  type SourceDescriptor,
  type SourceTicketTrackerDescriptor,
} from './descriptor.js';
import type {
  ArtifactFailureReason,
  ArtifactRef,
  ArtifactReadResult,
  RawArtifact,
} from './artifact.js';
import { matchesArtifactFilter, type ArtifactFilter } from './filter.js';
import type { ConnectorCapabilities, ConnectorSession, SourceConnector } from './connector.js';
import { renderAdfToText } from './adf.js';
import { JiraApiError, jiraGet, type JiraClientOptions, type JiraFetch } from './jira-client.js';

export const JIRA_CONNECTOR_ID = 'jira';

const SUPPORTED_SOURCE_TYPES: readonly SourceType[] = ['ticket'];

/**
 * `contentHashing`/`incrementalScan` are true for the same reason git's are:
 * `changedSince` compares against Jira's real `fields.updated`, and the
 * content hash is a real sha256 of the normalized issue this connector
 * produces. `subtreeFiltering` is false -- `ArtifactFilter.includePaths`/
 * `excludePaths` glob patterns are never pushed into JQL, only applied
 * locally via the shared `matchesArtifactFilter` (ADR 0013 decision 5);
 * `ticketTracker.projectKeys`/`issueTypes` are the mechanism that narrows
 * what is FETCHED, mirroring `repository.subpaths` — both may be set, the
 * same "fetched vs. surfaced" split ADR 0013 already drew for repositories.
 * `binaryContent` is false: every issue is read as normalized JSON text.
 */
const CAPABILITIES: ConnectorCapabilities = {
  revisionPinning: false,
  incrementalScan: true,
  subtreeFiltering: false,
  contentHashing: true,
  binaryContent: false,
};

const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_ARTIFACT_BYTES = 4 * 1024 * 1024;
const LIST_FIELDS = 'summary,issuetype,status,updated';
const READ_FIELDS_BASE = [
  'summary',
  'description',
  'issuetype',
  'status',
  'priority',
  'labels',
  'created',
  'updated',
  'parent',
  'issuelinks',
];

export interface JiraConnectorOptions {
  /** How many issues to request per `/search` page. Defaults to 50. */
  pageSize?: number;
  /** Per-request timeout. Defaults to `DEFAULT_JIRA_TIMEOUT_MS` (30s). */
  requestTimeoutMs?: number;
  /** Refuse any single issue's serialized content larger than this. Defaults to 4 MiB. */
  maxArtifactBytes?: number;
  /**
   * Include assignee/reporter display names in `RawArtifact.attributes`.
   * Defaults to FALSE: a person's name is personal data, and this package
   * sits upstream of `packages/redaction-hardening` -- mirrors
   * `GitConnectorOptions.includeAuthorMetadata` (ADR 0014 decision 6)
   * exactly.
   */
  includeUserIdentity?: boolean;
  /** Injectable HTTP function, defaulting to the global `fetch`. Tests supply a fake. */
  fetchImpl?: JiraFetch;
  /** Injectable clock so `capturedAt` is deterministic under test. Defaults to the real clock. */
  now?: () => string;
}

interface JiraProjectSummary {
  key: string;
  id: string;
  name: string;
}

interface JiraIssueLink {
  type: string;
  direction: 'inward' | 'outward';
  targetKey: string;
}

interface NormalizedJiraIssue {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  status: string;
  labels: string[];
  issueLinks: JiraIssueLink[];
  priority?: string;
  createdAt?: string;
  updatedAt?: string;
  parentKey?: string;
  assignee?: string;
  reporter?: string;
}

function sha256(content: string): { algorithm: string; value: string } {
  return { algorithm: 'sha256', value: createHash('sha256').update(content, 'utf8').digest('hex') };
}

function toIso(value: unknown): string | undefined {
  if (!isNonEmptyString(value)) return undefined;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
}

function namedField(fields: Record<string, unknown>, key: string): string | undefined {
  const value = fields[key];
  return isPlainObject(value) && isNonEmptyString(value.name) ? value.name : undefined;
}

function toIssueLinks(raw: unknown): JiraIssueLink[] {
  if (!Array.isArray(raw)) return [];
  const links: JiraIssueLink[] = [];
  for (const entry of raw) {
    if (!isPlainObject(entry)) continue;
    const type = entry.type;
    if (!isPlainObject(type)) continue;
    const outward = entry.outwardIssue;
    if (isPlainObject(outward) && isNonEmptyString(outward.key) && isNonEmptyString(type.outward)) {
      links.push({ type: type.outward, direction: 'outward', targetKey: outward.key });
    }
    const inward = entry.inwardIssue;
    if (isPlainObject(inward) && isNonEmptyString(inward.key) && isNonEmptyString(type.inward)) {
      links.push({ type: type.inward, direction: 'inward', targetKey: inward.key });
    }
  }
  return links;
}

/** Parses one `GET /issue/{key}` response into the shape this connector reports. `undefined` on an unrecognisable shape. */
function normalizeIssue(
  data: unknown,
  includeUserIdentity: boolean,
): NormalizedJiraIssue | undefined {
  if (!isPlainObject(data) || !isNonEmptyString(data.key) || !isPlainObject(data.fields)) {
    return undefined;
  }
  const fields = data.fields;

  const priority = namedField(fields, 'priority');
  const createdAt = toIso(fields.created);
  const updatedAt = toIso(fields.updated);
  const parent = fields.parent;
  const parentKey = isPlainObject(parent) && isNonEmptyString(parent.key) ? parent.key : undefined;
  const assignee =
    includeUserIdentity &&
    isPlainObject(fields.assignee) &&
    isNonEmptyString(fields.assignee.displayName)
      ? fields.assignee.displayName
      : undefined;
  const reporter =
    includeUserIdentity &&
    isPlainObject(fields.reporter) &&
    isNonEmptyString(fields.reporter.displayName)
      ? fields.reporter.displayName
      : undefined;

  return {
    key: data.key,
    summary: isNonEmptyString(fields.summary) ? fields.summary : '',
    description: renderAdfToText(fields.description ?? null),
    issueType: namedField(fields, 'issuetype') ?? 'Unknown',
    status: namedField(fields, 'status') ?? 'Unknown',
    labels: Array.isArray(fields.labels) ? fields.labels.filter(isNonEmptyString) : [],
    issueLinks: toIssueLinks(fields.issuelinks),
    ...(priority === undefined ? {} : { priority }),
    ...(createdAt === undefined ? {} : { createdAt }),
    ...(updatedAt === undefined ? {} : { updatedAt }),
    ...(parentKey === undefined ? {} : { parentKey }),
    ...(assignee === undefined ? {} : { assignee }),
    ...(reporter === undefined ? {} : { reporter }),
  };
}

function issueAttributes(issue: NormalizedJiraIssue): Record<string, KnowledgeValue> {
  return {
    issueType: issue.issueType,
    status: issue.status,
    labels: issue.labels,
    issueLinks: issue.issueLinks.map((link) => ({
      type: link.type,
      direction: link.direction,
      targetKey: link.targetKey,
    })),
    ...(issue.priority === undefined ? {} : { priority: issue.priority }),
    ...(issue.parentKey === undefined ? {} : { parentKey: issue.parentKey }),
    ...(issue.assignee === undefined ? {} : { assignee: issue.assignee }),
    ...(issue.reporter === undefined ? {} : { reporter: issue.reporter }),
  };
}

/** Wraps a JQL string literal, escaping `\` and `"` -- see `TicketTrackerCoordinates.jql`'s doc comment for what is and is not escaped this way. */
function jqlQuote(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function buildJql(coordinates: {
  projectKeys: readonly string[];
  issueTypes?: readonly string[];
  jql?: string;
}): string {
  const clauses = [`project in (${coordinates.projectKeys.map(jqlQuote).join(', ')})`];
  if (coordinates.issueTypes !== undefined && coordinates.issueTypes.length > 0) {
    clauses.push(`issuetype in (${coordinates.issueTypes.map(jqlQuote).join(', ')})`);
  }
  if (coordinates.jql !== undefined && coordinates.jql.length > 0) {
    clauses.push(`(${coordinates.jql})`);
  }
  // P8: an explicit, total order. Without one, Jira pages through whatever
  // order its index yields, which can change between page requests -- an
  // issue can be skipped or read twice -- and every downstream object comes
  // out in a different order run to run. The caller's own `jql` is wrapped in
  // parentheses above, where Jira forbids ORDER BY, so this cannot clash.
  return `${clauses.join(' AND ')} ORDER BY key ASC`;
}

function classifyReadFailure(error: unknown): ArtifactFailureReason {
  if (!(error instanceof JiraApiError)) return 'unreadable';
  if (error.reason === 'too-large') return 'too-large';
  if (error.reason === 'network') return 'transport-error';
  if (error.reason === 'invalid-json') return 'unreadable';
  // reason === 'http-status'
  if (error.status === 404) return 'not-found';
  if (error.status === 401 || error.status === 403) return 'access-denied';
  if (error.status === 429 || (error.status !== undefined && error.status >= 500)) {
    return 'transport-error';
  }
  return 'unreadable';
}

function errorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface SearchPage {
  issues: readonly unknown[];
  total: number;
}

async function searchIssues(
  client: JiraClientOptions,
  jql: string,
  startAt: number,
  maxResults: number,
): Promise<SearchPage> {
  const data = await jiraGet(
    '/rest/api/3/search',
    { jql, startAt: String(startAt), maxResults: String(maxResults), fields: LIST_FIELDS },
    client,
  );
  if (!isPlainObject(data) || !Array.isArray(data.issues) || typeof data.total !== 'number') {
    throw new JiraApiError(`${JIRA_CONNECTOR_ID}: unexpected /search response shape`, {
      reason: 'invalid-json',
      url: `${client.baseUrl}/rest/api/3/search`,
    });
  }
  return { issues: data.issues, total: data.total };
}

function toListRef(raw: unknown): ArtifactRef | undefined {
  if (!isPlainObject(raw) || !isNonEmptyString(raw.key)) return undefined;
  const fields = isPlainObject(raw.fields) ? raw.fields : {};
  const lastModifiedAt = toIso(fields.updated);
  return {
    path: raw.key,
    mediaType: 'application/json',
    ...(lastModifiedAt === undefined ? {} : { lastModifiedAt }),
  };
}

/** Creates the Jira connector. Requires network access to the configured `ticketTracker.baseUrl`. */
export function createJiraConnector(
  options: JiraConnectorOptions = {},
): SourceConnector<SourceTicketTrackerDescriptor> {
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  const maxArtifactBytes = options.maxArtifactBytes ?? DEFAULT_MAX_ARTIFACT_BYTES;
  const includeUserIdentity = options.includeUserIdentity ?? false;
  const now = options.now ?? ((): string => new Date().toISOString());

  return {
    id: JIRA_CONNECTOR_ID,
    sourceTypes: SUPPORTED_SOURCE_TYPES,
    capabilities: CAPABILITIES,

    supports(descriptor: SourceDescriptor): descriptor is SourceTicketTrackerDescriptor {
      if (!SUPPORTED_SOURCE_TYPES.includes(descriptor.sourceType)) return false;
      if (!validateSourceTicketTrackerDescriptor(descriptor).valid) return false;
      return (descriptor as SourceTicketTrackerDescriptor).ticketTracker.kind === 'jira';
    },

    async open(descriptor: SourceTicketTrackerDescriptor): Promise<ConnectorSession> {
      const validation = validateSourceTicketTrackerDescriptor(descriptor);
      if (!validation.valid) {
        throw new Error(
          `${JIRA_CONNECTOR_ID}: invalid descriptor — ${validation.errors.join('; ')}`,
        );
      }

      const {
        baseUrl,
        projectKeys,
        issueTypes,
        jql: extraJql,
        accountEmail,
      } = descriptor.ticketTracker;
      const client: JiraClientOptions = {
        baseUrl,
        ...(descriptor.credential === undefined ? {} : { credential: descriptor.credential }),
        ...(accountEmail === undefined ? {} : { accountEmail }),
        ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
        ...(options.requestTimeoutMs === undefined ? {} : { timeoutMs: options.requestTimeoutMs }),
      };

      const projects: JiraProjectSummary[] = [];
      for (const key of projectKeys) {
        const data = await jiraGet(`/rest/api/3/project/${encodeURIComponent(key)}`, {}, client);
        if (!isPlainObject(data) || !isNonEmptyString(data.id) || !isNonEmptyString(data.name)) {
          throw new Error(
            `${JIRA_CONNECTOR_ID}: unexpected response shape for project ${JSON.stringify(key)}`,
          );
        }
        projects.push({ key, id: data.id, name: data.name });
      }

      const jql = buildJql({
        projectKeys,
        ...(issueTypes === undefined ? {} : { issueTypes }),
        ...(extraJql === undefined ? {} : { jql: extraJql }),
      });
      const source = descriptorToSource(descriptor);
      const descriptorFilter = descriptor.filter;
      const sourceMetadata: Record<string, KnowledgeValue> = {
        baseUrl,
        projectKeys: [...projectKeys],
        projects: projects.map((project) => ({ ...project })),
        jql,
      };

      let closed = false;
      const assertOpen = (): void => {
        if (closed) throw new Error(`${JIRA_CONNECTOR_ID}: session is closed`);
      };

      return {
        descriptor,
        source,
        sourceMetadata,

        list(filter?: ArtifactFilter): AsyncIterable<ArtifactRef> {
          assertOpen();
          return {
            async *[Symbol.asyncIterator]() {
              let startAt = 0;
              for (;;) {
                const page = await searchIssues(client, jql, startAt, pageSize);
                for (const raw of page.issues) {
                  const ref = toListRef(raw);
                  if (ref === undefined) continue;
                  if (
                    matchesArtifactFilter(ref, descriptorFilter) &&
                    matchesArtifactFilter(ref, filter)
                  ) {
                    yield ref;
                  }
                }
                startAt += page.issues.length;
                if (page.issues.length === 0 || startAt >= page.total) break;
              }
            },
          };
        },

        async read(ref: ArtifactRef): Promise<ArtifactReadResult> {
          assertOpen();

          const fields = READ_FIELDS_BASE.concat(
            includeUserIdentity ? ['assignee', 'reporter'] : [],
          );
          let data: unknown;
          try {
            data = await jiraGet(
              `/rest/api/3/issue/${encodeURIComponent(ref.path)}`,
              { fields: fields.join(',') },
              client,
            );
          } catch (error) {
            return {
              ok: false,
              failure: {
                path: ref.path,
                reason: classifyReadFailure(error),
                detail: errorDetail(error),
              },
            };
          }

          const issue = normalizeIssue(data, includeUserIdentity);
          if (issue === undefined) {
            return {
              ok: false,
              failure: {
                path: ref.path,
                reason: 'unreadable',
                detail: 'unexpected issue response shape',
              },
            };
          }

          const content = JSON.stringify(
            {
              key: issue.key,
              summary: issue.summary,
              description: issue.description,
              issueType: issue.issueType,
              status: issue.status,
              ...(issue.priority === undefined ? {} : { priority: issue.priority }),
              labels: issue.labels,
              ...(issue.createdAt === undefined ? {} : { createdAt: issue.createdAt }),
              ...(issue.updatedAt === undefined ? {} : { updatedAt: issue.updatedAt }),
              ...(issue.parentKey === undefined ? {} : { parentKey: issue.parentKey }),
              issueLinks: issue.issueLinks,
              ...(issue.assignee === undefined ? {} : { assignee: issue.assignee }),
              ...(issue.reporter === undefined ? {} : { reporter: issue.reporter }),
            },
            null,
            2,
          );
          const sizeBytes = Buffer.byteLength(content, 'utf8');
          const limit = Math.min(
            maxArtifactBytes,
            descriptorFilter?.maxSizeBytes ?? maxArtifactBytes,
          );
          if (sizeBytes > limit) {
            return {
              ok: false,
              failure: {
                path: ref.path,
                reason: 'too-large',
                detail: `${sizeBytes} bytes exceeds the ${limit}-byte limit`,
              },
            };
          }

          const artifact: RawArtifact = {
            path: ref.path,
            sizeBytes,
            mediaType: 'application/json',
            ...(issue.updatedAt === undefined ? {} : { lastModifiedAt: issue.updatedAt }),
            sourceId: descriptor.id,
            locator: buildArtifactLocator(descriptor, ref.path),
            content,
            contentEncoding: 'utf-8',
            contentHash: sha256(content),
            capturedAt: now(),
            attributes: issueAttributes(issue),
          };

          return { ok: true, artifact };
        },

        async close(): Promise<void> {
          closed = true;
        },
      };
    },
  };
}
