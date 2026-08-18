# ADR 0015: Java source discovery and project structure (P3-03)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Owners:** Platform maintainers

## Context

ADR 0013 (P3-01) drew the boundary this whole family of tickets has to respect: a connector emits
`RawArtifact`s and "deciding that a file describes an `architecture.container` is extraction's job."
ADR 0014 (P3-02) built the first real connector, closing with an explicit forward reference:
"`extraction-engine` (P3-03 onward) can be developed against real Java files instead of fixtures."

This ticket starts that work — the FRD's §3.3 "Deterministic Extraction Engine", specifically its
first need: knowing WHAT to parse before parsing anything. A Java source tree is not a flat bag of
files; it has module boundaries (Maven's `pom.xml`, Gradle's `build.gradle[.kts]`), a main/test
split, and build coordinates that later tickets (and eventually `inference-engine`) will want. P3-03
is deliberately scoped to answer exactly that, and nothing else: it performs **no Java parsing at
all**. `packages/extraction-engine` was, before this ticket, an untouched `MODULE_NAME`/
`placeholder()` scaffold.

This is the first of six tickets (P3-03 through P3-08) that together build
`packages/extraction-engine`'s Java support, each adding one deterministic-fact capability on top of
the last. Later tickets' own ADRs (0016 onward) will cover the parsing strategy and the rest of the
FRD's FR-DET-01/02/03 requirements; this ADR covers only what P3-03 itself decided.

## Decision

1. **Module boundaries are found by walking each `.java` path upward to its nearest ancestor build
   file, not by reading a fixed directory convention.** `discoverJavaProject` collects every
   `pom.xml`/`build.gradle`/`build.gradle.kts` artifact, then for each `.java` file finds the
   longest (most specific) build-file directory that is an ancestor of it. This is the same shape a
   module boundary actually has in a real multi-module repository — a nested module's own `pom.xml`
   wins over its parent's — and needs no assumption about where in the tree the source lives.

2. **POM coordinates (`groupId`/`artifactId`/`version`/`packaging`) are read by a narrow,
   depth-tracking tag reader scoped to the root `<project>` element's DIRECT children — not a
   general XML parsing dependency.** This mirrors `packages/ingestion-connectors/src/filter.ts`'s own
   precedent: a hand-rolled parser for a well-known, bounded grammar (four sibling elements under one
   root) beats a dependency for a grammar only a sliver of which is ever used. Depth tracking
   specifically is what stops a `<parent>` or `<dependency>` block's own `<groupId>` from being
   misread as the module's — a real bug class in naive regex POM readers, and one this ticket's tests
   assert against directly with a `<parent>`-bearing fixture.

3. **`<parent>` POM inheritance is NOT resolved — an honest, tested gap, not a silent guess.** A child
   POM that omits `groupId`/`version` (inheriting them from its parent, valid and common Maven
   practice) simply has those fields `undefined` here. Resolving inheritance would mean finding and
   parsing the parent POM too, which may not even be among the artifacts this run has access to
   (it could live in a separate repository or a local Maven cache) — a materially different and
   larger problem than reading one file's own direct content.

4. **Gradle coordinates are read from top-level `group`/`version` assignments only, both Groovy
   (`group = 'x'` / `group 'x'`) and Kotlin DSL shorthand.** `artifactId` has no Gradle equivalent in
   scope — a Gradle project's name comes from `settings.gradle`, itself not read here (out of scope,
   not needed for the coordinates this ticket captures).

5. **Source-root classification (`main` vs `test`) is the `src/main/java`/`src/test/java` convention,
   with a path-substring fallback (`/test/` anywhere in the path) for a file that doesn't fit that
   layout — never dropped.** This is Maven's default layout and Gradle's Java plugin default; a
   custom Gradle `sourceSets` layout would require evaluating Groovy/Kotlin DSL to discover, which is
   out of scope (an honest limitation, not attempted).

6. **A `.java` file with no ancestor build file is surfaced as `unassignedJavaFiles`, not dropped.**
   Some real repositories (a scratch script, a build tool's own helper class) have Java files outside
   any Maven/Gradle module. Losing them silently would make `discoverJavaProject`'s output an
   incomplete inventory; surfacing them lets a caller (or a later ticket) decide what to do.

## Testing

`packages/extraction-engine/tests/java-project.test.ts` — 7 tests:

- `parsePomCoordinates` / `parseGradleCoordinates` in isolation: a `<parent>`-bearing POM proving
  inheritance is not wrongly picked up (decision 3), and both Gradle DSL coordinate shorthands.
- `discoverJavaProject`: a single-module layout with main/test files split correctly; a NESTED
  multi-module layout resolving each file to its nearest (most specific) ancestor build file
  (decision 1); an unassigned `.java` file surfaced rather than dropped (decision 6); and Gradle
  module detection.

## Consequences

Later Java extraction tickets (P3-04 onward) have a real module/source-root inventory to work from
instead of a flat artifact list — in particular, a future orchestrator knows which `.java` files are
`main` source (parse and extract from) versus `test` source (currently out of scope for extraction
targets), without re-deriving that classification itself.

Cost: `discoverJavaProject` runs before anything else in the eventual pipeline and its output shapes
what later tickets iterate over, so a discovery bug (e.g. misclassifying a source root) would be
inherited by every ticket built on top of it. Mitigated by the test coverage above, in the same spirit
as ADR 0014's git connector tests running against a real repository rather than a mock.

## Limitations

- **`<parent>` POM inheritance is not resolved** (decision 3).
- **A custom Gradle `sourceSets` layout is not read** (decision 5) — only the conventional
  `src/main/java`/`src/test/java` paths.
- **Gradle `artifactId` is never populated** (decision 4) — no Gradle equivalent in scope.
- **No Java parsing of any kind happens in this ticket** — by design; see ADR 0016 (P3-04) for where
  that starts.

## Alternatives considered

- **A general XML parsing dependency for POM reading** — rejected, see decision 2. The bounded,
  well-known grammar this ticket actually needs does not justify a new dependency this early in the
  Java extraction family, when a ~50-line hand-rolled reader is both sufficient and easier to reason
  about for exactly this shape.
- **Resolving `<parent>` POM inheritance** — rejected, see decision 3. A materially larger problem
  (finding and parsing a second file, possibly outside this run's artifact set) than this ticket's
  scope justifies; deferred as an honest, documented gap rather than half-solved.
- **Assuming a fixed repository layout (e.g. "every module is a direct child of the repo root")** —
  rejected, see decision 1. Real multi-module Maven/Gradle repositories nest arbitrarily; walking
  upward from each leaf is the only approach that does not assume a specific shape.
