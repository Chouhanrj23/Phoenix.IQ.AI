/**
 * P5-07 -- journey -> entity/state mapping.
 *
 * Connects the `journey.action` objects P5-05 already produced to the
 * business entities (P5-03) and entity states (P5-06) they actually act on,
 * using P2-05's EXISTING `readsEntity`/`writesEntity`/`triggersTransition`
 * relationship kinds -- unmodified, and never populated before Phase 5.
 * Every mapping here is re-derived from the SAME verb/noun evidence that
 * already produced the action and the state (via `normalizeIdentifierText`/
 * `STATUS_VERBS`, the shared source of truth both this and `state-inference.ts`
 * build on) -- nothing is linked merely because two labels look similar.
 */

import type {
  CanonicalKnowledgeObject,
  CanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import { deterministicId } from './inference-contract.js';
import { normalizeIdentifierText } from './vocabulary.js';
import { ACTION_STATUS, STATUS_VERBS } from './state-inference.js';
import type { BusinessConceptCandidate } from './concept-inference.js';

/** Verbs that only observe an entity, never mutate it -- the `readsEntity` side of the split; every other recognized verb is treated as `writesEntity`. */
const READ_VERBS = new Set([
  'get',
  'find',
  'fetch',
  'list',
  'view',
  'check',
  'validate',
  'is',
  'has',
]);

export interface JourneyMappingResult {
  readonly relationships: readonly CanonicalKnowledgeRelationship[];
}

/**
 * For every `journey.action` object, resolves which business concept it
 * acts on (by re-normalizing its label, the same rule that produced it) and
 * emits `readsEntity`/`writesEntity` to that concept's real entity object,
 * plus `triggersTransition` to the specific `domain.entity-state` object its
 * verb denotes, when P5-06 actually inferred that state for this entity.
 */
export function mapJourneysToEntitiesAndStates(
  actionObjects: readonly CanonicalKnowledgeObject[],
  stateObjects: readonly CanonicalKnowledgeObject[],
  concepts: readonly BusinessConceptCandidate[],
  entityObjectIdByConceptId: ReadonlyMap<string, string>,
): JourneyMappingResult {
  const conceptsByName = new Map(concepts.map((c) => [c.name.toLowerCase(), c]));
  const stateObjectsById = new Map(stateObjects.map((s) => [s.identity.id, s]));
  const relationships: CanonicalKnowledgeRelationship[] = [];

  const actions = actionObjects.filter((object) => object.kind === 'journey.action');

  for (const action of actions) {
    const normalized = normalizeIdentifierText(action.label);
    if (normalized === undefined) continue;
    const concept = conceptsByName.get(normalized.normalizedTerm.toLowerCase());
    if (concept === undefined) continue;
    const entityObjectId = entityObjectIdByConceptId.get(concept.id);
    if (entityObjectId === undefined) continue;

    const isRead =
      normalized.leadingVerb !== undefined
        ? READ_VERBS.has(normalized.leadingVerb)
        : normalized.normalizedAction === 'read';
    const relationshipKind = isRead ? 'readsEntity' : 'writesEntity';

    relationships.push({
      id: deterministicId('relationship', relationshipKind, action.identity.id, entityObjectId),
      category: 'interaction',
      kind: relationshipKind,
      sourceObjectId: action.identity.id,
      targetObjectId: entityObjectId,
      metadata: {
        provenance: [...action.metadata.provenance],
        confidence: action.metadata.confidence,
      },
      ...(action.confidenceDetail === undefined
        ? {}
        : { confidenceDetail: action.confidenceDetail }),
    });

    const statusInfo =
      normalized.leadingVerb !== undefined
        ? STATUS_VERBS[normalized.leadingVerb]
        : normalized.normalizedAction !== undefined
          ? ACTION_STATUS[normalized.normalizedAction]
          : undefined;
    if (statusInfo !== undefined) {
      const stateId = deterministicId('entitystate', concept.id, statusInfo.stateName);
      if (stateObjectsById.has(stateId)) {
        relationships.push({
          id: deterministicId('relationship', 'triggersTransition', action.identity.id, stateId),
          category: 'interaction',
          kind: 'triggersTransition',
          sourceObjectId: action.identity.id,
          targetObjectId: stateId,
          metadata: {
            provenance: [...action.metadata.provenance],
            confidence: action.metadata.confidence,
          },
          ...(action.confidenceDetail === undefined
            ? {}
            : { confidenceDetail: action.confidenceDetail }),
        });
      }
    }
  }

  return { relationships };
}
