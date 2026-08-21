# ADR 0021: Java extraction OKF mapping (P3-09)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Owners:** Platform maintainers

## Context

The Java extraction family (P3-03 through P3-08, ADRs 0015-0020) ends with `extractJavaProject`
returning a `JavaExtractionResult` whose `objects` array already contains real, validated
`CanonicalKnowledgeObject`s (`EntityObject`/`ApiObject`, bridged in P3-06/P3-07) and a
`relationships` array (always empty, per each bridge ticket's own documented scope boundary). What
was still missing was the last step connecting this family to P2-10 (`docs/architecture/adr/0012-okf-yaml-schema.md`):
wrapping those objects into a complete `CanonicalKnowledgeBundle` — with a `sources` registry so
`validateSourceReferences` can resolve every `provenance`/`evidence` `sourceId` — and rendering it as
an actual OKF document/YAML string.

Depends on P2-10 (the OKF schema and `toOkfDocument`/`serializeOkfYaml` this ticket reuses
unmodified), P3-04 (the structural facts underlying every bridged object), and P3-08 (the final
`JavaExtractionResult` shape this ticket wraps).

## Decision

1. **No new canonical mapping is invented here.** Deciding what bridges to a canonical object was
   already settled, deliberately, at each prior ticket's own bridge (ADR 0018 decision 4: only
   annotation-decidable controller→`ApiObject`; ADR 0019 decision 4: only entity→`EntityObject`,
   repositories excluded; ADR 0020 decision 5: config facts excluded entirely). This ticket's whole
   job is downstream of that boundary — it takes `JavaExtractionResult.objects`/`.relationships` AS
   GIVEN and assembles them into a bundle, never reaching back into `calls`/`typeDependencies`/
   `repositories`/`config` to invent a mapping those tickets explicitly declined to make.

2. **`okf-mapping.ts` reuses P2-10's `toOkfDocument`/`serializeOkfYaml` completely unmodified — no
   second YAML serializer, no second field-ordering scheme, no second validator.** An OKF document
   assembled from real Java source and one hand-built for a `knowledge-graph` test fixture are
   validated, serialized, and versioned by the exact same code path. This is the same discipline ADR
   0012 decision 4 already established for `okf.ts` itself ("no new validation logic is
   reimplemented... duplicating any of it here would be exactly the second competing model the
   objective forbids"), now applied one layer up.

3. **The `sources` registry is accepted as a parameter, not reconstructed.** `okf-mapping.ts` does
   not know a repository's label, locator, or revision — `ingestion-connectors`' own `Source` record
   (`ConnectorSession.source`, built by `descriptorToSource`) already has them, correctly, for
   whatever produced the artifacts `extractJavaProject` read. Passing it through avoids a second,
   possibly inconsistent way of describing the same source, and keeps `okf-mapping.ts` free of any
   knowledge of `ingestion-connectors`' descriptor/session shapes.

4. **`sources` stays optional, and is omitted entirely (not an empty array) when not given** —
   matching `CanonicalKnowledgeBundle.sources?`'s own documented contract ("a bundle assembled before
   any `Source` registry existed... remains valid without it"). A caller that has not yet resolved a
   `Source` still gets a usable bundle; only `validateSourceReferences`' cross-check against a known
   registry is unavailable until one is supplied.

5. **No internal validation call.** `buildJavaCanonicalBundle`/`mapJavaExtractionToOkfDocument`/
   `serializeJavaExtractionToOkfYaml` do not call `validateCanonicalKnowledgeBundle`/
   `validateOkfDocument` themselves — matching the precedent every bridge in this family already set
   (`bridge-http.ts`/`bridge-persistence.ts` do not self-validate either): production code stays a
   simple, pure transformation; the TEST SUITE is where the real validators run, against the real
   output, the same discipline `git-connector.test.ts`'s and `extract-java.test.ts`'s own end-to-end
   blocks already established.

## Testing

`packages/extraction-engine/tests/okf-mapping.test.ts` — 4 new tests, all against a real
`extractJavaProject` run (never a hand-built bundle):

- `buildJavaCanonicalBundle` produces a bundle that passes the real `validateCanonicalKnowledgeBundle`/
  `validateSourceReferences`, and omits `sources` entirely (not `[]`) when none are given (decision
  4).
- `mapJavaExtractionToOkfDocument` produces a real, valid `OkfDocument` (`validateOkfDocument`).
- `serializeJavaExtractionToOkfYaml` produces YAML text that round-trips through the real
  `parseAndValidateOkfYaml` — the same round-trip discipline `git-connector.test.ts`'s end-to-end
  block already proved for P3-02.

## Consequences

The Java extraction family now has a genuine end-to-end path from `RawArtifact[]` to a real,
serializable OKF YAML document, with every step (parsing, structural facts, HTTP/persistence
extraction, canonical bridging, OKF wrapping) validated against real code, not a fixture standing in
for one.

## Limitations

- **Only the already-bridged `objects`/`relationships` are wrapped** — `calls`, `typeDependencies`,
  `repositories`, `config`, and `configReferences` are NOT part of the resulting bundle/OKF document
  (they have no canonical shape, per decision 1); a caller that needs them still reads them off
  `JavaExtractionResult` directly.
- **`relationships` is always empty** in any bundle this produces, inherited from every prior ticket
  in this family. **Update (Phase 4 prerequisite, ADR 0023):** no longer strictly true —
  `bridge-relationships.ts` now populates `relationships` for resolved type-dependencies/JPA
  associations between two already-bridged objects; this ticket's own wrapping logic (`objects`,
  `relationships`, `sources` → `CanonicalKnowledgeBundle`) required no change to pick that up, since
  it already passed `result.relationships` through unmodified.
- **No multi-source/multi-module bundle merging.** One `JavaExtractionResult` (one call to
  `extractJavaProject`) maps to one bundle; combining several extraction runs (e.g. several
  repositories) into a single multi-source bundle is a caller concern, not built here.

## Alternatives considered

- **Reaching back into `calls`/`repositories`/`config` to synthesize additional canonical objects or
  relationships here** — rejected, see decision 1. Every prior ticket in this family already
  considered and declined that mapping for a stated reason (no fitting canonical kind, or requires
  semantic inference this deterministic family does not perform); revisiting that decision belongs to
  whichever ticket actually adds the missing canonical vocabulary, not to a wrapping step.
- **Reconstructing a `Source` from `JavaExtractionOptions`/artifact paths instead of accepting one as
  a parameter** — rejected, see decision 3. `ingestion-connectors` already solves "describe this
  source correctly" and duplicating that logic here would risk the two falling out of sync.
- **A second YAML serializer or field-ordering scheme scoped to Java extraction output** — rejected,
  see decision 2. P2-10's serializer is already deterministic and general; nothing about Java
  extraction's output needs different ordering or formatting rules.
