/**
 * P6-04 -- maps a Jira bridge result onto OKF, mirroring `okf-mapping.ts`'s
 * (P3-09) role for Java exactly: no new mapping logic here, only wrapping
 * `bridgeJiraArtifacts`'s already-canonical `objects`/`relationships` into a
 * real `CanonicalKnowledgeBundle` and rendering it through P2-10's existing,
 * unmodified `toOkfDocument`/`serializeOkfYaml`. See
 * `docs/architecture/adr/0028-p6-04-jira-okf-mapping.md`.
 */

import {
  serializeOkfYaml,
  toOkfDocument,
  type CanonicalKnowledgeBundle,
  type OkfDocument,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import type { JiraBridgeResult } from './jira-bridge.js';

export interface JiraOkfMappingOptions {
  systemId: string;
  /** ISO-8601 -- the same instant passed to `bridgeJiraArtifacts`'s own `options.generatedAt`. */
  generatedAt: string;
  /** The Jira `Source` record(s) (typically `ConnectorSession.source`) this bridge's artifacts came from. Optional and additive, matching `CanonicalKnowledgeBundle.sources`. */
  sources?: Source[];
  /** Defaults to the current canonical schema version, matching `toOkfDocument`'s own default. */
  okfVersion?: string;
}

/** Wraps a Jira bridge result's already-bridged objects/relationships into a full `CanonicalKnowledgeBundle`. */
export function buildJiraCanonicalBundle(
  result: JiraBridgeResult,
  options: JiraOkfMappingOptions,
): CanonicalKnowledgeBundle {
  return {
    systemId: options.systemId,
    generatedAt: options.generatedAt,
    objects: result.objects,
    relationships: result.relationships,
    ...(options.sources === undefined ? {} : { sources: options.sources }),
  };
}

/** `buildJiraCanonicalBundle` plus P2-10's `toOkfDocument` -- an OKF document ready to serialize or validate. */
export function mapJiraToOkfDocument(
  result: JiraBridgeResult,
  options: JiraOkfMappingOptions,
): OkfDocument {
  return toOkfDocument(buildJiraCanonicalBundle(result, options), options.okfVersion);
}

/** `mapJiraToOkfDocument` plus P2-10's `serializeOkfYaml` -- the deterministic OKF YAML text for a Jira bridge run. */
export function serializeJiraToOkfYaml(
  result: JiraBridgeResult,
  options: JiraOkfMappingOptions,
): string {
  return serializeOkfYaml(mapJiraToOkfDocument(result, options));
}
