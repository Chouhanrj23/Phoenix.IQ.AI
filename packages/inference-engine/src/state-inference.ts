/**
 * P5-06 -- entity lifecycle state inference.
 *
 * States and transitions are inferred only from real operations whose verb
 * denotes a status change (e.g. `confirmOrder`, `activateAccount`) --
 * `STATUS_VERBS` is a fixed table of common ENGLISH STATUS VERBS
 * (confirm/approve/activate/ship/close/cancel/reject/suspend/...) mapped to
 * their past-participle state name (a generic LINGUISTIC transformation --
 * verb to resulting-state-name -- not a business-noun list; nothing here
 * assumes WHICH entities have these states, only recognizes the verb
 * pattern when real evidence uses it). Transition ordering uses a fixed
 * generic lifecycle-phase number (initiation < confirmation < fulfillment
 * < termination) attached to each verb -- NEVER alphabetical/textual
 * ordering (the ticket's explicit prohibition) -- and a transition is only
 * created between two states BOTH evidenced by a real operation on the
 * same entity.
 *
 * For real REST operation names (`"GET /owners/{id}"`, Phase 3's actual
 * output shape) with no bare status verb, `ACTION_STATUS` provides a
 * DELIBERATELY NARROW fallback: only `create` (POST) and `terminate`
 * (DELETE) carry unambiguous-enough REST semantics to name a generic
 * lifecycle state (`Created`/`Deleted`) from the HTTP method alone; `read`
 * (GET) never changes state, and `update` (PUT/PATCH) is too generic to
 * safely name a specific business state without more context -- so neither
 * contributes a state signal, consistent with "do not assume every GET/PUT
 * means a particular business action beyond the defined normalized signal."
 *
 * Reuses P2-04's EXISTING `domain.entity-state` kind and P2-02/P2-04's
 * EXISTING `hasState`/`transitionsTo` relationship kinds, unmodified. Every
 * inferred state's provenance/evidence is re-derived from the REAL
 * operation evidence that justified it (`deriveProvenanceFrom`/
 * `deriveEvidenceFrom`, the same mechanism `concept-inference.ts` uses --
 * never a generic system-level placeholder), and every state is grounded
 * back to the real technical (API) object it came from via `groundedIn`
 * (`stateGroundingLinks`, consumed by `traceability.ts`) -- the same
 * grounding mechanism `journey-inference.ts` already uses for actions, not
 * a second, parallel traceability mechanism.
 */

import {
  CANONICAL_SCHEMA_VERSION,
  type ApiObject,
  type CanonicalKnowledgeObject,
  type CanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
import {
  deriveEvidenceFrom,
  deriveInferenceConfidence,
  deriveProvenanceFrom,
  deterministicId,
  type TechnicalEvidenceItem,
} from './inference-contract.js';
import { normalizeIdentifierText, type NormalizedAction } from './vocabulary.js';
import type { BusinessConceptCandidate } from './concept-inference.js';

export interface StatusVerbInfo {
  readonly stateName: string;
  readonly stage: number;
}

/** Generic status-verb -> resulting-state-name table. A linguistic pattern (verb -> past participle), not a business-noun list; see file header. Exported so `journey-mapping.ts` (P5-07) can recognize the SAME status verbs when wiring `triggersTransition`, without redefining or drifting from this table. */
export const STATUS_VERBS: Readonly<Record<string, StatusVerbInfo>> = {
  create: { stateName: 'Created', stage: 0 },
  open: { stateName: 'Open', stage: 0 },
  submit: { stateName: 'Submitted', stage: 0 },
  confirm: { stateName: 'Confirmed', stage: 1 },
  approve: { stateName: 'Approved', stage: 1 },
  activate: { stateName: 'Active', stage: 1 },
  validate: { stateName: 'Validated', stage: 1 },
  process: { stateName: 'Processing', stage: 2 },
  ship: { stateName: 'Shipped', stage: 2 },
  deliver: { stateName: 'Delivered', stage: 3 },
  complete: { stateName: 'Completed', stage: 3 },
  close: { stateName: 'Closed', stage: 3 },
  suspend: { stateName: 'Suspended', stage: 3 },
  cancel: { stateName: 'Cancelled', stage: 3 },
  reject: { stateName: 'Rejected', stage: 3 },
};

/**
 * The deliberately narrow HTTP-method-only fallback -- see file header for
 * why `read`/`update` are excluded. Exported so `journey-mapping.ts` (P5-07)
 * recognizes the SAME fallback without redefining it.
 */
export const ACTION_STATUS: Readonly<Partial<Record<NormalizedAction, StatusVerbInfo>>> = {
  create: { stateName: 'Created', stage: 0 },
  terminate: { stateName: 'Deleted', stage: 3 },
};

export interface StateInferenceResult {
  readonly objects: readonly CanonicalKnowledgeObject[];
  readonly relationships: readonly CanonicalKnowledgeRelationship[];
  readonly stateGroundingLinks: readonly StateGroundingLink[];
}

/** One `domain.entity-state` object's grounding in the real technical object (an `ApiObject`) its status-operation evidence came from -- consumed by `traceability.ts` (P5-08) to materialize `groundedIn` relationships, mirroring `journey-inference.ts`'s `ActionGroundingLink`. */
export interface StateGroundingLink {
  readonly stateId: string;
  readonly technicalObjectId: string;
}

function isApiObject(object: CanonicalKnowledgeObject): object is ApiObject {
  return object.kind === 'integration.api';
}

/**
 * Resolves the status-verb signal for one normalized operation: a bare
 * status verb (`confirmOrder`) is checked first against `STATUS_VERBS`;
 * only when no bare verb is present does the narrow, HTTP-method-only
 * `ACTION_STATUS` fallback apply (real REST operation names).
 */
function resolveStatusInfo(
  normalized: ReturnType<typeof normalizeIdentifierText>,
): StatusVerbInfo | undefined {
  if (normalized === undefined) return undefined;
  if (normalized.leadingVerb !== undefined) return STATUS_VERBS[normalized.leadingVerb];
  if (normalized.normalizedAction !== undefined) return ACTION_STATUS[normalized.normalizedAction];
  return undefined;
}

/**
 * Infers `domain.entity-state` objects and `hasState`/`transitionsTo`
 * relationships for every business entity with at least one real
 * status-verb operation. `entityObjectId` must be the id of an ALREADY
 * materialized `domain.entity` object (either a real Phase 3 entity or one
 * `concept-inference.ts` just created) -- states are never attached to a
 * concept that has no real entity object.
 */
export function inferEntityStates(
  objects: readonly CanonicalKnowledgeObject[],
  concepts: readonly BusinessConceptCandidate[],
  entityObjectIdByConceptId: ReadonlyMap<string, string>,
  systemId: string,
  generatedAt: string,
): StateInferenceResult {
  const apiObjects = objects.filter(isApiObject);
  const conceptsByName = new Map(concepts.map((c) => [c.name.toLowerCase(), c]));

  interface FoundState {
    readonly info: StatusVerbInfo;
    readonly operationName: string;
    readonly apiObjectId: string;
    readonly item: TechnicalEvidenceItem;
  }
  const statesByConcept = new Map<string, FoundState[]>();

  for (const api of apiObjects) {
    for (const operation of api.attributes.operations ?? []) {
      const normalized = normalizeIdentifierText(operation.name);
      const statusInfo = resolveStatusInfo(normalized);
      if (normalized === undefined || statusInfo === undefined) continue;
      const concept = conceptsByName.get(normalized.normalizedTerm.toLowerCase());
      if (concept === undefined) continue;

      const found = statesByConcept.get(concept.id) ?? [];
      found.push({
        info: statusInfo,
        operationName: operation.name,
        apiObjectId: api.identity.id,
        item: {
          kind: 'operation-name',
          text: operation.name,
          sourceObjectId: api.identity.id,
          sourceObjectKind: api.kind,
          provenance: api.metadata.provenance,
          evidence: api.evidence,
        },
      });
      statesByConcept.set(concept.id, found);
    }
  }

  const objectsOut: CanonicalKnowledgeObject[] = [];
  const relationshipsOut: CanonicalKnowledgeRelationship[] = [];
  const stateGroundingLinks: StateGroundingLink[] = [];

  for (const [conceptId, found] of statesByConcept) {
    const entityObjectId = entityObjectIdByConceptId.get(conceptId);
    if (entityObjectId === undefined) continue;

    // One representative FoundState per distinct state name -- carries the
    // real operation evidence/provenance/technical-object id that state is
    // grounded in.
    const distinctStates = [...new Map(found.map((f) => [f.info.stateName, f])).values()].sort(
      (a, b) => a.info.stage - b.info.stage,
    );
    if (distinctStates.length === 0) continue;

    const { confidence, confidenceDetail } = deriveInferenceConfidence(
      distinctStates.length,
      'state-verb-evidence',
      generatedAt,
      { distinctStateCount: distinctStates.length },
    );

    const stateIdByName = new Map<string, string>();
    for (const state of distinctStates) {
      const stateId = deterministicId('entitystate', conceptId, state.info.stateName);
      stateIdByName.set(state.info.stateName, stateId);

      const provenance = deriveProvenanceFrom([state.item], generatedAt);
      const evidence = deriveEvidenceFrom([state.item]);

      objectsOut.push({
        identity: {
          id: stateId,
          systemId,
          createdAt: generatedAt,
          updatedAt: generatedAt,
          schemaVersion: CANONICAL_SCHEMA_VERSION,
        },
        category: 'entity',
        kind: 'domain.entity-state',
        label: state.info.stateName,
        attributes: { description: `Observed via status operation "${state.operationName}".` },
        metadata: { provenance, confidence },
        evidence,
        confidenceDetail,
      });

      relationshipsOut.push({
        id: deterministicId('relationship', 'hasState', entityObjectId, stateId),
        category: 'association',
        kind: 'hasState',
        sourceObjectId: entityObjectId,
        targetObjectId: stateId,
        metadata: { provenance, confidence },
        confidenceDetail,
      });

      stateGroundingLinks.push({ stateId, technicalObjectId: state.apiObjectId });
    }

    for (let i = 0; i < distinctStates.length - 1; i++) {
      const from = distinctStates[i]!;
      const to = distinctStates[i + 1]!;
      if (from.info.stage === to.info.stage) continue;
      const fromId = stateIdByName.get(from.info.stateName)!;
      const toId = stateIdByName.get(to.info.stateName)!;
      const transitionProvenance = deriveProvenanceFrom([from.item, to.item], generatedAt);
      relationshipsOut.push({
        id: deterministicId('relationship', 'transitionsTo', fromId, toId),
        category: 'interaction',
        kind: 'transitionsTo',
        sourceObjectId: fromId,
        targetObjectId: toId,
        metadata: { provenance: transitionProvenance, confidence },
        confidenceDetail,
      });
    }
  }

  return { objects: objectsOut, relationships: relationshipsOut, stateGroundingLinks };
}
