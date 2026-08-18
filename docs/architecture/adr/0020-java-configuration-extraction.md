# ADR 0020: Java configuration extraction (P3-08)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Owners:** Platform maintainers

## Context

This is the last ticket in the Java extraction family (P3-03 through P3-08). It covers "application
configuration and environment information" — `application.properties`/`.yml` values, and where they
are actually consumed from Java source (`@Value`, `@ConfigurationProperties`, `System.getenv`,
`System.getProperty`). Unlike every prior ticket in this family, it is the ONE module that reads more
than one other pass's output together — structural facts (P3-04, for `@Value`/`@ConfigurationProperties`
annotation sites) AND the call graph (P3-05, for `System.getenv`/`System.getProperty` call sites) — so
it is also where `extractJavaProject` (`extract-java.ts`) reaches its final form for this family.

## Decision

1. **`.properties` parsing is a trivial line-based split — no dependency.** `key=value`/`key:value`
   per line, `#`/`!` comment lines skipped. The format is simple enough that a dependency would be
   pure overhead; the one documented gap (no line-continuation `\` support) is narrow and honest
   rather than silently mishandled.

2. **`.yml` parsing uses the `yaml` package's `parseDocument` (NOT its plain `parse`), specifically
   because `parseDocument` preserves each node's source range — which a bare `parse()` would lose
   entirely.** Line-and-key evidence (FR-DET-08, consistent with every other fact this family
   produces) requires that range; `LineCounter.linePos(offset)` converts it to a 1-indexed line.
   Version pinned to `^2.9.0`, matching the exact range already used by `packages/knowledge-graph`
   rather than letting pnpm resolve a second, potentially different one.

3. **Nested YAML keys flatten with `.`, and list items with `[index]`** (Spring Boot's own
   relaxed-binding convention, e.g. `app.profiles[0]`) — so a config fact's `key` is always
   comparable, in the same shape, to a `@Value("${app.profiles[0]}")` reference, without a consumer
   needing to know YAML's own nesting shape.

4. **`extractConfigReferences` is the one module in this family that reads more than one other pass's
   output together** — `JavaFileFacts` (P3-04, for `@Value`/`@ConfigurationProperties` annotation
   sites) and `JavaCallFact[]` (P3-05, for `System.getenv`/`System.getProperty` call sites, matched
   on `calleeName`/`calleeQualifiedName` and using the call's `firstStringArgument` — a small,
   narrowly-scoped addition to `JavaCallFact` added in this ticket specifically to recover the env
   var/property key's literal text). This cross-referencing is exactly what "relevant application
   configuration and ENVIRONMENT information" (the literal ask) requires: not just "what config keys
   exist" but "where are they actually consumed."

5. **Neither config facts nor config references bridge to a canonical object.** No existing
   `@phoenix-ai/knowledge-graph` kind fits "a configuration key" or "a config reference site" — unlike
   P3-06/P3-07's controllers/entities, there is no annotation-decidable canonical shape here. They
   stay facts in `JavaExtractionResult.config`/`configReferences`, for a later module (deployment/NFR
   extraction, not built yet, or `inference-engine`) to consume.

## Testing

`packages/extraction-engine/tests/java-config.test.ts` — 3 new tests, plus `extract-java.test.ts`
grown by two new `describe` blocks (the last growth this file will see in this family):

- `.properties` line parsing, `.yml` nested-key/list flattening with per-key line numbers, and
  `@Value`/`@ConfigurationProperties`/`System.getenv`/`System.getProperty` cross-references, all
  asserted against real parsed output (never a hand-built fixture for the config facts themselves).
- `extract-java.test.ts`: `extractJavaProject` grown to wire config extraction in, plus — since this
  is the LAST ticket in the family — the full end-to-end assertions this whole family has been
  building toward: the bridged `EntityObject`/`ApiObject` assembled into a real
  `CanonicalKnowledgeBundle` and validated with the real `validateCanonicalKnowledgeBundle`/
  `validateSourceReferences`, and a byte-stability assertion (FR-DET-07) running `extractJavaProject`
  twice over identical input and diffing the JSON-serialized `objects`/`calls`.

## Consequences

The Java extraction family (P3-03 through P3-08) is complete: `extractJavaProject` now performs
discovery, parsing, structural facts, the call/type-dependency graph, HTTP/persistence extraction,
configuration extraction, and bridges the annotation-decidable subset (JPA entities, Spring
controllers) into real, validated canonical objects — all from real Java source, with file+line
evidence on every fact, and proven byte-stable across runs.

`packages/inference-engine` (not built yet) has real deterministic facts to build on: the call graph,
type-dependency graph, repositories, and configuration facts this family produces but does not
interpret.

## Limitations

- **No line-continuation (`\`) support in `.properties` parsing** (decision 1).
- **Neither config facts nor config references bridge to a canonical object** (decision 5).
- **No relationship bridging anywhere in this family** — `JavaExtractionResult.relationships` is
  always empty. Constructing one (e.g. Controller "handles" Entity) would require resolving exactly
  the call/type graph P3-05 (ADR 0017) already documents as deliberately shallow.
- **A Spring profile-specific file (`application-{profile}.yml`) is read the same as the base
  `application.yml`** — no profile-activation logic is modeled; every such file's keys are extracted
  unconditionally, without knowing which profile (if any) is actually active at runtime.

## Alternatives considered

- **A YAML parsing dependency other than `yaml`** — rejected. `yaml` is already a pinned dependency of
  `packages/knowledge-graph` (used for OKF serialization); reusing the exact same version avoids a
  second YAML implementation resolving in the dependency graph for no benefit.
- **Recovering `.properties` line-continuation support** — rejected as unnecessary scope for this
  ticket; genuinely rare in practice for Spring Boot's typical flat key=value usage, and honestly
  documented as a gap rather than silently mishandled.
- **Bridging a `JavaConfigFact` to some future `deployment.*`/`quality.*` kind** — rejected. No such
  kind exists yet in `@phoenix-ai/knowledge-graph` (the FRD's Deployment/NFR vocabulary is still an
  open gap per `docs/okf/ui-validation.md`, tracked separately in `docs/phase-3/README.md`'s
  remaining-work list) — inventing one here would be scope well beyond "configuration extraction."
