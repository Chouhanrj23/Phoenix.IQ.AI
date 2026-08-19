import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createGitRepositoryConnector,
  collectArtifacts,
  withConnectorSession,
  type SourceRepositoryDescriptor,
} from '@phoenix-ai/ingestion-connectors';
import {
  validateApiObject,
  validateCanonicalKnowledgeBundle,
  validateEntityObject,
  validateSourceReferences,
  parseAndValidateOkfYaml,
  serializeOkfYaml,
} from '@phoenix-ai/knowledge-graph';
import { extractJavaProject } from '../src/extract-java.js';
import { buildJavaCanonicalBundle, mapJavaExtractionToOkfDocument } from '../src/okf-mapping.js';

/**
 * P3-12 -- the one test the Phase 3 audit found missing: a single,
 * automated (`vitest`, runs in CI, no manual step) test chaining the REAL
 * pipeline end to end --
 *
 *   real git repository (created here with actual `git` commands, exactly
 *   `ingestion-connectors/tests/git-connector.test.ts`'s own convention)
 *     -> real git ingestion (`createGitRepositoryConnector`, P3-02)
 *     -> real Java discovery + parsing + structural/call/HTTP/persistence
 *        extraction (`extractJavaProject`, P3-03 through P3-08 -- the
 *        actual production functions, not fixtures standing in for them)
 *     -> real canonical-object bridging + OKF mapping (`buildJavaCanonicalBundle`/
 *        `mapJavaExtractionToOkfDocument`, P3-09)
 *     -> real OKF YAML serialization and round-trip validation
 *        (`serializeOkfYaml`/`parseAndValidateOkfYaml`, P2-10, unmodified)
 *
 * Every prior test in this package (`extract-java.test.ts`, `okf-mapping.test.ts`,
 * ...) proves one stage, or the extraction family, against hand-built
 * `RawArtifact`s that skip real git entirely. `git-connector.test.ts`'s own
 * "end to end" test proves real git ingestion through OKF validation, but
 * with a hand-built `ContainerObject` standing in for real Java extraction.
 * Neither proves the two halves connected -- this test is that connection,
 * and only that: it exercises the SAME already-shipped P3-01 through P3-10
 * functions every other test does, wired together, nothing added or mocked.
 *
 * Local, not remote: `kind: 'local-directory'` against a real temp git
 * repository, matching `git-connector.test.ts`'s own established pattern --
 * deterministic, no network dependency, no external service, no
 * developer-specific path (`mkdtempSync(tmpdir())`, cleaned up in `afterAll`).
 */

const COMMIT_DATE = '2026-08-20T09:00:00+00:00';

let repoRoot: string;
let headRevision: string;

function git(args: readonly string[], cwd: string): string {
  return execFileSync('git', [...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: 'Phoenix Test',
      GIT_AUTHOR_EMAIL: 'test@example.invalid',
      GIT_COMMITTER_NAME: 'Phoenix Test',
      GIT_COMMITTER_EMAIL: 'test@example.invalid',
      GIT_AUTHOR_DATE: COMMIT_DATE,
      GIT_COMMITTER_DATE: COMMIT_DATE,
    },
  });
}

function write(relativePath: string, content: string): void {
  const absolute = join(repoRoot, relativePath);
  mkdirSync(join(absolute, '..'), { recursive: true });
  writeFileSync(absolute, content, 'utf8');
}

/** A `file://` locator for a local path -- the descriptor contract requires `<scheme>://<rest>`. */
function fileLocator(path: string): string {
  return `file://${path.replace(/\\/g, '/')}`;
}

const POM_XML = `<?xml version="1.0"?>
<project>
  <groupId>com.phoenix.sample</groupId>
  <artifactId>catalog-service</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>
</project>
`;

// A real JPA entity: package + class + fields, exercising P3-04 (structural
// facts) and P3-07 (persistence extraction).
const PRODUCT_JAVA = `package com.phoenix.sample.catalog;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "products")
public class Product {
  @Id
  private Long id;
  private String sku;
  private String name;
}
`;

// A real Spring Data repository, exercising P3-07's repository detection.
const PRODUCT_REPOSITORY_JAVA = `package com.phoenix.sample.catalog;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, Long> {
  Product findBySku(String sku);
}
`;

// A real Spring MVC controller whose handler method calls a private helper
// -- a real call-graph edge (P3-05) -- and whose route carries a real
// @PathVariable (P3-06).
const PRODUCT_CONTROLLER_JAVA = `package com.phoenix.sample.catalog;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/products")
public class ProductController {

  private final ProductRepository repository;

  public ProductController(ProductRepository repository) {
    this.repository = repository;
  }

  @GetMapping("/{sku}")
  public Product getBySku(@PathVariable String sku) {
    return lookup(sku);
  }

  private Product lookup(String sku) {
    return repository.findBySku(sku);
  }
}
`;

const APPLICATION_YML = `spring:\n  application:\n    name: catalog-service\n`;

beforeAll(() => {
  repoRoot = mkdtempSync(join(tmpdir(), 'phoenix-pipeline-e2e-'));

  git(['init', '-b', 'main'], repoRoot);
  git(['config', 'user.name', 'Phoenix Test'], repoRoot);
  git(['config', 'user.email', 'test@example.invalid'], repoRoot);

  write('pom.xml', POM_XML);
  write('src/main/java/com/phoenix/sample/catalog/Product.java', PRODUCT_JAVA);
  write('src/main/java/com/phoenix/sample/catalog/ProductRepository.java', PRODUCT_REPOSITORY_JAVA);
  write('src/main/java/com/phoenix/sample/catalog/ProductController.java', PRODUCT_CONTROLLER_JAVA);
  write('src/main/resources/application.yml', APPLICATION_YML);

  git(['add', '--all'], repoRoot);
  git(['commit', '-m', 'Catalog service: Product entity, repository, and controller'], repoRoot);
  headRevision = git(['rev-parse', 'HEAD'], repoRoot).trim();
});

afterAll(() => {
  if (repoRoot !== undefined) rmSync(repoRoot, { recursive: true, force: true });
});

describe('full pipeline — real git ingestion through OKF validation', () => {
  it('ingests a real repository, extracts real Java facts, maps them to the canonical model, and produces a valid OKF document', async () => {
    const SOURCE_ID = 'repo://catalog-service';
    const descriptor: SourceRepositoryDescriptor = {
      id: SOURCE_ID,
      sourceType: 'source-code',
      label: 'catalog-service (pipeline-e2e fixture)',
      locator: fileLocator(repoRoot),
      repository: { kind: 'local-directory' },
      filter: {
        includePaths: ['**/*.java', '**/pom.xml', '**/application*.yml'],
      },
    };

    const connector = createGitRepositoryConnector();

    // --- Stage 1: real git ingestion (P3-02) ---
    const { collection, revision, source } = await withConnectorSession(
      connector,
      descriptor,
      async (session) => ({
        collection: await collectArtifacts(session),
        revision: session.revision,
        source: session.source,
      }),
    );

    expect(collection.failures).toEqual([]);
    expect(collection.artifacts.length).toBeGreaterThan(0);
    expect(revision).toBe(headRevision);
    const javaArtifactPaths = collection.artifacts
      .map((a) => a.path)
      .filter((p) => p.endsWith('.java'));
    expect(javaArtifactPaths).toHaveLength(3);
    expect(javaArtifactPaths).toContain('src/main/java/com/phoenix/sample/catalog/Product.java');

    // --- Stage 2/3: real Java discovery + parsing + structural/call/HTTP/persistence extraction (P3-03 through P3-08) ---
    const generatedAt = '2026-08-20T10:00:00.000Z';
    const result = extractJavaProject(collection.artifacts, {
      systemId: 'catalog-service',
      sourceId: SOURCE_ID,
      generatedAt,
      ...(revision === undefined ? {} : { sourceVersion: revision }),
    });

    // Java source discovery: the module was found via the real pom.xml.
    expect(result.layout.modules).toHaveLength(1);
    expect(result.layout.modules[0]?.coordinates?.artifactId).toBe('catalog-service');

    // Java parsing: every file parsed, none failed.
    expect(result.parseFailures).toEqual([]);
    expect(result.files).toHaveLength(3);

    // Structural extraction: real types, with real methods.
    const controllerFile = result.files.find((f) => f.path.endsWith('ProductController.java'));
    expect(controllerFile?.types[0]?.simpleName).toBe('ProductController');
    expect(controllerFile?.types[0]?.methods.map((m) => m.name)).toEqual(
      expect.arrayContaining(['getBySku', 'lookup']),
    );

    // Method/dependency extraction: a real call graph edge from the handler to its private helper.
    expect(
      result.calls.some((call) => call.callerMethod === 'getBySku' && call.calleeName === 'lookup'),
    ).toBe(true);

    // REST/API extraction: one controller, one real route with a real path variable.
    expect(result.controllers).toHaveLength(1);
    expect(result.controllers[0]?.qualifiedName).toBe(
      'com.phoenix.sample.catalog.ProductController',
    );
    expect(result.controllers[0]?.routes).toHaveLength(1);
    expect(result.controllers[0]?.routes[0]).toMatchObject({
      httpMethod: 'GET',
      path: '/products/{sku}',
      handlerMethod: 'getBySku',
    });

    // Database interaction extraction: one JPA entity, one repository, correctly linked.
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]).toMatchObject({
      qualifiedName: 'com.phoenix.sample.catalog.Product',
      tableName: 'products',
      idFields: ['id'],
    });
    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0]?.entityTypeArgument).toBe('Product');

    // Provenance: every fact carries which source, which revision, derived by what, and when.
    expect(result.entities[0]?.provenance).toEqual({
      sourceId: SOURCE_ID,
      sourceVersion: revision,
      derivedBy: 'extraction-engine',
      derivedAt: generatedAt,
    });

    // --- Stage 4: canonical mapping (P3-06/P3-07 bridges) ---
    expect(result.objects).toHaveLength(2);
    const apiObject = result.objects.find((o) => o.kind === 'integration.api');
    const entityObject = result.objects.find((o) => o.kind === 'domain.entity');
    expect(validateApiObject(apiObject)).toEqual({ valid: true, errors: [] });
    expect(validateEntityObject(entityObject)).toEqual({ valid: true, errors: [] });
    // Provenance/evidence on the bridged object trace back to the SAME real revision git resolved, not a fixture value.
    expect(entityObject?.metadata.provenance[0]).toMatchObject({
      sourceId: SOURCE_ID,
      derivedBy: 'extraction-engine',
    });
    expect(entityObject?.evidence[0]?.sourceVersion).toBe(revision);
    expect(entityObject?.confidenceDetail).toEqual({ basis: 'observed' });

    // --- Stage 5: OKF mapping, serialization, and schema validation (P3-09, P2-10) ---
    const mappingOptions = { systemId: 'catalog-service', generatedAt, sources: [source] };
    const bundle = buildJavaCanonicalBundle(result, mappingOptions);
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });

    const document = mapJavaExtractionToOkfDocument(result, mappingOptions);
    const yamlText = serializeOkfYaml(document);
    expect(yamlText).toContain('kind: integration.api');
    expect(yamlText).toContain('kind: domain.entity');

    const roundTrip = parseAndValidateOkfYaml(yamlText);
    expect(roundTrip).toEqual({ valid: true, errors: [] });
  });
});
