/**
 * P8 -- signals from change history (FR-DET-05, FR-DET-06, BR-08).
 *
 *  - Co-change coupling (FR-DET-05, "an additional boundary signal"): two
 *    canonical elements whose files keep changing in the same commits are
 *    coupled, whatever their static dependencies say. Emitted as
 *    `coChangesWith` relationships between existing elements.
 *  - Ownership and knowledge risk (FR-DET-06): per element, who changes it
 *    and how recently; an element with a single author whose last change is
 *    old is flagged, with that owner and the last-change date (the PRD's
 *    acceptance criterion for this story).
 *
 * Everything is computed from the commit records a connector reported
 * (`CommitRecord`, FR-ING-06) and from where each element's own evidence
 * points -- no element is invented, and an element whose files have no
 * history simply has no finding. Owners are the pseudonymous `authorKey`
 * unless the connector was told to include author identity.
 *
 * "Stale" is measured against the run's `generatedAt`, never the wall
 * clock, so the result is reproducible (FR-DET-07).
 */

import type { CommitRecord } from '@phoenix-ai/ingestion-connectors';
import type {
  CanonicalKnowledgeObject,
  CanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { compareCodeUnits } from '@phoenix-ai/shared';
import { deterministicId, type BridgeOptions } from './bridge-shared.js';

export interface HistoryOptions extends BridgeOptions {
  /** Fewest shared commits that count as coupling. Default 2: one shared commit is coincidence. */
  readonly minCoChanges?: number;
  /**
   * Commits touching more files than this are ignored for coupling: a
   * repository-wide reformat or rename couples everything to everything and
   * says nothing about boundaries. Default 50.
   */
  readonly maxFilesPerCommit?: number;
  /** Days without a change after which an element's knowledge is stale. Default 365. */
  readonly staleAfterDays?: number;
}

export interface KnowledgeRiskFinding {
  readonly objectId: string;
  readonly label: string;
  readonly kind: string;
  readonly commits: number;
  readonly distinctAuthors: number;
  /** The author with the most commits (pseudonymous `authorKey` unless identity was included). */
  readonly owner: string;
  /** The owner's share of the element's commits, 0..1, rounded to 3 dp. */
  readonly ownerShare: number;
  readonly lastChangedAt: string;
  readonly singleOwner: boolean;
  readonly stale: boolean;
  /** Single owner AND stale -- the knowledge-loss risk FR-DET-06 asks to flag. */
  readonly atRisk: boolean;
}

/** The repository paths an element's evidence points at (`path#Lx` locators). */
export function evidencePaths(object: CanonicalKnowledgeObject): string[] {
  const paths = new Set<string>();
  for (const entry of object.evidence) {
    const locator = entry.locator;
    if (locator === undefined || locator.includes('://') || locator.startsWith('git:')) continue;
    const path = locator.split('#')[0];
    if (path !== undefined && path.length > 0) paths.add(path);
  }
  return [...paths];
}

function filesIndex(objects: readonly CanonicalKnowledgeObject[]): Map<string, string[]> {
  const byFile = new Map<string, string[]>();
  for (const object of objects) {
    for (const path of evidencePaths(object)) {
      byFile.set(path, [...(byFile.get(path) ?? []), object.identity.id]);
    }
  }
  return byFile;
}

/** Elements touched by each commit, in commit order (oldest first). */
function touchedPerCommit(
  history: readonly CommitRecord[],
  byFile: ReadonlyMap<string, readonly string[]>,
): Array<{ commit: CommitRecord; objectIds: string[] }> {
  return history.map((commit) => {
    const ids = new Set<string>();
    for (const file of commit.files) for (const id of byFile.get(file) ?? []) ids.add(id);
    return { commit, objectIds: [...ids].sort(compareCodeUnits) };
  });
}

/** FR-DET-05 -- `coChangesWith` relationships between elements that change together. */
export function extractChangeCoupling(
  history: readonly CommitRecord[],
  objects: readonly CanonicalKnowledgeObject[],
  options: HistoryOptions,
): CanonicalKnowledgeRelationship[] {
  const minCoChanges = options.minCoChanges ?? 2;
  const maxFiles = options.maxFilesPerCommit ?? 50;
  const byFile = filesIndex(objects);
  const pathsById = new Map(objects.map((o) => [o.identity.id, new Set(evidencePaths(o))]));

  const commitsPerObject = new Map<string, number>();
  const pairs = new Map<string, { a: string; b: string; count: number; lastRevision: string }>();

  for (const { commit, objectIds } of touchedPerCommit(history, byFile)) {
    if (commit.files.length > maxFiles) continue;
    for (const id of objectIds) commitsPerObject.set(id, (commitsPerObject.get(id) ?? 0) + 1);
    for (let i = 0; i < objectIds.length; i++) {
      for (let j = i + 1; j < objectIds.length; j++) {
        const a = objectIds[i] as string;
        const b = objectIds[j] as string;
        // Two elements evidenced in the SAME file always change together;
        // that is co-location, not coupling.
        const aPaths = pathsById.get(a) ?? new Set<string>();
        if ([...(pathsById.get(b) ?? [])].some((path) => aPaths.has(path))) continue;
        const key = `${a}\u0000${b}`;
        const pair = pairs.get(key) ?? { a, b, count: 0, lastRevision: commit.revision };
        pair.count += 1;
        pair.lastRevision = commit.revision;
        pairs.set(key, pair);
      }
    }
  }

  const relationships: CanonicalKnowledgeRelationship[] = [];
  for (const { a, b, count, lastRevision } of pairs.values()) {
    if (count < minCoChanges) continue;
    const commitsA = commitsPerObject.get(a) ?? count;
    const commitsB = commitsPerObject.get(b) ?? count;
    const jaccard = Math.round((count / (commitsA + commitsB - count)) * 1000) / 1000;
    relationships.push({
      id: deterministicId('relationship', 'coChangesWith', a, b),
      category: 'association',
      kind: 'coChangesWith',
      sourceObjectId: a,
      targetObjectId: b,
      attributes: { coChanges: count, jaccard, commitsSource: commitsA, commitsTarget: commitsB },
      metadata: {
        provenance: [
          {
            sourceId: options.sourceId,
            sourceType: 'source-code',
            derivedBy: 'extraction-engine',
            derivedAt: options.generatedAt,
          },
        ],
        confidence: { level: 'high' },
      },
      evidence: [
        {
          id: deterministicId('evidence', 'co-change', options.sourceId, a, b),
          sourceId: options.sourceId,
          locator: `git:${lastRevision}`,
          excerpt: `${count} commit(s) changed both elements' files (most recently ${lastRevision}).`,
          capturedAt: options.generatedAt,
          ...(options.sourceVersion === undefined ? {} : { sourceVersion: options.sourceVersion }),
        },
      ],
      confidenceDetail: { basis: 'observed' },
    });
  }
  return relationships.sort((x, y) => compareCodeUnits(x.id, y.id));
}

/** FR-DET-06 -- ownership and knowledge-loss risk per element. */
export function assessKnowledgeRisk(
  history: readonly CommitRecord[],
  objects: readonly CanonicalKnowledgeObject[],
  options: Pick<HistoryOptions, 'generatedAt' | 'staleAfterDays'>,
): KnowledgeRiskFinding[] {
  const staleMs = (options.staleAfterDays ?? 365) * 24 * 60 * 60 * 1000;
  const now = Date.parse(options.generatedAt);
  const byFile = filesIndex(objects);
  const perObject = new Map<
    string,
    { commits: number; authors: Map<string, number>; last: string }
  >();

  for (const { commit, objectIds } of touchedPerCommit(history, byFile)) {
    const author = commit.author ?? commit.authorKey;
    for (const id of objectIds) {
      const entry = perObject.get(id) ?? {
        commits: 0,
        authors: new Map<string, number>(),
        last: commit.committedAt,
      };
      entry.commits += 1;
      entry.authors.set(author, (entry.authors.get(author) ?? 0) + 1);
      if (Date.parse(commit.committedAt) >= Date.parse(entry.last)) entry.last = commit.committedAt;
      perObject.set(id, entry);
    }
  }

  const findings: KnowledgeRiskFinding[] = [];
  for (const object of objects) {
    const entry = perObject.get(object.identity.id);
    if (entry === undefined) continue;
    const [owner = '', ownerCommits = 0] = [...entry.authors.entries()].sort(
      (x, y) => y[1] - x[1] || compareCodeUnits(x[0], y[0]),
    )[0] ?? ['', 0];
    const singleOwner = entry.authors.size === 1;
    const stale = now - Date.parse(entry.last) > staleMs;
    findings.push({
      objectId: object.identity.id,
      label: object.label,
      kind: object.kind,
      commits: entry.commits,
      distinctAuthors: entry.authors.size,
      owner,
      ownerShare: Math.round((ownerCommits / entry.commits) * 1000) / 1000,
      lastChangedAt: entry.last,
      singleOwner,
      stale,
      atRisk: singleOwner && stale,
    });
  }
  return findings.sort((x, y) => compareCodeUnits(x.objectId, y.objectId));
}
