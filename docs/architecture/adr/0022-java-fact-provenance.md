# ADR 0022: Java extraction fact provenance (P3-10)

- **Status:** Accepted
- **Date:** 2026-08-19
- **Owners:** Platform maintainers

## Context

Every fact this family produces has carried file+line LOCATION since P3-04 (`SourceSpan`'s `path`/
`startLine`/`endLine`, ADR 0016). What it never carried was EXTRACTION metadata: which source
artifact set a run read from, at which revision, and when the run happened -- the same
`Provenance`-shaped information (`@phoenix-ai/shared`) every bridged canonical object already carries
in `metadata.provenance` (P3-06/P3-07), but which the raw, unbridged facts (types, methods, calls,
config keys, ...) had no place to record. A consumer handed a bare `JavaCallFact` array outside the
extraction run's context could tell WHERE in a file a call was (path + line) but not WHICH repository
or revision that file came from.

Separately, `bridge-shared.ts`'s `evidenceFor` (P3-06) has built `Evidence` since it was written, but
never populated `Evidence.sourceVersion` -- a field P2-09 added for exactly this purpose, simply
never wired up because nothing in `BridgeOptions` carried a revision to put there.

Depends on P3-09 (`okf-mapping.ts`): this ticket enriches the same final `JavaExtractionResult` shape
that ticket learned to wrap into an OKF document, rather than restructuring it.

## Decision

1. **Provenance is stamped ONCE, as a post-processing enrichment in `extractJavaProject`, not
   threaded as a parameter through every fact-producing function in `java-structure.ts`/
   `java-calls.ts`/`java-http.ts`/`java-persistence.ts`/`java-config.ts`.** Threading it through would
   touch dozens of call sites across five already-tested, already-documented modules, for a concern
   (which run produced this) orthogonal to what each of them actually computes (what does this
   annotation say, what does this call resolve to, ...). Every one of those modules is UNCHANGED by
   this ticket.

2. **`stampFactProvenance` (`fact-provenance.ts`) is generic: it recognizes "this is a fact" by the
   presence of a `path: string` property at any depth, not by knowing every specific fact interface
   in this family.** A hand-written stamping function enumerating `JavaTypeFact`/`JavaFieldFact`/
   `JavaMethodFact`/`JavaCallFact`/... individually would need updating every time a future ticket
   adds a new fact shape; the generic, structural version needs no maintenance for that. It recurses
   into every array and object property so nested facts (a type's fields/methods/nested types, a
   controller's routes) are reached too, not just the top-level array `extractJavaProject` returns
   them in.

3. **Provenance lands wherever the LOCATION already lives, which is not uniform across this family --
   and that's fine, not a bug to paper over.** A fact that extends `SourceSpan` directly (
   `JavaTypeFact`, `JavaFieldFact`, `JavaMethodFact`, `JavaControllerFact`, `JavaRouteFact`,
   `JavaJpaEntityFact`, ...) gets `provenance` as a sibling of its own `path`. A fact whose location
   lives on a NESTED `span: SourceSpan` (`JavaCallFact`, `JavaTypeDependencyFact`, because their
   OWN identity -- caller/callee, from/to -- isn't itself a location) gets `provenance` on `span`, not
   on the fact itself, because that is where the generic rule (`path` at any depth) genuinely finds
   it. `fact-provenance.test.ts` asserts both shapes directly, including that a call fact's OUTER
   object does NOT get a spurious top-level `provenance`.

4. **`sourceVersion` is a single, caller-supplied value for the whole extraction run
   (`JavaExtractionOptions.sourceVersion?`), not derived per-artifact from each `RawArtifact.revision`.**
   This matches how `systemId`/`sourceId` already work (ADR 0018 decision 5: one run-level identity,
   not per-artifact) -- and matches reality: every real connector in this project (the git connector,
   ADR 0014) resolves ONE revision for a whole session, so every artifact it produces already shares
   one `revision`. A documented, honest limitation, not a silent assumption: if a caller ever
   assembles artifacts from genuinely different revisions into one `extractJavaProject` call, every
   fact is stamped with the SAME `sourceVersion` regardless.

5. **`BridgeOptions.sourceVersion?` flows straight into `Evidence.sourceVersion`, fixing the P3-06/
   P3-07 gap directly** -- reusing the exact field `Evidence` (P2-09) already defined for this, not
   inventing a new one. Omitted entirely (never `undefined`-valued) when the caller does not supply
   one, matching every other optional field this family already treats this way under
   `exactOptionalPropertyTypes`.

6. **`FactProvenance` is a NEW, small type (`sourceId`, `sourceVersion?`, `derivedBy`, `derivedAt`) --
   not a reuse of `@phoenix-ai/shared`'s `Provenance`.** `Provenance` has no `sourceVersion` field
   (that concept lives on `Evidence` in the canonical model, P2-09's own deliberate split between "a
   claim's origin" and "the concrete material examined"). Raw facts in this family are not
   `CanonicalKnowledgeObject`s and do not have a separate `Evidence` array to hold a revision
   separately -- so `FactProvenance` merges both concerns into one small, fact-appropriate shape
   rather than forcing facts to adopt the full object/evidence split canonical objects use.

## Testing

`packages/extraction-engine/tests/` -- 7 new tests in `fact-provenance.test.ts` (the generic stamper
in isolation: a flat path-bearing object, deep recursion through nested arrays/objects, the
`span`-nested case, an object with no `path` staying unstamped, non-mutation of the input, a
top-level array, and reference-identity of the stamped `provenance` value across nodes) plus four new
tests in `extract-java.test.ts` (every top-level fact array carrying the run-level provenance in the
correct location per decision 3; nested facts -- fields, methods, routes -- stamped too, not just
their owning file/type; the bridged objects' `Evidence.sourceVersion` set from `options.sourceVersion`;
and `sourceVersion` omitted entirely, from both facts and evidence, when the caller does not supply
one) plus one new test each in `bridge-http.test.ts`/`bridge-persistence.test.ts` for decision 5
directly. The existing byte-stability test (FR-DET-07) is extended to cover `controllers`/`config`
too, confirming the new stamping introduces no per-run variance.

## Consequences

Every fact this family produces -- not just the two bridged canonical object kinds -- is now
traceable back to a specific source, revision, and extraction run on its own, without needing the
surrounding `JavaExtractionResult`/`JavaExtractionOptions` context to still be in scope. The bridged
`EntityObject`/`ApiObject`'s `Evidence` finally carries the revision it was always meant to.

## Limitations

- **`sourceVersion` is one value for the whole run** (decision 4), not resolved per-artifact.
- **`layout` (P3-03's discovery output) is not stamped.** Its paths are plain strings inside arrays
  (`JavaModule.mainSourceFiles: string[]`), not objects with their own `path` property to attach
  `provenance` to -- and it is project/module METADATA, not a deterministic FACT in the FR-DET-01/02/03
  sense the rest of this family targets.
- **`parseFailures` ARE stamped** (they carry `path` directly) even though a failure is not exactly a
  "fact" -- a deliberate inclusion, not an oversight: knowing which source/revision a parse failure
  came from is genuinely useful, and the generic stamper has no special case to exclude it.
- **The bridged `objects`/`relationships` are untouched by this ticket's stamping** -- they already
  have their own, more specific provenance/evidence model (P2-07/P2-09) that predates and differs
  from `FactProvenance`; only `Evidence.sourceVersion` (decision 5) was added to them, via a
  completely separate code path (`BridgeOptions`, not `stampFactProvenance`).

## Alternatives considered

- **Threading a provenance parameter through every fact-producing function** -- rejected, see decision
  1. Materially larger surface area for no behavioral difference a caller could observe; this
     ticket's whole value is additive enrichment on top of an already-complete, already-tested pipeline.
- **A hand-written stamping function per fact interface** -- rejected, see decision 2. Would need
  updating every time this family (or a future one) adds a new fact shape; the generic, structural
  version does not.
- **Deriving `sourceVersion` per-artifact from `RawArtifact.revision`** -- rejected, see decision 4.
  Would require building and threading a `path -> revision` lookup through the whole orchestrator for
  a distinction that does not exist in any real connector this project has (one session, one
  revision, ADR 0014).
- **Reusing `@phoenix-ai/shared`'s `Provenance` type directly for `FactProvenance`** -- rejected, see
  decision 6. `Provenance` has no room for a revision; forcing raw facts to carry a separate
  `Evidence`-like structure just to hold one extra field would be more machinery than the shape needs.
