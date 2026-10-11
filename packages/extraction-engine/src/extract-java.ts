/**
 * P3-10 -- the Java extraction orchestrator, now stamping provenance onto
 * every returned fact and passing a source revision through to the
 * canonical-object bridges' evidence.
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
 * canonical object -> bridge resolved type-dependency/JPA-association facts
 * into relationships between two already-bridged objects
 * (`bridge-relationships.ts`, a Phase 4 prerequisite fix -- see its file
 * header) -> stamp `FactProvenance` onto every fact (P3-10,
 * `fact-provenance.ts`).
 *
 * `options` (systemId/sourceId/generatedAt, introduced in P3-06; now also
 * `sourceVersion`, P3-10) is resolved ONCE here (`generatedAt` defaulted
 * only when the caller omits it) and threaded through every bridge call and
 * every stamped fact rather than re-stamped per-object -- the determinism
 * discipline FR-DET-07 requires: two runs over identical input must produce
 * a byte-identical result.
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
import { bridgeJpaAssociations, bridgeTypeDependencies } from './bridge-relationships.js';
import type { BridgeOptions } from './bridge-shared.js';
import { stampFactProvenance, type FactProvenance } from './fact-provenance.js';
import type { CstNode } from 'java-parser';
import type { JavaParseCache } from './parse-cache.js';

export interface JavaExtractionOptions {
  systemId: string;
  sourceId: string;
  /** ISO-8601. Defaults to the current time when omitted -- pass explicitly for byte-stable output across runs. */
  generatedAt?: string;
  /** The source's revision (e.g. a git SHA), when the caller tracks one. Stamped onto every returned fact's `provenance` and every bridged object's `Evidence.sourceVersion`. */
  sourceVersion?: string;
  /** P8 -- FR-DFT-01: reuse parses of unchanged files across runs. See `parse-cache.ts`. */
  parseCache?: JavaParseCache;
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
  /**
   * Relationships between two already-bridged canonical objects, evidenced
   * by resolved type-dependency facts (`paramType`/`returnType`/`extends`/
   * `implements`/`throws`) and JPA associations (`@OneToMany`/`@ManyToOne`/
   * `@OneToOne`/`@ManyToMany`) -- see `bridge-relationships.ts`. Still
   * intentionally incomplete, not intentionally empty: a dependency whose
   * target has no canonical object yet (e.g. a Repository, a plain service
   * class -- neither has an OKF kind) produces no relationship here, and
   * the call graph (`calls`) is not bridged at all yet (its target
   * resolution is shallower/noisier than the type-dependency graph's --
   * see the file header on why this was deferred, not silently dropped).
   */
  relationships: CanonicalKnowledgeRelationship[];
}

const APPLICATION_CONFIG_PATTERN = /(^|\/)application(-[^/.]+)?\.(properties|ya?ml)$/;

function isApplicationConfigPath(path: string): boolean {
  return APPLICATION_CONFIG_PATTERN.test(path);
}

/** Extracts every deterministic Java fact this package produces, plus the canonical objects that bridge directly -- every fact carrying its own extraction provenance. */
export function extractJavaProject(
  artifacts: readonly RawArtifact[],
  options: JavaExtractionOptions,
): JavaExtractionResult {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const bridgeOptions: BridgeOptions = {
    systemId: options.systemId,
    sourceId: options.sourceId,
    generatedAt,
    ...(options.sourceVersion === undefined ? {} : { sourceVersion: options.sourceVersion }),
  };
  const factProvenance: FactProvenance = {
    sourceId: options.sourceId,
    ...(options.sourceVersion === undefined ? {} : { sourceVersion: options.sourceVersion }),
    derivedBy: 'extraction-engine',
    derivedAt: generatedAt,
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
    let cached = options.parseCache?.get(path, artifact.content);
    if (cached === undefined) {
      const result = parseJavaSource(path, artifact.content);
      cached = result.ok
        ? { result, facts: extractJavaStructure(path, artifact.content, result.cst) }
        : { result };
      options.parseCache?.set(path, artifact.content, cached);
    }
    if (!cached.result.ok) {
      parseFailures.push(cached.result);
      continue;
    }
    cstsByPath.set(path, cached.result.cst);
    sourcesByPath.set(path, artifact.content);
    files.push((cached as { facts: JavaFileFacts }).facts);
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

  const controllerObjects = controllers.map((controller) =>
    bridgeSpringController(controller, bridgeOptions),
  );
  const entityObjects = entities.map((entity) => bridgeJpaEntity(entity, bridgeOptions));
  const objects: CanonicalKnowledgeObject[] = [...controllerObjects, ...entityObjects];

  const bridgedObjectIdsByQualifiedName = new Map<string, string>();
  controllers.forEach((controller, index) => {
    const object = controllerObjects[index];
    if (object !== undefined) {
      bridgedObjectIdsByQualifiedName.set(controller.qualifiedName, object.identity.id);
    }
  });
  entities.forEach((entity, index) => {
    const object = entityObjects[index];
    if (object !== undefined) {
      bridgedObjectIdsByQualifiedName.set(entity.qualifiedName, object.identity.id);
    }
  });
  const entityQualifiedNames = new Set(entities.map((entity) => entity.qualifiedName));

  const relationships: CanonicalKnowledgeRelationship[] = [
    ...bridgeTypeDependencies(
      typeDependencies,
      bridgedObjectIdsByQualifiedName,
      entityQualifiedNames,
      bridgeOptions,
    ),
    ...bridgeJpaAssociations(entities, bridgedObjectIdsByQualifiedName, bridgeOptions),
  ];

  return {
    layout,
    files: stampFactProvenance(files, factProvenance),
    parseFailures: stampFactProvenance(parseFailures, factProvenance),
    calls: stampFactProvenance(calls, factProvenance),
    typeDependencies: stampFactProvenance(typeDependencies, factProvenance),
    controllers: stampFactProvenance(controllers, factProvenance),
    entities: stampFactProvenance(entities, factProvenance),
    repositories: stampFactProvenance(repositories, factProvenance),
    config: stampFactProvenance(config, factProvenance),
    configReferences: stampFactProvenance(configReferences, factProvenance),
    objects,
    relationships,
  };
}
