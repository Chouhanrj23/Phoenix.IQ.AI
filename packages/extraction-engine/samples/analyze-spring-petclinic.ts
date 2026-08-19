/**
 * P3-11 -- positive-path POC: run the real git connector (P3-02) and the
 * whole Java extraction family (P3-03 through P3-10) against a REAL,
 * uncurated, third-party Spring Boot/JPA repository.
 *
 * `analyze-phoenix-repo.ts` already proved the pipeline runs end to end
 * against a real, large, un-anticipated repository (this one) and produces
 * a correct EMPTY result, because Phoenix.ai-1 has no Java source. That
 * proved the pipeline does not fabricate facts -- it did not, and could
 * not, prove that P3-04 through P3-08's Java-specific extraction logic
 * (controllers, entities, repositories, config) works against real,
 * un-curated Spring/JPA code, since Phoenix.ai-1 has none.
 *
 * This script closes that gap using **spring-petclinic**
 * (https://github.com/spring-projects/spring-petclinic), the official
 * Spring team's own reference sample application -- real Spring Boot, real
 * Spring MVC controllers, real JPA entities and Spring Data repositories,
 * real `application.properties`/profile-specific config. It was not written
 * by or for Phoenix, and nothing in it was curated or shaped to fit this
 * pipeline.
 *
 * Unlike `analyze-phoenix-repo.ts` (which reads an already-local checkout
 * via `kind: 'local-directory'`), this script uses `kind: 'git'` with a real
 * `https://` remote locator, so it is also the first real exercise of the
 * connector's REMOTE CLONE path (shallow clone, temp directory, cleanup on
 * close) -- see `git-connector.ts`'s `open()`.
 *
 * The revision is pinned (not left floating on `main`) so this script's
 * output is reproducible: the same commit is read every time this is run,
 * regardless of what lands on spring-petclinic's `main` branch afterward.
 *
 * Run via `pnpm --filter @phoenix-ai/extraction-engine poc:analyze-spring-petclinic`.
 * Writes `spring-petclinic-analysis-report.md` (this run's narrative report)
 * and `spring-petclinic.okf.yaml` (the full generated OKF document) next to
 * this script, mirroring the `packages/knowledge-graph/samples/` convention
 * of pairing a generated `.yaml` artifact with prose. Requires network
 * access and the `git` binary on `PATH`.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createGitRepositoryConnector,
  collectArtifacts,
  withConnectorSession,
  type ArtifactFilter,
  type SourceRepositoryDescriptor,
} from '@phoenix-ai/ingestion-connectors';
import {
  parseAndValidateOkfYaml,
  serializeOkfYaml,
  validateCanonicalKnowledgeBundle,
  validateSourceReferences,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import { extractJavaProject } from '../src/extract-java.js';
import { flattenJavaTypes } from '../src/java-structure.js';
import { buildJavaCanonicalBundle, mapJavaExtractionToOkfDocument } from '../src/okf-mapping.js';

const SOURCE_ID = 'repo://spring-petclinic';
const REMOTE_URL = 'https://github.com/spring-projects/spring-petclinic.git';
/**
 * Pinned for reproducibility -- resolved via `git ls-remote --symref
 * https://github.com/spring-projects/spring-petclinic.git HEAD` on the day
 * this script was written. `main` has moved on since; this SHA has not and
 * will not.
 */
const PINNED_REVISION = '88e37c15cf6fc8490b01bc3e8e2c800cec1ac272';

/** Config key fragments that must never be echoed as a value in the report, even a real project's own test-only defaults. */
const SENSITIVE_KEY_PATTERN = /password|secret|token|credential|private[-_]?key/i;

function descriptor(filter: ArtifactFilter): SourceRepositoryDescriptor {
  return {
    id: SOURCE_ID,
    sourceType: 'source-code',
    label: 'spring-petclinic (spring-projects/spring-petclinic, real upstream repository)',
    locator: REMOTE_URL,
    repository: { kind: 'git', revision: PINNED_REVISION },
    filter,
  };
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  return dot > slash ? path.slice(dot) : '(no extension)';
}

async function main(): Promise<void> {
  // Shallow but with headroom: a plain depth-1 clone of whatever is
  // currently at the tip of `main` might not contain PINNED_REVISION if a
  // new commit landed between when that SHA was captured and when this
  // runs. 30 gives real margin without fetching full history.
  const connector = createGitRepositoryConnector({ cloneDepth: 30 });
  const lines: string[] = [];
  const log = (line: string): void => {
    lines.push(line);
    // eslint-disable-next-line no-console -- this IS the script's intended CLI output, not leftover debugging.
    console.log(line);
  };

  log(
    `# P3-11 POC -- positive-path: analyzing ${REMOTE_URL} (real, uncurated Spring Boot/JPA repository)\n`,
  );
  log(`Pinned revision requested: ${PINNED_REVISION}`);

  const NOISE_EXCLUDES = ['.git', '.mvn', '.idea', '.vscode', 'target', 'node_modules'];

  // --- Step A: broad inventory (list only, no content read) ---
  const inventoryByExtension = new Map<string, number>();
  let totalFiles = 0;
  let headRevision: string | undefined;
  let sourceMetadata: Record<string, unknown> | undefined;

  await withConnectorSession(
    connector,
    descriptor({ excludePaths: NOISE_EXCLUDES }),
    async (session) => {
      headRevision = session.revision;
      sourceMetadata = session.sourceMetadata;
      for await (const ref of session.list()) {
        totalFiles += 1;
        const ext = extensionOf(ref.path);
        inventoryByExtension.set(ext, (inventoryByExtension.get(ext) ?? 0) + 1);
      }
    },
  );

  log(`Resolved revision: ${headRevision ?? '(unknown)'}`);
  log(`Revision matches pin: ${headRevision === PINNED_REVISION}`);
  if (sourceMetadata) {
    log(`Commit subject: ${String(sourceMetadata.commitSubject ?? '(unknown)')}`);
    log(`Committed at: ${String(sourceMetadata.committedAt ?? '(unknown)')}`);
    log(`Shallow clone: ${String(sourceMetadata.shallow ?? '(unknown)')}`);
  }
  log(`Total tracked files (after excluding ${NOISE_EXCLUDES.join(', ')}): ${totalFiles}\n`);
  log('Top 15 file extensions by count:');
  const topExtensions = [...inventoryByExtension.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  for (const [ext, count] of topExtensions) log(`  ${ext.padEnd(20)} ${count}`);
  log(`\nJava source files found (.java): ${inventoryByExtension.get('.java') ?? 0}`);

  // --- Step B: targeted read + real Java extraction over what extraction actually looks at ---
  const javaRelevantFilter: ArtifactFilter = {
    excludePaths: NOISE_EXCLUDES,
    includePaths: [
      '**/*.java',
      '**/pom.xml',
      '**/build.gradle',
      '**/build.gradle.kts',
      '**/application*.properties',
      '**/application*.yml',
      '**/application*.yaml',
    ],
  };

  const collection = await withConnectorSession(
    connector,
    descriptor(javaRelevantFilter),
    (session) => collectArtifacts(session),
  );

  log(`\nJava-extraction-relevant artifacts read: ${collection.artifacts.length}`);
  log(`Read failures: ${collection.failures.length}`);
  for (const failure of collection.failures) log(`  ${failure.reason}: ${failure.path}`);

  const generatedAt = new Date().toISOString();
  const result = extractJavaProject(collection.artifacts, {
    systemId: 'spring-petclinic',
    sourceId: SOURCE_ID,
    generatedAt,
    ...(headRevision === undefined ? {} : { sourceVersion: headRevision }),
  });

  const allTypes = result.files.flatMap((f) => flattenJavaTypes(f.types));
  const totalTypes = allTypes.length;
  const totalMethods = allTypes.reduce((m, t) => m + t.methods.length, 0);
  const packages = new Set(
    result.files
      .map((f) => f.packageName)
      .filter((p): p is string => p !== undefined && p.length > 0),
  );

  log(
    `\nJava modules discovered (Maven/Gradle build files found): ${result.layout.modules.length}`,
  );
  log(`Files successfully parsed as Java: ${result.files.length}`);
  log(`Parse failures: ${result.parseFailures.length}`);
  for (const failure of result.parseFailures)
    log(`  ${failure.reason} in ${failure.path}: ${failure.detail}`);
  log(`Distinct packages: ${packages.size}`);
  log(`Types extracted (classes/interfaces/enums/records/annotations): ${totalTypes}`);
  log(`Methods extracted: ${totalMethods}`);
  log(`Call graph edges: ${result.calls.length}`);
  log(`Type-dependency edges: ${result.typeDependencies.length}`);
  log(`Spring controllers: ${result.controllers.length}`);
  log(`REST routes: ${result.controllers.reduce((n, c) => n + c.routes.length, 0)}`);
  log(`JPA entities: ${result.entities.length}`);
  log(`Spring Data repositories: ${result.repositories.length}`);
  log(`Application config keys: ${result.config.length}`);
  log(
    `Config cross-references (@Value/@ConfigurationProperties/System.getenv sites): ${result.configReferences.length}`,
  );
  log(`Bridged canonical objects: ${result.objects.length}`);

  // --- Representative findings: real, specific examples, not just counts ---
  log('\n## Representative extracted facts\n');

  log('### Maven/Gradle modules discovered');
  for (const module of result.layout.modules) {
    log(
      `- ${module.buildFilePath} (${module.buildSystem}) -- ${module.coordinates?.groupId ?? '?'}:${module.coordinates?.artifactId ?? '?'}:${module.coordinates?.version ?? '?'}, ${module.mainSourceFiles.length} main source files, ${module.testSourceFiles.length} test source files`,
    );
  }

  log('\n### Spring MVC controllers and routes (first 5 controllers)');
  for (const controller of result.controllers.slice(0, 5)) {
    log(`- \`${controller.qualifiedName}\` (${controller.path}:${controller.startLine})`);
    for (const route of controller.routes.slice(0, 6)) {
      log(
        `    ${route.httpMethod.padEnd(6)} ${route.path}  -> ${route.handlerMethod}(${route.parameters.map((p) => `${p.kind}:${p.name}`).join(', ')})`,
      );
    }
  }

  log('\n### JPA entities (all)');
  for (const entity of result.entities) {
    log(
      `- \`${entity.qualifiedName}\` -> table "${entity.tableName ?? '(default)'}", id fields [${entity.idFields.join(', ')}], ${entity.columns.length} columns, ${entity.associations.length} associations (${entity.path}:${entity.startLine})`,
    );
    for (const association of entity.associations) {
      log(`    ${association.kind} ${association.fieldName}: ${association.targetJavaType}`);
    }
  }

  log('\n### Spring Data repositories (all)');
  for (const repository of result.repositories) {
    log(
      `- \`${repository.qualifiedName}\` extends ${repository.extendsRepositoryType ?? '?'}<${repository.entityTypeArgument ?? '?'}, ${repository.idTypeArgument ?? '?'}>, ${repository.declaredQueryMethods.length} declared query methods (${repository.path}:${repository.startLine})`,
    );
  }

  log('\n### Application configuration keys found (values redacted where the key looks sensitive)');
  const configSample = result.config.slice(0, 25);
  for (const entry of configSample) {
    const value = SENSITIVE_KEY_PATTERN.test(entry.key) ? '(redacted)' : entry.value;
    log(`- ${entry.path}:${entry.line}  ${entry.key} = ${value}`);
  }
  if (result.config.length > configSample.length) {
    log(`  ... and ${result.config.length - configSample.length} more`);
  }

  log(
    '\n### Provenance -- one representative fact of each kind, showing what was actually stamped',
  );
  const firstEntity = result.entities[0];
  if (firstEntity !== undefined) {
    log(
      `- Entity \`${firstEntity.qualifiedName}\`.provenance = ${JSON.stringify(firstEntity.provenance)}`,
    );
  }
  const firstController = result.controllers[0];
  if (firstController !== undefined) {
    log(
      `- Controller \`${firstController.qualifiedName}\`.provenance = ${JSON.stringify(firstController.provenance)}`,
    );
  }
  const firstObject = result.objects[0];
  if (firstObject !== undefined) {
    log(
      `- Bridged canonical object \`${firstObject.identity.id}\` (${firstObject.kind}).metadata.provenance = ${JSON.stringify(firstObject.metadata.provenance)}`,
    );
    log(`  .evidence = ${JSON.stringify(firstObject.evidence)}`);
    log(`  .confidenceDetail = ${JSON.stringify(firstObject.confidenceDetail)}`);
  }

  // --- OKF mapping and validation ---
  const source: Source = {
    id: SOURCE_ID,
    type: 'source-code',
    label: 'spring-petclinic (spring-projects/spring-petclinic, real upstream repository)',
    locator: REMOTE_URL,
    ...(headRevision === undefined ? {} : { version: headRevision }),
  };
  const mappingOptions = { systemId: 'spring-petclinic', generatedAt, sources: [source] };

  const bundle = buildJavaCanonicalBundle(result, mappingOptions);
  const bundleValidation = validateCanonicalKnowledgeBundle(bundle);
  const sourceRefValidation = validateSourceReferences(bundle);
  log(`\n## OKF mapping and validation\n`);
  log(
    `Bundle validates against the real validateCanonicalKnowledgeBundle: ${bundleValidation.valid}`,
  );
  if (!bundleValidation.valid) log(`  errors: ${bundleValidation.errors.join('; ')}`);
  log(
    `Every provenance/evidence sourceId resolves against the sources registry: ${sourceRefValidation.valid}`,
  );
  if (!sourceRefValidation.valid) log(`  errors: ${sourceRefValidation.errors.join('; ')}`);

  const document = mapJavaExtractionToOkfDocument(result, mappingOptions);
  const yamlText = serializeOkfYaml(document);
  log(`OKF YAML document generated: ${yamlText.split('\n').length} lines`);
  const okfValidation = parseAndValidateOkfYaml(yamlText);
  log(`OKF YAML round-trips through the real parseAndValidateOkfYaml: ${okfValidation.valid}`);
  if (!okfValidation.valid) log(`  errors: ${okfValidation.errors.join('; ')}`);

  const okfPath = fileURLToPath(new URL('./spring-petclinic.okf.yaml', import.meta.url));
  writeFileSync(okfPath, yamlText, 'utf8');
  log(`\nFull generated OKF document written to ${okfPath}`);

  const reportPath = fileURLToPath(
    new URL('./spring-petclinic-analysis-report.md', import.meta.url),
  );
  writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');
  log(`Report written to ${reportPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
