/**
 * P5-08 -- business -> technical traceability.
 *
 * Materializes the `groundedIn` relationship (a new, additive, open-`kind`
 * relationship -- category `association`, the same mechanism as
 * `business.capability`/`comprises`/`realizedBy`) from business-level
 * objects back to the real technical objects that justified them:
 * newly-inferred business concepts -> their supporting technical objects
 * (P5-03), journey actions -> the real `ApiObject` their operation evidence
 * came from (P5-05's `ActionGroundingLink`), and entity states -> the real
 * `ApiObject` their status-operation evidence came from (P5-06's
 * `StateGroundingLink`) -- the SAME grounding mechanism for all three, never
 * a second, parallel traceability path. Capability -> concept (`comprises`)
 * and capability -> technical object (`realizedBy`) are already materialized
 * by `capability-inference.ts` -- not duplicated here.
 *
 * Also provides `explainTraceability`, a read-only walker that answers "why
 * does this business object exist, and where did it come from" by
 * following provenance/evidence and `groundedIn`/`comprises`/`realizedBy`
 * edges back to real source locations -- "the system must be able to
 * explain where the inference came from" (the ticket's own provenance
 * rule), as a concrete, callable function, not just a documentation claim.
 */

import type { Provenance } from '@phoenix-ai/shared';
import type {
  CanonicalKnowledgeObject,
  CanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { deterministicId } from './inference-contract.js';
import type { ActionGroundingLink } from './journey-inference.js';
import type { StateGroundingLink } from './state-inference.js';
import type { BusinessConceptCandidate } from './concept-inference.js';

const GROUNDING_RELATIONSHIP_KINDS = new Set(['groundedIn', 'comprises', 'realizedBy']);

/** Builds `groundedIn` (association) relationships from newly-materialized business concepts to their supporting technical objects. Concepts that already ARE a real technical object (`existingObjectId` set) need no such link -- the concept IS the technical object. */
export function buildConceptGroundingRelationships(
  concepts: readonly BusinessConceptCandidate[],
): CanonicalKnowledgeRelationship[] {
  const relationships: CanonicalKnowledgeRelationship[] = [];
  for (const concept of concepts) {
    if (concept.existingObjectId !== undefined) continue;
    for (const technicalObjectId of concept.supportingTechnicalObjectIds) {
      relationships.push({
        id: deterministicId('relationship', 'groundedIn', concept.id, technicalObjectId),
        category: 'association',
        kind: 'groundedIn',
        sourceObjectId: concept.id,
        targetObjectId: technicalObjectId,
        metadata: {
          provenance: [...concept.provenance],
          confidence: concept.confidence,
        },
        confidenceDetail: concept.confidenceDetail,
      });
    }
  }
  return relationships;
}

/** Builds `groundedIn` relationships from journey actions to the real `ApiObject` each one's operation evidence came from. */
export function buildActionGroundingRelationships(
  links: readonly ActionGroundingLink[],
  actionObjectsById: ReadonlyMap<string, CanonicalKnowledgeObject>,
): CanonicalKnowledgeRelationship[] {
  const relationships: CanonicalKnowledgeRelationship[] = [];
  for (const link of links) {
    const action = actionObjectsById.get(link.actionId);
    if (action === undefined) continue;
    relationships.push({
      id: deterministicId('relationship', 'groundedIn', link.actionId, link.technicalObjectId),
      category: 'association',
      kind: 'groundedIn',
      sourceObjectId: link.actionId,
      targetObjectId: link.technicalObjectId,
      metadata: {
        provenance: [...action.metadata.provenance],
        confidence: action.metadata.confidence,
      },
      ...(action.confidenceDetail === undefined
        ? {}
        : { confidenceDetail: action.confidenceDetail }),
    });
  }
  return relationships;
}

/** Builds `groundedIn` relationships from entity states to the real `ApiObject` each one's status-operation evidence came from -- mirrors `buildActionGroundingRelationships` exactly (same relationship kind, same shape), reusing the state object's own (now real, per Blocker 3) provenance/confidence rather than re-deriving anything. */
export function buildStateGroundingRelationships(
  links: readonly StateGroundingLink[],
  stateObjectsById: ReadonlyMap<string, CanonicalKnowledgeObject>,
): CanonicalKnowledgeRelationship[] {
  const relationships: CanonicalKnowledgeRelationship[] = [];
  for (const link of links) {
    const state = stateObjectsById.get(link.stateId);
    if (state === undefined) continue;
    relationships.push({
      id: deterministicId('relationship', 'groundedIn', link.stateId, link.technicalObjectId),
      category: 'association',
      kind: 'groundedIn',
      sourceObjectId: link.stateId,
      targetObjectId: link.technicalObjectId,
      metadata: {
        provenance: [...state.metadata.provenance],
        confidence: state.metadata.confidence,
      },
      ...(state.confidenceDetail === undefined ? {} : { confidenceDetail: state.confidenceDetail }),
    });
  }
  return relationships;
}

export interface TraceabilityStep {
  readonly objectId: string;
  readonly label: string;
  readonly kind: string;
}

export interface TraceabilityExplanation {
  readonly objectId: string;
  readonly label: string;
  readonly kind: string;
  readonly provenance: readonly Provenance[];
  readonly sourceLocations: readonly string[];
  /** The chain of grounding steps walked to reach real technical objects -- empty when `objectId` already IS a technical object (e.g. it has `derivedBy: 'extraction-engine'` provenance). */
  readonly groundedInChain: readonly TraceabilityStep[];
}

/**
 * Walks from a business object, through `groundedIn`/`comprises`/
 * `realizedBy` edges, to the real technical objects it traces back to, and
 * collects every `Evidence.locator`/`Provenance.sourceId` found along the
 * way. Read-only: performs no writes, infers nothing new -- it only reports
 * a chain that inference already built.
 */
export function explainTraceability(
  objectId: string,
  objectsById: ReadonlyMap<string, CanonicalKnowledgeObject>,
  relationships: readonly CanonicalKnowledgeRelationship[],
): TraceabilityExplanation | undefined {
  const object = objectsById.get(objectId);
  if (object === undefined) return undefined;

  const sourceLocations = new Set<string>();
  for (const evidence of object.evidence) {
    if (evidence.locator !== undefined) sourceLocations.add(evidence.locator);
  }

  const groundedInChain: TraceabilityStep[] = [];
  const visited = new Set<string>([objectId]);
  let frontier = [objectId];

  while (frontier.length > 0) {
    const next: string[] = [];
    for (const currentId of frontier) {
      for (const relationship of relationships) {
        if (relationship.sourceObjectId !== currentId) continue;
        if (!GROUNDING_RELATIONSHIP_KINDS.has(relationship.kind)) continue;
        const target = objectsById.get(relationship.targetObjectId);
        if (target === undefined || visited.has(target.identity.id)) continue;
        visited.add(target.identity.id);
        groundedInChain.push({
          objectId: target.identity.id,
          label: target.label,
          kind: target.kind,
        });
        for (const evidence of target.evidence) {
          if (evidence.locator !== undefined) sourceLocations.add(evidence.locator);
        }
        next.push(target.identity.id);
      }
    }
    frontier = next;
  }

  return {
    objectId: object.identity.id,
    label: object.label,
    kind: object.kind,
    provenance: object.metadata.provenance,
    sourceLocations: [...sourceLocations].sort(),
    groundedInChain,
  };
}
