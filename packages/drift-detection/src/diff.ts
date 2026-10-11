/**
 * P8 -- the Differential / Drift Detection Engine (FRD §3.9):
 *
 *  - FR-DFT-02: diff a new graph version against the prior one and produce
 *    an architectural changelog;
 *  - FR-DFT-03: classify every change (added / removed / modified, and what
 *    kind of element: architecture, entity, integration, flow, deployment,
 *    …);
 *  - FR-DFT-04: immune to model non-determinism -- elements are compared by
 *    their ARCHITECTURAL signature (`objectSignature`), never by evidence
 *    positions, confidence wording or timestamps, and inferred elements are
 *    reported apart from observed ones so interpretive churn is never
 *    mistaken for a change in the system.
 *
 * (FR-DFT-01, re-processing only changed artifacts, is in the extraction
 * engine's parse cache; this module only ever sees finished versions.)
 */

import type { DriftAlert, DriftRun } from '@phoenix-ai/shared';
import { compareCodeUnits } from '@phoenix-ai/shared';
import type {
  CanonicalKnowledgeObject,
  CanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { objectSignature, relationshipSignature, type GraphVersion } from './version.js';

export type ChangeType = 'added' | 'removed' | 'modified';

/** FR-DFT-03 -- what kind of element changed. */
export type ChangeClass =
  | 'architecture'
  | 'entity'
  | 'integration'
  | 'flow'
  | 'deployment'
  | 'business'
  | 'conflict'
  | 'backlog'
  | 'review'
  | 'relationship'
  | 'other';

export interface DriftChange {
  readonly elementType: 'object' | 'relationship';
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly change: ChangeType;
  readonly changeClass: ChangeClass;
  /** `observed` (extracted) or `derived` (inferred) -- inferred churn is reported apart. */
  readonly basis: 'observed' | 'derived';
  /** For `modified`: which top-level fields differ (`label`, `attributes.<name>`, `endpoints`, …). */
  readonly changedFields: readonly string[];
}

export interface Changelog {
  readonly systemId: string;
  readonly fromVersionId?: string;
  readonly toVersionId: string;
  readonly generatedAt: string;
  readonly changes: readonly DriftChange[];
  readonly summary: {
    readonly added: number;
    readonly removed: number;
    readonly modified: number;
    /** Changes to observed (deterministically extracted) elements -- the architectural drift. */
    readonly observed: number;
    /** Changes to inferred elements -- reported, but not architectural drift. */
    readonly inferred: number;
    readonly byClass: Readonly<Record<string, number>>;
  };
}

export function classifyKind(kind: string): ChangeClass {
  const prefix = kind.split('.')[0];
  switch (prefix) {
    case 'architecture':
      return 'architecture';
    case 'domain':
      return 'entity';
    case 'integration':
      return 'integration';
    case 'journey':
      return 'flow';
    case 'deployment':
      return 'deployment';
    case 'business':
      return 'business';
    case 'reconciliation':
      return 'conflict';
    case 'workitem':
      return 'backlog';
    case 'review':
      return 'review';
    default:
      return 'other';
  }
}

function basisOf(element: { confidenceDetail?: { basis?: string } }): 'observed' | 'derived' {
  return element.confidenceDetail?.basis === 'derived' ? 'derived' : 'observed';
}

function objectFieldDiff(
  before: CanonicalKnowledgeObject,
  after: CanonicalKnowledgeObject,
): string[] {
  const fields: string[] = [];
  if (before.kind !== after.kind) fields.push('kind');
  if (before.category !== after.category) fields.push('category');
  if (before.label !== after.label) fields.push('label');
  const keys = new Set([...Object.keys(before.attributes), ...Object.keys(after.attributes)]);
  for (const key of [...keys].sort(compareCodeUnits)) {
    if (JSON.stringify(before.attributes[key]) !== JSON.stringify(after.attributes[key])) {
      fields.push(`attributes.${key}`);
    }
  }
  return fields;
}

function relationshipFieldDiff(
  before: CanonicalKnowledgeRelationship,
  after: CanonicalKnowledgeRelationship,
): string[] {
  const fields: string[] = [];
  if (before.kind !== after.kind) fields.push('kind');
  if (
    before.sourceObjectId !== after.sourceObjectId ||
    before.targetObjectId !== after.targetObjectId
  ) {
    fields.push('endpoints');
  }
  if (JSON.stringify(before.attributes ?? {}) !== JSON.stringify(after.attributes ?? {})) {
    fields.push('attributes');
  }
  return fields;
}

/** FR-DFT-02 -- the changelog from `previous` (or from nothing) to `next`. */
export function diffGraphVersions(
  previous: GraphVersion | undefined,
  next: GraphVersion,
): Changelog {
  const changes: DriftChange[] = [];
  const beforeObjects = new Map((previous?.bundle.objects ?? []).map((o) => [o.identity.id, o]));
  const afterObjects = new Map(next.bundle.objects.map((o) => [o.identity.id, o]));
  const labelOf = (id: string) => afterObjects.get(id)?.label ?? beforeObjects.get(id)?.label ?? id;

  for (const [id, after] of afterObjects) {
    const before = beforeObjects.get(id);
    const common = {
      elementType: 'object' as const,
      id,
      kind: after.kind,
      label: after.label,
      changeClass: classifyKind(after.kind),
      basis: basisOf(after),
    };
    if (before === undefined) changes.push({ ...common, change: 'added', changedFields: [] });
    else if (objectSignature(before) !== objectSignature(after)) {
      changes.push({
        ...common,
        change: 'modified',
        changedFields: objectFieldDiff(before, after),
      });
    }
  }
  for (const [id, before] of beforeObjects) {
    if (afterObjects.has(id)) continue;
    changes.push({
      elementType: 'object',
      id,
      kind: before.kind,
      label: before.label,
      change: 'removed',
      changeClass: classifyKind(before.kind),
      basis: basisOf(before),
      changedFields: [],
    });
  }

  const beforeRels = new Map((previous?.bundle.relationships ?? []).map((r) => [r.id, r]));
  const afterRels = new Map(next.bundle.relationships.map((r) => [r.id, r]));
  const relLabel = (r: CanonicalKnowledgeRelationship) =>
    `${labelOf(r.sourceObjectId)} ${r.kind} ${labelOf(r.targetObjectId)}`;
  for (const [id, after] of afterRels) {
    const before = beforeRels.get(id);
    const common = {
      elementType: 'relationship' as const,
      id,
      kind: after.kind,
      label: relLabel(after),
      changeClass: 'relationship' as const,
      basis: basisOf(after),
    };
    if (before === undefined) changes.push({ ...common, change: 'added', changedFields: [] });
    else if (relationshipSignature(before) !== relationshipSignature(after)) {
      changes.push({
        ...common,
        change: 'modified',
        changedFields: relationshipFieldDiff(before, after),
      });
    }
  }
  for (const [id, before] of beforeRels) {
    if (afterRels.has(id)) continue;
    changes.push({
      elementType: 'relationship',
      id,
      kind: before.kind,
      label: relLabel(before),
      change: 'removed',
      changeClass: 'relationship',
      basis: basisOf(before),
      changedFields: [],
    });
  }

  changes.sort(
    (a, b) =>
      compareCodeUnits(a.elementType, b.elementType) ||
      compareCodeUnits(a.change, b.change) ||
      compareCodeUnits(a.id, b.id),
  );

  const byClass: Record<string, number> = {};
  for (const change of changes)
    byClass[change.changeClass] = (byClass[change.changeClass] ?? 0) + 1;

  return {
    systemId: next.systemId,
    ...(previous === undefined ? {} : { fromVersionId: previous.id }),
    toVersionId: next.id,
    generatedAt: next.createdAt,
    changes,
    summary: {
      added: changes.filter((c) => c.change === 'added').length,
      removed: changes.filter((c) => c.change === 'removed').length,
      modified: changes.filter((c) => c.change === 'modified').length,
      observed: changes.filter((c) => c.basis === 'observed').length,
      inferred: changes.filter((c) => c.basis === 'derived').length,
      byClass,
    },
  };
}

/** One line a person can read. */
export function describeChangelog(changelog: Changelog): string {
  const { added, removed, modified, observed, inferred } = changelog.summary;
  if (changelog.fromVersionId === undefined) {
    return `Baseline version ${changelog.toVersionId}: ${added} element(s) recorded.`;
  }
  if (changelog.changes.length === 0) {
    return `No change since ${changelog.fromVersionId}.`;
  }
  return `${added} added, ${removed} removed, ${modified} modified since ${changelog.fromVersionId} (${observed} architectural, ${inferred} inferred).`;
}

/** The API's Phase 1 `DriftRun` contract, filled from a real changelog. */
export function toDriftRun(changelog: Changelog): DriftRun {
  const changes: DriftAlert[] = changelog.changes
    .filter((change) => change.basis === 'observed')
    .map((change) => ({
      id: `${changelog.toVersionId}:${change.id}`,
      elementName: change.label,
      changeType: change.change,
      description:
        change.change === 'modified'
          ? `${change.kind} changed (${change.changedFields.join(', ')}).`
          : `${change.kind} ${change.change}.`,
      detectedAt: changelog.generatedAt,
    }));
  return {
    id: changelog.toVersionId,
    runDate: changelog.generatedAt,
    summary: describeChangelog(changelog),
    changes,
  };
}
