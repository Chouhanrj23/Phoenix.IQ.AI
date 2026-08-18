# @phoenix-ai/extraction-engine

**Module:** Deterministic Extraction Engine
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Deterministic Extraction Engine"

## Responsibility

Extracts exact facts from normalised artifacts using parsing, not model inference.

## Status — Phase 3 (Source Connectors), P3-06: Java REST/API Extraction (Spring MVC)

`src/` continues the Java extraction family (P3-03 through P3-08). P3-03 through P3-05 (discovery,
structural facts, call/dependency graph) are complete; P3-06 adds Spring MVC controller/route
extraction and the first canonical-object bridge.

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
  parameter metadata (`@PathVariable`/`@RequestParam`/`@RequestBody`/`@RequestHeader`).
- `deterministicId`/`BridgeOptions` (`bridge-shared.ts`) and `bridgeSpringController`
  (`bridge-http.ts`) — the narrow, deterministic bridge from a controller to a real, validated
  `ApiObject` (`integration.api`) with `confidenceDetail: { basis: 'observed' }`. Ids are
  `sha256`-derived, never random.
- `extractJavaProject` (`extract-java.ts`) — the top-level orchestrator, wired so far as
  discover → parse → structural facts → call/type-dependency graph → HTTP extraction → bridge to
  `ApiObject`. Now takes `options: { systemId, sourceId, generatedAt? }`. Grows with each later
  ticket.

Design rationale: `docs/architecture/adr/0015-java-source-discovery.md` (P3-03),
`docs/architecture/adr/0016-java-structural-facts.md` (P3-04),
`docs/architecture/adr/0017-java-call-dependency-graph.md` (P3-05), and
`docs/architecture/adr/0018-java-rest-api-extraction.md` (P3-06). Status tracker:
`docs/phase-3/README.md`.

**Dependencies:** `java-parser` (pinned `3.0.1`) and `@phoenix-ai/knowledge-graph` (for the
`ApiObject` canonical type and its real validator, first needed by this ticket's bridge).

Not yet implemented (later tickets in this family): database interaction extraction (P3-07) and
configuration extraction (P3-08) — see `docs/phase-3/README.md` for the full sequence.
