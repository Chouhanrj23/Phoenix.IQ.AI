# @phoenix-ai/extraction-engine

**Module:** Deterministic Extraction Engine
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Deterministic Extraction Engine"

## Responsibility

Extracts exact facts from normalised artifacts using parsing, not model inference.

## Status — Phase 3 (Source Connectors), P3-03 through P3-10: Java Extraction (complete)

`src/` turns Java `RawArtifact`s (from `@phoenix-ai/ingestion-connectors`, e.g. its git connector)
into deterministic facts — source discovery, structural facts, the call graph and type-dependency
graph, Spring MVC controllers/routes, JPA entities/Spring Data repositories, and application
configuration — bridges the parts that need no interpretation into real
`@phoenix-ai/knowledge-graph` objects, wraps the result into a real OKF document/YAML string, and
stamps every fact with the provenance of the run that produced it. The whole Java extraction family
(P3-03 through P3-10) is complete.

- `discoverJavaProject` (`java-project.ts`) — filesystem/build-file discovery ONLY, no parsing:
  classifies `.java` artifacts into Maven/Gradle modules by nearest ancestor build file, splits
  main/test source by the `src/main/java`/`src/test/java` convention, and reads POM/Gradle
  coordinates with a narrow, depth-tracking tag reader (not a general XML parser).
- `parseJavaSource` (`java-parser-adapter.ts`) — the one call site wrapping `java-parser`'s
  throw-only `parse()` into a non-throwing `{ ok: true, cst } | { ok: false, reason, detail,
position? }`, mirroring `ArtifactReadResult`'s convention from `ingestion-connectors`.
- `extractJavaStructure` (`java-structure.ts`) — package, imports, and every type declaration
  (class/interface/enum/record/annotation-type) with its modifiers, annotations, extends/implements,
  fields, methods, and nested types, each carrying file+line evidence. Plain recursive-descent over
  the declaration grammar, not a CST visitor — see ADR 0016 decision 3.
- `extractJavaCallGraph` (`java-calls.ts`) — the type-dependency graph (pure, over structural facts)
  and the call graph (a second, deliberately shallow CST walk: resolved only for a bare/`this` call
  or `Type.method()` against a known project-local type; a call through an instance field is
  `unresolved: true`, never guessed — there is no classpath or symbol table here).
- `extractJavaHttp`/`joinPaths` (`java-http.ts`) — Spring MVC controllers, routes, HTTP methods, and
  parameter metadata (`@PathVariable`/`@RequestParam`/`@RequestBody`/`@RequestHeader`).
- `extractJavaPersistence` (`java-persistence.ts`) — JPA `@Entity` classes (table/id/columns/
  associations) and Spring Data repositories (type arguments, declared query methods, `@Query` text).
- `extractPropertiesConfig`/`extractYamlConfig`/`extractConfigReferences` (`java-config.ts`) —
  `application.properties`/`.yml` facts with line numbers, cross-referenced against `@Value`/
  `@ConfigurationProperties` annotations and `System.getenv`/`System.getProperty` call sites.
- `deterministicId`/`BridgeOptions` (`bridge-shared.ts`) — shared plumbing for every bridge in this
  family: `sha256`-derived ids, never random; evidence construction.
- `bridgeSpringController` (`bridge-http.ts`) — a controller → real, validated `ApiObject`
  (`integration.api`).
- `bridgeJpaEntity` (`bridge-persistence.ts`) — an entity → real, validated `EntityObject`
  (`domain.entity`).
- `extractJavaProject` (`extract-java.ts`) — the top-level orchestrator wiring every pass above into
  one `JavaExtractionResult`.
- `buildJavaCanonicalBundle`/`mapJavaExtractionToOkfDocument`/`serializeJavaExtractionToOkfYaml`
  (`okf-mapping.ts`) — wraps a `JavaExtractionResult`'s already-bridged `objects`/`relationships`
  into a real `CanonicalKnowledgeBundle`/`OkfDocument`/OKF YAML string, reusing P2-10's
  `toOkfDocument`/`serializeOkfYaml` completely unmodified. No new canonical mapping is invented
  here — see ADR 0021.
- `stampFactProvenance`/`FactProvenance` (`fact-provenance.ts`) — attaches which source, which
  revision, derived by what, and when to every fact this family returns (not just the bridged
  objects), as a generic post-processing enrichment `extractJavaProject` applies once, after every
  other pass has run. `BridgeOptions.sourceVersion?` also now flows into every bridged object's
  `Evidence.sourceVersion` — see ADR 0022.

`samples/analyze-phoenix-repo.ts` (P3-11) — a dev/demo script, not part of this package's runtime
API, that runs the real git connector (P3-02) and this whole family against Phoenix.ai-1's own real
working tree and reports what it finds — run via
`pnpm --filter @phoenix-ai/extraction-engine poc:analyze-phoenix`. See
`docs/phase-3/README.md`'s P3-11 section for the real numbers and what they prove.

**The load-bearing decision:** only JPA entities and Spring controllers bridge to canonical objects.
Grouping classes into architectural Components or bounded contexts is semantic inference (the FRD's
FR-SEM-01), not this package's job — everything else (the call graph, type-dependency graph,
repositories, raw config facts) stays this package's own intermediate fact model, for
`inference-engine`/`orchestration` to consume later. The same boundary `ingestion-connectors` draws
around `RawArtifact` (ADR 0013 decision 1), one layer up the pipeline.

```
RawArtifact[] ──(this package)──> deterministic facts ──┬──(this package's bridge)──> EntityObject/ApiObject
                                                          └──(inference-engine, later)──> everything else
```

Design rationale, one ADR per ticket:
`docs/architecture/adr/0015-java-source-discovery.md` (P3-03),
`docs/architecture/adr/0016-java-structural-facts.md` (P3-04),
`docs/architecture/adr/0017-java-call-dependency-graph.md` (P3-05),
`docs/architecture/adr/0018-java-rest-api-extraction.md` (P3-06),
`docs/architecture/adr/0019-java-persistence-extraction.md` (P3-07),
`docs/architecture/adr/0020-java-configuration-extraction.md` (P3-08),
`docs/architecture/adr/0021-java-okf-mapping.md` (P3-09), and
`docs/architecture/adr/0022-java-fact-provenance.md` (P3-10). Status tracker:
`docs/phase-3/README.md`. The canonical objects this package bridges into, and the OKF schema
`okf-mapping.ts` reuses: `packages/knowledge-graph/README.md`.

**Dependencies:** `java-parser` (pinned `3.0.1`) — the AST/CST library this whole package rests on;
Java's grammar is not regex-safe, so a real grammar-driven parser is used rather than a hand-rolled
scanner. `@phoenix-ai/knowledge-graph` (canonical objects/validators). `yaml` (matching
`packages/knowledge-graph`'s existing pin) for `application.yml`.

Not yet implemented: any language other than Java; JAX-RS, MyBatis, and raw SQL migration (Flyway/
Liquibase) support; full classpath/type resolution (call-graph and type-dependency resolution stays
shallow by design); `<parent>` POM inheritance; a custom Gradle `sourceSets` layout; and any
cross-object relationship bridging (`JavaExtractionResult.relationships` is always empty). See each
ticket's ADR "Limitations" section for the full list and why each is deferred.
