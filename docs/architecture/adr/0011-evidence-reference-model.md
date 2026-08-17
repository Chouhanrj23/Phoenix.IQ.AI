# ADR 0011: Evidence/reference model (P2-09)

- **Status:** Accepted
- **Date:** 2026-08-17
- **Owners:** Platform maintainers

## Context

P2-07 (ADR 0009) formalized provenance — where knowledge originated. P2-08 (ADR 0010) formalized
confidence — how strongly Phoenix trusts it. P2-09 rounds out the third piece of Phase 1's
"Element metadata" concern: what specifically supports a claim, distinct from both.

`Evidence` already existed since P2-01 (`evidence.ts`): `id`, `sourceId`, optional `excerpt`,
optional `locator`. `CanonicalKnowledgeObject.evidence: Evidence[]` was already a required
(possibly-empty) field. Four of the objective's six requirements were already covered: evidence
identity (`id`), source/reference (`sourceId`), location (`locator`), and supporting
content/context (`excerpt`).

Three things were missing:

1. **No timestamp/version on `Evidence` itself.** `Provenance.derivedAt` (`@phoenix-ai/shared`)
   records when a _claim_ was derived, and P2-07's `Source.version` records a source's _current
   known_ version in the registry — but nothing recorded when a specific excerpt was captured, or
   which version of the source it came from at that moment. This matters once a source is
   re-scanned: `Source.version` moves on, but older evidence, captured under an earlier version,
   remains valid and should stay pinned to what it actually came from.
2. **`CanonicalKnowledgeRelationship` had no `evidence` field at all.** Only objects could carry
   supporting material; a relationship (itself a claim — P2-08, ADR 0010 decision 5 already
   established this for confidence) had nowhere to attach one.
3. **No per-entry validation.** `validateCanonicalKnowledgeObject` only checked that `evidence`
   was an array, never that each entry had a well-formed `id`/`sourceId` — the same class of gap
   P2-07 found and fixed for `metadata.provenance[]` (ADR 0009), left unfixed for `evidence[]`
   until now.

The objective is explicit that Evidence and Provenance answer different questions and must stay
distinguishable: "Provenance answers 'Where did this knowledge originate?' Evidence answers 'What
specifically supports this knowledge?'" — and that the evidence model must connect to the
canonical model, provenance, and confidence "without duplicat[ing] the same information
unnecessarily."

## Decision

1. **`Evidence.sourceId` remains the only source-identifying field on `Evidence` — no `sourceType`
   or `label` added.** Those already live on `Source` (`provenance.ts`, P2-07), resolvable by
   following `sourceId`. Duplicating them onto every `Evidence` entry would be exactly the
   unnecessary duplication the objective warns against; the join key is enough.
2. **Two new optional fields added to `Evidence`: `capturedAt` (ISO-8601 timestamp) and
   `sourceVersion` (free-text).** `capturedAt` answers "timestamp where applicable" at the
   evidence-item granularity — distinct from `Provenance.derivedAt` (when the _claim_ was
   derived; the same evidence can be cited by claims derived at different times).
   `sourceVersion` answers "version where applicable" — distinct from `Source.version` (the
   registry's current known version for that source id) by pinning the specific snapshot _this_
   excerpt came from, which can lag behind the registry once a source is re-scanned. Both
   free-text/ISO, no new structured scheme — same reasoning P2-07 already applied to
   `Source.version` (ADR 0009 alternatives considered): no real source has been read yet to know
   what formats matter.
3. **`CanonicalKnowledgeRelationship` gains an optional `evidence?: Evidence[]` field**
   (`relationships.ts`), mirroring `CanonicalKnowledgeObject.evidence` (P2-01) for the same reason
   P2-08 added `confidenceDetail?` to relationships (ADR 0010 decision 5): a relationship is
   itself a claim and can have its own supporting material, independent of either object it
   connects (e.g. the actual call-site excerpt for "Checkout calls Payments"). Optional, unlike
   the object's always-present array, since it's being added after relationships already existed
   without it — existing relationship fixtures don't need to add an empty array to stay valid.
4. **"Relationship to the canonical knowledge item" is satisfied by containment, not a foreign
   key.** `Evidence` lives inside the `evidence[]` array of the specific object/relationship it
   supports — array membership _is_ the relationship. A `supportsObjectId` back-pointer on
   `Evidence` was considered and rejected as redundant: it would duplicate what containment
   already expresses, for no query capability the containing object/relationship's own id doesn't
   already provide.
5. **`validateEvidenceEntries` (new, `validation.ts`) validates each entry's shape** — `id`/
   `sourceId` required non-empty strings, `excerpt`/`locator`/`sourceVersion` non-empty strings if
   present, `capturedAt` a valid ISO-8601 timestamp if present — wired into both
   `validateCanonicalKnowledgeObject` (replacing the old array-only check) and
   `validateCanonicalKnowledgeRelationship` (as an optional-field check, matching how
   `confidenceDetail` is validated there). Kept in this base file, not `evidence.ts`, for the same
   acyclic-dependency reason `validateProvenanceEntries`/`validateConfidenceDetail` are (ADR 0009
   decision 5, ADR 0010 decision 6).
6. **Connection to confidence is documented usage, not new structure.** `ConfidenceCalculation.inputs`
   (P2-08, `confidence.ts`) is already `Record<string, KnowledgeValue>` — free-form by design.
   Recording something like `{ evidenceCount: 3 }` there, when a score was informed by how much
   supporting evidence exists, is a natural, already-supported usage pattern, demonstrated in
   `tests/evidence.test.ts` rather than requiring a new schema field. Confidence remains
   structurally independent of both provenance (ADR 0010 decision 9) and evidence — an object can
   validly carry `confidenceDetail: { basis: 'derived' }` with zero evidence entries (a derived
   claim need not cite direct excerpts at all).
7. **Future source-artifact kinds (source file, documentation, API definition, configuration,
   issue/project record) require no new vocabulary.** They resolve through `Evidence.sourceId` to
   a `Source.type` (`SourceType`, `@phoenix-ai/shared`), already fully mapped by P2-07 (ADR 0009
   decision 1): source file → `source-code`, documentation → `technical-doc`/`business-doc`, API
   definition and configuration → `data-model` (structured artifacts), issue/project record →
   `ticket`, anything else → `other`. No integration is implemented — only the reference shape.

## Testing

`packages/knowledge-graph/tests/evidence.test.ts` (22 tests) covers:

- **Evidence references** — fully-populated entries (including `capturedAt`/`sourceVersion`);
  minimal entries with only `id`/`sourceId`; relationships carrying their own evidence.
- **Source locations** — varied `locator` formats (line range, section heading, comment id);
  rejection of a non-string locator.
- **Multiple evidence items** — several entries citing different sources on one object; indexed
  error reporting when several entries are simultaneously invalid.
- **Missing/invalid references** — missing `id`/`sourceId`, non-object entries, a non-array
  `evidence` field, an invalid `capturedAt`, non-string `sourceVersion`/`excerpt`, and the same
  rejections applied to relationship evidence.
- **Evidence distinguished from provenance** — two objects sharing identical provenance while
  citing different evidence excerpts from the same source; evidence pinned to an older
  `sourceVersion` than the source registry's current one.
- **Future source-artifact kinds** — one evidence/source pair per category from the objective
  (source file, documentation, API definition, configuration, issue/project record), each
  validating cleanly against the existing `SourceType` vocabulary.
- **Connection to confidence** — `ConfidenceCalculation.inputs.evidenceCount` as a valid,
  already-supported usage; a `derived` claim validly carrying zero evidence.

All 176 previously-passing tests across the other 12 files still pass unmodified — every existing
evidence fixture already had both `id` and `sourceId`, so the new per-entry validation introduced
no regressions.

## Consequences

Every canonical knowledge item (and now every relationship) can cite specific, structured
supporting material — what was read, where within its source, when it was captured, and at what
source revision — independently of both where the claim originated (provenance) and how strongly
it's trusted (confidence). A future extraction source populating real evidence has a defined
target shape, including how to keep older evidence correctly pinned once its source is re-scanned.

## Alternatives considered

- **Add `sourceType`/`label` directly to `Evidence`** — rejected: `Source` (P2-07) already owns
  those; duplicating them onto every evidence entry is exactly the unnecessary duplication the
  objective warns against.
- **A `supportsObjectId`/`supportsRelationshipId` back-pointer on `Evidence`**, making evidence a
  flat, independently-queryable store rather than embedded arrays — rejected: containment
  (`evidence[]` on the owning object/relationship) already expresses the relationship; a
  back-pointer would be redundant, and would also need to distinguish "supports an object" from
  "supports a relationship" as two mutually-exclusive optional fields, adding complexity with no
  new capability.
- **A structured `sourceVersion` scheme** distinguishing a git SHA from a doc revision from a
  ticket snapshot — rejected as premature, same reasoning already applied to `Source.version`
  (ADR 0009) and `ConfidenceCalculation.method` (ADR 0010): no real source has been read yet to
  know what schemes actually occur.
- **A structural link from `ConfidenceDetail`/`ConfidenceCalculation` to specific evidence ids**
  (e.g. a required `evidenceIds: string[]`) — rejected: would force every confidence assessment to
  enumerate its evidence even when none exists (a `derived` claim can be valid with zero evidence),
  and duplicates what a query over the same object's own `evidence[]` array already answers.
  `ConfidenceCalculation.inputs` being free-form already supports recording evidence-derived
  figures (decision 6) without a mandatory schema coupling.
