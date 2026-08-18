/**
 * @phoenix-ai/extraction-engine
 * Module: Deterministic Extraction Engine
 *
 * P3-03: Java source discovery and project structure (`java-project.ts`,
 * `docs/architecture/adr/0015-java-source-discovery.md`).
 *
 * P3-04: Java structural facts -- real AST parsing (via `java-parser`) and
 * every type declaration's package/imports/modifiers/annotations/fields/
 * methods/nested types, each carrying file+line evidence. See
 * `docs/architecture/adr/0016-java-structural-facts.md`.
 *
 * P3-05: the type-dependency graph (pure, over structural facts) and the
 * call graph (a second, deliberately shallow CST walk -- no classpath/symbol
 * resolution, so an instance-field-qualified call is `unresolved: true`
 * rather than guessed). See `docs/architecture/adr/0017-java-call-dependency-graph.md`.
 *
 *   - `java-parser-adapter.ts` -- the one call site wrapping `java-parser`'s
 *     throw-only `parse()` into a non-throwing result.
 *   - `cst-utils.ts` -- rule-agnostic CST helpers (`sourceTextOf`,
 *     `resolveLiteral`, ...) every other CST-touching module shares.
 *   - `java-structure.ts` -- structural facts.
 *   - `java-calls.ts` -- the type-dependency graph and the call graph.
 *   - `extract-java.ts` -- `extractJavaProject`, the top-level orchestrator,
 *     grown incrementally by each ticket in this family.
 *
 * See `docs/phase-3/README.md` for the full P3-03..P3-08 status record.
 */

export * from './java-project.js';
export * from './cst-utils.js';
export * from './java-parser-adapter.js';
export * from './java-structure.js';
export * from './java-calls.js';
export * from './extract-java.js';
