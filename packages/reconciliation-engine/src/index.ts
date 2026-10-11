/**
 * @phoenix-ai/reconciliation-engine
 * Module: Reconciliation & Confidence Engine
 *
 * P6-05: implements the FRD's §3.6 module -- "Merges signals across
 * sources, surfaces disagreement, and computes confidence for every graph
 * element" -- against real `@phoenix-ai/knowledge-graph` objects, including
 * Jira's (`@phoenix-ai/extraction-engine`'s `jira-bridge.ts`, P6-04) and any
 * other already-bridged source.
 *
 *   - `claim.ts` -- `Claim`/`ClaimCategory`, the atomic unit this package
 *     compares (the FRD's own "structured claims", §2.1), plus
 *     `SOURCE_TYPE_AUTHORITY`/`authorityOf` (FR-REC-01's source-type
 *     weighting table) and `claimFromObject`, which extracts a `Claim` from
 *     any already-bridged canonical object's own provenance/evidence.
 *   - `confidence-scoring.ts` -- `computeConfidence` (P6-06, FR-REC-02): the
 *     dedicated, standalone confidence calculation -- structurally derived
 *     from supporting-source authority, corroboration, AND (generalized
 *     beyond P6-05's original agreement-only version) how much contradicting
 *     evidence exists, so a `ConflictObject` position that is outvoted reads
 *     as less confident than one that is merely disputed.
 *   - `evidence-aggregation.ts` -- `aggregateEvidence`/`evidenceForClaims`
 *     (P6-08): deduplicates a claim's or claim group's supporting
 *     `Evidence` by `id`, so a `ReconciledClaim` and each `ConflictObject`
 *     position carry a clean, non-redundant evidence set instead of a raw
 *     `flatMap` a caller would otherwise have to deduplicate themselves.
 *   - `reconcile.ts` -- `reconcileClaims`, the algorithm: groups claims by
 *     subject/attribute/category and either derives a structural confidence
 *     when sources agree, or builds a real `@phoenix-ai/knowledge-graph`
 *     `ConflictObject` that retains every distinct position and its
 *     sources when they don't (FR-REC-04) -- each position carrying its own
 *     `computeConfidence` result and its own aggregated `evidenceIds` --
 *     ranked for review via `rankConflicts` (FR-REC-05).
 *   - `composite-confidence.ts` -- `boundCompositeConfidence` (FR-REC-03):
 *     a composite element's confidence bounded by its least-certain
 *     constituent, a separate concern from claim reconciliation.
 *   - `determinism.ts` -- `deterministicId`, a local `sha256`-based
 *     identifier (FR-DET-07: never random), the same technique
 *     `extraction-engine`'s `bridge-shared.ts` uses, reimplemented rather
 *     than imported (see that file's header for why).
 *
 * A `ConflictObject` this package builds is already a valid
 * `CanonicalKnowledgeObject` (`category: 'observation'`) -- unlike
 * `jira-bridge.ts`/`okf-mapping.ts`, there is no separate OKF-wrap step:
 * concatenate `ReconciliationResult.conflicts` directly into a bundle's
 * `objects` array and P2-10's existing `toOkfDocument`/`serializeOkfYaml`
 * handle the rest unmodified.
 *
 * Deliberately NOT implemented here: cross-source ENTITY RESOLUTION (which
 * claims from different sources describe "the same" real-world thing is the
 * caller's job -- `subjectId` is supplied, not inferred); FR-REC-06's
 * human-confirmed-correction override (that is `packages/review-loop`'s
 * job, per the FRD's own module split and FR-IF-04's "review interface");
 * and any persistence, run history, or drift comparison across runs (that
 * is `packages/drift-detection`'s job). See
 * `docs/architecture/adr/0029-p6-05-source-reconciliation.md`,
 * `docs/architecture/adr/0030-p6-06-confidence-calculation.md`, and
 * `docs/architecture/adr/0031-p6-08-evidence-aggregation.md`.
 */

export * from './claim.js';
export * from './confidence-scoring.js';
export * from './reconcile.js';
export * from './composite-confidence.js';
export * from './determinism.js';
export * from './evidence-aggregation.js';
