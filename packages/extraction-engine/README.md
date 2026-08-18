# @phoenix-ai/extraction-engine

**Module:** Deterministic Extraction Engine
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Deterministic Extraction Engine"

## Responsibility

Extracts exact facts from normalised artifacts using parsing, not model inference.

## Status — Phase 3 (Source Connectors), P3-05: Java Method, Call, and Dependency Extraction

`src/` continues the Java extraction family (P3-03 through P3-08). P3-03 (source discovery) and
P3-04 (structural facts) are complete; P3-05 adds the call graph and type-dependency graph.

- `discoverJavaProject` (`java-project.ts`) — classifies `.java` artifacts into Maven/Gradle modules
  and main/test source roots. No parsing (P3-03).
- `parseJavaSource` (`java-parser-adapter.ts`) — the one call site wrapping `java-parser`'s
  throw-only `parse()` into a non-throwing result (P3-04).
- `extractJavaStructure` (`java-structure.ts`) — package, imports, and every type declaration with
  modifiers, annotations, extends/implements, fields, methods, and nested types, each carrying
  file+line evidence (P3-04).
- `extractJavaCallGraph` (`java-calls.ts`) — the type-dependency graph (pure, over structural facts)
  and the call graph (a second, deliberately shallow CST walk: resolved only for a bare/`this` call
  or `Type.method()` against a known project-local type; a call through an instance field is
  `unresolved: true`, never guessed — there is no classpath or symbol table here).
- `extractJavaProject` (`extract-java.ts`) — the top-level orchestrator, wired so far as
  discover → parse → structural facts → call/type-dependency graph. Grows with each later ticket.

Design rationale: `docs/architecture/adr/0015-java-source-discovery.md` (P3-03),
`docs/architecture/adr/0016-java-structural-facts.md` (P3-04), and
`docs/architecture/adr/0017-java-call-dependency-graph.md` (P3-05). Status tracker:
`docs/phase-3/README.md`.

**Dependency:** `java-parser` (pinned `3.0.1`) — the AST/CST library this whole Java extraction
family rests on.

Not yet implemented (later tickets in this family): REST/API extraction (P3-06), database
interaction extraction (P3-07), and configuration extraction (P3-08) — see `docs/phase-3/README.md`
for the full sequence.
