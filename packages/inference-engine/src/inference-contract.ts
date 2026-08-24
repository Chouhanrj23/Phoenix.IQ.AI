/**
 * P5-01 -- the domain inference architecture. Read this file first; every
 * later Phase 5 module (`vocabulary.ts`, `concept-inference.ts`,
 * `capability-inference.ts`, `journey-inference.ts`, `state-inference.ts`,
 * `journey-mapping.ts`, `traceability.ts`) builds on the types and
 * discipline defined here. Full rationale: `docs/phase-5/README.md` and
 * `docs/architecture/adr/0025-phase-5-business-understanding.md`.
 *
 * ---------------------------------------------------------------------------
 * 1. INPUT EVIDENCE
 * ---------------------------------------------------------------------------
 * Every Phase 5 stage consumes `TechnicalEvidenceItem[]` (below), extracted
 * from an already-produced, already-validated OKF bundle
 * (`CanonicalKnowledgeBundle`, `@phoenix-ai/knowledge-graph`) -- never raw
 * source files. This is FR-SEM-03's own requirement ("the semantic layer
 * shall operate on structured facts and summaries, not raw source, to
 * control cost and hallucination") and also why this package does not
 * duplicate `@phoenix-ai/extraction-engine`'s job: Phase 3 already turned
 * raw Java into OKF objects/relationships with real provenance; Phase 5
 * reads that, it does not re-parse anything.
 *
 * ---------------------------------------------------------------------------
 * 2. INFERENCE PROCESS
 * ---------------------------------------------------------------------------
 * `InferenceProvider<TInput, TOutput>` is the one contract every stage's
 * logic implements. Two things make this domain-neutral by construction:
 *
 *  - `TInput`/`TOutput` are generic, never a fixed business shape -- a
 *    provider for "extract vocabulary" has a completely different TOutput
 *    than one for "infer journeys", but both satisfy the same contract.
 *  - The ONLY implementation this package ships and wires up is
 *    `HeuristicInferenceProvider`-style deterministic, rule-based logic
 *    (per-stage, see each module) operating on STRUCTURAL patterns (naming
 *    conventions, CRUD-verb ordering, package co-location, field shapes) --
 *    never on a fixed list of business nouns. See `docs/phase-5/README.md`
 *    "Domain neutrality" for the full audit trail of why this holds.
 *
 * An LLM-backed provider is a documented EXTENSION POINT, not implemented
 * here (see section 6) -- this repository has no existing LLM integration
 * (verified: no provider SDK in any `package.json`, no `LLM_*`/`OPENAI_*`/
 * `ANTHROPIC_*` env var anywhere), so per this ticket's own instruction,
 * the contract and a deterministic implementation come first.
 *
 * ---------------------------------------------------------------------------
 * 3. OUTPUT
 * ---------------------------------------------------------------------------
 * Every stage's real output is EITHER:
 *  - an intermediate, package-internal type (e.g. `VocabularyTerm` --
 *    analogous to `extraction-engine`'s `JavaCallFact`: real, evidenced,
 *    but not itself a canonical object), or
 *  - a real `CanonicalKnowledgeObject`/`CanonicalKnowledgeRelationship`,
 *    reusing an EXISTING OKF kind wherever one already fits
 *    (`domain.entity`, `domain.entity-state`, `journey.persona`/`.journey`/
 *    `.flow`/`.action`, and the EXISTING-but-Phase-3-never-populated
 *    relationship kinds `hasState`/`transitionsTo`/`readsEntity`/
 *    `writesEntity`/`triggersTransition`/`contains`), or a new, ADDITIVE,
 *    open-vocabulary `kind` (`business.capability`) exactly the way
 *    Phase 4's `bridge-relationships.ts` added `dependsOn`/`hasAssociation`
 *    -- P2-01/P2-02 designed `kind` as an open string precisely so this
 *    needs no schema file change. `packages/knowledge-graph` is NOT
 *    modified by Phase 5. See `docs/architecture/adr/0025-...md` decision 2
 *    for why `business.capability` needed a new kind and nothing else did.
 *
 * ---------------------------------------------------------------------------
 * 4. PROVENANCE
 * ---------------------------------------------------------------------------
 * Every `TechnicalEvidenceItem` carries the `Provenance`/`Evidence` of the
 * OKF object it was read from (`@phoenix-ai/shared`'s `Provenance`,
 * `@phoenix-ai/knowledge-graph`'s `Evidence` -- reused as-is, never
 * redefined). Every inference stage's output re-derives its own
 * `metadata.provenance`/`evidence` from the INPUT items that supported it
 * (`deriveProvenanceFrom`/`deriveEvidenceFrom` below) -- an inferred claim's
 * provenance names `derivedBy: 'inference-engine'`, distinct from the
 * technical evidence's own `derivedBy: 'extraction-engine'`, so the chain
 * `business inference -> inference evidence -> technical evidence -> source
 * artifact -> source location` (the ticket's own required chain) is walkable
 * end to end, never collapsed into just the final answer.
 *
 * ---------------------------------------------------------------------------
 * 5. CONFIDENCE
 * ---------------------------------------------------------------------------
 * No new confidence VOCABULARY is introduced -- every inferred object uses
 * the exact same `Confidence`/`ConfidenceDetail` types Phase 2 already
 * defined. What Phase 5 adds is one clearly-documented, deterministic
 * CALCULATION (`deriveInferenceConfidence` below) so a score is never typed
 * in by hand: it is a function of how many independent evidence signals
 * corroborate a claim, recorded in `confidenceDetail.calculation` (the
 * exact field P2-08 already reserved for "how a score was produced").
 * `confidenceDetail.basis` is ALWAYS `'derived'` for Phase 5 output (never
 * `'observed'`) -- FR-SEM-05's own requirement that inferred elements stay
 * distinguished from deterministically extracted facts.
 *
 * ---------------------------------------------------------------------------
 * 6. AMBIGUITY HANDLING
 * ---------------------------------------------------------------------------
 * When more than one candidate interpretation has comparable evidentiary
 * support, every stage returns ALL candidates above a minimum evidence
 * threshold, each with its own confidence -- never silently collapsed to
 * "the best guess". A caller (a later stage, a UI, a human reviewer) sees
 * the full set and can judge; nothing is dropped to make the output look
 * more certain than the evidence supports. See `AmbiguousInferenceResult`.
 *
 * ---------------------------------------------------------------------------
 * 7. DOMAIN NEUTRALITY
 * ---------------------------------------------------------------------------
 * No file in this package's `src/` names a real business noun from any
 * actual domain (e-commerce, fintech, or otherwise) -- verified mechanically
 * by P5-09's `domain-agnostic.test.ts`, which scans every `src/*.ts` file's
 * actual text, not just its own author's intent. Where this file's own
 * comments need a concrete illustration, they use a deliberately generic
 * placeholder noun ("Widget") -- never a word that could be mistaken for
 * this system actually recognizing e-commerce/fintech/any other domain's
 * vocabulary. Real business nouns exist ONLY in `tests/`/`samples/`
 * fixtures, clearly labelled as such (Aurora/e-commerce and fintech, P5-10).
 */

import type { Confidence, ConfidenceLevel, Provenance } from '@phoenix-ai/shared';
import type {
  CanonicalKnowledgeObject,
  ConfidenceDetail,
  Evidence,
} from '@phoenix-ai/knowledge-graph';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Deterministic identity -- the same discipline as
// `extraction-engine`'s `bridge-shared.ts`/`ingestion-connectors`'s
// `reference-connector.ts`: a stable, content-derived id, never random.
// ---------------------------------------------------------------------------

/** A stable, content-derived identifier -- never a random UUID. Same construction as `extraction-engine`'s `deterministicId`, reimplemented here rather than imported to avoid a downward-layering dependency from inference (Phase 5) onto extraction (Phase 3). */
export function deterministicId(prefix: string, ...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join(' '), 'utf8').digest('hex');
  return `${prefix}-${hash.slice(0, 16)}`;
}

// ---------------------------------------------------------------------------
// 1. Input evidence
// ---------------------------------------------------------------------------

/**
 * One unit of technical evidence read from an already-validated OKF bundle
 * -- never raw source. `kind` says what shape of technical fact this is
 * (a class/object label, an API operation name, a field name, ...); `text`
 * is the actual identifier text a later stage tokenizes/normalizes.
 * Domain-neutral by construction: nothing here encodes what the text MEANS,
 * only what KIND of technical artifact it came from.
 */
export interface TechnicalEvidenceItem {
  readonly kind: 'object-label' | 'operation-name' | 'field-name' | 'attribute-value';
  readonly text: string;
  /** The OKF object this evidence was read from -- lets later stages recover its kind/attributes/relationships without re-reading the whole bundle. */
  readonly sourceObjectId: string;
  readonly sourceObjectKind: string;
  readonly provenance: readonly Provenance[];
  readonly evidence: readonly Evidence[];
}

/**
 * Reads every real object in a bundle and produces one `TechnicalEvidenceItem`
 * per label/operation-name/field-name/attribute-value found -- the single
 * place Phase 5 touches raw OKF structure, so every later stage works with
 * a flat, uniform list regardless of which of the 15 OKF kinds an object is.
 * Reused verbatim by every domain (Aurora, fintech, or any other) -- this
 * function contains no business-specific branching at all.
 */
export function extractTechnicalEvidence(
  objects: readonly CanonicalKnowledgeObject[],
): TechnicalEvidenceItem[] {
  const items: TechnicalEvidenceItem[] = [];

  for (const object of objects) {
    const base = {
      sourceObjectId: object.identity.id,
      sourceObjectKind: object.kind,
      provenance: object.metadata.provenance,
      evidence: object.evidence,
    };

    items.push({ kind: 'object-label', text: object.label, ...base });

    for (const [key, value] of Object.entries(object.attributes)) {
      if (typeof value === 'string' && value.length > 0) {
        items.push({ kind: 'attribute-value', text: value, ...base });
      } else if (Array.isArray(value)) {
        for (const entry of value) {
          if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
            const name = (entry as Record<string, unknown>).name;
            if (typeof name === 'string' && name.length > 0) {
              const isOperationLike = key === 'operations';
              items.push({
                kind: isOperationLike ? 'operation-name' : 'field-name',
                text: name,
                ...base,
              });
            }
          }
        }
      }
    }
  }

  return items;
}

// ---------------------------------------------------------------------------
// 4. Provenance derivation
// ---------------------------------------------------------------------------

/** De-duplicates provenance entries by `(sourceId, derivedBy)` -- several evidence items often trace back to the same source. */
export function deriveProvenanceFrom(
  items: readonly TechnicalEvidenceItem[],
  derivedAt: string,
): Provenance[] {
  const seen = new Map<string, Provenance>();
  for (const item of items) {
    for (const provenance of item.provenance) {
      const key = `${provenance.sourceId}::${provenance.sourceType}`;
      if (!seen.has(key)) {
        seen.set(key, {
          sourceId: provenance.sourceId,
          sourceType: provenance.sourceType,
          derivedBy: 'inference-engine',
          derivedAt,
        });
      }
    }
  }
  return [...seen.values()];
}

/** De-duplicates evidence entries by id -- the same underlying excerpt is often cited by more than one input item. */
export function deriveEvidenceFrom(items: readonly TechnicalEvidenceItem[]): Evidence[] {
  const seen = new Map<string, Evidence>();
  for (const item of items) {
    for (const evidence of item.evidence) {
      if (!seen.has(evidence.id)) seen.set(evidence.id, evidence);
    }
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// 5. Confidence calculation -- documented, deterministic, never hand-typed.
// ---------------------------------------------------------------------------

export interface InferenceConfidence {
  readonly confidence: Confidence;
  readonly confidenceDetail: ConfidenceDetail;
}

/**
 * The one confidence calculation every Phase 5 stage uses. `signalCount` is
 * the number of INDEPENDENT evidence signals corroborating a claim (e.g.
 * distinct source objects, distinct operation names) -- a stage-specific
 * count its own module computes and documents; this function only turns
 * that count into a `Confidence`/`ConfidenceDetail` pair, consistently.
 *
 * Formula (documented per the ticket's explicit "define the calculation
 * clearly" requirement): `score = min(1, 0.3 + 0.15 * (signalCount - 1))`,
 * floored at 0.3 for a single-signal claim (real, but uncorroborated) and
 * capped at 1.0. Level thresholds reuse Phase 1's own closed vocabulary
 * (`ConfidenceLevel`, `@phoenix-ai/shared`): `>=0.75` high, `>=0.55`
 * medium, `>=0.35` low, else `inferred`. `basis` is always `'derived'` --
 * every Phase 5 output is inference, never a directly-observed fact.
 */
export function deriveInferenceConfidence(
  signalCount: number,
  method: string,
  calculatedAt: string,
  inputs?: Record<string, string | number | boolean>,
): InferenceConfidence {
  const clampedSignalCount = Math.max(1, signalCount);
  const score = Math.min(1, 0.3 + 0.15 * (clampedSignalCount - 1));
  const level: ConfidenceLevel =
    score >= 0.75 ? 'high' : score >= 0.55 ? 'medium' : score >= 0.35 ? 'low' : 'inferred';

  return {
    confidence: { level, score: Math.round(score * 100) / 100 },
    confidenceDetail: {
      basis: 'derived',
      calculation: {
        method,
        calculatedAt,
        inputs: { signalCount: clampedSignalCount, ...inputs },
      },
    },
  };
}

// ---------------------------------------------------------------------------
// 2/6. The inference contract itself, and ambiguity handling.
// ---------------------------------------------------------------------------

/** One candidate result, with its own confidence and the rationale a reader needs to judge it -- never just a bare value. */
export interface InferenceCandidate<T> {
  readonly value: T;
  readonly confidence: Confidence;
  readonly confidenceDetail: ConfidenceDetail;
  /** Plain-language explanation of why this candidate was inferred -- "the system must be able to explain where the inference came from" (the ticket's own provenance rule), independent of the structured `evidence`/`provenance` arrays. */
  readonly rationale: string;
  readonly provenance: readonly Provenance[];
  readonly evidence: readonly Evidence[];
}

/**
 * The result of one inference step over one input grouping. Ambiguity is
 * represented structurally, not resolved away: `candidates` may hold more
 * than one entry when the evidence does not clearly favor a single
 * interpretation. A caller that wants "the best guess" reads
 * `candidates[0]` (stages sort candidates by confidence, descending);
 * a caller that wants to expose ambiguity to a human reviewer reads all of
 * `candidates`.
 */
export interface AmbiguousInferenceResult<T> {
  readonly candidates: readonly InferenceCandidate<T>[];
}

/**
 * The one inference contract every Phase 5 stage implements. Generic over
 * input/output so the SAME shape describes "extract vocabulary from
 * evidence", "infer concepts from vocabulary", "infer journeys from
 * concepts", etc. -- each stage's `TInput`/`TOutput` differ, the contract
 * does not. `infer` is async so a future LLM-backed provider (a real
 * network call) satisfies the exact same interface a synchronous, in-
 * process heuristic provider does today -- the pipeline never has to know
 * which kind of provider it is calling.
 */
export interface InferenceProvider<TInput, TOutput> {
  /** A short, stable name identifying which provider produced a result -- becomes part of `derivedBy` provenance for anything this provider infers. */
  readonly name: string;
  infer(input: TInput): Promise<TOutput>;
}
