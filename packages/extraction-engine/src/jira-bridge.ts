/**
 * P6-04 -- bridges the Jira connector's (`@phoenix-ai/ingestion-connectors`,
 * P6-02) already-normalized `RawArtifact`s into real
 * `@phoenix-ai/knowledge-graph` `WorkItemObject`s/`WorkItemRelationship`s.
 * The same "deterministic facts to canonical objects" discipline
 * `bridge-http.ts`/`bridge-relationships.ts` established for Java (P3-06,
 * Phase-4-prerequisite): only bridge what is directly, mechanically
 * decidable from what the connector already observed -- nothing invented,
 * nothing inferred. See `docs/architecture/adr/0028-p6-04-jira-okf-mapping.md`.
 *
 * Unlike the Java bridges, there is no separate "structural fact" stage to
 * consume: `createJiraConnector`'s `read()` already normalizes each issue
 * into the JSON this file parses back out of `RawArtifact.content` (key,
 * summary, description, issueType, status, priority, labels, timestamps,
 * parentKey, issueLinks). This file is the first and only mapping step for
 * Jira, playing both `bridge-http.ts`'s role (one object per artifact) and
 * `bridge-relationships.ts`'s role (parent/issue-link edges between
 * already-bridged objects) at once.
 *
 * `deterministicId` is reused unmodified from `bridge-shared.ts` (a stable
 * sha256 over content, never random -- FR-DET-07); `evidenceFor` is NOT
 * reused, because it is shaped around a Java `SourceSpan` (a file + line
 * range). A `RawArtifact` already carries everything `Evidence` needs
 * (`sourceId`/`locator`/`capturedAt`/`revision`), so
 * `@phoenix-ai/ingestion-connectors`' own `artifactToEvidence` -- built for
 * exactly this bridge -- is used instead.
 */

import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import { artifactToEvidence } from '@phoenix-ai/ingestion-connectors';
import {
  CANONICAL_SCHEMA_VERSION,
  isNonEmptyString,
  isPlainObject,
  type CanonicalKnowledgeRelationship,
  type WorkItemObject,
} from '@phoenix-ai/knowledge-graph';
import { deterministicId } from './bridge-shared.js';

export interface JiraBridgeOptions {
  systemId: string;
  /** ISO-8601 -- stamped as `identity.createdAt`/`identity.updatedAt` (when PHOENIX captured this, not when Jira did) and `Provenance.derivedAt`. */
  generatedAt: string;
}

/** One artifact this bridge could not interpret as a Jira issue, kept as data rather than dropped silently. */
export interface JiraBridgeSkip {
  path: string;
  reason: string;
}

export interface JiraBridgeResult {
  objects: WorkItemObject[];
  relationships: CanonicalKnowledgeRelationship[];
  skipped: JiraBridgeSkip[];
}

interface JiraIssueLink {
  type: string;
  direction: 'inward' | 'outward';
  targetKey: string;
}

/** The shape `createJiraConnector`'s `read()` serializes into `RawArtifact.content`. */
interface JiraIssueContent {
  key: string;
  summary: string;
  description: string;
  issueType: string;
  status: string;
  priority?: string;
  labels: string[];
  createdAt?: string;
  updatedAt?: string;
  parentKey?: string;
  issueLinks: JiraIssueLink[];
  assignee?: string;
  reporter?: string;
}

function isIssueLink(candidate: unknown): candidate is JiraIssueLink {
  return (
    isPlainObject(candidate) &&
    isNonEmptyString(candidate.type) &&
    (candidate.direction === 'inward' || candidate.direction === 'outward') &&
    isNonEmptyString(candidate.targetKey)
  );
}

/**
 * Parses `RawArtifact.content` back into the issue shape the Jira connector
 * produced. Returns `undefined` -- never throws -- for content that is not
 * valid JSON or does not have the fields this bridge requires, so one
 * malformed artifact becomes a reported skip rather than aborting the whole
 * batch (the same partial-failure discipline ADR 0013 decision 7 established
 * for reading an artifact in the first place).
 */
function parseJiraIssueContent(content: string): JiraIssueContent | undefined {
  let data: unknown;
  try {
    data = JSON.parse(content);
  } catch {
    return undefined;
  }
  if (!isPlainObject(data)) return undefined;
  if (
    !isNonEmptyString(data.key) ||
    typeof data.summary !== 'string' ||
    typeof data.description !== 'string' ||
    !isNonEmptyString(data.issueType) ||
    !isNonEmptyString(data.status) ||
    !Array.isArray(data.labels) ||
    !data.labels.every((label) => typeof label === 'string') ||
    !Array.isArray(data.issueLinks) ||
    !data.issueLinks.every(isIssueLink)
  ) {
    return undefined;
  }

  return {
    key: data.key,
    summary: data.summary,
    description: data.description,
    issueType: data.issueType,
    status: data.status,
    labels: data.labels,
    issueLinks: data.issueLinks,
    ...(isNonEmptyString(data.priority) ? { priority: data.priority } : {}),
    ...(isNonEmptyString(data.createdAt) ? { createdAt: data.createdAt } : {}),
    ...(isNonEmptyString(data.updatedAt) ? { updatedAt: data.updatedAt } : {}),
    ...(isNonEmptyString(data.parentKey) ? { parentKey: data.parentKey } : {}),
    ...(isNonEmptyString(data.assignee) ? { assignee: data.assignee } : {}),
    ...(isNonEmptyString(data.reporter) ? { reporter: data.reporter } : {}),
  };
}

function relationshipProvenance(
  artifact: RawArtifact,
  options: JiraBridgeOptions,
): CanonicalKnowledgeRelationship['metadata'] {
  return {
    provenance: [
      {
        sourceId: artifact.sourceId,
        sourceType: 'ticket',
        derivedBy: 'extraction-engine',
        derivedAt: options.generatedAt,
      },
    ],
    confidence: { level: 'high' },
  };
}

function buildWorkItemObject(
  artifact: RawArtifact,
  issue: JiraIssueContent,
  objectId: string,
  options: JiraBridgeOptions,
): WorkItemObject {
  return {
    identity: {
      id: objectId,
      systemId: options.systemId,
      createdAt: options.generatedAt,
      updatedAt: options.generatedAt,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'workitem.issue',
    label: issue.summary.length > 0 ? issue.summary : issue.key,
    attributes: {
      issueType: issue.issueType,
      status: issue.status,
      labels: issue.labels,
      ...(issue.priority === undefined ? {} : { priority: issue.priority }),
      ...(issue.description.length === 0 ? {} : { description: issue.description }),
      ...(issue.createdAt === undefined ? {} : { reportedCreatedAt: issue.createdAt }),
      ...(issue.updatedAt === undefined ? {} : { reportedUpdatedAt: issue.updatedAt }),
    },
    metadata: {
      provenance: [
        {
          sourceId: artifact.sourceId,
          sourceType: 'ticket',
          derivedBy: 'extraction-engine',
          derivedAt: options.generatedAt,
        },
      ],
      confidence: { level: 'high' },
    },
    evidence: [
      artifactToEvidence(artifact, {
        id: deterministicId('evidence', 'workitem', artifact.sourceId, issue.key),
        ...(issue.summary.length === 0 ? {} : { excerpt: issue.summary }),
      }),
    ],
    confidenceDetail: { basis: 'observed' },
  };
}

/**
 * Bridges a batch of Jira-issue `RawArtifact`s into `WorkItemObject`s and
 * the `contains`/`relatesTo` relationships between them.
 *
 * A relationship is only produced when BOTH endpoints resolve to an object
 * bridged from THIS SAME batch (matched by `sourceId` + issue key) -- the
 * same "only connect two already-bridged canonical objects" rule
 * `bridge-relationships.ts` established: an issue link to a key outside this
 * batch (a different project, a filtered-out issue, an issue the caller
 * simply didn't include) produces no dangling relationship rather than one
 * pointing at an object id that does not exist in the result.
 */
export function bridgeJiraArtifacts(
  artifacts: readonly RawArtifact[],
  options: JiraBridgeOptions,
): JiraBridgeResult {
  const parsed: Array<{ artifact: RawArtifact; issue: JiraIssueContent; objectId: string }> = [];
  const skipped: JiraBridgeSkip[] = [];

  for (const artifact of artifacts) {
    const issue = parseJiraIssueContent(artifact.content);
    if (issue === undefined) {
      skipped.push({ path: artifact.path, reason: 'unrecognised Jira issue content shape' });
      continue;
    }
    const objectId = deterministicId('workitem', options.systemId, artifact.sourceId, issue.key);
    parsed.push({ artifact, issue, objectId });
  }

  const objects = parsed.map(({ artifact, issue, objectId }) =>
    buildWorkItemObject(artifact, issue, objectId, options),
  );

  const objectIdByKey = new Map(
    parsed.map(({ artifact, issue, objectId }) => [`${artifact.sourceId} ${issue.key}`, objectId]),
  );

  const relationships: CanonicalKnowledgeRelationship[] = [];

  for (const { artifact, issue, objectId } of parsed) {
    if (issue.parentKey !== undefined) {
      const parentObjectId = objectIdByKey.get(`${artifact.sourceId} ${issue.parentKey}`);
      if (parentObjectId !== undefined && parentObjectId !== objectId) {
        relationships.push({
          id: deterministicId('relationship', 'contains', parentObjectId, objectId),
          category: 'composition',
          kind: 'contains',
          sourceObjectId: parentObjectId,
          targetObjectId: objectId,
          attributes: { childIssueType: issue.issueType },
          metadata: relationshipProvenance(artifact, options),
          evidence: [
            artifactToEvidence(artifact, {
              id: deterministicId('evidence', 'contains', artifact.sourceId, issue.key),
            }),
          ],
          confidenceDetail: { basis: 'observed' },
        });
      }
    }

    for (const link of issue.issueLinks) {
      const targetObjectId = objectIdByKey.get(`${artifact.sourceId} ${link.targetKey}`);
      if (targetObjectId === undefined || targetObjectId === objectId) continue;

      relationships.push({
        id: deterministicId(
          'relationship',
          'relatesTo',
          objectId,
          targetObjectId,
          link.type,
          link.direction,
        ),
        category: 'association',
        kind: 'relatesTo',
        sourceObjectId: objectId,
        targetObjectId,
        attributes: { linkType: link.type, direction: link.direction },
        metadata: relationshipProvenance(artifact, options),
        evidence: [
          artifactToEvidence(artifact, {
            id: deterministicId(
              'evidence',
              'relatesTo',
              artifact.sourceId,
              issue.key,
              link.targetKey,
            ),
          }),
        ],
        confidenceDetail: { basis: 'observed' },
      });
    }
  }

  relationships.sort((a, b) => a.id.localeCompare(b.id));

  return { objects, relationships, skipped };
}
