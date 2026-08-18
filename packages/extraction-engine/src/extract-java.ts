/**
 * P3-08 -- the Java extraction orchestrator, in its final (for this family)
 * form: discovery, parsing, structural facts, the call/type-dependency
 * graph, HTTP and persistence extraction, application configuration, and
 * the canonical-object bridge, all in one call.
 *
 * Wires every pass this family built: discover project structure -> parse
 * each main-source `.java` file (collecting per-file parse failures
 * non-throwingly, mirroring `ArtifactCollection.failures` in
 * `@phoenix-ai/ingestion-connectors` -- one unparseable file must not abort
 * a whole extraction run) -> structural facts -> the call graph and
 * type-dependency graph -> Spring MVC controllers/routes -> JPA entities and
 * Spring Data repositories -> application config
 * (`application*.properties`/`.yml` artifacts) plus config
 * cross-references -> bridge each controller and entity into a real
 * canonical object.
 *
 * `options` (systemId/sourceId/generatedAt, introduced in P3-06) is
 * resolved ONCE here (`generatedAt` defaulted only when the caller omits
 * it) and threaded through every bridge call rather than re-stamped
 * per-object -- the determinism discipline FR-DET-07 requires: two runs
 * over identical input must produce a byte-identical result.
 *
 * Only `.java` files under each module's MAIN source root are parsed --
 * test sources are discovered (`layout`) but not parsed, since none of this
 * family's targets (routes, entities, config) live in test code.
 */

import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import type {
  CanonicalKnowledgeObject,
  CanonicalKnowledgeRelationship,
} from '@phoenix-ai/knowledge-graph';
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
import {
  extractConfigReferences,
  extractPropertiesConfig,
  extractYamlConfig,
  type JavaConfigFact,
  type JavaConfigReferenceFact,
} from './java-config.js';
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
  config: JavaConfigFact[];
  configReferences: JavaConfigReferenceFact[];
  /** Bridged `ApiObject`s/`EntityObject`s -- see `bridge-http.ts`/`bridge-persistence.ts` for what does and does not bridge. */
  objects: CanonicalKnowledgeObject[];
  /** Always empty in this family -- no cross-object relationship bridging is performed yet (a documented gap). */
  relationships: CanonicalKnowledgeRelationship[];
}

const APPLICATION_CONFIG_PATTERN = /(^|\/)application(-[^/.]+)?\.(properties|ya?ml)$/;

function isApplicationConfigPath(path: string): boolean {
  return APPLICATION_CONFIG_PATTERN.test(path);
}

/** Extracts every deterministic Java fact this package produces, plus the canonical objects that bridge directly. */
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

  const config = artifacts
    .filter((artifact) => isApplicationConfigPath(artifact.path))
    .flatMap((artifact) =>
      artifact.path.endsWith('.properties')
        ? extractPropertiesConfig(artifact.path, artifact.content)
        : extractYamlConfig(artifact.path, artifact.content),
    );
  const configReferences = extractConfigReferences(files, calls);

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
    config,
    configReferences,
    objects,
    relationships: [],
  };
}
