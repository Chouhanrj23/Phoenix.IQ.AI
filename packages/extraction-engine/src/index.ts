/**
 * @phoenix-ai/extraction-engine
 * Module: Deterministic Extraction Engine
 *
 * P3-03 through P3-08: deterministic Java extraction -- source discovery
 * and project structure, structural facts (packages/types/fields/methods/
 * annotations), the call graph and type-dependency graph, Spring MVC
 * controllers/routes/API metadata, JPA entities and Spring Data
 * repositories, and application configuration/environment information.
 *
 * P3-09: maps a Java extraction's already-bridged objects into a real,
 * complete `CanonicalKnowledgeBundle`/`OkfDocument`/OKF YAML string, reusing
 * P2-10's schema/serialization exactly rather than inventing a second one.
 * See `docs/architecture/adr/0021-java-okf-mapping.md`.
 *
 * P3-10: stamps `FactProvenance` (which source/revision, derived by what,
 * when) onto every fact this family returns, and adds `sourceVersion` to
 * every bridged object's `Evidence`. See
 * `docs/architecture/adr/0022-java-fact-provenance.md`.
 *
 * See `docs/phase-3/README.md` for the full status record and each
 * ticket's own ADR (`docs/architecture/adr/0015` through `0022`).
 *
 *   - `java-project.ts` -- filesystem/build-file discovery (Maven/Gradle
 *     module boundaries, POM/Gradle coordinates, main/test source roots).
 *     No Java parsing (P3-03).
 *   - `java-parser-adapter.ts` -- the one call site wrapping `java-parser`'s
 *     throw-only `parse()` into a non-throwing result (P3-04).
 *   - `cst-utils.ts` -- rule-agnostic CST helpers (`sourceTextOf`,
 *     `resolveLiteral`, ...) every other CST-touching module shares.
 *   - `fact-provenance.ts` -- `FactProvenance` and `stampFactProvenance`,
 *     the generic post-processing enrichment `extract-java.ts` applies to
 *     every returned fact (P3-10).
 *   - `java-structure.ts` -- structural facts: package, imports, and every
 *     type declaration with its modifiers, annotations, extends/implements,
 *     fields, methods, and nested types (P3-04).
 *   - `java-calls.ts` -- the type-dependency graph (pure, over structural
 *     facts) and the call graph (a second, deliberately shallow CST walk)
 *     (P3-05).
 *   - `java-http.ts` -- Spring MVC controllers, routes, HTTP methods, and
 *     parameter metadata (P3-06).
 *   - `java-persistence.ts` -- JPA entities and Spring Data repositories
 *     (P3-07).
 *   - `java-config.ts` -- `application.properties`/`.yml` facts, plus
 *     `@Value`/`@ConfigurationProperties`/`System.getenv`/`System.getProperty`
 *     cross-references (P3-08).
 *   - `bridge-shared.ts` -- shared plumbing (deterministic ids, evidence)
 *     for every canonical-object bridge in this family.
 *   - `bridge-http.ts` -- bridges a Spring controller into an `ApiObject`.
 *   - `bridge-persistence.ts` -- bridges a JPA entity into an `EntityObject`.
 *   - `extract-java.ts` -- `extractJavaProject`, the top-level orchestrator.
 *   - `okf-mapping.ts` -- `buildJavaCanonicalBundle`/`mapJavaExtractionToOkfDocument`/
 *     `serializeJavaExtractionToOkfYaml`, wrapping a Java extraction result
 *     into a real OKF document/YAML text.
 *
 * P6-04: bridges Jira issues -- `@phoenix-ai/ingestion-connectors`' Jira
 * connector output (P6-02) -- into real `WorkItemObject`s/relationships
 * (`@phoenix-ai/knowledge-graph`'s new P6-04 Work Item model), and wraps
 * them into OKF the same way P3-09 does for Java. See
 * `docs/architecture/adr/0028-p6-04-jira-okf-mapping.md`.
 *
 *   - `jira-bridge.ts` -- `bridgeJiraArtifacts`, the deterministic
 *     facts-to-canonical-objects mapping for a batch of Jira `RawArtifact`s:
 *     one `WorkItemObject` per issue, plus `contains`/`relatesTo`
 *     relationships between issues already bridged in the same batch.
 *   - `jira-okf-mapping.ts` -- `buildJiraCanonicalBundle`/
 *     `mapJiraToOkfDocument`/`serializeJiraToOkfYaml`, wrapping a Jira
 *     bridge result into a real OKF document/YAML text.
 *
 * Deliberately NOT implemented here: any language other than Java, JAX-RS,
 * MyBatis, raw SQL migrations (Flyway/Liquibase), full classpath/type
 * resolution, any architectural/semantic inference (Component/bounded-
 * context boundaries, workflow/state inference over a Jira issue's status)
 * -- that is `packages/inference-engine`'s job -- and any tracker other than
 * Jira.
 */

export * from './java-project.js';
export * from './fact-provenance.js';
export * from './cst-utils.js';
export * from './java-parser-adapter.js';
export * from './java-structure.js';
export * from './java-calls.js';
export * from './java-http.js';
export * from './java-persistence.js';
export * from './java-config.js';
export * from './bridge-shared.js';
export * from './bridge-http.js';
export * from './bridge-persistence.js';
export * from './extract-java.js';
export * from './okf-mapping.js';
export * from './jira-bridge.js';
export * from './jira-okf-mapping.js';
export * from './iac.js';
export * from './history.js';
export * from './parse-cache.js';
