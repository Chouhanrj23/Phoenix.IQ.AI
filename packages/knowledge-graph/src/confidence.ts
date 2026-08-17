/**
 * P2-08 -- the confidence model.
 *
 * Phase 1 already defined `Confidence`/`ConfidenceLevel` in
 * `@phoenix-ai/shared` (`level: 'high'|'medium'|'low'|'inferred'`, optional
 * `score` in `[0, 1]`, optional `rationale`), reused as-is by
 * `CanonicalKnowledgeObject.metadata`/`CanonicalKnowledgeRelationship.metadata`
 * since P2-01 -- untouched here too, so no Phase 1 contract changes (same
 * discipline as P2-07's `Source`, see ADR 0009 decision 7).
 *
 * What Phase 1's `Confidence` cannot express: `level: 'inferred'` sits as a
 * fourth rung on the SAME strength scale as `high`/`medium`/`low` -- it
 * conflates two genuinely different questions into one field:
 *
 *   "How strongly do we trust this?"      -- STRENGTH  (`level`/`score`)
 *   "How was this claim obtained at all?" -- BASIS      (this file's job)
 *
 * A directly-observed fact and a confident inference are not the same kind
 * of claim even when equally trusted, and a weak direct observation is not
 * the same kind of claim as a weak inference. Real Phase 1 fixture data
 * confirms the conflation in practice: every `level: 'inferred'` entry in
 * `apps/web/src/data/mock/*\/{fixtures,nfrs}.ts` also happens to carry a low
 * `score` (0.25-0.32) -- the model has no way to represent a *confident*
 * inference, because `'inferred'` already spent the one dimension available
 * on both "not observed" and "not very sure" at once.
 *
 * `ConfidenceDetail` (added here, referenced as a new optional sibling
 * field on `CanonicalKnowledgeObject`/`CanonicalKnowledgeRelationship`, not
 * folded into `metadata.confidence`) adds the missing, orthogonal `basis`
 * dimension, plus optional metadata about how a numerical score was
 * produced. See `docs/architecture/adr/0010-confidence-model.md`.
 */

import type { KnowledgeValue } from './identity.js';

/**
 * Whether a claim was directly observed, or derived/inferred from other
 * information -- the FACT/DIRECTLY OBSERVED vs DERIVED/INFERRED distinction
 * the objective requires be kept explicit, never blended with strength.
 *
 * - `observed` -- read directly from a source with no intermediate
 *   reasoning step (e.g. a container name parsed straight from a repo's
 *   `docker-compose.yml`, a persona's role copied verbatim from a research
 *   doc).
 * - `derived` -- produced by reasoning over one or more other pieces of
 *   information (e.g. inferring an integration's existence from a log
 *   pattern, an inference engine proposing a relationship no source states
 *   outright). Deliberately does not distinguish *how* it was derived
 *   (heuristic, ML, human judgment) -- that belongs to `ConfidenceCalculation`
 *   below, or to `Provenance.derivedBy` (`@phoenix-ai/shared`), not here.
 *
 * A `derived` claim is never treated as equivalent to an `observed` one
 * regardless of `level`/`score` -- both fields are always required together
 * once `ConfidenceDetail` is present (see `validation.ts`), so a claim can
 * never carry a confidence strength without also declaring which kind of
 * claim it is.
 */
export type ConfidenceBasis = 'observed' | 'derived';

export const CONFIDENCE_BASES: readonly ConfidenceBasis[] = ['observed', 'derived'];

/**
 * Optional metadata about how a numerical `Confidence.score` was produced,
 * when it was something other than direct human judgment -- e.g. a future
 * reconciliation/inference engine. Deliberately NOT a calculation engine:
 * this only gives such a future engine a structured place to record what it
 * did, without Phase 2 implementing that engine here (explicitly out of
 * scope, see the objective).
 */
export interface ConfidenceCalculation {
  /** Which method/module produced the score, e.g. 'corroboration-count', 'reconciliation-engine', 'manual-review'. Free-text: no calculation engine exists yet to know what methods matter. */
  method: string;
  /** ISO-8601 timestamp the score was calculated/assigned. */
  calculatedAt: string;
  /** Free-form inputs that fed the calculation, where known (e.g. corroborating source count). Optional and unstructured on purpose, same reasoning as `method`. */
  inputs?: Record<string, KnowledgeValue>;
}

/**
 * The P2-08 confidence model: the FACT/DIRECTLY-OBSERVED vs
 * DERIVED/INFERRED distinction, plus optional score-calculation metadata.
 * Composes with (does not replace) Phase 1's `Confidence`
 * (`@phoenix-ai/shared`, still the source of `level`/`score`/`rationale`) --
 * see `CanonicalKnowledgeObject.confidenceDetail`/
 * `CanonicalKnowledgeRelationship.confidenceDetail` (`canonical-object.ts`/
 * `relationships.ts`).
 *
 * `basis` is required whenever `ConfidenceDetail` is present at all -- once
 * a claim opts into this richer model, it cannot omit which kind of claim
 * it is (see the objective: "without pretending that inferred information
 * is equivalent to directly observed information"). The field carrying
 * `ConfidenceDetail` itself stays optional on the envelope, so P2-01
 * through P2-07 objects that predate this model remain valid unchanged.
 */
export interface ConfidenceDetail {
  basis: ConfidenceBasis;
  /** How `metadata.confidence.score` (if present) was produced, where known. */
  calculation?: ConfidenceCalculation;
}
