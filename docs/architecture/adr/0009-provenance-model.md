# ADR 0009: Provenance model (P2-07)

- **Status:** Accepted
- **Date:** 2026-08-17
- **Owners:** Platform maintainers

## Context

P2-01 through P2-06 formalized the canonical knowledge model and all four planned domain-specific
ontologies (Architecture, Domain/Entity, Persona/Journey/State, Integration/API). P2-07 turns to a
cross-cutting concern rather than a new domain area: how any canonical knowledge item identifies
where it came from.

Phase 1 already defined `Provenance` and `Confidence` in `packages/shared/src/provenance.ts`
(`sourceId`, `sourceType`, `derivedBy`, `derivedAt`), reused as-is by
`CanonicalKnowledgeObject.metadata`/`CanonicalKnowledgeRelationship.metadata` since P2-01 (ADR
0003 decision 2). P2-01 also added `Evidence` (`sourceId`, `excerpt?`, `locator?`) — the concrete
supporting material a claim was captured from. Between them, most of the objective's list was
already covered: source type (`Provenance.sourceType`), source identifier/reference
(`Provenance.sourceId`), evidence origin (`Evidence.sourceId`), extraction/derivation information
(`Provenance.derivedBy`), and timestamp (`Provenance.derivedAt`).

Two things were genuinely missing:

1. **A resolvable description of the source itself.** `sourceId` was, and remains, a plain string
   — nothing in the model described what it actually names, or let one source be referenced
   consistently by many objects/evidence entries without repeating its details.
2. **Source version/revision, where applicable.** No existing field captured which revision of a
   source a claim came from (a git commit SHA, a document revision, an API schema version).

Also, `validateCanonicalKnowledgeObject`/`validateCanonicalKnowledgeRelationship` only checked that
`metadata.provenance` was a non-empty array — never that each entry inside it was actually a
well-formed `Provenance` record. This is a real gap directly in tension with "avoid storing
provenance as an unstructured string": a malformed or field-missing provenance entry would have
passed validation entirely undetected.

## Decision

1. **New file `provenance.ts` adds `Source`, not a redefinition of `Provenance`.** `Source`
   describes the origin artifact itself (id, `type: SourceType` — reused directly from
   `@phoenix-ai/shared`, not a competing enum — `label`, optional `locator`, optional `version`).
   `Source.id` is deliberately the _same identifier space_ as `Provenance.sourceId` and
   `Evidence.sourceId`: a join key, not a new concept layered on top of them.
2. **`Source` is not a `CanonicalKnowledgeObject`.** The FRD's own node-type list
   (`docs/ontology/README.md`) has no "Source" node, and §4.3 treats provenance/confidence as
   metadata every node/edge _carries_, not a node in its own right. `Evidence` (P2-01) already set
   this precedent — a plain struct, not a graph node. Modeling `Source` as a node would also force
   every knowledge object into a same-graph relationship with something that isn't part of the
   analyzed system at all.
3. **`Source` version/revision is a single free-text optional field**, not a structured
   version-history type. No real source has been read yet (no connector exists) to know what
   version formats actually matter across a repository, a doc, a ticket system, and a config file
   — inventing a structured shape now would be speculative. Free-text, present only "where
   applicable" (a live config value read once may have no meaningful version), directly satisfies
   the requirement without over-modeling.
4. **`CanonicalKnowledgeBundle` gains an optional `sources?: Source[]` registry** (`bundle.ts`) —
   the bundle-level place a set of distinct origin artifacts referenced by any
   `provenance[].sourceId`/`evidence[].sourceId` in that bundle can be resolved from, without
   repeating each source's `type`/`label`/`locator`/`version` on every object that references it.
   Optional and additive: a bundle assembled before any registry existed remains valid without it.
5. **A new `validateSourceReferences` (in `provenance.ts`) cross-checks the registry** — the same
   kind of check `validateCanonicalKnowledgeBundle` already runs for relationship endpoints against
   `objects`, applied here to sources. This is the "relationship between knowledge and its source"
   requirement made concretely traceable and deterministic, not an unverified floating string. Kept
   as its own function rather than folded into `validateCanonicalKnowledgeBundle`, following the
   same layering every domain file (P2-03 onward) already uses on top of the base validators — and
   avoiding a circular module dependency, since `bundle.ts` already imports `Source` from
   `provenance.ts`. When `sources` is omitted, only sourceId shape is checked; resolving against a
   registry is opt-in, since no real extraction source populates one yet.
6. **`validateCanonicalKnowledgeObject`/`validateCanonicalKnowledgeRelationship` now validate each
   `Provenance` entry's shape**, not just array non-emptiness — `sourceId`/`sourceType`/`derivedBy`
   non-empty strings, `derivedAt` a valid ISO-8601 timestamp. Added directly to `validation.ts`
   (not a domain-specific file) because `Provenance` is foundational, like `identity`/`evidence`/
   `ontology`, not domain-specific like architecture/domain/journey/integration. This closes the
   "avoid storing provenance as an unstructured string" gap: a `Provenance` entry can no longer be
   an empty object, or carry a garbage timestamp, and still validate.
7. **`Provenance`/`Confidence`/`GraphElementMetadata` in `@phoenix-ai/shared` are untouched.** No
   field added, renamed, or removed — every existing Phase 1 fixture, route, and UI component using
   these types keeps working unmodified. The two genuinely new needs (`Source`, stricter per-entry
   checks) live entirely in `packages/knowledge-graph`, additively.

## Testing

`packages/knowledge-graph/tests/provenance.test.ts` (29 tests) covers:

- **Provenance creation** — a fully-populated object/relationship with well-formed provenance
  validates; the future-source examples from the objective (repository, documentation,
  project/issue system, configuration, inference engine) each validate against the existing
  `SourceType` vocabulary with no new enum needed.
- **Source references** — `validateSourceReferences` resolves `metadata.provenance[].sourceId` and
  `evidence[].sourceId` against a bundle's `sources` registry; rejects an unresolved sourceId once
  a (possibly empty) registry is provided; is a no-op shape-only check when the registry is omitted
  entirely.
- **Timestamps** — a non-ISO-8601 `derivedAt` is now rejected with an indexed error message; valid
  timestamps pass; the same check applies to relationship provenance, not just object provenance.
- **Optional version/revision** — `Source.version` and `Source.locator` are both individually
  optional and independently testable; a later differential run can carry a new `version` for the
  same `Source.id` without changing its identity.
- **Invalid provenance** — missing `sourceId`/`sourceType`/`derivedBy`, a non-object provenance
  entry, and duplicate source ids within a registry are all rejected with specific, indexed error
  messages (not a generic "invalid" failure).

All 126 previously-passing tests across the other 9 files still pass unmodified — every existing
fixture already used well-formed `Provenance` entries, so tightening the validator introduced no
regressions.

## Consequences

Every canonical knowledge item now has a fully structured, deterministic, traceable path back to
its origin: `metadata.provenance[]` (who derived it, when, from which source id) and `evidence[]`
(what was actually observed, and where) can both resolve against a `Source` registry that
describes what that source actually is, down to a specific version where one exists. A future
extraction source (repository scanner, documentation indexer, ticket-system connector,
configuration reader, or inference engine) has a defined target shape for populating `Source`
records, without any of that population logic existing yet.

## Alternatives considered

- **Model `Source` as a `CanonicalKnowledgeObject`** (`category: 'other'`, a new `kind`) — rejected:
  conflicts with the FRD's own node-type list (no "Source" node), and would pull sources into
  bundle-level object-id uniqueness/relationship-endpoint rules meant for knowledge about the
  analyzed system, not meta-knowledge about where that knowledge came from.
- **Extend `Provenance` in `@phoenix-ai/shared` directly** with `sourceVersion`/`sourceLabel`
  fields — rejected: even as additive optional fields, this changes a live Phase 1 contract type
  consumed by `apps/api` and `apps/web` (e.g. `provenance-list.tsx`'s exhaustive
  `Record<Provenance['sourceType'], ...>` pattern), for no benefit `Source`-as-a-separate-registry
  doesn't already provide, and directly conflicts with "integrate provenance into the canonical
  model without breaking existing Phase 1 contracts."
- **Make `sources` mandatory on every bundle** — rejected: no real extraction source exists yet
  (explicitly out of scope for P2-07), so forcing every bundle to populate a source registry today
  would make every existing P2-01–P2-06 test fixture invalid for no real benefit. Optional and
  opt-in validation lets `sources` be adopted incrementally as real sources arrive.
- **A structured `SourceVersion` type** (e.g. `{ scheme: 'git-sha' | 'doc-revision' | ...; value:
string }`) instead of a free-text `version` field — rejected as premature: no real source has
  been read yet to know what version schemes actually occur in practice; a closed scheme enum
  would be guesswork.
