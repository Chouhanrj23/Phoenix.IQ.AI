/**
 * P4-01 -- the authoritative OKF -> graph model mapping.
 *
 * The Phase 2 canonical OKF (`@phoenix-ai/knowledge-graph`) remains the sole
 * knowledge representation. This module does not add a second one: every
 * node-label and relationship-type table below is keyed by the SAME `kind`
 * strings Phase 2's own domain files (`architecture.ts`/`domain.ts`/
 * `journey.ts`/`integration.ts`) already define and validate against --
 * nothing here re-derives, re-names, or re-interprets what those files
 * already say a `kind` means. `attributes` (a free-form, per-kind-typed bag
 * in Phase 2) is deliberately treated as OPAQUE here and flattened
 * generically for Neo4j property-value safety (see `flattenAttributesInto`)
 * rather than hand-mapped field-by-field per kind -- doing the latter would
 * itself be exactly the "second domain model" this ticket forbids, since it
 * would duplicate typing Phase 2's domain files already own.
 *
 * Scope, strictly: OKF object/relationship -> an in-memory graph-shaped
 * value (`GraphNodeMapping`/`GraphRelationshipMapping`). This module never
 * imports `neo4j-driver`, opens a session, or runs Cypher -- that is
 * `neo4j-client.ts`'s (connection only, today) and a LATER ticket's job
 * (P4-02 transformation-to-Cypher-params, P4-03/04 actual persistence).
 *
 * Preconditions this module relies on, not re-checks: the input
 * `CanonicalKnowledgeBundle` is assumed already valid per
 * `validateCanonicalKnowledgeBundle`/`validateSourceReferences`
 * (`@phoenix-ai/knowledge-graph`) -- e.g. every `sourceObjectId`/
 * `targetObjectId` really does reference an object in `bundle.objects`.
 * Re-validating that here would duplicate, not compose with, P2's own
 * validators. What THIS module does check, per element, is narrower: does
 * its `kind` have a known graph mapping, and does it carry the stable id
 * this module requires (never inventing one when absent).
 *
 * See `docs/architecture/adr/0024-p4-01-graph-mapping.md` for the full
 * design rationale, the complete node/relationship mapping tables, the
 * identity strategy, and the documented (not yet implemented) UI adapter
 * boundary.
 */

import {
  ARCHITECTURE_OBJECT_KINDS,
  ARCHITECTURE_RELATIONSHIP_KINDS,
  DOMAIN_OBJECT_KINDS,
  DOMAIN_RELATIONSHIP_KINDS,
  JOURNEY_OBJECT_KINDS,
  JOURNEY_RELATIONSHIP_KINDS,
  INTEGRATION_OBJECT_KINDS,
  INTEGRATION_RELATIONSHIP_KINDS,
  REVIEW_OBJECT_KINDS,
  type CanonicalKnowledgeBundle,
  type CanonicalKnowledgeObject,
  type CanonicalKnowledgeRelationship,
  type Evidence,
  type KnowledgeValue,
} from '@phoenix-ai/knowledge-graph';
import type { Provenance } from '@phoenix-ai/shared';

// ---------------------------------------------------------------------------
// Node label mapping (Step 2) -- every OKF object kind that exists today.
// Keys are exactly the `kind` literals `architecture.ts`/`domain.ts`/
// `journey.ts`/`integration.ts` define (`ARCHITECTURE_OBJECT_KINDS` etc.,
// re-exported below purely so a test can assert this table stays exhaustive
// against them, never duplicated by hand a second time).
// ---------------------------------------------------------------------------

export const OBJECT_KIND_TO_LABEL: Readonly<Record<string, string>> = {
  'architecture.system': 'System',
  'architecture.container': 'Container',
  'architecture.component': 'Component',
  'domain.domain': 'Domain',
  'domain.entity': 'Entity',
  'domain.aggregate': 'Aggregate',
  'domain.entity-state': 'EntityState',
  'journey.persona': 'Persona',
  'journey.journey': 'Journey',
  'journey.flow': 'Flow',
  'journey.action': 'Action',
  'integration.api': 'Api',
  'integration.interface': 'Interface',
  'integration.integration': 'Integration',
  'integration.dataflow': 'DataFlow',
  // P7-01: the human review decision (`category: 'observation'`), so a
  // persisted decision is a first-class graph node rather than a side table.
  'review.decision': 'ReviewDecision',
};

/** Every OKF object `kind` this module knows a Neo4j label for -- exported for the exhaustiveness test and for future callers (e.g. a P4-08 UI adapter) that need the full known-kind list. */
export const KNOWN_OBJECT_KINDS: readonly string[] = [
  ...ARCHITECTURE_OBJECT_KINDS,
  ...DOMAIN_OBJECT_KINDS,
  ...JOURNEY_OBJECT_KINDS,
  ...INTEGRATION_OBJECT_KINDS,
  ...REVIEW_OBJECT_KINDS,
];

// ---------------------------------------------------------------------------
// Relationship type mapping (Step 3). The 17 keys through `realizes` are the
// complete SCHEMA-SUPPORTED vocabulary (the closed, per-domain relationship
// `kind`s `architecture.ts`/`domain.ts`/`journey.ts`/`integration.ts`
// validate against -- `contains` appears in three of those files with
// identical meaning, so it is one entry here, not three).
// `dependsOn`/`hasAssociation` are additive: NOT part of any domain file's
// closed vocabulary, minted by the Phase 4 prerequisite fix
// (`bridge-relationships.ts`, ADR 0023) using P2-01/P2-02's deliberately
// open `kind` string -- these are the only two relationship kinds Phase 3
// CURRENTLY PRODUCES. See `docs/architecture/adr/0024-p4-01-graph-mapping.md`
// for the full "supported by schema" vs "currently produced" table.
// ---------------------------------------------------------------------------

export const RELATIONSHIP_KIND_TO_TYPE: Readonly<Record<string, string>> = {
  contains: 'CONTAINS',
  communicatesWith: 'COMMUNICATES_WITH',
  aggregateRoot: 'AGGREGATE_ROOT',
  aggregateMember: 'AGGREGATE_MEMBER',
  hasState: 'HAS_STATE',
  transitionsTo: 'TRANSITIONS_TO',
  relatesTo: 'RELATES_TO',
  hasPersona: 'HAS_PERSONA',
  supports: 'SUPPORTS',
  readsEntity: 'READS_ENTITY',
  writesEntity: 'WRITES_ENTITY',
  triggersTransition: 'TRIGGERS_TRANSITION',
  hasIntegration: 'HAS_INTEGRATION',
  carries: 'CARRIES',
  exposes: 'EXPOSES',
  consumes: 'CONSUMES',
  realizes: 'REALIZES',
  // Additive, currently-produced-by-Phase-3 kinds (ADR 0023) -- not part of
  // any closed per-domain vocabulary.
  dependsOn: 'DEPENDS_ON',
  hasAssociation: 'HAS_ASSOCIATION',
  // P7-01: links a `review.decision` to the element it reviewed. Additive
  // for the same reason -- a review decision is not part of any closed
  // per-domain relationship vocabulary.
  reviewOf: 'REVIEW_OF',
};

/** The closed, schema-defined relationship kinds only (excludes `dependsOn`/`hasAssociation`) -- exported for the exhaustiveness test. */
export const SCHEMA_RELATIONSHIP_KINDS: readonly string[] = [
  ...ARCHITECTURE_RELATIONSHIP_KINDS,
  ...DOMAIN_RELATIONSHIP_KINDS,
  ...JOURNEY_RELATIONSHIP_KINDS,
  ...INTEGRATION_RELATIONSHIP_KINDS,
];

/** Relationship kinds a real Phase 3 extraction run can currently produce -- see `bridge-relationships.ts`. */
export const CURRENTLY_PRODUCED_RELATIONSHIP_KINDS: readonly string[] = [
  'dependsOn',
  'hasAssociation',
];

/** Object kinds a real Phase 3 extraction run can currently produce -- see `bridge-http.ts`/`bridge-persistence.ts`. */
export const CURRENTLY_PRODUCED_OBJECT_KINDS: readonly string[] = [
  'integration.api',
  'domain.entity',
];

// ---------------------------------------------------------------------------
// Neo4j-safe property values -- a node/relationship property in Neo4j must
// be a scalar or a homogeneous array of scalars, never a nested map/object.
// ---------------------------------------------------------------------------

export type GraphPropertyValue =
  string | number | boolean | null | readonly string[] | readonly number[] | readonly boolean[];

function isScalar(value: KnowledgeValue): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

function isHomogeneousScalarArray(
  value: readonly KnowledgeValue[],
): value is readonly string[] | readonly number[] | readonly boolean[] {
  if (value.length === 0) return true;
  const firstType = typeof value[0];
  if (firstType !== 'string' && firstType !== 'number' && firstType !== 'boolean') return false;
  return value.every((item) => typeof item === firstType);
}

/**
 * Flattens a free-form `attributes`/`attributes`-shaped bag onto a
 * Neo4j-safe property object, generically -- no per-kind field knowledge.
 * A scalar or homogeneous scalar array becomes `attr_<key>` as-is; anything
 * else (a nested object, an array of objects, a mixed array -- e.g.
 * `EntityAttributes.fields`, `ApiAttributes.operations`) becomes
 * `attr_<key>_json`, a JSON-stringified property -- lossless and
 * `JSON.parse`-recoverable, never silently dropped, never re-typed into a
 * second, hand-written shape.
 */
function flattenAttributesInto(
  attributes: Record<string, KnowledgeValue>,
  target: Record<string, GraphPropertyValue>,
): void {
  for (const [key, value] of Object.entries(attributes)) {
    const propertyKey = `attr_${key}`;
    if (isScalar(value)) {
      target[propertyKey] = value;
    } else if (Array.isArray(value) && isHomogeneousScalarArray(value)) {
      target[propertyKey] = value;
    } else {
      target[`${propertyKey}_json`] = JSON.stringify(value);
    }
  }
}

function flattenConfidenceInto(
  object: Pick<
    CanonicalKnowledgeObject | CanonicalKnowledgeRelationship,
    'metadata' | 'confidenceDetail'
  >,
  target: Record<string, GraphPropertyValue>,
): void {
  target.confidenceLevel = object.metadata.confidence.level;
  if (object.metadata.confidence.score !== undefined)
    target.confidenceScore = object.metadata.confidence.score;
  if (object.metadata.confidence.rationale !== undefined) {
    target.confidenceRationale = object.metadata.confidence.rationale;
  }
  if (object.confidenceDetail !== undefined) {
    target.confidenceBasis = object.confidenceDetail.basis;
    const calculation = object.confidenceDetail.calculation;
    if (calculation !== undefined) {
      target.confidenceCalculationMethod = calculation.method;
      target.confidenceCalculatedAt = calculation.calculatedAt;
      if (calculation.inputs !== undefined) {
        target.confidenceCalculationInputsJson = JSON.stringify(calculation.inputs);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Mapped shapes
// ---------------------------------------------------------------------------

/**
 * A graph node ready for a later ticket's Neo4j `MERGE` (P4-03) -- `id` is
 * the OKF object's own `identity.id`, reused verbatim, never re-derived
 * (Step 4: identity strategy). `properties` holds every Neo4j-safe scalar
 * value; `provenance`/`evidence` are kept as their OWN structured,
 * unflattened arrays -- flattening `provenance` (which can hold more than
 * one entry) onto scalar properties would silently drop every entry past
 * the first, so it deliberately is not done here. P4-05 turns `provenance`
 * into `(:Object)-[:DERIVED_FROM]->(:Source)` edges and `evidence` into
 * `(:Object)-[:HAS_EVIDENCE]->(:Evidence)` nodes; this module only
 * preserves the data losslessly for that later step.
 */
export interface GraphNodeMapping {
  readonly id: string;
  readonly label: string;
  readonly properties: Readonly<Record<string, GraphPropertyValue>>;
  readonly provenance: readonly Provenance[];
  readonly evidence: readonly Evidence[];
}

export interface GraphRelationshipMapping {
  readonly id: string;
  readonly type: string;
  readonly sourceId: string;
  readonly targetId: string;
  readonly properties: Readonly<Record<string, GraphPropertyValue>>;
  readonly provenance: readonly Provenance[];
  readonly evidence: readonly Evidence[];
}

/** An OKF object/relationship this module could not map -- an unknown `kind`, or a missing stable id. Never thrown; always collected, so one bad element cannot abort a whole bundle's mapping (mirrors `ArtifactCollection.failures`'s non-throwing precedent in `@phoenix-ai/ingestion-connectors`). */
export interface GraphMappingIssue {
  readonly elementType: 'object' | 'relationship';
  readonly id: string | undefined;
  readonly kind: string | undefined;
  readonly reason: string;
}

export interface GraphMappingResult {
  readonly nodes: readonly GraphNodeMapping[];
  readonly relationships: readonly GraphRelationshipMapping[];
  readonly issues: readonly GraphMappingIssue[];
}

type MapObjectResult =
  | { readonly ok: true; readonly node: GraphNodeMapping }
  | { readonly ok: false; readonly issue: GraphMappingIssue };

type MapRelationshipResult =
  | { readonly ok: true; readonly relationship: GraphRelationshipMapping }
  | { readonly ok: false; readonly issue: GraphMappingIssue };

/** Maps one `CanonicalKnowledgeObject` to a `GraphNodeMapping`, or reports why it could not be mapped. Never throws. */
export function mapOkfObjectToGraphNode(object: CanonicalKnowledgeObject): MapObjectResult {
  const label = OBJECT_KIND_TO_LABEL[object.kind];
  if (label === undefined) {
    return {
      ok: false,
      issue: {
        elementType: 'object',
        id: object.identity?.id,
        kind: object.kind,
        reason: `kind "${object.kind}" has no Neo4j label mapping -- not part of the Phase 2 OKF object vocabulary this module knows about`,
      },
    };
  }

  const id = object.identity.id;
  if (id.length === 0) {
    return {
      ok: false,
      issue: {
        elementType: 'object',
        id: undefined,
        kind: object.kind,
        reason: 'identity.id is empty -- refusing to invent a stable id',
      },
    };
  }

  const properties: Record<string, GraphPropertyValue> = {
    id,
    kind: object.kind,
    category: object.category,
    label: object.label,
    systemId: object.identity.systemId,
    createdAt: object.identity.createdAt,
    updatedAt: object.identity.updatedAt,
    schemaVersion: object.identity.schemaVersion,
  };
  flattenConfidenceInto(object, properties);
  if (object.lifecycle !== undefined) {
    properties.lifecycleStatus = object.lifecycle.status;
    properties.lifecycleSince = object.lifecycle.since;
    if (object.lifecycle.previousStatus !== undefined) {
      properties.lifecyclePreviousStatus = object.lifecycle.previousStatus;
    }
  }
  flattenAttributesInto(object.attributes, properties);

  return {
    ok: true,
    node: {
      id,
      label,
      properties,
      provenance: object.metadata.provenance,
      evidence: object.evidence,
    },
  };
}

/** Maps one `CanonicalKnowledgeRelationship` to a `GraphRelationshipMapping`, or reports why it could not be mapped. Never throws. */
export function mapOkfRelationshipToGraphRelationship(
  relationship: CanonicalKnowledgeRelationship,
): MapRelationshipResult {
  const type = RELATIONSHIP_KIND_TO_TYPE[relationship.kind];
  if (type === undefined) {
    return {
      ok: false,
      issue: {
        elementType: 'relationship',
        id: relationship.id,
        kind: relationship.kind,
        reason: `kind "${relationship.kind}" has no Neo4j relationship-type mapping -- not part of the Phase 2 OKF relationship vocabulary this module knows about`,
      },
    };
  }

  if (relationship.id.length === 0) {
    return {
      ok: false,
      issue: {
        elementType: 'relationship',
        id: undefined,
        kind: relationship.kind,
        reason: 'id is empty -- refusing to invent a stable id',
      },
    };
  }

  const properties: Record<string, GraphPropertyValue> = {
    id: relationship.id,
    kind: relationship.kind,
    category: relationship.category,
  };
  flattenConfidenceInto(relationship, properties);
  if (relationship.attributes !== undefined)
    flattenAttributesInto(relationship.attributes, properties);

  return {
    ok: true,
    relationship: {
      id: relationship.id,
      type,
      sourceId: relationship.sourceObjectId,
      targetId: relationship.targetObjectId,
      properties,
      provenance: relationship.metadata.provenance,
      evidence: relationship.evidence ?? [],
    },
  };
}

/**
 * Maps a full `CanonicalKnowledgeBundle` to its graph-shaped projection.
 * Deterministic: output node/relationship order is sorted by id, regardless
 * of input array order, so identical input always produces byte-identical
 * output (matching every other bridge/mapper in this monorepo's own
 * determinism discipline, e.g. `bridge-relationships.ts`).
 */
export function mapOkfBundleToGraph(bundle: CanonicalKnowledgeBundle): GraphMappingResult {
  const nodes: GraphNodeMapping[] = [];
  const relationships: GraphRelationshipMapping[] = [];
  const issues: GraphMappingIssue[] = [];

  for (const object of bundle.objects) {
    const result = mapOkfObjectToGraphNode(object);
    if (result.ok) nodes.push(result.node);
    else issues.push(result.issue);
  }

  for (const relationship of bundle.relationships) {
    const result = mapOkfRelationshipToGraphRelationship(relationship);
    if (result.ok) relationships.push(result.relationship);
    else issues.push(result.issue);
  }

  nodes.sort((a, b) => a.id.localeCompare(b.id));
  relationships.sort((a, b) => a.id.localeCompare(b.id));

  return { nodes, relationships, issues };
}
