/**
 * P3-07 -- the Java extraction orchestrator, now including database
 * interaction extraction and its bridge into a real canonical object.
 *
 * Wires the passes that exist so far: discover project structure -> parse
 * each main-source `.java` file (collecting per-file parse failures
 * non-throwingly, mirroring `ArtifactCollection.failures` in
 * `@phoenix-ai/ingestion-connectors` -- one unparseable file must not abort
 * a whole extraction run) -> structural facts -> the call graph and
 * type-dependency graph -> Spring MVC controllers/routes -> JPA entities and
 * Spring Data repositories -> bridge each controller and entity into a real
 * canonical object.
 *
 * `options` (systemId/sourceId/generatedAt, introduced in P3-06) is threaded
 * through both bridges from one resolved `generatedAt` -- the determinism
 * discipline FR-DET-07 requires.
 *
 * Later Java extraction tickets (P3-08) extend this same function with
 * configuration extraction -- see `docs/phase-3/README.md` for the sequence.
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
import {
  extractJavaPersistence,
  type JavaJpaEntityFact,
  type JavaRepositoryFact,
} from './java-persistence.js';
import { bridgeSpringController } from './bridge-http.js';
import { bridgeJpaEntity } from './bridge-persistence.js';
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
  entities: JavaJpaEntityFact[];
  repositories: JavaRepositoryFact[];
  /** Bridged `ApiObject`s/`EntityObject`s so far -- see `bridge-http.ts`/`bridge-persistence.ts` for what does and does not bridge. */
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
  const { entities, repositories } = extractJavaPersistence(files);

  const objects: CanonicalKnowledgeObject[] = [
    ...controllers.map((controller) => bridgeSpringController(controller, bridgeOptions)),
    ...entities.map((entity) => bridgeJpaEntity(entity, bridgeOptions)),
  ];

  return {
    layout,
    files,
    parseFailures,
    calls,
    typeDependencies,
    controllers,
    entities,
    repositories,
    objects,
  };
}
