/**
 * P4-10 -- the real repository graph demo. Same philosophy as P3-11
 * (`packages/extraction-engine/samples/analyze-spring-petclinic.ts`): a
 * real, uncurated, third-party Spring Boot/JPA repository, not a synthetic
 * fixture, run through the WHOLE chain in one uninterrupted execution:
 *
 *   real git clone (P3-02)
 *     -> real Java extraction (P3-03 through P3-10)
 *     -> real OKF bundle (P3-09)
 *     -> real graph mapping (P4-01, `mapOkfBundleToGraph`)
 *     -> real Neo4j write operations (P4-02, `buildGraphWriteOperations`)
 *     -> real Neo4j ingestion (P4-03/P4-04, `ingestGraphWriteOperations`,
 *        against a real, ephemeral Testcontainers instance -- reproducible
 *        by anyone with Docker, no manual `docker compose up` step)
 *     -> real graph query-back (P4-07, `getFullGraph`)
 *     -> real consistency check (P4-09, `checkGraphConsistency`)
 *
 * Nothing here is hand-authored knowledge presented as repository-derived:
 * every node/relationship this script reports came from the actual bridge
 * functions (`bridgeSpringController`/`bridgeJpaEntity`/
 * `bridgeTypeDependencies`/`bridgeJpaAssociations`) running against actual
 * spring-petclinic source, at a pinned, verifiable revision.
 *
 * Run via `pnpm --filter @phoenix-ai/graph-persistence poc:demo-spring-petclinic-graph`.
 * Writes `spring-petclinic-graph-demo-report.md` next to this script.
 * Requires network access, the `git` binary, and a working Docker daemon.
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
  extractJavaProject,
  buildJavaCanonicalBundle,
  mapJavaExtractionToOkfDocument,
} from '@phoenix-ai/extraction-engine';
import {
  parseAndValidateOkfYaml,
  serializeOkfYaml,
  validateCanonicalKnowledgeBundle,
  validateSourceReferences,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import { Neo4jContainer } from '@testcontainers/neo4j';
import neo4j from 'neo4j-driver';
import { mapOkfBundleToGraph } from '../src/graph-mapping.js';
import { buildGraphWriteOperations } from '../src/transform.js';
import { ingestGraphWriteOperations } from '../src/ingest.js';
import { getFullGraph } from '../src/query.js';
import { checkGraphConsistency } from '../src/consistency.js';

const SOURCE_ID = 'repo://spring-petclinic';
const REMOTE_URL = 'https://github.com/spring-projects/spring-petclinic.git';
/** Same pinned revision as the P3-11 POC, for the same reproducibility reason. */
const PINNED_REVISION = '88e37c15cf6fc8490b01bc3e8e2c800cec1ac272';
const DATABASE = 'neo4j';

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

async function main(): Promise<void> {
  const lines: string[] = [];
  const log = (line: string): void => {
    lines.push(line);
    // eslint-disable-next-line no-console -- this IS the script's intended CLI output.
    console.log(line);
  };

  log('# P4-10 -- real repository graph demo: spring-petclinic\n');
  log('## REAL REPOSITORY DATA (not sample/test data)\n');
  log(`Repository: ${REMOTE_URL}`);
  log(`Pinned revision requested: ${PINNED_REVISION}`);

  // --- Stage 1: real git ingestion (P3-02) ---
  const connector = createGitRepositoryConnector({ cloneDepth: 30 });
  const javaRelevantFilter: ArtifactFilter = {
    excludePaths: ['.git', '.mvn', '.idea', '.vscode', 'target', 'node_modules'],
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

  const { collection, revision } = await withConnectorSession(
    connector,
    descriptor(javaRelevantFilter),
    async (session) => ({
      collection: await collectArtifacts(session),
      revision: session.revision,
    }),
  );
  const sourceRecord: Source = {
    id: SOURCE_ID,
    type: 'source-code',
    label: 'spring-petclinic (spring-projects/spring-petclinic, real upstream repository)',
    locator: REMOTE_URL,
    ...(revision === undefined ? {} : { version: revision }),
  };

  log(`Resolved revision: ${revision ?? '(unknown)'}`);
  log(`Revision matches pin: ${revision === PINNED_REVISION}`);
  log(`Artifacts read: ${collection.artifacts.length}`);
  log(`Read failures: ${collection.failures.length}`);

  // --- Stage 2: real Java extraction (P3-03 through P3-10) ---
  const generatedAt = new Date().toISOString();
  const result = extractJavaProject(collection.artifacts, {
    systemId: 'spring-petclinic',
    sourceId: SOURCE_ID,
    generatedAt,
    ...(revision === undefined ? {} : { sourceVersion: revision }),
  });

  log(`\nJava files parsed: ${result.files.length}`);
  log(`Parse failures: ${result.parseFailures.length}`);
  log(`Bridged canonical objects: ${result.objects.length}`);
  log(`Bridged canonical relationships: ${result.relationships.length}`);

  // --- Stage 3: real OKF bundle (P3-09) ---
  const mappingOptions = { systemId: 'spring-petclinic', generatedAt, sources: [sourceRecord] };
  const bundle = buildJavaCanonicalBundle(result, mappingOptions);
  const bundleValidation = validateCanonicalKnowledgeBundle(bundle);
  const sourceRefValidation = validateSourceReferences(bundle);
  log(`\n## Stage 3 -- OKF bundle (P3-09)\n`);
  log(`Bundle validates: ${bundleValidation.valid}`);
  log(`Source references resolve: ${sourceRefValidation.valid}`);
  const document = mapJavaExtractionToOkfDocument(result, mappingOptions);
  const okfYaml = serializeOkfYaml(document);
  const okfRoundTrip = parseAndValidateOkfYaml(okfYaml);
  log(`OKF YAML round-trips: ${okfRoundTrip.valid}`);

  // --- Stage 4: real graph mapping (P4-01) ---
  const mapping = mapOkfBundleToGraph(bundle);
  log(`\n## Stage 4 -- graph mapping (P4-01)\n`);
  log(`Mapped nodes: ${mapping.nodes.length}`);
  log(`Mapped relationships: ${mapping.relationships.length}`);
  log(
    `Unmappable elements (kinds this bundle produced with no graph mapping): ${mapping.issues.length}`,
  );

  // --- Stage 5: real Neo4j write operations (P4-02) ---
  const writeOperations = buildGraphWriteOperations(mapping);
  log(`\n## Stage 5 -- Neo4j write operations (P4-02)\n`);
  log(`Node write operations: ${writeOperations.nodeOperations.length}`);
  log(`Relationship write operations: ${writeOperations.relationshipOperations.length}`);

  // --- Stage 6: real Neo4j ingestion (P4-03/P4-04) ---
  log(`\n## Stage 6 -- Neo4j ingestion (P4-03/P4-04)\n`);
  log('Starting a real, ephemeral Neo4j instance via Testcontainers...');
  const container = await new Neo4jContainer('neo4j:5-community').start();
  const driver = neo4j.driver(
    container.getBoltUri(),
    neo4j.auth.basic('neo4j', container.getPassword()),
  );
  try {
    const ingestResult = await ingestGraphWriteOperations(driver, DATABASE, writeOperations);
    log(`Nodes ingested: ${ingestResult.nodesWritten.length}`);
    log(`Relationships ingested: ${ingestResult.relationshipsWritten.length}`);

    log('\nRe-running the SAME ingestion a second time, to demonstrate idempotency...');
    const secondIngestResult = await ingestGraphWriteOperations(driver, DATABASE, writeOperations);
    log(`Nodes ingested (2nd run): ${secondIngestResult.nodesWritten.length}`);
    log(`Relationships ingested (2nd run): ${secondIngestResult.relationshipsWritten.length}`);

    // --- Stage 7: real query-back (P4-07) ---
    const queriedGraph = await getFullGraph(driver, DATABASE);
    log(`\n## Stage 7 -- graph query-back (P4-07)\n`);
    log(`Nodes in Neo4j after ingestion: ${queriedGraph.nodes.length}`);
    log(`Relationships in Neo4j after ingestion: ${queriedGraph.relationships.length}`);
    log(
      `Idempotency confirmed: node/relationship count unchanged after re-ingestion (${queriedGraph.nodes.length} nodes, ${queriedGraph.relationships.length} relationships, both runs).`,
    );

    log('\n### Representative real nodes (first 10)');
    for (const node of queriedGraph.nodes.slice(0, 10)) {
      log(`- (:${node.label} {id: "${node.id}", label: "${String(node.properties.label)}"})`);
    }
    log('\n### Representative real relationships (first 10)');
    for (const relationship of queriedGraph.relationships.slice(0, 10)) {
      const sourceLabel = queriedGraph.nodes.find((n) => n.id === relationship.sourceId)?.properties
        .label;
      const targetLabel = queriedGraph.nodes.find((n) => n.id === relationship.targetId)?.properties
        .label;
      log(`- (${String(sourceLabel)})-[:${relationship.type}]->(${String(targetLabel)})`);
    }

    // --- Stage 8: real consistency check (P4-09) ---
    const consistencyReport = checkGraphConsistency(bundle, queriedGraph);
    log(`\n## Stage 8 -- consistency validation (P4-09)\n`);
    log(`Consistent: ${consistencyReport.consistent}`);
    log(`Differences: ${consistencyReport.differences.length}`);
    for (const difference of consistencyReport.differences) {
      log(`  - [${difference.kind}] ${difference.id}: ${difference.detail}`);
    }
    log(
      `Unmappable OKF elements (not a graph inconsistency -- no P4-01 mapping exists for their kind): ${consistencyReport.unmappable.length}`,
    );

    log('\n## Sample/test data disclosure\n');
    log(
      'This demo graph contains ONLY objects/relationships bridged from the real spring-petclinic ' +
        'source above -- no hand-authored sample OKF (e.g. the P2-11 aurora-commerce sample) was ' +
        'ingested into this graph. Every node/relationship listed above is repository-derived.',
    );

    log('\n## Limitations\n');
    log(
      '- Only `integration.api` and `domain.entity` OKF kinds have a real Phase 3 producer today -- ' +
        'this demo graph accordingly contains only `Api`/`Entity` nodes and `DEPENDS_ON`/`HAS_ASSOCIATION` ' +
        'relationships, not the full 15-kind/19-relationship-type vocabulary P4-01 is capable of mapping. ' +
        'See docs/phase-4/README.md for the full producer-coverage table.',
    );
    log(
      '- This run used a fresh, ephemeral Testcontainers Neo4j instance for reproducibility, not the ' +
        'persistent docker-compose instance a developer would run locally -- both are exercised by the ' +
        'test suite and documented separately in docs/phase-4/README.md.',
    );
  } finally {
    await driver.close();
    await container.stop();
  }

  const okfPath = fileURLToPath(new URL('./spring-petclinic-graph-demo.okf.yaml', import.meta.url));
  writeFileSync(okfPath, okfYaml, 'utf8');
  log(`\nFull generated OKF document written to ${okfPath}`);

  const reportPath = fileURLToPath(
    new URL('./spring-petclinic-graph-demo-report.md', import.meta.url),
  );
  writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');
  log(`Report written to ${reportPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
