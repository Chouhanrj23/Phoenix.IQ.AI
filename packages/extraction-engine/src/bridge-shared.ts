/**
 * P3-06 -- shared plumbing for the deterministic-facts-to-canonical-objects
 * bridges (`bridge-http.ts`'s `bridgeSpringController`, `bridge-persistence.ts`'s
 * `bridgeJpaEntity`).
 *
 * Mirrors `packages/ingestion-connectors`'s own `artifactToEvidence`: a
 * narrow, explicit bridge from this package's own intermediate fact model
 * into REAL `@phoenix-ai/knowledge-graph` objects, built only where the
 * mapping is directly, mechanically decidable from an annotation -- deciding
 * architectural Component/bounded-context boundaries is semantic inference's
 * job (FR-SEM-01), not this package's. Everything else this package extracts
 * (call graph, type-dependency graph, repositories, raw config facts) is
 * returned as-is by `extract-java.ts` for a later module to consume -- it has
 * no canonical shape of its own yet.
 *
 * Ids are deterministic (`sha256` over stable inputs via `node:crypto`),
 * never random -- the exact pattern already shipping in
 * `packages/ingestion-connectors/src/reference-connector.ts`'s own
 * `sha256()` helper, required so identical input produces a byte-stable
 * bundle across runs (FR-DET-07, FR-KG-04).
 */

import { createHash } from 'node:crypto';
import type { Evidence } from '@phoenix-ai/knowledge-graph';
import type { SourceSpan } from './java-structure.js';

export interface BridgeOptions {
  systemId: string;
  /** The `Source.id`/`Provenance.sourceId` this fact was read from -- the same join key `ingestion-connectors` established. */
  sourceId: string;
  /** ISO-8601, flows in from the caller rather than being stamped internally -- see the file header on determinism. */
  generatedAt: string;
}

/** A stable, content-derived identifier -- never a random UUID. */
export function deterministicId(prefix: string, ...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join(' '), 'utf8').digest('hex');
  return `${prefix}-${hash.slice(0, 16)}`;
}

export function simpleNameOf(qualifiedName: string): string {
  return qualifiedName.split('.').pop() ?? qualifiedName;
}

function locatorFor(span: SourceSpan): string {
  const range =
    span.endLine === undefined || span.endLine === span.startLine
      ? `L${span.startLine}`
      : `L${span.startLine}-L${span.endLine}`;
  return `${span.path}#${range}`;
}

export function evidenceFor(
  span: SourceSpan,
  options: BridgeOptions,
  kind: string,
  qualifiedName: string,
): Evidence {
  return {
    id: deterministicId('evidence', kind, options.sourceId, qualifiedName),
    sourceId: options.sourceId,
    locator: locatorFor(span),
    capturedAt: options.generatedAt,
  };
}
