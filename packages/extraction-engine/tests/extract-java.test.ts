import { describe, expect, it } from 'vitest';
import { extractJavaProject, type JavaExtractionOptions } from '../src/extract-java.js';
import {
  validateCanonicalKnowledgeBundle,
  validateSourceReferences,
  type CanonicalKnowledgeBundle,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';

const SOURCE_ID = 'repo://aurora-commerce/services/checkout';

const OPTIONS: JavaExtractionOptions = {
  systemId: 'aurora-commerce',
  sourceId: SOURCE_ID,
  generatedAt: '2026-08-18T00:00:00.000Z',
};

function artifact(path: string, content: string): RawArtifact {
  return {
    path,
    sourceId: SOURCE_ID,
    locator: `${SOURCE_ID}/${path}`,
    content,
    contentEncoding: 'utf-8',
    revision: 'abc1234',
    capturedAt: '2026-08-18T00:00:00.000Z',
  };
}

const POM_XML = `<?xml version="1.0"?>
<project>
  <groupId>com.aurora.commerce</groupId>
  <artifactId>checkout</artifactId>
  <version>1.0.0</version>
  <packaging>jar</packaging>
</project>
`;

const ENTITY_JAVA = `package com.aurora.checkout;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "checkout_items")
public class CheckoutItem {
  @Id
  private Long id;
  private String sku;
}
`;

const REPOSITORY_JAVA = `package com.aurora.checkout;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CheckoutItemRepository extends JpaRepository<CheckoutItem, Long> {
  CheckoutItem findBySku(String sku);
}
`;

const CONTROLLER_JAVA = `package com.aurora.checkout;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/checkout")
public class CheckoutController {

  private final CheckoutItem item;

  public CheckoutController(CheckoutItem item) {
    this.item = item;
  }

  @GetMapping("/{id}")
  public CheckoutItem getItem(@PathVariable String id) {
    return find();
  }

  private CheckoutItem find() {
    return item;
  }
}
`;

const APPLICATION_YML = `server:\n  port: 8080\nspring:\n  application:\n    name: checkout\n`;

const ARTIFACTS: RawArtifact[] = [
  artifact('services/checkout/pom.xml', POM_XML),
  artifact('services/checkout/src/main/java/com/aurora/checkout/CheckoutItem.java', ENTITY_JAVA),
  artifact(
    'services/checkout/src/main/java/com/aurora/checkout/CheckoutController.java',
    CONTROLLER_JAVA,
  ),
  artifact(
    'services/checkout/src/main/java/com/aurora/checkout/CheckoutItemRepository.java',
    REPOSITORY_JAVA,
  ),
  artifact('services/checkout/src/main/resources/application.yml', APPLICATION_YML),
];

describe('extractJavaProject -- discovery + parsing + structural facts', () => {
  it('discovers the module and extracts structural facts for every main source file', () => {
    const result = extractJavaProject(ARTIFACTS, OPTIONS);

    expect(result.parseFailures).toEqual([]);
    expect(result.layout.modules).toHaveLength(1);
    expect(result.layout.modules[0]?.coordinates).toEqual({
      groupId: 'com.aurora.commerce',
      artifactId: 'checkout',
      version: '1.0.0',
      packaging: 'jar',
    });

    expect(result.files).toHaveLength(3);
    const item = result.files.find((f) => f.path.endsWith('CheckoutItem.java'));
    expect(item?.types[0]?.qualifiedName).toBe('com.aurora.checkout.CheckoutItem');
    expect(item?.types[0]?.fields.map((f) => f.name)).toEqual(['id', 'sku']);
  });

  it('collects a parse failure without aborting the run, and excludes that file from structural facts', () => {
    const broken = artifact(
      'services/checkout/src/main/java/com/aurora/checkout/Broken.java',
      'package com.aurora.checkout;\nclass Broken { void bad( }\n',
    );
    const result = extractJavaProject([...ARTIFACTS, broken], OPTIONS);

    expect(result.parseFailures).toHaveLength(1);
    expect(result.parseFailures[0]?.path).toBe(broken.path);
    expect(result.files.some((f) => f.path === broken.path)).toBe(false);
    expect(result.files).toHaveLength(3);
  });
});

describe('extractJavaProject -- call graph and type dependencies', () => {
  it('resolves a bare same-class call and reports a resolved field-type dependency', () => {
    const result = extractJavaProject(ARTIFACTS, OPTIONS);

    expect(
      result.calls.some(
        (c) => c.calleeQualifiedName === 'com.aurora.checkout.CheckoutController.find',
      ),
    ).toBe(true);

    expect(result.typeDependencies).toContainEqual(
      expect.objectContaining({
        fromQualifiedName: 'com.aurora.checkout.CheckoutController',
        relation: 'fieldType',
        toQualifiedName: 'com.aurora.checkout.CheckoutItem',
        unresolved: false,
      }),
    );
  });
});

describe('extractJavaProject -- REST/API extraction and bridging', () => {
  it('extracts the controller and its route', () => {
    const result = extractJavaProject(ARTIFACTS, OPTIONS);

    expect(result.controllers).toHaveLength(1);
    expect(result.controllers[0]?.routes).toEqual([
      expect.objectContaining({
        httpMethod: 'GET',
        path: '/checkout/{id}',
        handlerMethod: 'getItem',
      }),
    ]);
  });

  it('bridges the controller into a real ApiObject', () => {
    const result = extractJavaProject(ARTIFACTS, OPTIONS);

    expect(result.objects.filter((o) => o.kind === 'integration.api')).toHaveLength(1);
  });
});

describe('extractJavaProject -- database interaction extraction and bridging', () => {
  it('extracts the JPA entity and the Spring Data repository', () => {
    const result = extractJavaProject(ARTIFACTS, OPTIONS);

    expect(result.entities).toHaveLength(1);
    expect(result.entities[0]?.tableName).toBe('checkout_items');

    expect(result.repositories).toHaveLength(1);
    expect(result.repositories[0]?.entityTypeArgument).toBe('CheckoutItem');
  });

  it('bridges the entity into a real EntityObject alongside the ApiObject', () => {
    const result = extractJavaProject(ARTIFACTS, OPTIONS);

    expect(result.objects).toHaveLength(2);
    const kinds = result.objects.map((o) => o.kind).sort();
    expect(kinds).toEqual(['domain.entity', 'integration.api']);
  });
});

describe('extractJavaProject -- configuration extraction', () => {
  it('extracts application.yml config facts', () => {
    const result = extractJavaProject(ARTIFACTS, OPTIONS);

    expect(result.config).toContainEqual({
      path: 'services/checkout/src/main/resources/application.yml',
      line: 2,
      key: 'server.port',
      value: '8080',
    });
  });
});

describe('extractJavaProject -- end to end', () => {
  it('bridges into real canonical objects that assemble into a valid, source-referenced OKF bundle', () => {
    const result = extractJavaProject(ARTIFACTS, OPTIONS);

    const source: Source = {
      id: SOURCE_ID,
      type: 'source-code',
      label: 'aurora-commerce/services/checkout',
      locator: SOURCE_ID,
      version: 'abc1234',
    };

    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-18T00:00:00.000Z',
      sources: [source],
      objects: result.objects,
      relationships: result.relationships,
    };

    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('produces byte-identical objects across two runs over identical input (FR-DET-07)', () => {
    const first = extractJavaProject(ARTIFACTS, OPTIONS);
    const second = extractJavaProject(ARTIFACTS, OPTIONS);
    expect(JSON.stringify(first.objects)).toBe(JSON.stringify(second.objects));
    expect(JSON.stringify(first.calls)).toBe(JSON.stringify(second.calls));
  });
});
