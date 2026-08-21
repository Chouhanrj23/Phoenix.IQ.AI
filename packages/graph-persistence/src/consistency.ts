/**
 * P4-09 -- graph consistency validation.
 *
 * Compares the canonical OKF (via P4-01's `mapOkfBundleToGraph`, the same
 * "expected" shape P4-02/P4-03/P4-04 already persist from) against what a
 * real query of the graph (`query.ts`'s `QueriedGraph`) actually contains.
 * Purely a comparison: this module never writes to Neo4j, never modifies
 * the OKF, and never repairs anything it finds wrong -- it only reports,
 * precisely and deterministically, what differs and why.
 *
 * "Missing" always means "in the OKF, not in the graph"; "extra" always
 * means "in the graph, not in the OKF" -- the OKF is the source of truth
 * being checked AGAINST, never adjusted to match the graph.
 *
 * An object/relationship whose `kind` has no P4-01 mapping (a
 * `GraphMappingIssue`) is not treated as "missing from the graph" -- it was
 * never expected to be there in the first place, so reporting it as
 * "missing" would be misleading. Those are surfaced separately, as
 * `unmappable`, not folded into `differences`.
 */

import type { CanonicalKnowledgeBundle } from '@phoenix-ai/knowledge-graph';
import { mapOkfBundleToGraph, type GraphMappingIssue } from './graph-mapping.js';
import type { QueriedGraph, QueriedNode, QueriedRelationship } from './query.js';

export type ConsistencyDifferenceKind =
  | 'missing-node'
  | 'extra-node'
  | 'node-label-mismatch'
  | 'node-property-mismatch'
  | 'missing-relationship'
  | 'extra-relationship'
  | 'relationship-type-mismatch'
  | 'relationship-endpoint-mismatch'
  | 'provenance-mismatch'
  | 'confidence-mismatch';

export interface ConsistencyDifference {
  readonly kind: ConsistencyDifferenceKind;
  readonly id: string;
  readonly detail: string;
}

export interface ConsistencyReport {
  readonly consistent: boolean;
  readonly differences: readonly ConsistencyDifference[];
  /** OKF objects/relationships P4-01 could not map at all (unknown kind, missing id) -- not a graph inconsistency, since they were never expected to be persisted. */
  readonly unmappable: readonly GraphMappingIssue[];
}

function parseJsonArray(value: unknown): unknown[] | undefined {
  if (typeof value !== 'string') return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function compareNode(
  expected: {
    id: string;
    label: string;
    properties: Readonly<Record<string, unknown>>;
    provenance: readonly unknown[];
    evidence: readonly unknown[];
  },
  actual: QueriedNode,
  differences: ConsistencyDifference[],
): void {
  if (actual.label !== expected.label) {
    differences.push({
      kind: 'node-label-mismatch',
      id: expected.id,
      detail: `expected label "${expected.label}", graph has "${actual.label}"`,
    });
  }

  for (const key of ['kind', 'category', 'label'] as const) {
    if (actual.properties[key] !== expected.properties[key]) {
      differences.push({
        kind: 'node-property-mismatch',
        id: expected.id,
        detail: `property "${key}": expected ${JSON.stringify(expected.properties[key])}, graph has ${JSON.stringify(actual.properties[key])}`,
      });
    }
  }

  const actualConfidenceLevel = actual.properties.confidenceLevel;
  const expectedConfidenceLevel = expected.properties.confidenceLevel;
  if (actualConfidenceLevel !== expectedConfidenceLevel) {
    differences.push({
      kind: 'confidence-mismatch',
      id: expected.id,
      detail: `confidenceLevel: expected ${JSON.stringify(expectedConfidenceLevel)}, graph has ${JSON.stringify(actualConfidenceLevel)}`,
    });
  }

  const actualProvenance = parseJsonArray(actual.properties.provenanceJson);
  if (actualProvenance === undefined || !deepEqual(actualProvenance, expected.provenance)) {
    differences.push({
      kind: 'provenance-mismatch',
      id: expected.id,
      detail: "graph provenanceJson does not match the OKF object's metadata.provenance",
    });
  }
}

function compareRelationship(
  expected: {
    id: string;
    type: string;
    sourceId: string;
    targetId: string;
    properties: Readonly<Record<string, unknown>>;
    provenance: readonly unknown[];
  },
  actual: QueriedRelationship,
  differences: ConsistencyDifference[],
): void {
  if (actual.type !== expected.type) {
    differences.push({
      kind: 'relationship-type-mismatch',
      id: expected.id,
      detail: `expected type "${expected.type}", graph has "${actual.type}"`,
    });
  }
  if (actual.sourceId !== expected.sourceId || actual.targetId !== expected.targetId) {
    differences.push({
      kind: 'relationship-endpoint-mismatch',
      id: expected.id,
      detail: `expected ${expected.sourceId} -> ${expected.targetId}, graph has ${actual.sourceId} -> ${actual.targetId}`,
    });
  }

  const actualConfidenceLevel = actual.properties.confidenceLevel;
  const expectedConfidenceLevel = expected.properties.confidenceLevel;
  if (actualConfidenceLevel !== expectedConfidenceLevel) {
    differences.push({
      kind: 'confidence-mismatch',
      id: expected.id,
      detail: `confidenceLevel: expected ${JSON.stringify(expectedConfidenceLevel)}, graph has ${JSON.stringify(actualConfidenceLevel)}`,
    });
  }

  const actualProvenance = parseJsonArray(actual.properties.provenanceJson);
  if (actualProvenance === undefined || !deepEqual(actualProvenance, expected.provenance)) {
    differences.push({
      kind: 'provenance-mismatch',
      id: expected.id,
      detail: "graph provenanceJson does not match the OKF relationship's metadata.provenance",
    });
  }
}

/**
 * Compares a canonical OKF bundle (via P4-01's mapping -- the "expected"
 * graph) against a real, already-queried graph (the "actual" graph,
 * `query.ts`'s `getFullGraph` output). Deterministic: differences are always
 * returned sorted by id, regardless of either input's array order.
 */
export function checkGraphConsistency(
  bundle: CanonicalKnowledgeBundle,
  actual: QueriedGraph,
): ConsistencyReport {
  const expected = mapOkfBundleToGraph(bundle);
  const differences: ConsistencyDifference[] = [];

  const actualNodesById = new Map(actual.nodes.map((n) => [n.id, n]));
  const expectedNodeIds = new Set(expected.nodes.map((n) => n.id));

  for (const expectedNode of expected.nodes) {
    const actualNode = actualNodesById.get(expectedNode.id);
    if (actualNode === undefined) {
      differences.push({
        kind: 'missing-node',
        id: expectedNode.id,
        detail: `expected in the graph (label "${expectedNode.label}") but not found`,
      });
      continue;
    }
    compareNode(expectedNode, actualNode, differences);
  }

  for (const actualNode of actual.nodes) {
    if (!expectedNodeIds.has(actualNode.id)) {
      differences.push({
        kind: 'extra-node',
        id: actualNode.id,
        detail: `present in the graph (label "${actualNode.label}") but not in the OKF bundle`,
      });
    }
  }

  const actualRelationshipsById = new Map(actual.relationships.map((r) => [r.id, r]));
  const expectedRelationshipIds = new Set(expected.relationships.map((r) => r.id));

  for (const expectedRelationship of expected.relationships) {
    const actualRelationship = actualRelationshipsById.get(expectedRelationship.id);
    if (actualRelationship === undefined) {
      differences.push({
        kind: 'missing-relationship',
        id: expectedRelationship.id,
        detail: `expected in the graph (type "${expectedRelationship.type}") but not found`,
      });
      continue;
    }
    compareRelationship(expectedRelationship, actualRelationship, differences);
  }

  for (const actualRelationship of actual.relationships) {
    if (!expectedRelationshipIds.has(actualRelationship.id)) {
      differences.push({
        kind: 'extra-relationship',
        id: actualRelationship.id,
        detail: `present in the graph (type "${actualRelationship.type}") but not in the OKF bundle`,
      });
    }
  }

  differences.sort((a, b) => a.id.localeCompare(b.id) || a.kind.localeCompare(b.kind));

  return { consistent: differences.length === 0, differences, unmappable: expected.issues };
}
