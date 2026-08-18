/**
 * P3-05 -- the Java extraction orchestrator, now including the call graph
 * and type-dependency graph.
 *
 * Wires the passes that exist so far: discover project structure -> parse
 * each main-source `.java` file (collecting per-file parse failures
 * non-throwingly, mirroring `ArtifactCollection.failures` in
 * `@phoenix-ai/ingestion-connectors` -- one unparseable file must not abort
 * a whole extraction run) -> structural facts -> the call graph and
 * type-dependency graph.
 *
 * Later Java extraction tickets (P3-06 onward) extend this same function
 * with HTTP/persistence extraction, configuration, and the canonical-object
 * bridge -- see `docs/phase-3/README.md` for the sequence.
 *
 * Only `.java` files under each module's MAIN source root are parsed --
 * test sources are discovered (`layout`) but not parsed, since none of this
 * family's targets (routes, entities, config) live in test code.
 */

import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import { discoverJavaProject, type JavaProjectLayout } from './java-project.js';
import { parseJavaSource, type JavaParseFailure } from './java-parser-adapter.js';
import { extractJavaStructure, type JavaFileFacts } from './java-structure.js';
import {
  extractJavaCallGraph,
  type JavaCallFact,
  type JavaTypeDependencyFact,
} from './java-calls.js';
import type { CstNode } from 'java-parser';

export interface JavaExtractionResult {
  layout: JavaProjectLayout;
  files: JavaFileFacts[];
  parseFailures: JavaParseFailure[];
  calls: JavaCallFact[];
  typeDependencies: JavaTypeDependencyFact[];
}

/**
 * Extracts every deterministic Java fact this package produces so far:
 * discovery, parsing, structural facts, and the call/type-dependency graph.
 * Later tickets (P3-06 onward) add a second `options` parameter once there is
 * a canonical-object bridge that needs a system/source identity to stamp onto
 * its output -- this stage has nothing yet that needs one.
 */
export function extractJavaProject(artifacts: readonly RawArtifact[]): JavaExtractionResult {
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

  return { layout, files, parseFailures, calls, typeDependencies };
}
