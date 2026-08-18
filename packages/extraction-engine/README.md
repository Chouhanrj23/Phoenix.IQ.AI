# @phoenix-ai/extraction-engine

**Module:** Deterministic Extraction Engine
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Deterministic Extraction Engine"

## Responsibility

Extracts exact facts from normalised artifacts using parsing, not model inference.

## Status — Phase 3 (Source Connectors), P3-03: Java Source Discovery and Project Structure

`src/` begins the Java extraction family — a sequence of tickets (P3-03 through P3-08) that turn Java
`RawArtifact`s (from `@phoenix-ai/ingestion-connectors`, e.g. its git connector) into deterministic
facts. P3-03 is deliberately the smallest: filesystem/build-file discovery only, no Java parsing.

- `discoverJavaProject` (`java-project.ts`) — classifies `.java` artifacts into Maven/Gradle modules
  by walking each path upward to its nearest ancestor `pom.xml`/`build.gradle[.kts]`, splits main/test
  source by the `src/main/java`/`src/test/java` convention, and reads POM/Gradle coordinates with a
  narrow, depth-tracking tag reader (not a general XML parser — `<parent>` inheritance is an honest,
  documented gap, not guessed at).

Design rationale: `docs/architecture/adr/0015-java-source-discovery.md`. Status tracker:
`docs/phase-3/README.md`.

Not yet implemented (later tickets in this family): any actual Java parsing or structural fact
extraction (P3-04), the call/type-dependency graph (P3-05), REST/API extraction (P3-06), database
interaction extraction (P3-07), and configuration extraction (P3-08) — see `docs/phase-3/README.md`
for the full sequence.
