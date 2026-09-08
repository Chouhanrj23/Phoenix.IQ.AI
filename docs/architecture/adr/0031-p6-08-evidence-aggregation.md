# ADR 0031: Evidence aggregation (P6-08)

- **Status:** Accepted
- **Date:** 2026-09-08
- **Owners:** Platform maintainers

## Context

Requested as "P6-08 — Evidence Aggregation: aggregate supporting evidences for each claim." No FRD
functional requirement literally names "evidence aggregation" (grepped the extracted
`docs/requirements/FRD (1).docx` text again for this ticket; every "aggregat" hit is the unrelated
Domain-Driven-Design `Aggregate`/`AggregateRoot` node type, §4.1). This is a natural follow-on
capability the reconciliation pipeline needed, not a distinct FRD item — the same way P6-01
"hardened" a framework the FRD didn't call out by that name either.

P6-05/P6-06 (ADR 0029/0030) built `Claim`, `reconcileClaims`, and per-position confidence, but never
actually aggregated the EVIDENCE behind a claim or a conflict position:

- `ReconciledClaim` (the agreement-case result) carried only `claims: readonly Claim[]` — a caller
  had to `flatMap` every claim's own `.evidence` themselves, and re-derive deduplication, to get "all
  supporting evidence" for an agreed value.
- `ConflictObject.evidence` — the object's own top-level evidence array — was a raw, UNDEDUPLICATED
  `groupClaims.flatMap((claim) => claim.evidence)`. Worse, it mixed evidence from EVERY retained
  position into one flat bag: a reviewer looking at the "Done" position had no way to tell which of
  the object's evidence entries actually supported "Done" versus "In Progress" without manually
  cross-referencing `position.sources[].sourceId` back into that flat array by hand — fragile, since a
  single source can legitimately contribute more than one piece of evidence for different purposes.

This is the same shape of gap P6-06 closed for confidence: a real capability (aggregate evidence per
claim) that existed in name only, half-built, and never actually differentiated per position.

## Decision

1. **`packages/reconciliation-engine/src/evidence-aggregation.ts`** — a new, small, dedicated module:
   - `aggregateEvidence(entries: readonly Evidence[]): Evidence[]` — deduplicates by `Evidence.id`,
     keeping the first occurrence, preserving input order. Trusts the id as the identity boundary
     ("a stable identifier for this specific piece of evidence" — `evidence.ts`'s own doc comment),
     the same "an id is the trust boundary, never re-derived from content" pattern this codebase
     already applies everywhere (`deterministicId`, every `objectIdByKey`-style lookup).
   - `evidenceForClaims(claims: readonly Claim[]): Evidence[]` — `aggregateEvidence` over the
     combined `.evidence` arrays of a set of claims. The one function both integration points below
     call.

2. **`ReconciledClaim` gains an `evidence: Evidence[]` field**, populated via `evidenceForClaims`
   over every agreeing claim. A caller no longer re-derives this from `.claims` by hand.

3. **Each `ConflictPosition` gains its OWN aggregated evidence, referenced by id rather than
   embedded as a nested copy.** `ConflictPosition.evidenceIds?: string[]` (new field,
   `@phoenix-ai/knowledge-graph`'s `reconciliation.ts`) holds the ids `evidenceForClaims` produced for
   just that position's own claims; the object's own top-level `evidence: Evidence[]` (now itself
   deduplicated via the same function, over the WHOLE group) remains the single place the actual
   `Evidence` records live. A consumer joins `position.evidenceIds` against `conflict.evidence` by
   `.id`. Referencing rather than embedding avoids storing the same `Evidence` object twice (once at
   the object level, once nested per position) and — practically — sidesteps the same
   `KnowledgeValue`-index-signature friction `ConflictPositionConfidence` already had to work around
   for `Confidence` (P6-06 ADR 0030 decision 5): a bare `string[]` needs no such workaround at all,
   since `string` is already a `KnowledgeValue`.

4. **`evidenceIds` is optional, purely additive**, the same P2-08/P2-09/P6-06 precedent this codebase
   keeps reusing for exactly this situation: every pre-P6-08 `ConflictObject` fixture — including
   P6-05's and P6-06's own hand-authored test fixtures — remains valid unchanged.

5. **The object-level `ConflictObject.evidence` is now genuinely deduplicated**, not a raw `flatMap`.
   Two claims (e.g. a ticket and its mirror in a second tracker) that happen to cite the exact same
   evidence entry no longer produce two copies of it in the object's evidence array.

## Testing

`packages/reconciliation-engine/tests/evidence-aggregation.test.ts` (new, 9 tests) — the dedicated
suite: empty input, distinct entries passed through unchanged, deduplication by id (keeping the FIRST
occurrence, even when a later duplicate carries different other fields — proving the id, not the
content, is the identity), first-occurrence order preservation, dedup surviving many repeats, and
`evidenceForClaims` over multiple claims (including the same-shared-entry case and empty-claims case).

`reconcile.test.ts` (+5) proves the integration: a `ReconciledClaim`'s `evidence` aggregates across
multiple agreeing claims and deduplicates a literally-shared entry; each `ConflictObject` position
carries its own `evidenceIds`, correctly attributed to the right side of the dispute (never
cross-attributed to the other position) and always present in the object's own top-level `evidence`
array; and the object-level array itself no longer contains duplicate ids when two claims cite the
same evidence. `index.test.ts` (+1) confirms the entry point re-exports both functions.
`knowledge-graph/tests/reconciliation.test.ts` (+4) covers the new optional `evidenceIds` field:
accepted when present and well-formed, accepted when ABSENT (backward compatibility), and rejected
when malformed (non-array, non-string entries).

Every one of the 57 pre-P6-08 `reconciliation-engine` tests and 17 pre-P6-08 `knowledge-graph`
`reconciliation.test.ts` tests still passes unmodified. Totals: 72 `reconciliation-engine` tests (up
from 57), 301 `knowledge-graph` tests (up from 297). `tsc -b --noEmit` and `eslint` are clean in both
packages.

## Consequences

A `ReconciledClaim` and each retained `ConflictObject` position are now self-contained with respect to
evidence: a caller (a future `review-loop` UI, or a human reading the object directly) can see exactly
which supporting material backs which side of a dispute without hand-rolling the cross-reference
themselves, and without a flat evidence bag silently duplicating the same excerpt when two claims
happened to cite it.

The corresponding cost: `buildConflictObject` computes `evidenceForClaims` twice per position (once
for the position's own `evidenceIds`, once implicitly via the group-level call for the object's own
`evidence`) rather than once — a constant-factor, not asymptotic, cost at the scale a reconciliation
run over one system's claims operates at.

## Limitations

- **Deduplication trusts `Evidence.id` completely.** Two evidence entries describing the same
  underlying excerpt but built with different ids (e.g. two independent bridges that did not share an
  id-generation convention) will NOT be recognised as duplicates. This is a deliberate trust boundary,
  not an oversight — re-deriving equality from `excerpt`/`locator` content would be far less reliable
  (two different excerpts of the same file are legitimately different evidence) and contradicts the
  id's own documented purpose.
- **No evidence-level ranking or truncation.** `evidenceIds`/`evidence` preserve input order; a
  position or claim with many pieces of evidence gets all of them, with no "top N most relevant" cut
  — that is a presentation concern for whatever eventually renders these (`review-loop`, a future
  OKF renderer), not this package's.
- **`evidenceForClaims` recomputes over its whole input every call** — no memoization across the
  repeated per-position and per-group calls within `buildConflictObject`. Negligible at this
  package's operating scale (see Consequences); would need revisiting only if claim volumes grew by
  orders of magnitude.

## Alternatives considered

- **Embed a full `Evidence[]` copy directly on each `ConflictPosition`** (mirroring how
  `ConflictPositionConfidence` embeds a full confidence value) instead of referencing by id —
  rejected, see decision 3: it would duplicate the same `Evidence` record in two places for every
  position that shares evidence with the object level (the common case, since a position's evidence is
  always a subset of the object's), and would require the same self-indexed mirror-type workaround
  `ConflictPositionConfidence` needed for `Confidence` — extra ceremony a plain `string[]` avoids
  entirely.
- **Deduplicate by evidence CONTENT (`sourceId` + `locator` + `excerpt`) instead of by `id`** —
  rejected: `id` is the field this codebase already designates as the stable identity for one piece of
  evidence; re-deriving equality from content would be a second, competing notion of "the same
  evidence" and could either over-merge (two similar but distinct excerpts) or under-merge (the same
  excerpt captured under a slightly different locator string).
- **Rank evidence within a position by source authority or recency** — considered, rejected for this
  ticket: aggregation (collect and deduplicate) and ranking (order by relevance) are separable
  concerns, and the ticket asked specifically for aggregation. Ordering is left as a documented,
  disclosed gap (see "Limitations") rather than an unrequested addition.
