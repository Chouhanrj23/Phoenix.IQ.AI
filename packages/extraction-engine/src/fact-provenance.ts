/**
 * P3-10 -- attaches provenance to every extracted fact: which source, which
 * revision, derived by what, and when. Depends on P3-09 (`okf-mapping.ts`):
 * this ticket enriches the same final `JavaExtractionResult` shape that
 * ticket learned to wrap into an OKF document, rather than restructuring it.
 *
 * Every fact in this family already carries file+line LOCATION (`path`,
 * and `startLine`/`endLine` via `SourceSpan`, since P3-04/ADR 0016). What
 * was missing is EXTRACTION metadata -- which source artifact set this run
 * read from, at which revision, and when the run happened -- the same
 * `Provenance`-shaped information (`@phoenix-ai/shared`) every bridged
 * canonical object already carries in `metadata.provenance`, but which the
 * raw, unbridged facts (types, methods, calls, config keys, ...) had no
 * place to record.
 *
 * Rather than threading a provenance parameter through every fact-producing
 * function in `java-structure.ts`/`java-calls.ts`/`java-http.ts`/
 * `java-persistence.ts`/`java-config.ts` -- which would touch dozens of call
 * sites across five already-tested, already-documented modules for a
 * concern orthogonal to what each of them actually computes -- provenance is
 * stamped ONCE, as a post-processing enrichment, by `extractJavaProject`
 * (`extract-java.ts`) after every pass has already run. `stampFactProvenance`
 * is deliberately generic (it recognizes "this is a fact" by the presence of
 * a `path: string` property, not by knowing every specific fact interface
 * in this family) so it needs no maintenance when a future ticket adds a
 * new fact shape with its own `path`/`SourceSpan`.
 */

export interface FactProvenance {
  /** The `Source.id`/`Provenance.sourceId` this extraction run read from -- the same join key `ingestion-connectors` established. */
  sourceId: string;
  /** The source's revision (e.g. a git SHA), when the caller tracked one. Free-text, matching `Evidence.sourceVersion`'s own convention. */
  sourceVersion?: string;
  /** Which module/agent derived this fact -- always `'extraction-engine'` for everything this package produces. */
  derivedBy: string;
  /** ISO-8601 -- when this extraction run happened. The same instant as every bridged object's `metadata.provenance[].derivedAt`. */
  derivedAt: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stampValue(value: unknown, provenance: FactProvenance): unknown {
  if (Array.isArray(value)) return value.map((item) => stampValue(item, provenance));
  if (!isPlainRecord(value)) return value;

  const stamped: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    stamped[key] = stampValue(child, provenance);
  }
  if (typeof value.path === 'string') stamped.provenance = provenance;
  return stamped;
}

/**
 * Recursively attaches `provenance` to every object (at any depth, inside
 * arrays or nested objects) that carries a `path: string` property --
 * every fact in this family, wherever it is nested (a `JavaFileFacts`'
 * types/fields/methods/annotations, or a flat array like `calls`/`config`).
 * Never mutates its input; returns a new, deeply-rebuilt structure, so
 * pre-existing references to the un-stamped facts (e.g. what was already
 * passed to a canonical-object bridge) remain valid and unaffected.
 */
export function stampFactProvenance<T>(value: T, provenance: FactProvenance): T {
  return stampValue(value, provenance) as T;
}
