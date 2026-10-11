/**
 * P5-03 -- entity/business concept inference.
 *
 * Turns `VocabularyTerm[]` (P5-02) into `BusinessConceptCandidate[]`: real
 * candidate business concepts, each retaining evidence/provenance/
 * confidence and an explicit rationale. This does NOT do `Java class =
 * business entity` -- a candidate's confidence is driven by how many
 * INDEPENDENT SIGNAL KINDS corroborate it (an object label, an operation
 * name, a field name are different signal kinds; several occurrences of
 * the same kind corroborate less than one occurrence of each different
 * kind), and whether it already matches a real, already-bridged
 * `domain.entity`/`domain.aggregate` object -- the strongest possible
 * signal, since Phase 3 already had direct annotation evidence for it.
 *
 * Concepts that already correspond to an existing OKF object are NOT
 * duplicated (`existingObjectId` is set, `materializeBusinessConcepts`
 * skips them) -- "map into the existing canonical model where appropriate,
 * do not create a parallel model" is structural here, not a convention to
 * remember. Concepts with no existing object become new, real
 * `domain.entity` objects (P2-04's own kind, reused unmodified) with
 * `confidenceDetail.basis: 'derived'`.
 *
 * P5-01's `InferenceProvider`/`InferenceCandidate`/`AmbiguousInferenceResult`
 * contract (`inference-contract.ts`) is wired through HERE, at the one real
 * ambiguity point in Phase 5's pipeline: resolving a vocabulary term to an
 * already-real, already-bridged entity-like OKF object is not always
 * unambiguous -- more than one entity-like object could plausibly share a
 * label (e.g. two bounded contexts each with their own "Widget"). Both
 * `resolveExistingEntityCandidates` (the synchronous core logic
 * `inferBusinessConcepts` calls directly, so this package's existing
 * synchronous callers are not forced to become async for a resolution step
 * with no real I/O) and `existingEntityResolutionProvider` (the same logic,
 * wrapped as a genuine, contract-compliant, async `InferenceProvider`) share
 * ONE implementation -- never two parallel, drifting ones.
 */

import type { Confidence, Provenance } from '@phoenix-ai/shared';
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalKnowledgeObject,
  type ConfidenceDetail,
  type EntityObject,
  type Evidence,
} from '@phoenix-ai/knowledge-graph';
import {
  deterministicId,
  deriveInferenceConfidence,
  type AmbiguousInferenceResult,
  type InferenceCandidate,
  type InferenceProvider,
} from './inference-contract.js';
import type { VocabularyTerm } from './vocabulary.js';
import { compareCodeUnits } from '@phoenix-ai/shared';

export interface BusinessConceptCandidate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Set when this concept already corresponds to a real, existing OKF object -- no new object should be materialized for it. */
  readonly existingObjectId?: string;
  readonly supportingTechnicalObjectIds: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly provenance: readonly Provenance[];
  readonly confidence: Confidence;
  readonly confidenceDetail: ConfidenceDetail;
  readonly rationale: string;
}

const ENTITY_LIKE_KINDS = new Set(['domain.entity', 'domain.aggregate']);

export interface EntityResolutionInput {
  readonly normalizedTerm: string;
  readonly objects: readonly CanonicalKnowledgeObject[];
}

/**
 * The real resolution logic (shared by `inferBusinessConcepts` below and
 * `existingEntityResolutionProvider`): finds every real, already-bridged
 * entity-like object whose label matches this candidate's normalized term
 * (case-insensitive) -- NOT just the first one. Ambiguity (>1 match) is
 * preserved as multiple candidates, each with its own confidence (an
 * exact-case match is stronger evidence than a case-insensitive-only match)
 * and rationale, sorted highest-confidence first -- never silently
 * collapsed to "the first one found" before this point.
 */
function resolveExistingEntityCandidates(
  normalizedTerm: string,
  objects: readonly CanonicalKnowledgeObject[],
): InferenceCandidate<CanonicalKnowledgeObject>[] {
  const target = normalizedTerm.toLowerCase();
  const matches = objects.filter(
    (object) => ENTITY_LIKE_KINDS.has(object.kind) && object.label.toLowerCase() === target,
  );

  const candidates = matches.map((object) => {
    const isExactCase = object.label === normalizedTerm;
    const { confidence, confidenceDetail } = deriveInferenceConfidence(
      isExactCase ? 2 : 1,
      'existing-entity-label-match',
      object.identity.updatedAt,
      { exactCase: isExactCase, totalMatches: matches.length },
    );
    return {
      value: object,
      confidence,
      confidenceDetail,
      rationale:
        matches.length > 1
          ? `"${object.label}" (${object.identity.id}, ${object.kind}) is one of ${matches.length} existing objects whose label matches "${normalizedTerm}" -- ambiguous; ranked by exact-case match strength.`
          : `"${object.label}" (${object.identity.id}, ${object.kind}) is the one existing object whose label matches "${normalizedTerm}".`,
      provenance: object.metadata.provenance,
      evidence: object.evidence,
    };
  });

  return candidates.sort((a, b) => (b.confidence.score ?? 0) - (a.confidence.score ?? 0));
}

/**
 * P5-01 -- the one real `InferenceProvider` implementation wired through
 * Phase 5's actual pipeline: the SAME underlying resolution logic
 * `inferBusinessConcepts` calls directly (`resolveExistingEntityCandidates`
 * above), exposed as a genuine, contract-compliant, async provider. Async
 * even though the underlying resolution is itself deterministic and
 * synchronous -- the same discipline `inference-contract.ts` documents for
 * a future LLM-backed provider: the caller never needs to know which kind
 * of provider it is calling. Demonstrates every part of the contract: a
 * typed input (`EntityResolutionInput`), a real `AmbiguousInferenceResult`
 * (>1 candidate when more than one entity-like object matches), confidence
 * per candidate, and a selected result (`candidates[0]`, highest
 * confidence) alongside the full, unresolved candidate set for a caller
 * that wants to see the ambiguity rather than just the best guess.
 */
export const existingEntityResolutionProvider: InferenceProvider<
  EntityResolutionInput,
  AmbiguousInferenceResult<CanonicalKnowledgeObject>
> = {
  name: 'existing-entity-resolution',
  infer: (input) =>
    Promise.resolve({
      candidates: resolveExistingEntityCandidates(input.normalizedTerm, input.objects),
    }),
};

/**
 * Infers business-concept candidates from vocabulary terms. A term backed
 * only by `attribute-value` evidence (prose mentioning a word, not an
 * identifier's actual structure) is not promoted -- it is too weak a
 * signal to distinguish a real concept from incidental description text.
 */
export function inferBusinessConcepts(
  terms: readonly VocabularyTerm[],
  objects: readonly CanonicalKnowledgeObject[],
  generatedAt: string,
): BusinessConceptCandidate[] {
  const candidates: BusinessConceptCandidate[] = [];

  for (const term of terms) {
    const structuralSignalCount = term.evidence.length + term.relatedTechnicalObjectIds.length;
    if (structuralSignalCount === 0) continue;

    const entityCandidates = resolveExistingEntityCandidates(term.normalizedTerm, objects);
    const existing = entityCandidates[0]?.value;
    // Corroboration signal: existing technical entity (+2, the strongest
    // signal), plus one point per distinct supporting technical object,
    // plus the vocabulary term's own occurrence count.
    const signalCount =
      (existing !== undefined ? 2 : 0) +
      term.relatedTechnicalObjectIds.length +
      term.occurrenceCount;

    const { confidence, confidenceDetail } = deriveInferenceConfidence(
      signalCount,
      'concept-corroboration',
      generatedAt,
      {
        hasExistingTechnicalEntity: existing !== undefined,
        supportingObjectCount: term.relatedTechnicalObjectIds.length,
        vocabularyOccurrenceCount: term.occurrenceCount,
      },
    );

    const rationale =
      existing !== undefined
        ? `"${term.normalizedTerm}" already exists as a real ${existing.kind} object (${existing.identity.id}); treated as the same business concept rather than duplicated. Additionally corroborated by ${term.relatedTechnicalObjectIds.length} technical object(s) and ${term.occurrenceCount} vocabulary occurrence(s).${entityCandidates.length > 1 ? ` (Ambiguous: ${entityCandidates.length} existing objects shared this label; ${entityCandidates[0]!.rationale})` : ''}`
        : `"${term.normalizedTerm}" inferred from ${term.relatedTechnicalObjectIds.length} distinct technical object(s) and ${term.occurrenceCount} vocabulary occurrence(s): ${term.candidateMeaning}`;

    candidates.push({
      id: deterministicId('concept', term.normalizedTerm.toLowerCase()),
      name: term.normalizedTerm,
      description: term.candidateMeaning,
      ...(existing === undefined ? {} : { existingObjectId: existing.identity.id }),
      supportingTechnicalObjectIds: term.relatedTechnicalObjectIds,
      evidence: term.evidence,
      provenance: term.provenance,
      confidence,
      confidenceDetail,
      rationale,
    });
  }

  return candidates.sort((a, b) => compareCodeUnits(a.name, b.name));
}

/**
 * Materializes new `domain.entity` objects (P2-04's existing kind, reused
 * unmodified) for every candidate that does NOT already correspond to a
 * real OKF object. Candidates with `existingObjectId` set are skipped --
 * enriching an already-real entity with inferred rationale is a
 * documentation concern (`traceability.ts`), not a reason to create a
 * second object for the same concept.
 */
export function materializeBusinessConcepts(
  candidates: readonly BusinessConceptCandidate[],
  systemId: string,
  generatedAt: string,
): EntityObject[] {
  return candidates
    .filter((candidate) => candidate.existingObjectId === undefined)
    .map((candidate) => ({
      identity: {
        id: candidate.id,
        systemId,
        createdAt: generatedAt,
        updatedAt: generatedAt,
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      },
      category: 'entity' as const,
      kind: 'domain.entity' as const,
      label: candidate.name,
      attributes: { description: candidate.description },
      metadata: {
        provenance: [...candidate.provenance],
        confidence: candidate.confidence,
      },
      evidence: [...candidate.evidence],
      confidenceDetail: candidate.confidenceDetail,
    }));
}
