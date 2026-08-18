# @phoenix-ai/extraction-engine

**Module:** Deterministic Extraction Engine
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Deterministic Extraction Engine"

## Responsibility

Extracts exact facts from normalised artifacts using parsing, not model inference.

## Status — Phase 3 (Source Connectors), P3-07: Java Database Interaction Extraction (JPA/Spring Data)

`src/` continues the Java extraction family (P3-03 through P3-08). P3-03 through P3-06 (discovery,
structural facts, call/dependency graph, REST/API) are complete; P3-07 adds JPA entity/Spring Data
repository extraction and a second canonical-object bridge.

- `discoverJavaProject` (`java-project.ts`) — classifies `.java` artifacts into Maven/Gradle modules
  and main/test source roots. No parsing (P3-03).
- `parseJavaSource` (`java-parser-adapter.ts`) — the one call site wrapping `java-parser`'s
  throw-only `parse()` into a non-throwing result (P3-04).
- `extractJavaStructure` (`java-structure.ts`) — package, imports, and every type declaration with
  modifiers, annotations, extends/implements, fields, methods, and nested types, each carrying
  file+line evidence (P3-04).
- `extractJavaCallGraph` (`java-calls.ts`) — the type-dependency graph and the call graph, resolved
  only for a bare/`this` call or `Type.method()` against a known project-local type (P3-05).
- `extractJavaHttp`/`joinPaths` (`java-http.ts`) — Spring MVC controllers, routes, HTTP methods, and
  parameter metadata (P3-06).
- `extractJavaPersistence` (`java-persistence.ts`) — JPA `@Entity` classes (table/id/columns/
  associations) and Spring Data repositories (type arguments, declared query methods, `@Query` text).
- `deterministicId`/`BridgeOptions` (`bridge-shared.ts`) — shared plumbing for every bridge in this
  family.
- `bridgeSpringController` (`bridge-http.ts`) — a controller → real, validated `ApiObject` (P3-06).
- `bridgeJpaEntity` (`bridge-persistence.ts`) — an entity → real, validated `EntityObject`
  (`domain.entity`), reusing `bridge-shared.ts` unchanged.
- `extractJavaProject` (`extract-java.ts`) — the top-level orchestrator, wired so far as
  discover → parse → structural facts → call/type-dependency graph → HTTP + persistence extraction →
  bridge to `ApiObject`/`EntityObject`. Grows with the last ticket in this family.

Design rationale: `docs/architecture/adr/0015-java-source-discovery.md` (P3-03) through
`docs/architecture/adr/0019-java-persistence-extraction.md` (P3-07). Status tracker:
`docs/phase-3/README.md`.

**Dependencies:** `java-parser` (pinned `3.0.1`) and `@phoenix-ai/knowledge-graph`.

Not yet implemented (the last ticket in this family): configuration extraction (P3-08) — see
`docs/phase-3/README.md` for the full sequence.
