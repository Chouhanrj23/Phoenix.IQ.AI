# @phoenix-ai/reconciliation-engine

**Module:** Reconciliation & Confidence Engine
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Reconciliation & Confidence Engine"

## Responsibility

Merges signals across sources, surfaces disagreement, and computes confidence for every graph element.

## Status — P6-05/P6-06 (FR-REC-01/02/03/04/05)

`src/` implements the FRD's §3.6 module against real `@phoenix-ai/knowledge-graph` objects — Jira's
(`@phoenix-ai/extraction-engine`'s `jira-bridge.ts`, P6-04) and any other already-bridged source:

- `Claim`/`ClaimCategory`/`SOURCE_TYPE_AUTHORITY`/`authorityOf`/`claimFromObject` (`claim.ts`) — the
  atomic unit this package compares (the FRD's own "structured claims", §2.1), plus FR-REC-01's
  source-type weighting table: how authoritative each `@phoenix-ai/shared` `SourceType` is for each
  of four claim categories (`structure`/`behaviour`/`deployment`/`intent`) — code is authoritative
  for structure, logs for behaviour, docs/tickets for intent, per the FRD's own wording.
  `claimFromObject` extracts one `Claim` from ANY already-bridged canonical object, reusing its own
  provenance/evidence — not Jira-specific.
- `computeConfidence` (`confidence-scoring.ts`, P6-06) — FR-REC-02's dedicated, standalone
  calculation: authority + corroboration when sources agree, AND (generalized beyond P6-05's
  original agreement-only version) a genuine disagreement penalty when they don't — a position
  outvoted by contradicting sources reads as less confident than one that is merely disputed, and a
  live dispute never reads as `high` however authoritative its supporting side is.
- `reconcileClaims`/`rankConflicts` (`reconcile.ts`) — the algorithm. Groups claims by
  (subject, attribute, category); when every claim agrees, derives a structural `Confidence` via
  `computeConfidence`; when they disagree, builds a real `ConflictObject` that retains EVERY distinct
  position and its sources (FR-REC-04: "shall not silently resolve it") — each position carrying its
  OWN `computeConfidence` result, not a shared flat value — ranked most-in-need-of-review first
  (FR-REC-05).
- `boundCompositeConfidence` (`composite-confidence.ts`) — FR-REC-03: a composite element's
  confidence bounded by its least-certain constituent, returned verbatim.
- `deterministicId` (`determinism.ts`) — a local `sha256`-based id helper (FR-DET-07: never random).

`ConflictObject` (`kind: 'reconciliation.conflict'`, `category: 'observation'`) is
`@phoenix-ai/knowledge-graph`'s new sixth domain-specific vocabulary (`reconciliation.ts`) — the
first real occupant of the `observation` structural category P2-02 reserved but left unfilled since
Phase 2. It needs no separate OKF-wrap step: it already is a valid `CanonicalKnowledgeObject`, so a
caller concatenates `ReconciliationResult.conflicts` straight into a bundle's `objects` array.

```
Source A's object ──┐
                     ├─(claimFromObject)─> Claim[] ──(reconcileClaims)──> agreed: Confidence
Source B's object ──┘                                                 └─> conflicts: ConflictObject[]
                                                                              (each position its own
                                                                               computeConfidence)
```

Design rationale: `docs/architecture/adr/0029-p6-05-source-reconciliation.md` and
`docs/architecture/adr/0030-p6-06-confidence-calculation.md`. Status tracker:
`docs/phase-6/README.md`. The canonical `ConflictObject` model this package builds:
`packages/knowledge-graph/README.md`.

**Correlating which claims from different sources describe "the same real-world thing" (`subjectId`)
is the CALLER's job, not this package's** — cross-source entity resolution is a distinct, harder
problem this ticket does not solve.

Not yet implemented: FR-REC-06 (human-confirmed corrections overriding derived confidence — that is
`packages/review-loop`'s job, per the FRD's own module split); the FRD's full mandatory `status`
field (`extracted | inferred | conflicted | human-confirmed`) on every canonical object/relationship
(a `ConflictObject` records a dispute as its own object rather than stamping the disputed objects
themselves); a `SourceType` for "config/IaC" (deployment-category claims currently proxy through
`technical-doc`); configurable/tunable source-type authority scores or confidence-formula thresholds
(both are fixed constants in code); authority-WEIGHTED outnumbered/majority comparison in
`computeConfidence` (it compares plain source counts, not summed authority — see ADR 0030
"Limitations"); per-claim/per-position evidence aggregation (`ConflictObject.evidence` is a raw,
undeduplicated concatenation of each contributing claim's evidence); and any persistence or
run-history comparison (that is `packages/drift-detection`'s job). See ADR 0029/ADR 0030
"Limitations" for the full list and why each is deferred.
