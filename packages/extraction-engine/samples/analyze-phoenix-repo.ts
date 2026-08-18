/**
 * P3-11 -- POC: run the first REAL connector (P3-02's git connector) and
 * the whole Java extraction family (P3-03 through P3-10) against a real,
 * un-curated repository: Phoenix.ai-1 itself.
 *
 * This is a dev/demo utility, not part of either package's runtime API
 * (not exported from any `src/index.ts`, not part of `tsc -b`'s build).
 * Run it via `pnpm --filter @phoenix-ai/extraction-engine poc:analyze-phoenix`.
 *
 * Every prior test in this project's ingestion/extraction pipeline ran
 * against a small, hand-built fixture -- a handful of files, purpose-built
 * to exercise one behavior at a time. This POC is the first time the real
 * git connector opens a real, large, working repository it did not create
 * (thousands of files, real `.git` history, a real `node_modules` tree if
 * present, real lockfiles) and the real Java extraction pipeline runs over
 * whatever it finds -- proving the pipeline behaves correctly (no crash, no
 * false positive, a coherent report) against a repository the tests never
 * anticipated, not just against fixtures shaped to fit it.
 *
 * Phoenix.ai-1 itself is a TypeScript/Node monorepo with NO Java source --
 * an intentional, informative choice, not a workaround: the expected,
 * CORRECT finding is an empty extraction result, which is exactly what
 * proves the pipeline does not fabricate facts out of non-Java content it
 * was never designed to understand. See `docs/phase-3/README.md`'s P3-11
 * section for the real numbers this script produced and what they mean.
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
import { buildJavaCanonicalBundle, mapJavaExtractionToOkfDocument } from '../src/okf-mapping.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[/\\]$/, '');
const SOURCE_ID = 'repo://phoenix-ai-1';

function fileLocator(path: string): string {
  return `file://${path.replace(/\\/g, '/')}`;
}

/** Build/dependency/output noise every real analysis run excludes -- not code to analyze. */
const NOISE_EXCLUDES = [
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  'dist',
  'coverage',
  'pnpm-lock.yaml',
  '.pnpm-store',
];

function descriptor(filter: ArtifactFilter): SourceRepositoryDescriptor {
  return {
    id: SOURCE_ID,
    sourceType: 'source-code',
    label: 'phoenix-ai-1 (this repository)',
    locator: fileLocator(REPO_ROOT),
    repository: { kind: 'local-directory' },
    filter,
  };
}

function extensionOf(path: string): string {
  const dot = path.lastIndexOf('.');
  const slash = path.lastIndexOf('/');
  return dot > slash ? path.slice(dot) : '(no extension)';
}

async function main(): Promise<void> {
  const connector = createGitRepositoryConnector();
  const lines: string[] = [];
  const log = (line: string): void => {
    lines.push(line);
    // eslint-disable-next-line no-console -- this IS the script's intended CLI output, not leftover debugging.
    console.log(line);
  };

  log(`# P3-11 POC -- analyzing ${REPO_ROOT}\n`);

  // --- Step A: broad inventory (list only, no content read -- cheap even for a large tree) ---
  const inventoryByExtension = new Map<string, number>();
  let totalFiles = 0;
  let headRevision: string | undefined;

  await withConnectorSession(
    connector,
    descriptor({ excludePaths: NOISE_EXCLUDES }),
    async (session) => {
      headRevision = session.revision;
      for await (const ref of session.list()) {
        totalFiles += 1;
        const ext = extensionOf(ref.path);
        inventoryByExtension.set(ext, (inventoryByExtension.get(ext) ?? 0) + 1);
      }
    },
  );

  log(`Resolved revision: ${headRevision ?? '(unknown)'}`);
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
    systemId: 'phoenix-ai-1',
    sourceId: SOURCE_ID,
    generatedAt,
    ...(headRevision === undefined ? {} : { sourceVersion: headRevision }),
  });

  log(
    `\nJava modules discovered (Maven/Gradle build files found): ${result.layout.modules.length}`,
  );
  log(`Files successfully parsed as Java: ${result.files.length}`);
  log(`Parse failures: ${result.parseFailures.length}`);
  log(`Types extracted: ${result.files.reduce((n, f) => n + f.types.length, 0)}`);
  log(`Call graph edges: ${result.calls.length}`);
  log(`Type-dependency edges: ${result.typeDependencies.length}`);
  log(`Spring controllers: ${result.controllers.length}`);
  log(`JPA entities: ${result.entities.length}`);
  log(`Spring Data repositories: ${result.repositories.length}`);
  log(`Application config keys: ${result.config.length}`);
  log(`Bridged canonical objects: ${result.objects.length}`);

  const source: Source = {
    id: SOURCE_ID,
    type: 'source-code',
    label: 'phoenix-ai-1 (this repository)',
    locator: SOURCE_ID,
    ...(headRevision === undefined ? {} : { version: headRevision }),
  };
  const mappingOptions = { systemId: 'phoenix-ai-1', generatedAt, sources: [source] };

  const bundle = buildJavaCanonicalBundle(result, mappingOptions);
  log(
    `\nBundle validates against the real validateCanonicalKnowledgeBundle: ${validateCanonicalKnowledgeBundle(bundle).valid}`,
  );
  log(
    `Every provenance/evidence sourceId resolves against the sources registry: ${validateSourceReferences(bundle).valid}`,
  );

  const document = mapJavaExtractionToOkfDocument(result, mappingOptions);
  const yamlText = serializeOkfYaml(document);
  log(`OKF YAML document generated: ${yamlText.split('\n').length} lines`);
  const okfValidation = parseAndValidateOkfYaml(yamlText);
  log(`OKF YAML round-trips through the real parseAndValidateOkfYaml: ${okfValidation.valid}`);
  if (!okfValidation.valid) log(`  errors: ${okfValidation.errors.join('; ')}`);

  const reportPath = fileURLToPath(new URL('./phoenix-repo-analysis-report.md', import.meta.url));
  writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');
  log(`\nReport written to ${reportPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
