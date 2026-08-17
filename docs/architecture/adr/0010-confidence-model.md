# ADR 0010: Confidence model (P2-08)

- **Status:** Accepted
- **Date:** 2026-08-17
- **Owners:** Platform maintainers

## Context

P2-07 (ADR 0009) formalized the provenance model — where a piece of knowledge came from. P2-08
turns to a related but distinct cross-cutting concern: how strongly Phoenix trusts that knowledge.

Phase 1 already defined `Confidence`/`ConfidenceLevel` in `packages/shared/src/provenance.ts`:
`level: 'high' | 'medium' | 'low' | 'inferred'`, an optional `score` documented as "numeric score
in `[0, 1]` for finer-grained ranking", and an optional `rationale`. Reused as-is by
`CanonicalKnowledgeObject.metadata`/`CanonicalKnowledgeRelationship.metadata` since P2-01. Three
of the objective's five requirements were already covered: confidence level, numerical score, and
rationale.

Two things were missing, and one thing was actively wrong:

1. **No optional confidence-calculation metadata** — nothing records how a score was produced
   when it wasn't direct human judgment.
2. **No clean basis/source relationship** — nothing distinguishes _how_ a claim relates to what
   grounds it (directly read off a source, vs. reasoned/derived from one or more sources).
3. **`level: 'inferred'` conflates two different questions.** `level` is meant to answer "how
   strongly do we trust this" (a strength scale: high → medium → low), but `'inferred'` smuggles
   in a second, orthogonal question — "was this observed or reasoned about at all" — as a fourth
   rung on the _same_ scale. Real Phase 1 fixture data confirms this in practice: every
   `level: 'inferred'` entry across `apps/web/src/data/mock/{aurora,fintech}/{fixtures,nfrs}.ts`
   also carries a low `score` (0.25–0.32). The model has no way to represent a _confident_
   inference — a case that will matter as soon as a real inference/reconciliation engine exists,
   since a well-corroborated inference is not automatically "low confidence."

The objective is explicit that this must not be swept under the rug: "The model must distinguish
FACT / DIRECTLY OBSERVED from DERIVED / INFERRED without pretending that inferred information is
equivalent to directly observed information" — and separately, "confidence must remain independent
from provenance."

## Decision

1. **New file `confidence.ts` adds `ConfidenceBasis`, `ConfidenceCalculation`, and
   `ConfidenceDetail` — composing with, not redefining, Phase 1's `Confidence`.** `Confidence`
   answers "how strongly do we trust this" (untouched, still owns `level`/`score`/`rationale`).
   `ConfidenceDetail.basis` answers a genuinely different question: "was this observed or derived
   at all." Two questions, two fields, never blended into one enum again.
2. **`ConfidenceBasis` is a closed two-value type: `'observed' | 'derived'`.** `observed` — read
   directly from a source with no intermediate reasoning step. `derived` — produced by reasoning
   over one or more other pieces of information (a heuristic, an inference engine, human
   judgment). Deliberately does not distinguish _how_ something was derived — that's
   `ConfidenceCalculation.method` or `Provenance.derivedBy` (`@phoenix-ai/shared`)'s job, not this
   field's.
3. **`basis` is required whenever `ConfidenceDetail` is present at all — no optional escape
   hatch.** This is the concrete mechanism satisfying "without pretending that inferred
   information is equivalent to directly observed information": once a claim opts into carrying
   `ConfidenceDetail`, it cannot state a confidence level/score without also declaring which kind
   of claim it is. The `confidenceDetail` field itself stays optional on the envelope (so P2-01
   through P2-07 objects remain valid unchanged), but its internal shape leaves no gap once used.
4. **`ConfidenceCalculation` is optional, free-text metadata (`method`, `calculatedAt`,
   `inputs?`), not a calculation engine.** It gives a future engine (explicitly out of scope here,
   per the objective) a structured place to record what it did — which method, when, what fed it —
   without Phase 2 building that engine. `method`/`inputs` are deliberately unstructured strings/
   bag, mirroring P2-07's `Source.version` reasoning (ADR 0009 alternatives considered): no real
   calculation logic has been read yet to know what a closed vocabulary of methods should look
   like.
5. **`confidenceDetail?: ConfidenceDetail` is added as a new optional sibling field directly on
   `CanonicalKnowledgeObject` and `CanonicalKnowledgeRelationship`** (`canonical-object.ts`,
   `relationships.ts`) — not folded into `metadata`, and not a parallel/competing confidence field.
   `metadata.confidence` (Phase 1, frozen) remains the single source for strength (`level`/
   `score`/`rationale`); `confidenceDetail` is purely additive, the same sibling-field pattern
   P2-01 already used for `evidence: Evidence[]` alongside `metadata`. A relationship gets the
   field too — a relationship is itself a claim (e.g. "Checkout calls Payments" can be observed
   via a code call or inferred from a naming heuristic).
6. **`validation.ts` validates `confidenceDetail` inline in the base object/relationship
   validators**, exactly mirroring how `lifecycle?: LifecycleState` (P2-02) is already validated
   inline rather than via a separate exported validator. `confidence.ts` itself has zero
   dependency on `validation.ts` (only `identity.ts` for `KnowledgeValue`), so `validation.ts` can
   safely import `CONFIDENCE_BASES` from it one-directionally — the same acyclic layering
   `ontology.ts` (`LifecycleState`) already established, avoiding the circular-import trap P2-07
   deliberately worked around for `Source` (ADR 0009 decision 5).
7. **`Confidence`/`ConfidenceLevel`/`GraphElementMetadata` in `@phoenix-ai/shared` are completely
   untouched.** No field added, renamed, or removed — every Phase 1 fixture, route, and UI
   component (including `provenance-list.tsx`'s exhaustive `Record<Provenance['sourceType'], ...>`-
   style patterns) keeps working unmodified. Same discipline as P2-07 (ADR 0009 decision 7 /
   alternatives considered), applied here for the identical reason.
8. **Numerical score range and interpretation are documented, not left arbitrary.** Per Phase 1's
   own doc comment, `score` is `[0, 1]`. This ADR fixes an interpretation, grounded in real Aurora/
   Fintech fixture data ranges observed across `apps/web/src/data/mock`:

   | Range       | Meaning                                                                                       | Observed in real fixtures                              |
   | ----------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
   | 0.85 – 1.0  | Very high — strong, typically direct/unambiguous signal (parsed source code, a formal schema) | `level: 'high'`, scores 0.85–0.98                      |
   | 0.65 – 0.84 | High — reliable but not unambiguous, or a low-risk derivation                                 | `level: 'high'`, scores 0.87–0.92 range also seen here |
   | 0.4 – 0.64  | Medium — one weak or partial corroborating signal                                             | `level: 'medium'`, scores 0.6–0.68                     |
   | 0.0 – 0.39  | Low — a single weak signal, an unconfirmed inference, or a flagged assumption                 | `level: 'low'`/`'inferred'`, scores 0.25–0.4           |

   This is interpretive guidance for anything that assigns a `score`, not a validation rule —
   enforcing it strictly would reject real, already-valid Phase 1 fixture data whose score/level
   pairs don't fall on exact boundaries, and would drift toward "confidence calculation engine"
   territory, which is explicitly out of scope.

9. **Confidence stays structurally independent of provenance.** `ConfidenceDetail` has no field
   referencing a `Provenance` entry or `Source` id (`provenance.ts`, P2-07) — a `basis: 'derived'`
   claim doesn't have to point at which source(s) fed the derivation to be valid. That link, if
   ever needed, belongs to `Provenance.derivedBy`/`ConfidenceCalculation.inputs`, not to a
   structural foreign key on confidence itself, keeping "where information came from" and "how
   strongly Phoenix trusts it" answerable independently.

## Testing

`packages/knowledge-graph/tests/confidence.test.ts` (21 tests) covers:

- **Valid combinations** — no `confidenceDetail` at all (backward-compatible); `basis: 'observed'`/
  `'derived'` with and without `calculation`; applied identically to relationships.
- **Invalid values** — missing/unrecognized `basis`, a non-object `confidenceDetail`, a
  `calculation` missing `method`, an invalid `calculatedAt` timestamp, a non-object `calculation`
  or `calculation.inputs`, an explicit `null`, and the same rejections on relationships.
- **Independence from provenance** — a valid `ConfidenceDetail` references no `Provenance`/
  `Source` field; two objects sharing identical provenance can carry different `basis` values.
- **FACT/DIRECTLY OBSERVED vs DERIVED/INFERRED, grounded in real fixture ranges** — a
  directly-observed high-confidence fact (real range ~0.9); a low-confidence inference matching
  how Phase 1 used `level: 'inferred'` (real range ~0.25–0.32); and, crucially, a
  **high-confidence inference** and a **low-confidence direct observation** — the two combinations
  Phase 1's single-axis `level` enum could never cleanly express, now both valid and distinct.

All 155 previously-passing tests across the other 11 files still pass unmodified.

## Consequences

Every canonical knowledge item can now express confidence strength and epistemic basis as two
independent facts, matching how Phase 1's own real data already implicitly wanted to (every
`'inferred'` entry was _also_ trying to say "low trust", conflating both signals into one field).
A future inference/reconciliation engine has a defined, structured place (`ConfidenceCalculation`)
to record how it produced a score, and a defined way to mark its output as `derived` at whatever
strength the evidence actually supports — including `high`, which Phase 1 could not represent for
inferred claims.

## Alternatives considered

- **Add a `basis`/`derived` field directly to `Confidence` in `@phoenix-ai/shared`** — rejected:
  even as an additive optional field, this changes a live Phase 1 contract type consumed by
  `apps/api`/`apps/web`, for no benefit a knowledge-graph-owned sibling field doesn't already
  provide — the same reasoning ADR 0009 already applied to `Provenance`, applied here to
  `Confidence` for the identical reason.
- **Deprecate/remove `level: 'inferred'`** — impossible without a Phase 1 contract change (out of
  scope), and unnecessary: `ConfidenceDetail.basis` supersedes it for any object that adopts the
  new model, while `'inferred'` remains valid, unmodified, and still meaningful for anything that
  hasn't.
- **A structured, closed vocabulary for `ConfidenceCalculation.method`** (e.g. an enum of known
  calculation strategies) — rejected as premature: no calculation engine exists yet to know what
  methods actually occur in practice; free-text avoids guessing a taxonomy ahead of real usage,
  the same reasoning ADR 0009 applied to `Source.version`.
- **A hard validation rule tying `score` ranges to `level` values** — rejected: would reject
  legitimate real Phase 1 fixture data that doesn't fall on clean boundaries, and edges toward
  implementing confidence-calculation logic, which the objective explicitly excludes. Documented
  as interpretive guidance (decision 8) instead of an enforced rule.
- **A required (not optional) `sourceId`/`sourceIds` field on `ConfidenceDetail`**, explicitly
  linking a confidence assessment to the provenance entries that ground it — rejected: directly
  conflicts with "confidence must remain independent from provenance." An object's own
  `metadata.provenance[]` already carries that information; duplicating a pointer to it on
  `ConfidenceDetail` would couple the two concerns the objective asks to keep separate.
