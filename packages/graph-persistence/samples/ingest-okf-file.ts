/**
 * P4-10 support script -- ingests an already-generated, real OKF YAML file
 * (e.g. `spring-petclinic-graph-demo.okf.yaml`, produced by
 * `demo-spring-petclinic-graph.ts`) into whichever Neo4j instance
 * `loadNeo4jConfig()` points at (the persistent local docker-compose
 * instance, in normal use -- NOT a fresh Testcontainers instance).
 *
 * This is what lets the P4-10 evidence trail extend past the ephemeral
 * demo run into a real, browsable API/UI check: the demo script proves the
 * full real-repository chain reproducibly; this script re-uses its exact
 * output to populate a long-lived Neo4j that `apps/api`/`apps/web` can then
 * be pointed at for a real, manual API/UI verification.
 *
 * Usage: pnpm --filter @phoenix-ai/graph-persistence exec tsx samples/ingest-okf-file.ts <path-to-okf.yaml>
 * Requires NEO4J_URI/NEO4J_USER/NEO4J_PASSWORD/NEO4J_DATABASE in the environment.
 */

import { readFileSync } from 'node:fs';
import {
  parseAndValidateOkfYaml,
  parseOkfYaml,
  type CanonicalKnowledgeBundle,
} from '@phoenix-ai/knowledge-graph';
import { mapOkfBundleToGraph } from '../src/graph-mapping.js';
import { buildGraphWriteOperations } from '../src/transform.js';
import { ingestGraphWriteOperations } from '../src/ingest.js';
import { loadNeo4jConfig } from '../src/config.js';
import { createNeo4jDriver } from '../src/neo4j-client.js';

async function main(): Promise<void> {
  const path = process.argv[2];
  if (path === undefined) {
    console.error('Usage: tsx samples/ingest-okf-file.ts <path-to-okf.yaml>');
    process.exitCode = 1;
    return;
  }

  const yamlText = readFileSync(path, 'utf8');
  const validation = parseAndValidateOkfYaml(yamlText);
  if (!validation.valid) {
    console.error('OKF document failed validation:', validation.errors);
    process.exitCode = 1;
    return;
  }
  const bundle = parseOkfYaml(yamlText) as CanonicalKnowledgeBundle;

  const config = loadNeo4jConfig();
  const driver = createNeo4jDriver(config);
  try {
    const mapping = mapOkfBundleToGraph(bundle);
    console.error(
      `Mapped ${mapping.nodes.length} nodes, ${mapping.relationships.length} relationships (${mapping.issues.length} unmappable).`,
    );
    const operations = buildGraphWriteOperations(mapping);
    const result = await ingestGraphWriteOperations(driver, config.database, operations);
    console.error(
      `Ingested ${result.nodesWritten.length} nodes, ${result.relationshipsWritten.length} relationships into ${config.uri} (database "${config.database}").`,
    );
  } finally {
    await driver.close();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
