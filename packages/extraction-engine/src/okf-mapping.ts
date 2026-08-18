/**
 * P3-09 -- maps deterministic Java extraction results onto OKF (FR-OKF-*,
 * building on P2-10's schema).
 *
 * `extractJavaProject` (P3-08, `extract-java.ts`) already produces real
 * `CanonicalKnowledgeObject`s (`objects`, via P3-06/P3-07's bridges) and an
 * (always empty, per ADR 0018-0020) `relationships` array -- this ticket
 * does NOT invent any new mapping from raw facts to canonical shape, since
 * that boundary was already drawn deliberately at each bridge (ADR 0018
 * decision 4, ADR 0019 decision 4, ADR 0020 decision 5: only what is
 * directly annotation-decidable bridges; the call graph, type-dependency
 * graph, repositories, and config facts have no canonical shape and stay
 * facts for `inference-engine`). What THIS ticket adds is the missing last
 * step: wrapping those already-canonical objects into a real, complete
 * `CanonicalKnowledgeBundle` -- with a `sources` registry so
 * `validateSourceReferences` can resolve every `provenance`/`evidence`
 * `sourceId` -- and rendering it through P2-10's existing, unmodified
 * `toOkfDocument`/`serializeOkfYaml` (`@phoenix-ai/knowledge-graph`).
 *
 * No new canonical model, no new validation logic, and no new YAML
 * serialization is written here -- reusing P2-10's machinery exactly is the
 * point: an OKF document assembled from real Java source and one hand-built
 * for a fixture are validated, serialized, and versioned identically.
 */

import {
  serializeOkfYaml,
  toOkfDocument,
  type CanonicalKnowledgeBundle,
  type OkfDocument,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import type { JavaExtractionResult } from './extract-java.js';

export interface JavaOkfMappingOptions {
  systemId: string;
  /** ISO-8601 -- the same instant passed to `extractJavaProject`'s own `options.generatedAt`, so the bundle's timestamp matches every object's `identity`/`provenance` timestamps. */
  generatedAt: string;
  /**
   * The origin artifact(s) this extraction read from -- typically the
   * `ConnectorSession.source` a `@phoenix-ai/ingestion-connectors` connector
   * already produced for the repository `extractJavaProject`'s artifacts
   * came from. Optional and additive, matching `CanonicalKnowledgeBundle.sources`
   * itself: a bundle assembled before a source registry is available remains
   * valid, just less resolvable.
   */
  sources?: Source[];
  /** Defaults to the current canonical schema version, matching `toOkfDocument`'s own default. */
  okfVersion?: string;
}

/**
 * Wraps a Java extraction's already-bridged objects/relationships into a
 * full `CanonicalKnowledgeBundle`. Everything this family determined was
 * NOT directly bridgeable (the call graph, type-dependency graph,
 * repositories, raw config facts) is deliberately left out -- it has no
 * canonical shape yet (see the file header) and stays on `result` itself
 * for a caller that needs it.
 */
export function buildJavaCanonicalBundle(
  result: JavaExtractionResult,
  options: JavaOkfMappingOptions,
): CanonicalKnowledgeBundle {
  return {
    systemId: options.systemId,
    generatedAt: options.generatedAt,
    objects: result.objects,
    relationships: result.relationships,
    ...(options.sources === undefined ? {} : { sources: options.sources }),
  };
}

/** `buildJavaCanonicalBundle` plus P2-10's `toOkfDocument` -- an OKF document ready to serialize or validate. */
export function mapJavaExtractionToOkfDocument(
  result: JavaExtractionResult,
  options: JavaOkfMappingOptions,
): OkfDocument {
  return toOkfDocument(buildJavaCanonicalBundle(result, options), options.okfVersion);
}

/** `mapJavaExtractionToOkfDocument` plus P2-10's `serializeOkfYaml` -- the deterministic OKF YAML text for a Java extraction run. */
export function serializeJavaExtractionToOkfYaml(
  result: JavaExtractionResult,
  options: JavaOkfMappingOptions,
): string {
  return serializeOkfYaml(mapJavaExtractionToOkfDocument(result, options));
}
