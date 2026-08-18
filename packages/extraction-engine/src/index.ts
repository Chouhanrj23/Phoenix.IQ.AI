/**
 * @phoenix-ai/extraction-engine
 * Module: Deterministic Extraction Engine
 *
 * P3-03: Java source discovery and project structure -- classifies Java
 * artifacts into Maven/Gradle modules and main/test source roots, and reads
 * build-file coordinates. No Java parsing happens here; that starts with
 * P3-04. See `docs/architecture/adr/0015-java-source-discovery.md` and
 * `docs/phase-3/README.md` for the status record.
 *
 *   - `java-project.ts` -- filesystem/build-file discovery (Maven/Gradle
 *     module boundaries, POM/Gradle coordinates, main/test source roots).
 */

export * from './java-project.js';
