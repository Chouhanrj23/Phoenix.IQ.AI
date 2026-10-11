/**
 * P5-05 -- user/business journey inference.
 *
 * A journey is inferred only where real evidence supports a SEQUENCE of
 * operations acting on the same business concept -- never fabricated from
 * a single operation, and never ordered alphabetically/textually (the
 * ticket's own explicit prohibition). Ordering instead uses a fixed,
 * domain-neutral CRUD/lifecycle verb precedence (create/open < read/check
 * < update/confirm < cancel/close) -- a structural convention true of
 * almost any CRUD-shaped API regardless of business domain, not a
 * business-specific rule.
 *
 * Reuses P2-05's EXISTING `journey.journey`/`journey.flow`/`journey.action`
 * kinds and `contains`/`supports` relationship kinds UNMODIFIED -- these
 * were defined in Phase 2 and never populated by Phase 3/4 (P3 has no
 * journey producer; see `docs/phase-4/README.md`'s producer-coverage
 * table). Phase 5 is their first real producer.
 *
 * Personas (`journey.persona`) are deliberately NOT fabricated here: no
 * actor/user evidence exists anywhere in the current OKF (Phase 3 never
 * extracts one), and the ticket requires personas only "where supported".
 */

import {
  CANONICAL_SCHEMA_VERSION,
  type ApiObject,
  type CanonicalKnowledgeObject,
  type CanonicalKnowledgeRelationship,
  type Evidence,
} from '@phoenix-ai/knowledge-graph';
import type { Provenance } from '@phoenix-ai/shared';
import { deterministicId, deriveInferenceConfidence } from './inference-contract.js';
import { normalizeIdentifierText, type NormalizedAction } from './vocabulary.js';
import type { BusinessConceptCandidate } from './concept-inference.js';

/**
 * Fallback stage precedence for real REST operation names (`"GET /owners/{id}"`)
 * that have no bare leading verb to draw a `VERB_STAGE` entry from -- reuses
 * the SAME 4-tier structure (0 create < 1 read < 2 update < 3 terminate) as
 * `VERB_STAGE` below, driven only by `normalizeIdentifierText`'s generic,
 * HTTP-method-derived `normalizedAction` signal (never a business action).
 */
const ACTION_STAGE: Readonly<Record<NormalizedAction, number>> = {
  create: 0,
  read: 1,
  update: 2,
  terminate: 3,
};

/** Generic CRUD/lifecycle stage precedence -- a structural convention (create precedes read precedes update precedes terminate), not a business-specific rule. Verbs not listed here do not contribute an ordering signal. */
const VERB_STAGE: Readonly<Record<string, number>> = {
  create: 0,
  add: 0,
  open: 0,
  submit: 0,
  get: 1,
  find: 1,
  fetch: 1,
  list: 1,
  view: 1,
  check: 1,
  validate: 1,
  is: 1,
  has: 1,
  activate: 1,
  approve: 1,
  update: 2,
  modify: 2,
  confirm: 2,
  process: 2,
  put: 2,
  patch: 2,
  post: 2,
  save: 2,
  ship: 2,
  cancel: 3,
  delete: 3,
  remove: 3,
  close: 3,
  deliver: 3,
  complete: 3,
  suspend: 3,
  reject: 3,
  deactivate: 3,
};

/** Minimum distinct lifecycle stages required before a sequence is treated as a real journey -- one action alone is not a "sequence". */
const MIN_STAGES_FOR_JOURNEY = 2;

interface OperationStep {
  readonly conceptId: string;
  readonly conceptName: string;
  readonly apiObjectId: string;
  readonly operationName: string;
  readonly description: string;
  readonly stage: number;
}

/** One `journey.action` object's grounding in the real technical object (an `ApiObject`) its operation evidence came from -- consumed by `traceability.ts` (P5-08) to materialize `groundedIn` relationships. */
export interface ActionGroundingLink {
  readonly actionId: string;
  readonly technicalObjectId: string;
}

export interface JourneyInferenceResult {
  readonly objects: readonly CanonicalKnowledgeObject[];
  readonly relationships: readonly CanonicalKnowledgeRelationship[];
  readonly actionGroundingLinks: readonly ActionGroundingLink[];
}

function isApiObject(object: CanonicalKnowledgeObject): object is ApiObject {
  return object.kind === 'integration.api';
}

/**
 * Infers one journey (a `journey.journey` + one `journey.flow` of ordered
 * `journey.action` steps) per business concept that has real operations
 * spanning at least `MIN_STAGES_FOR_JOURNEY` distinct lifecycle stages.
 * A concept with only one stage of operations (e.g. only reads) produces
 * no journey at all -- there is no real sequence to report.
 */
export function inferJourneys(
  objects: readonly CanonicalKnowledgeObject[],
  concepts: readonly BusinessConceptCandidate[],
  systemId: string,
  generatedAt: string,
): JourneyInferenceResult {
  const apiObjects = objects.filter(isApiObject);
  const apiById = new Map(apiObjects.map((api) => [api.identity.id, api]));
  const conceptsByName = new Map(concepts.map((c) => [c.name.toLowerCase(), c]));

  const stepsByConcept = new Map<string, OperationStep[]>();
  for (const api of apiObjects) {
    for (const operation of api.attributes.operations ?? []) {
      const normalized = normalizeIdentifierText(operation.name);
      if (normalized === undefined) continue;
      const concept = conceptsByName.get(normalized.normalizedTerm.toLowerCase());
      if (concept === undefined) continue;
      const stage =
        normalized.leadingVerb !== undefined
          ? VERB_STAGE[normalized.leadingVerb]
          : normalized.normalizedAction !== undefined
            ? ACTION_STAGE[normalized.normalizedAction]
            : undefined;
      if (stage === undefined) continue;

      const steps = stepsByConcept.get(concept.id) ?? [];
      steps.push({
        conceptId: concept.id,
        conceptName: concept.name,
        apiObjectId: api.identity.id,
        operationName: operation.name,
        description: operation.description ?? `Operation "${operation.name}" on ${concept.name}.`,
        stage,
      });
      stepsByConcept.set(concept.id, steps);
    }
  }

  const objectsOut: CanonicalKnowledgeObject[] = [];
  const relationshipsOut: CanonicalKnowledgeRelationship[] = [];
  const actionGroundingLinks: ActionGroundingLink[] = [];

  for (const [conceptId, steps] of stepsByConcept) {
    const distinctStages = new Set(steps.map((s) => s.stage));
    if (distinctStages.size < MIN_STAGES_FOR_JOURNEY) continue;

    const conceptName = steps[0]!.conceptName;
    const sortedSteps = [...steps].sort((a, b) => a.stage - b.stage);
    const distinctApiObjectIds = new Set(sortedSteps.map((s) => s.apiObjectId));

    const { confidence, confidenceDetail } = deriveInferenceConfidence(
      distinctStages.size + distinctApiObjectIds.size,
      'journey-sequence-corroboration',
      generatedAt,
      { distinctStages: distinctStages.size, stepCount: sortedSteps.length },
    );

    const journeyId = deterministicId('journey', 'journey', conceptId);
    const flowId = deterministicId('journey', 'flow', conceptId);

    // P8 -- provenance and evidence come from the API objects the steps were
    // actually observed on. Before P8 every journey/flow/action claimed
    // `sourceId: systemId` -- a source that does not exist in any registry,
    // so a validated bundle rejected it -- and carried no evidence at all,
    // although each step is grounded in a real, evidenced operation.
    const groundingApis = [...distinctApiObjectIds]
      .map((id) => apiById.get(id))
      .filter((api): api is ApiObject => api !== undefined);
    const provenance = inferredProvenance(groundingApis, generatedAt);
    const evidence = groundedEvidence(groundingApis);

    objectsOut.push({
      identity: {
        id: journeyId,
        systemId,
        createdAt: generatedAt,
        updatedAt: generatedAt,
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      },
      category: 'process',
      kind: 'journey.journey',
      label: `Manage ${conceptName}`,
      attributes: {
        purpose: `Carry a ${conceptName} through its real, observed operations (${sortedSteps.map((s) => s.operationName).join(', ')}).`,
      },
      metadata: { provenance, confidence },
      evidence,
      confidenceDetail,
    });

    objectsOut.push({
      identity: {
        id: flowId,
        systemId,
        createdAt: generatedAt,
        updatedAt: generatedAt,
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      },
      category: 'process',
      kind: 'journey.flow',
      label: `${conceptName} Lifecycle Flow`,
      attributes: {},
      metadata: { provenance, confidence },
      evidence,
      confidenceDetail,
    });

    relationshipsOut.push({
      id: deterministicId('relationship', 'supports', flowId, journeyId),
      category: 'realization',
      kind: 'supports',
      sourceObjectId: flowId,
      targetObjectId: journeyId,
      metadata: { provenance, confidence },
      confidenceDetail,
    });

    sortedSteps.forEach((step, index) => {
      const actionId = deterministicId('journey', 'action', conceptId, step.operationName);
      objectsOut.push({
        identity: {
          id: actionId,
          systemId,
          createdAt: generatedAt,
          updatedAt: generatedAt,
          schemaVersion: CANONICAL_SCHEMA_VERSION,
        },
        category: 'entity',
        kind: 'journey.action',
        label: step.operationName,
        attributes: { description: step.description },
        metadata: {
          provenance: inferredProvenance(stepApis(step.apiObjectId), generatedAt),
          confidence,
        },
        evidence: groundedEvidence(stepApis(step.apiObjectId)),
        confidenceDetail,
      });

      relationshipsOut.push({
        id: deterministicId('relationship', 'contains', flowId, actionId),
        category: 'composition',
        kind: 'contains',
        sourceObjectId: flowId,
        targetObjectId: actionId,
        attributes: { order: index },
        metadata: { provenance, confidence },
        confidenceDetail,
      });

      actionGroundingLinks.push({ actionId, technicalObjectId: step.apiObjectId });
    });
  }

  return { objects: objectsOut, relationships: relationshipsOut, actionGroundingLinks };

  function stepApis(apiObjectId: string): ApiObject[] {
    const api = apiById.get(apiObjectId);
    return api === undefined ? [] : [api];
  }
}

/** One inference provenance entry per distinct real source behind the grounding objects -- never a source that was not observed. */
function inferredProvenance(apis: readonly ApiObject[], generatedAt: string): Provenance[] {
  const seen = new Map<string, Provenance>();
  for (const api of apis) {
    for (const entry of api.metadata.provenance) {
      const key = `${entry.sourceId}::${entry.sourceType}`;
      if (seen.has(key)) continue;
      seen.set(key, {
        sourceId: entry.sourceId,
        sourceType: entry.sourceType,
        derivedBy: 'inference-engine',
        derivedAt: generatedAt,
      });
    }
  }
  return [...seen.values()];
}

/** The grounding objects' own evidence, de-duplicated by id -- referenced, never re-described. */
function groundedEvidence(apis: readonly ApiObject[]): Evidence[] {
  const seen = new Map<string, Evidence>();
  for (const api of apis)
    for (const entry of api.evidence) if (!seen.has(entry.id)) seen.set(entry.id, entry);
  return [...seen.values()];
}
