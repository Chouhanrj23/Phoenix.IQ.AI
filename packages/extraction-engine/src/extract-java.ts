/**
 * P3-06 -- the Java extraction orchestrator, now including REST/API
 * extraction and its bridge into a real canonical object.
 *
 * Wires the passes that exist so far: discover project structure -> parse
 * each main-source `.java` file (collecting per-file parse failures
 * non-throwingly, mirroring `ArtifactCollection.failures` in
 * `@phoenix-ai/ingestion-connectors` -- one unparseable file must not abort
 * a whole extraction run) -> structural facts -> the call graph and
 * type-dependency graph -> Spring MVC controllers/routes -> bridge each
 * controller into a real `ApiObject`.
 *
 * `options` (systemId/sourceId/generatedAt) is introduced in THIS ticket,
 * not earlier, because it is only needed once there is a canonical-object
 * bridge to stamp it onto -- P3-03 through P3-05 had nothing that needed a
 * system/source identity. `generatedAt` is resolved ONCE here (defaulted
 * only when the caller omits it) and threaded through the bridge rather than
 * re-stamped per-object -- the determinism discipline FR-DET-07 requires.
 *
 * Later Java extraction tickets (P3-07 onward) extend this same function
 * with persistence extraction and configuration -- see
 * `docs/phase-3/README.md` for the sequence.
 *
 * Only `.java` files under each module's MAIN source root are parsed --
 * test sources are discovered (`layout`) but not parsed, since none of this
 * family's targets (routes, entities, config) live in test code.
 */

import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import type { CanonicalKnowledgeObject } from '@phoenix-ai/knowledge-graph';
import { discoverJavaProject, type JavaProjectLayout } from './java-project.js';
import { parseJavaSource, type JavaParseFailure } from './java-parser-adapter.js';
import { extractJavaStructure, type JavaFileFacts } from './java-structure.js';
import {
  extractJavaCallGraph,
  type JavaCallFact,
  type JavaTypeDependencyFact,
} from './java-calls.js';
import { extractJavaHttp, type JavaControllerFact } from './java-http.js';
import { bridgeSpringController } from './bridge-http.js';
import type { BridgeOptions } from './bridge-shared.js';
import type { CstNode } from 'java-parser';

export interface JavaExtractionOptions {
  systemId: string;
  sourceId: string;
  /** ISO-8601. Defaults to the current time when omitted -- pass explicitly for byte-stable output across runs. */
  generatedAt?: string;
}

export interface JavaExtractionResult {
  layout: JavaProjectLayout;
  files: JavaFileFacts[];
  parseFailures: JavaParseFailure[];
  calls: JavaCallFact[];
  typeDependencies: JavaTypeDependencyFact[];
  controllers: JavaControllerFact[];
  /** Bridged `ApiObject`s so far -- see `bridge-http.ts` for what does and does not bridge. */
  objects: CanonicalKnowledgeObject[];
}

/** Extracts every deterministic Java fact this package produces so far, plus the canonical objects that bridge directly. */
export function extractJavaProject(
  artifacts: readonly RawArtifact[],
  options: JavaExtractionOptions,
): JavaExtractionResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const bridgeOptions: BridgeOptions = {
    systemId: options.systemId,
    sourceId: options.sourceId,
    generatedAt,
  };

  const byPath = new Map(artifacts.map((artifact) => [artifact.path, artifact]));
  const layout = discoverJavaProject(artifacts);

  const mainJavaPaths = [
    ...layout.modules.flatMap((module) => module.mainSourceFiles),
    ...layout.unassignedJavaFiles,
  ].sort();

  const files: JavaFileFacts[] = [];
  const parseFailures: JavaParseFailure[] = [];
  const cstsByPath = new Map<string, CstNode>();
  const sourcesByPath = new Map<string, string>();

  for (const path of mainJavaPaths) {
    const artifact = byPath.get(path);
    if (artifact === undefined) continue;
    const result = parseJavaSource(path, artifact.content);
    if (!result.ok) {
      parseFailures.push(result);
      continue;
    }
    cstsByPath.set(path, result.cst);
    sourcesByPath.set(path, artifact.content);
    files.push(extractJavaStructure(path, artifact.content, result.cst));
  }

  const { calls, typeDependencies } = extractJavaCallGraph(files, cstsByPath, sourcesByPath);
  const controllers = extractJavaHttp(files);

  const objects: CanonicalKnowledgeObject[] = controllers.map((controller) =>
    bridgeSpringController(controller, bridgeOptions),
  );

  return { layout, files, parseFailures, calls, typeDependencies, controllers, objects };
}
