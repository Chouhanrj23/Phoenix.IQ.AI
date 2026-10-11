/**
 * P8 -- FR-KG-05: "The graph shall be versioned; each run shall produce an
 * immutable, addressable graph version."
 *
 * A version's id is a content address: the SHA-256 of the canonical bundle
 * with only time-of-run fields removed (`generatedAt`, `createdAt`,
 * `updatedAt`, `derivedAt`, `capturedAt`, `calculatedAt`). Re-running
 * unchanged input therefore yields the SAME version (nothing new to store),
 * while any change to an element, a relationship, evidence or the source
 * revision yields a new one. Keys are sorted at every depth, so the id does
 * not depend on object insertion order (FR-DET-07).
 *
 * Each version also records, per element, the version in which it was
 * produced or last changed -- FRD §4.3's mandatory `version` metadata -- by
 * comparing against the parent version's architectural signatures
 * (`diff.ts`).
 */

import { createHash } from 'node:crypto';
import type {
  CanonicalKnowledgeBundle,
  CanonicalKnowledgeObject,
  CanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { compareCodeUnits } from '@phoenix-ai/shared';

const TIME_OF_RUN_KEYS = new Set([
  'generatedAt',
  'createdAt',
  'updatedAt',
  'derivedAt',
  'capturedAt',
  'calculatedAt',
]);

/** Canonical JSON: keys sorted at every depth, the given keys dropped at every depth. */
export function canonicalJson(value: unknown, dropKeys: ReadonlySet<string> = new Set()): string {
  const normalise = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(normalise);
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {};
      for (const key of Object.keys(node).sort(compareCodeUnits)) {
        if (dropKeys.has(key)) continue;
        const entry = (node as Record<string, unknown>)[key];
        if (entry === undefined) continue;
        out[key] = normalise(entry);
      }
      return out;
    }
    return node;
  };
  return JSON.stringify(normalise(value));
}

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * The exact content a version id addresses: the bundle in canonical order,
 * with time-of-run fields removed. Two bundles with the same content are the
 * same version, whenever each was produced.
 */
export function versionContent(bundle: CanonicalKnowledgeBundle): string {
  const ordered = {
    systemId: bundle.systemId,
    objects: [...bundle.objects].sort((a, b) => compareCodeUnits(a.identity.id, b.identity.id)),
    relationships: [...bundle.relationships].sort((a, b) => compareCodeUnits(a.id, b.id)),
    sources: [...(bundle.sources ?? [])].sort((a, b) => compareCodeUnits(a.id, b.id)),
  };
  return canonicalJson(ordered, TIME_OF_RUN_KEYS);
}

/** The content address of a bundle -- identical for identical knowledge, whenever it was produced. */
export function graphVersionId(bundle: CanonicalKnowledgeBundle): string {
  return `gv-${sha256(versionContent(bundle)).slice(0, 24)}`;
}

/**
 * What counts as an ARCHITECTURAL change to an element (FR-DFT-04: diff the
 * deterministic graph, not prose or bookkeeping): its kind, category, label
 * and attributes, and for a relationship its endpoints. Evidence locations,
 * confidence wording and timestamps are excluded -- code that moved down a
 * few lines is a new version, but not drift.
 */
export function objectSignature(object: CanonicalKnowledgeObject): string {
  return canonicalJson({
    kind: object.kind,
    category: object.category,
    label: object.label,
    attributes: object.attributes,
  });
}

export function relationshipSignature(relationship: CanonicalKnowledgeRelationship): string {
  return canonicalJson({
    kind: relationship.kind,
    category: relationship.category,
    sourceObjectId: relationship.sourceObjectId,
    targetObjectId: relationship.targetObjectId,
    attributes: relationship.attributes ?? {},
  });
}

/** An immutable, addressable snapshot of one system's graph. */
export interface GraphVersion {
  readonly id: string;
  readonly systemId: string;
  /** The version this one was compared against, when there was one. */
  readonly parentId?: string;
  /** When the run that produced this version happened (the run's `generatedAt`). */
  readonly createdAt: string;
  /** Source id -> revision read, for every registered source that pinned one. */
  readonly sourceRevisions: Readonly<Record<string, string>>;
  readonly objectCount: number;
  readonly relationshipCount: number;
  /** FRD §4.3 -- element id -> the version in which it was produced or last changed. */
  readonly elementVersions: Readonly<Record<string, string>>;
  readonly bundle: CanonicalKnowledgeBundle;
}

/**
 * Builds the version for `bundle`. With a `parent`, an element whose
 * architectural signature is unchanged keeps the version it already had;
 * a new or changed element is stamped with this version.
 */
export function createGraphVersion(
  bundle: CanonicalKnowledgeBundle,
  parent?: GraphVersion,
): GraphVersion {
  const id = graphVersionId(bundle);
  const parentObjects = new Map(
    (parent?.bundle.objects ?? []).map((o) => [o.identity.id, objectSignature(o)]),
  );
  const parentRelationships = new Map(
    (parent?.bundle.relationships ?? []).map((r) => [r.id, relationshipSignature(r)]),
  );

  const elementVersions: Record<string, string> = {};
  for (const object of [...bundle.objects].sort((a, b) =>
    compareCodeUnits(a.identity.id, b.identity.id),
  )) {
    const inherited = parent?.elementVersions[object.identity.id];
    elementVersions[object.identity.id] =
      inherited !== undefined && parentObjects.get(object.identity.id) === objectSignature(object)
        ? inherited
        : id;
  }
  for (const relationship of [...bundle.relationships].sort((a, b) =>
    compareCodeUnits(a.id, b.id),
  )) {
    const inherited = parent?.elementVersions[relationship.id];
    elementVersions[relationship.id] =
      inherited !== undefined &&
      parentRelationships.get(relationship.id) === relationshipSignature(relationship)
        ? inherited
        : id;
  }

  const sourceRevisions: Record<string, string> = {};
  for (const source of [...(bundle.sources ?? [])].sort((a, b) => compareCodeUnits(a.id, b.id))) {
    if (source.version !== undefined) sourceRevisions[source.id] = source.version;
  }

  return {
    id,
    systemId: bundle.systemId,
    ...(parent === undefined || parent.id === id ? {} : { parentId: parent.id }),
    createdAt: bundle.generatedAt,
    sourceRevisions,
    objectCount: bundle.objects.length,
    relationshipCount: bundle.relationships.length,
    elementVersions,
    bundle,
  };
}
