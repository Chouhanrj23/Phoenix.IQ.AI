# @phoenix-ai/extraction-engine

**Module:** Deterministic Extraction Engine
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Deterministic Extraction Engine"

## Responsibility

Extracts exact facts from normalised artifacts using parsing, not model inference.

## Status — Phase 3 (Source Connectors), P3-04: Java Structural Facts

`src/` continues the Java extraction family (P3-03 through P3-08). P3-03 (source discovery) is
complete; P3-04 adds real Java parsing and structural fact extraction.

- `discoverJavaProject` (`java-project.ts`) — classifies `.java` artifacts into Maven/Gradle modules
  and main/test source roots. No parsing (P3-03).
- `parseJavaSource` (`java-parser-adapter.ts`) — the one call site wrapping `java-parser`'s
  throw-only `parse()` into a non-throwing `{ ok: true, cst } | { ok: false, reason, detail,
position? }`, mirroring `ArtifactReadResult`'s convention from `ingestion-connectors`.
- `extractJavaStructure` (`java-structure.ts`) — package, imports, and every type declaration
  (class/interface/enum/record/annotation-type) with its modifiers, annotations, extends/implements,
  fields, methods, and nested types, each carrying file+line evidence. Plain recursive-descent over
  the declaration grammar, not a CST visitor — see ADR 0016 decision 3.
- `extractJavaProject` (`extract-java.ts`) — the top-level orchestrator, wired so far as
  discover → parse → structural facts. Grows with each later ticket in this family.

Design rationale: `docs/architecture/adr/0015-java-source-discovery.md` (P3-03) and
`docs/architecture/adr/0016-java-structural-facts.md` (P3-04). Status tracker:
`docs/phase-3/README.md`.

**New dependency:** `java-parser` (pinned `3.0.1`) — the AST/CST library this whole Java extraction
family rests on; Java's grammar is not regex-safe, so a real grammar-driven parser is used rather
than a hand-rolled scanner.

Not yet implemented (later tickets in this family): the call/type-dependency graph (P3-05), REST/API
extraction (P3-06), database interaction extraction (P3-07), and configuration extraction (P3-08) —
see `docs/phase-3/README.md` for the full sequence.
