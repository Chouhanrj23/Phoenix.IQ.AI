# ADR 0030: Dedicated confidence calculation (P6-06)

- **Status:** Accepted
- **Date:** 2026-09-08
- **Owners:** Platform maintainers

## Context

Requested as "P6-06 — confidence calculation: calculate confidence from source agreement/
corroboration." That is FR-REC-02 (FRD §3.6) verbatim: "Confidence shall be derived structurally
from source agreement, source-type weight, and cross-signal corroboration — not from model
self-report."

P6-05 (ADR 0029) had already implemented a version of this — but only halfway, and only where it was
convenient rather than everywhere FR-REC-02 actually applies. `reconcile.ts` had a private,
non-exported `confidenceFor(maxAuthority, corroboration)` function called EXACTLY ONCE, from the
agreement path (`byValue.size === 1`). The moment sources disagreed, the whole subject/attribute
group fell through to `buildConflictObject`, and no confidence was computed at all for either side of
the dispute — the resulting `ConflictObject`'s only confidence was a flat, hardcoded
`metadata.confidence: { level: 'high' }`, which answers "are we sure a conflict exists?" (yes,
trivially — two distinct values were observed), never "how well-supported is THIS specific position?"

That gap is exactly backwards relative to what "source agreement" as a genuine INPUT should mean.
Consider: a Jira ticket (authority 3 for an "intent" claim) says a feature is "Done"; a single
technical-doc page (authority 2) says it is still "In Progress." Under P6-05, both positions were
retained (correctly, per FR-REC-04) but NEITHER carried any indication that the Jira claim, being
better-sourced, deserves more weight than the doc claim. "Source agreement" as FR-REC-02 names it is a
matter of DEGREE — how much of the total evidence agrees — not a boolean gate that only fires once
100% of sources agree.

## Decision

1. **Extracted into its own dedicated, exported, directly-testable module**:
   `packages/reconciliation-engine/src/confidence-scoring.ts`'s `computeConfidence`. Previously a
   private implementation detail of one function inside `reconcile.ts`; now a first-class capability
   any future caller (a future inference-engine consumer, a future review-loop prioritisation) can
   invoke directly without going through the full claim-grouping machinery.

2. **Generalized to take an explicit `contradictingSources` count**, defaulting to 0. With 0 (or
   omitted), `computeConfidence` produces EXACTLY what P6-05's `confidenceFor` already did and had
   tested — same three-tier level rule, same score formula, verified by re-running every existing
   P6-05 test unmodified (all 36 passed against the new implementation with no changes). This was a
   hard constraint on the refactor: generalizing must not silently change already-shipped, already-
   tested behaviour for the uncontested case.

3. **`buildConflictObject` (`reconcile.ts`) now calls `computeConfidence` once PER POSITION**, not
   zero times. Each position's `supportingAuthority`/`supportingSources` come from its own claims;
   `contradictingSources` is the distinct source count across every OTHER position in the same
   group. The result is a real, differentiated `ConflictPosition.confidence` — the Jira/"Done" example
   above now reads `medium` while the doc/"In Progress" side reads `low`, not an undifferentiated pair
   of positions with no confidence at all.

4. **Contested-case level rule, layered on top of the existing uncontested three tiers:**
   - `high` is ALWAYS capped down to `medium` when `contradictingSources > 0` — a position with a
     live, unresolved contradiction should never read as settled fact, however authoritative its own
     supporting sources are. This is the direct enforcement of FR-REC-04's spirit inside FR-REC-02's
     number: a conflict existing at all should visibly cost confidence.
   - `medium` is further capped to `low` only when OUTNUMBERED
     (`contradictingSources > supportingSources`), not merely contradicted. A genuine 1-vs-1 tie (or a
     clear majority) keeps `medium` — so the stronger side of a dispute still reads as meaningfully
     stronger than the weaker one, rather than both collapsing to the same floor the instant any
     disagreement exists at all.
   - The comparison is by SOURCE COUNT, not authority-weighted vote tallying. A deliberate
     simplification, disclosed below: it is easy to audit ("count of sources on each side"), which
     matters more here than a more sophisticated but harder-to-explain weighted comparison, given
     FR-REC-02's own emphasis on "structurally derived... not from model self-report" — the whole
     point is a formula a reader can verify by hand.

5. **`ConflictPosition` (`@phoenix-ai/knowledge-graph`'s `reconciliation.ts`) gains an OPTIONAL
   `confidence?: ConflictPositionConfidence` field.** Purely additive, the same P2-08/P2-09 precedent
   this codebase uses repeatedly for extending an existing shape (`confidenceDetail`, relationship
   `evidence`): every P6-05 fixture and hand-authored `ConflictObject` that predates this field remains
   valid, unmodified. `ConflictPositionConfidence` structurally mirrors `@phoenix-ai/shared`'s
   `Confidence` but declares its own `[key: string]: KnowledgeValue` index signature and narrows
   `level` to `string` — the identical "loosen and self-index" move `ConflictPositionSource.sourceType`
   already made for `SourceType`, for the same reason: a value nested inside a `KnowledgeValue`-typed
   attribute bag needs an index signature of its own, which neither `Confidence` nor `SourceType`
   (defined in `@phoenix-ai/shared`, outside this model's control) carries.

6. **`ComputedConfidence` (`confidence-scoring.ts`) declares `score` as required, not optional**,
   unlike `@phoenix-ai/shared`'s `Confidence.score?: number`. `computeConfidence` always calculates a
   score, so callers get a definite `number`; this also sidesteps an `exactOptionalPropertyTypes`
   assignability trap (assigning an optional-typed `score` into a target that requires either a real
   number or genuine absence, never explicit `undefined`, fails type-checking even though the runtime
   value is always defined). A required field is always assignable into an optional slot, so
   `ComputedConfidence` satisfies both `Confidence` (`ReconciledClaim.confidence`) and
   `ConflictPositionConfidence` (`ConflictPosition.confidence`) without a cast.

## Testing

`packages/reconciliation-engine/tests/confidence-scoring.test.ts` (new, 18 tests) — the dedicated
suite this ticket's own title asks for:

- **Uncontested (9)** — every tier of the original three-level rule, `contradictingSources` omitted
  behaving identically to `0`, score monotonically increasing with authority and with corroboration
  (capped at the 0.15 bonus ceiling), the 1.0 score ceiling, and the throw for zero supporting
  sources.
- **Contested (9)** — grounded in the ticket's own Jira-vs-doc scenario: `high` never survives any
  contradiction; the exact 1-vs-1 tie from the scenario (stronger side `medium`, weaker side `low`,
  not equal); an outnumbered position capped to `low`; a clear majority KEEPING `medium` rather than
  being crushed; score strictly lower when contested than the identical uncontested case; score
  falling further as the contradicting proportion grows; and the 0.0 score floor.

`reconcile.test.ts` (+2) and `index.test.ts` (+1) prove the integration: a real `reconcileClaims` run
now produces differentiated per-position confidence end to end (not just at the unit level), and the
majority-position case keeps `medium` rather than collapsing.
`knowledge-graph/tests/reconciliation.test.ts` (+4) covers the new optional field: accepted when
present and well-formed, accepted when ABSENT (backward compatibility, decision 5), and rejected when
malformed (`level` missing, `score` non-numeric).

Every one of P6-05's original 36 `reconciliation-engine` tests and 13 `knowledge-graph`
`reconciliation.test.ts` tests still passes unmodified. Totals: 57 `reconciliation-engine` tests
(up from 36), 297 `knowledge-graph` tests (up from 293). `tsc -b --noEmit` and `eslint` are clean in
both packages.

## Consequences

A `ConflictObject`'s positions now carry the information FR-REC-02 was always meant to produce for
them: not just "these sources disagree" but "here is how much weight each side of the disagreement
actually has, and why." A future `review-loop` prioritisation pass (or a human reviewer reading a
conflict directly) can now sort or filter by per-position confidence, not only by `rankConflicts`'
position/source counts. The confidence-scoring module is now a genuinely reusable building block
rather than an implementation detail buried inside one call site.

The corresponding cost: `ConflictPosition` grew one more optional field, and `reconcile.ts`'s
`buildConflictObject` does slightly more work per position (one `computeConfidence` call plus a
distinct-source-id set construction for the "everyone else" contradicting count). Negligible at the
scale this package operates at (a reconciliation run over one system's claims, not a streaming
pipeline).

## Limitations

- **The outnumbered/majority cap compares plain source COUNTS, not authority-weighted votes**
  (decision 4). A single highly authoritative source outnumbered 3-to-1 by weak sources is still
  capped to `low`, even though a more sophisticated tally might judge it differently. Disclosed,
  deliberate: simplicity and auditability were weighed above precision here, consistent with
  FR-REC-02's "structurally derived" emphasis.
- **No configurable thresholds.** The `high`/`medium`/`low` cutoffs, the 0.15 corroboration-bonus
  cap, and the disagreement-penalty formula are fixed constants in code, not tunable per deployment —
  the same disclosed limitation ADR 0029 already carries for `SOURCE_TYPE_AUTHORITY`.
- **Corroboration still counts distinct `sourceId`s, not distinct real-world sources** — unchanged
  from ADR 0029's own limitation; two `sourceId`s that happen to be the same underlying system exposed
  twice would still count as independent corroboration.
- **The conflict object's own top-level `metadata.confidence` remains a flat `{ level: 'high' }`**,
  unchanged from P6-05 — this ticket only differentiates PER-POSITION confidence, not whether the
  conflict's existence itself is confidently observed (which it already was, trivially, the moment two
  distinct values are seen).

## Alternatives considered

- **Leave `confidenceFor` private and simply call it once per position without generalizing its
  signature** (i.e. still only pass `maxAuthority`/`corroboration`, ignore contradicting evidence
  entirely) — rejected: that would give every position in a conflict the SAME confidence it would have
  had in isolation, contradicting the entire premise that a disputed claim should read as less certain
  than an undisputed one. FR-REC-02 names "source agreement" as an input specifically because it
  matters when it is NOT total.
- **Weight the outnumbered/majority cap by summed authority rather than by source count** —
  considered and rejected for this ticket, see decision 4 and "Limitations": more sophisticated, but
  harder to audit by hand, which cuts against FR-REC-02's own "not from model self-report" spirit of
  demanding a formula a person can verify.
- **Make `ConflictPosition.confidence` required rather than optional** — rejected: every existing
  P6-05 fixture, and any future caller that does not need per-position confidence, would break for no
  benefit; optional-and-additive is the established precedent (P2-08's `confidenceDetail`, P2-09's
  relationship `evidence`) for exactly this situation.
