/**
 * P4-02 -- OKF -> Neo4j transformation.
 *
 * Turns P4-01's graph-shaped mapping (`GraphNodeMapping`/`GraphRelationshipMapping`,
 * `graph-mapping.ts`) into concrete, parameterized Cypher `MERGE` write
 * operations ready for a LATER ticket (P4-03/P4-04) to actually execute
 * against a real Neo4j instance. This module never imports `neo4j-driver`,
 * never opens a session, never runs anything -- it only builds strings and
 * parameter objects, synchronously, with no I/O.
 *
 * Where P4-01 decides WHAT an OKF concept becomes in graph terms (a label, a
 * relationship type, a property bag, preserved provenance/evidence), this
 * module decides HOW that shape becomes a real, safe, idempotent write:
 *
 *  - `MERGE` (never bare `CREATE`) keyed on the OKF's own stable `id` --
 *    repeated transformation + ingestion of identical input must never
 *    create a duplicate node/relationship (Step 4 of P4-01, carried
 *    forward here as the actual write semantics).
 *  - Every VALUE (id, every property) is a bound Cypher parameter, never
 *    string-interpolated. The one exception -- and the only thing this
 *    module ever interpolates directly into Cypher text -- is the node
 *    LABEL / relationship TYPE, because Neo4j's Cypher grammar does not
 *    allow a label or relationship type to be a bound parameter at all
 *    (this is a real, documented Neo4j/driver limitation, not a choice).
 *    This is safe here specifically because a label/type string can only
 *    ever be one of the fixed values in `OBJECT_KIND_TO_LABEL`/
 *    `RELATIONSHIP_KIND_TO_TYPE` (`graph-mapping.ts`) -- never arbitrary
 *    external/user text -- so there is nothing to inject.
 *  - `provenance`/`evidence` (both arrays, preserved unflattened by P4-01)
 *    are serialized to `provenanceJson`/`evidenceJson` string properties --
 *    a structured-property-object representation (one of the three shapes
 *    P4-05's tracker requirement explicitly allows), not a separate
 *    `(:Source)`/`(:Evidence)` graph node. That richer design remains a
 *    documented option for later (ADR 0024 decision 5) but was not required
 *    to satisfy "no loss of provenance" -- `JSON.parse` round-trips it
 *    exactly, and P4-05/P4-06's tests prove that.
 */

import type {
  GraphNodeMapping,
  GraphPropertyValue,
  GraphRelationshipMapping,
} from './graph-mapping.js';

/** A single node MERGE, fully parameterized apart from its fixed, closed-vocabulary label. */
export interface NodeWriteOperation {
  readonly id: string;
  readonly label: string;
  readonly cypher: string;
  readonly params: { readonly id: string; readonly properties: Readonly<Record<string, unknown>> };
}

/** A single relationship MERGE, fully parameterized apart from its fixed, closed-vocabulary type. Matches endpoints by `id` alone (no label constraint), since ids are unique across this bundle regardless of label. */
export interface RelationshipWriteOperation {
  readonly id: string;
  readonly type: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly cypher: string;
  readonly params: {
    readonly relationshipId: string;
    readonly sourceId: string;
    readonly targetId: string;
    readonly properties: Readonly<Record<string, unknown>>;
  };
}

export interface GraphWriteOperations {
  readonly nodeOperations: readonly NodeWriteOperation[];
  readonly relationshipOperations: readonly RelationshipWriteOperation[];
}

/** JSON-stringifies an array that may be empty -- `[]` for "no provenance/evidence", never omitted, so a caller reading the property back always gets valid JSON. */
function toJsonArrayProperty(value: readonly unknown[]): string {
  return JSON.stringify(value);
}

function toCypherProperties(
  properties: Readonly<Record<string, GraphPropertyValue>>,
  provenance: readonly unknown[],
  evidence: readonly unknown[],
): Record<string, unknown> {
  return {
    ...properties,
    provenanceJson: toJsonArrayProperty(provenance),
    evidenceJson: toJsonArrayProperty(evidence),
  };
}

/**
 * Builds one node's write operation. `MERGE (n:Label {id: $id}) SET n += $properties`
 * -- keyed on `id` only (never on any other property), so re-running this
 * exact operation always converges to the same single node, updated to the
 * latest properties, never duplicated.
 */
export function buildNodeWriteOperation(node: GraphNodeMapping): NodeWriteOperation {
  const properties = toCypherProperties(node.properties, node.provenance, node.evidence);
  return {
    id: node.id,
    label: node.label,
    cypher: `MERGE (n:${node.label} {id: $id}) SET n += $properties RETURN n`,
    params: { id: node.id, properties },
  };
}

/**
 * Builds one relationship's write operation. Endpoints are matched by `id`
 * alone (`MATCH (source {id: $sourceId}), (target {id: $targetId})`) --
 * intentionally NOT constrained by label, since the OKF relationship only
 * carries object ids, not their kinds, and ids are unique within a bundle
 * regardless of label. If either endpoint does not exist, the `MATCH`
 * matches zero rows and the `MERGE` never runs -- the query returns zero
 * records, which the ingestion layer (P4-03/P4-04) must treat as "endpoint
 * missing", not silently ignore.
 */
export function buildRelationshipWriteOperation(
  relationship: GraphRelationshipMapping,
): RelationshipWriteOperation {
  const properties = toCypherProperties(
    relationship.properties,
    relationship.provenance,
    relationship.evidence,
  );
  return {
    id: relationship.id,
    type: relationship.type,
    sourceId: relationship.sourceId,
    targetId: relationship.targetId,
    cypher: `MATCH (source {id: $sourceId}), (target {id: $targetId}) MERGE (source)-[r:${relationship.type} {id: $relationshipId}]->(target) SET r += $properties RETURN r`,
    params: {
      relationshipId: relationship.id,
      sourceId: relationship.sourceId,
      targetId: relationship.targetId,
      properties,
    },
  };
}

/**
 * Builds every node/relationship write operation for a full P4-01 mapping
 * result, in the same deterministic (id-sorted) order `mapOkfBundleToGraph`
 * already produces -- nodes first, so P4-03/P4-04 can persist nodes before
 * the relationships that reference them.
 */
export function buildGraphWriteOperations(mapping: {
  readonly nodes: readonly GraphNodeMapping[];
  readonly relationships: readonly GraphRelationshipMapping[];
}): GraphWriteOperations {
  return {
    nodeOperations: mapping.nodes.map(buildNodeWriteOperation),
    relationshipOperations: mapping.relationships.map(buildRelationshipWriteOperation),
  };
}
