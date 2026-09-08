# ADR 0029: Source-to-source reconciliation (P6-05)

- **Status:** Accepted
- **Date:** 2026-09-08
- **Owners:** Platform maintainers

## Context

Requested as "P6-04 — Reconciliation: source-to-source reconciliation. Compare evidence from Jira and
other sources, identify contradictory claims and retain both positions." P6-04 was already used for
the OKF-mapping ticket (ADR 0028); this ticket is tracked as **P6-05** to avoid a duplicate ticket
number in the ADR/CHANGELOG/status-tracker sequence.

`packages/reconciliation-engine` had been an untouched scaffold since the original repository
setup. Its README already stated the remit verbatim from the FRD: "Merges signals across sources,
surfaces disagreement, and computes confidence for every graph element." The FRD's module section
(§3.6, extracted from `docs/requirements/FRD (1).docx` — a `.docx`, not previously transcribed
anywhere in `docs/`) specifies six functional requirements:

```
FR-REC-01  Weight sources by type: code authoritative for structure, logs/traces for behaviour,
           config/IaC for deployment, docs/tickets for intent.
FR-REC-02  Confidence shall be derived structurally from source agreement, source-type weight, and
           cross-signal corroboration — not from model self-report.
FR-REC-03  The confidence of a composite element shall be bounded by its least-certain constituent.
FR-REC-04  When sources disagree, the system shall record a conflict retaining both positions and
           their sources, and shall not silently resolve it.
FR-REC-05  Conflicts shall be exposed in outputs and prioritised for review.
FR-REC-06  Human-confirmed corrections shall override derived confidence and be treated as
           authoritative on subsequent runs.
```

The ticket's own wording ("identify contradictory claims and retain both positions") maps directly
onto FR-REC-04, with FR-REC-01/02 as the supporting confidence machinery and FR-REC-05 as the output
requirement. FR-REC-06 is explicitly out of scope: it is `packages/review-loop`'s job per the FRD's
own module split (§5, FR-IF-04: "a review interface for the correction loop") and that package's own
README ("Captures and persists human corrections").

Two things this ticket found already waiting for it:

1. **`StructuralCategory: 'observation'`** has been reserved since P2-02 (`ontology.ts`) for exactly
   this shape — "a meta-statement ABOUT other knowledge objects... a review item surfacing a disputed
   value" — and `packages/knowledge-graph/tests/ui-coverage.test.ts` has documented since P2-12 that
   no real `kind` had ever filled it: "P2-02 already reserved the structural category these would use
   (observation), unused by any real kind yet."
2. **The FRD's own §4.3 "Element Metadata" table** lists a mandatory `status` field
   (`extracted | inferred | conflicted | human-confirmed`) on every node/edge — a bigger, cross-cutting
   change than this ticket takes on; see decision 5 for the scoping call.

## Decision

1. **`packages/knowledge-graph/src/reconciliation.ts`** — the sixth domain-specific `kind`
   vocabulary, `ConflictObject` (`kind: 'reconciliation.conflict'`, `category: 'observation'`),
   built the same way P2-03 through P2-06 and P6-04's `workitem.ts` were: model only, no comparison
   logic. `ConflictAttributes.positions: ConflictPosition[]` retains EVERY distinct value sources
   claimed — never collapsed to one — each with every source that claimed it and that source's
   computed authority. `validateConflictObject` requires at least two positions: a "conflict" with
   fewer is not one.

2. **`packages/reconciliation-engine/src/`** implements the algorithm as a NEW real module,
   replacing the scaffold (the same `MODULE_NAME`/`placeholder()` replacement every prior P-0X
   ticket's first real package did):
   - `claim.ts` — `Claim`, the atomic unit ("structured claims" is the FRD's own phrase, §2.1's
     trust-boundary description). `claimFromObject` extracts one from ANY already-bridged
     `CanonicalKnowledgeObject` — not Jira-specific — reusing its own `metadata.provenance[0]` and
     `evidence` rather than re-deriving them. `SOURCE_TYPE_AUTHORITY` is FR-REC-01's weighting table:
     a deliberately coarse 1–3 integer scale per `(ClaimCategory, SourceType)` pair, not invented
     decimals, with every combination scored (`Record<SourceType, 1|2|3>`'s compiler-enforced
     completeness rules out a silently-missing source type).
   - `reconcile.ts`'s `reconcileClaims` — groups claims by `(subjectId, attribute, claimCategory)`.
     Within a group: if every claim's value matches (compared via canonical, key-order-independent
     JSON equality), it is an AGREEMENT — `confidenceFor` derives a `Confidence` purely from the
     strongest source authority and how many independent sources corroborate it (FR-REC-02's "not
     from model self-report", satisfied by the function being a small, fully inspectable formula, not
     a model call). If values differ, it is a CONFLICT — `buildConflictObject` groups claims by
     distinct value into positions and returns a real `ConflictObject` (FR-REC-04).
   - `rankConflicts` sorts by position count, then total source count, then a deterministic id
     tiebreak — "prioritised for review" (FR-REC-05) as the actual default ordering of
     `ReconciliationResult.conflicts`, not a separate opt-in step.
   - `composite-confidence.ts`'s `boundCompositeConfidence` — FR-REC-03, kept deliberately separate
     from claim reconciliation: it bounds a composite element's confidence by its weakest
     constituent's `Confidence`, returned VERBATIM (a composite is exactly as certain as its weakest
     part, not a blended average).
   - `determinism.ts`'s `deterministicId` — the same `sha256`-over-stable-inputs technique
     `extraction-engine`'s `bridge-shared.ts` already uses, REIMPLEMENTED locally rather than
     imported: two same-stage `packages/*-engine` siblings should not depend on each other for a
     ten-line generic utility.

3. **Correlating which claims from different sources describe "the same real-world thing"
   (`subjectId`) is the CALLER's job, not this package's.** Cross-source entity resolution — deciding
   that Jira's `AUR-101` and a technical-doc's "the refund feature" are the same subject — is a
   distinct, materially harder problem (fuzzy matching, human judgement, or a future dedicated
   ticket) that this ticket does not attempt to solve. `Claim.subjectId` is supplied by whoever calls
   `claimFromObject`/builds a `Claim` by hand, exactly the same scope boundary
   `bridgeJiraArtifacts` (P6-04) already drew for matching issue keys within one batch, one level up.

4. **A `ConflictObject` needs no separate OKF-wrap step, unlike Java/Jira.** It already IS a valid
   `CanonicalKnowledgeObject` the moment `reconcileClaims` returns it — a caller concatenates
   `ReconciliationResult.conflicts` directly into a bundle's `objects` array. Building a
   `reconciliation-okf-mapping.ts` mirroring `okf-mapping.ts`/`jira-okf-mapping.ts` would only
   reproduce three lines of boilerplate (`{ ...bundle, objects: [...objects, ...conflicts] }`) for no
   real benefit, so none was added.

5. **The FRD's full `status: extracted | inferred | conflicted | human-confirmed` field is NOT added
   to the P2-01 envelope in this ticket.** That is a cross-cutting change touching every existing
   object/relationship kind across five prior domain files plus this ticket's own two, with a much
   larger blast radius than "record a conflict as its own object" — FR-REC-04's literal requirement.
   `ConflictObject`'s existence already gives a caller everything needed to know a subject/attribute
   is disputed (join on `attributes.subjectId`/`attribute`), which is the operationally load-bearing
   part; formally stamping `status: 'conflicted'` back onto the disputed objects themselves is a
   disclosed, deferred gap — see "Limitations".

## Testing

`packages/reconciliation-engine/tests/` — 36 tests across 4 files (replacing the 2-test scaffold
suite), plus `packages/knowledge-graph/tests/reconciliation.test.ts` (13 tests, 293 total in that
package, up from 280):

- **`claim.test.ts` (8)** — every `(ClaimCategory, SourceType)` pair is scored (no silent gaps);
  FR-REC-01's three literal examples (code/structure, logs/behaviour, docs-tickets/intent); the same
  source scoring differently across categories; `claimFromObject` against a real P6-04 `WorkItemObject`
  fixture, including the two `undefined`-returning edge cases (missing attribute, no provenance).
- **`reconcile.test.ts` (17)** — grounded in the ticket's own scenario: a Jira claim ("Done") against
  a technical-doc claim ("In Progress") for the same subject. Agreement confidence at all three
  levels; claims split by `claimCategory` even with an identical value; the conflict path proven via
  the REAL `validateConflictObject`; both positions retained verbatim with correct sources/authority;
  no settled "winner" value anywhere on the object; evidence and provenance merged from both sides; a
  three-way conflict; agreeing sources collapsed into one shared position within a conflict;
  determinism across repeated calls; and a full `validateSourceReferences` check against a real
  `Source` registry. `rankConflicts` (2): more-disputed-first ordering, and non-mutation of its input.
- **`composite-confidence.test.ts` (7)** — single-constituent passthrough, weakest-wins regardless of
  input order, `'inferred'` ranked weaker than `'low'` (with the reasoning documented inline), a
  score tiebreak, a missing `score` never winning a tiebreak, and the empty-input throw.
- **`index.test.ts` (4)** — the public entry point re-exports each part.
- **`knowledge-graph/tests/reconciliation.test.ts` (13)** — mirrors `workitem.test.ts`'s coverage
  style for the new model: valid/invalid shapes, every required-field rejection, the
  fewer-than-two-positions rejection, and an end-to-end bundle validation proving decision 4 (no
  separate wrap step needed).

All 293 `knowledge-graph` tests and all 36 `reconciliation-engine` tests pass; `tsc -b --noEmit` and
`eslint` are clean in both packages.

## Consequences

Any two (or more) already-bridged sources describing the same real-world subject can now be compared:
when they agree, a structurally-derived confidence reflects how many independent, weighted sources
back the claim; when they disagree, nothing is silently dropped or averaged away — both positions
survive as a real, queryable, OKF-serializable graph object with full source attribution, ready to
seed `packages/review-loop`'s eventual human-review queue (FR-REC-05/FR-IF-04) via ordinary graph
traversal (find every `reconciliation.conflict` object, already ranked). The long-reserved
`category: 'observation'` slot in the canonical model has its first real occupant.

The corresponding cost: `packages/reconciliation-engine` now depends on
`@phoenix-ai/knowledge-graph` (previously only `@phoenix-ai/shared`), the same dependency direction
`extraction-engine`/`ingestion-connectors` already established. `SOURCE_TYPE_AUTHORITY`'s specific
1–3 scores are this ticket's own reasonable, disclosed defaults — not FRD-mandated constants (the FRD
gives qualitative examples, never numbers) — and a future ticket may need to make them tunable per
deployment rather than hardcoded.

## Limitations

- **No cross-source entity resolution.** `subjectId` correlation is the caller's job (decision 3);
  this ticket does not decide that a Jira issue and a code artifact describe "the same" thing.
- **The FRD's mandatory `status` field is not added to every canonical object/relationship**
  (decision 5) — a `ConflictObject` records a dispute as its own object; it does not (yet) mark the
  disputed source objects themselves as `status: 'conflicted'`.
- **FR-REC-06 (human-confirmed override) is entirely out of scope** — `packages/review-loop`'s job,
  still an untouched scaffold.
- **No `SourceType` maps cleanly to "config/IaC"** for `deployment`-category claims; `technical-doc`
  is used as the closest available proxy, disclosed in `claim.ts`'s own doc comment. A dedicated
  `SourceType` value would need a `@phoenix-ai/shared` change, out of scope here (that type is used
  everywhere across the pipeline).
- **`SOURCE_TYPE_AUTHORITY`'s scores are fixed at compile time, not configurable per deployment or
  per system.** Two organizations may reasonably weigh, say, `test` evidence differently; that is a
  future ticket, not this one.
- **No persistence or run-history.** `reconcileClaims` is a pure function over whatever claims a
  caller assembles for one run; comparing conflicts ACROSS runs over time is
  `packages/drift-detection`'s job, unbuilt.
- **Confidence corroboration counts distinct `sourceId`s, not distinct real-world sources.** Two
  claims from the same underlying system exposed under two different `sourceId`s (e.g. a mirrored
  ticket tracker) would count as two independent corroborating sources; detecting that is, again,
  entity-resolution territory this ticket does not attempt.

## Alternatives considered

- **Add `status: 'extracted' | 'inferred' | 'conflicted' | 'human-confirmed'` to the P2-01 envelope
  now, matching the FRD's §4.3 table literally** — rejected for this ticket, see decision 5. The
  blast radius (every existing object/relationship kind across five prior domain files) is out of
  proportion to what FR-REC-04 specifically asks for, and `ConflictObject`'s existence already
  satisfies "record a conflict... retaining both positions" without it.
- **Build `reconciliation-okf-mapping.ts` mirroring `okf-mapping.ts`** — rejected, see decision 4: a
  `ConflictObject` needs no wrapping, so a whole extra file would exist only to reproduce a
  three-line spread.
- **Have `reconcileClaims` attempt fuzzy subject matching** (e.g. matching similar labels/summaries
  across sources) — rejected, see decision 3: entity resolution done badly (a wrong automatic match)
  is worse than not attempting it, and doing it well is its own significant piece of work this ticket
  was not asked to build.
- **Weight sources with decimal scores derived from some formula** instead of a coarse 1–3 integer
  scale — rejected: the FRD gives no numeric specification at all, and decimals would imply a
  precision that does not exist, inviting a false sense of calibration.
- **Reuse `extraction-engine`'s `deterministicId`/`BridgeOptions` directly** — rejected, see decision
  2: `reconciliation-engine` and `extraction-engine` are sibling pipeline-stage packages; importing
  from one into the other for a ten-line hashing utility is the wrong coupling direction compared to
  a tiny, disclosed duplication.
