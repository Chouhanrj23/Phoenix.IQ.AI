import { describe, expect, it } from 'vitest';
import { extractJavaProject } from '../src/extract-java.js';
import {
  buildJavaCanonicalBundle,
  mapJavaExtractionToOkfDocument,
  serializeJavaExtractionToOkfYaml,
} from '../src/okf-mapping.js';
import {
  parseAndValidateOkfYaml,
  validateCanonicalKnowledgeBundle,
  validateOkfDocument,
  validateSourceReferences,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';

const SOURCE_ID = 'repo://aurora-commerce/services/checkout';

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
}
`;

const CONTROLLER_JAVA = `package com.aurora.checkout;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/checkout")
public class CheckoutController {
  @GetMapping("/{id}")
  public CheckoutItem getItem() {
    return null;
  }
}
`;

const ARTIFACTS: RawArtifact[] = [
  artifact('services/checkout/pom.xml', POM_XML),
  artifact('services/checkout/src/main/java/com/aurora/checkout/CheckoutItem.java', ENTITY_JAVA),
  artifact(
    'services/checkout/src/main/java/com/aurora/checkout/CheckoutController.java',
    CONTROLLER_JAVA,
  ),
];

const GENERATED_AT = '2026-08-18T00:00:00.000Z';

const SOURCE: Source = {
  id: SOURCE_ID,
  type: 'source-code',
  label: 'aurora-commerce/services/checkout',
  locator: SOURCE_ID,
  version: 'abc1234',
};

function extract() {
  return extractJavaProject(ARTIFACTS, {
    systemId: 'aurora-commerce',
    sourceId: SOURCE_ID,
    generatedAt: GENERATED_AT,
  });
}

describe('buildJavaCanonicalBundle', () => {
  it('wraps the extraction result objects/relationships into a valid bundle', () => {
    const result = extract();
    const bundle = buildJavaCanonicalBundle(result, {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
      sources: [SOURCE],
    });

    expect(bundle.objects).toBe(result.objects);
    expect(bundle.relationships).toBe(result.relationships);
    expect(bundle.sources).toEqual([SOURCE]);
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('omits sources entirely when none are given, rather than an empty array', () => {
    const result = extract();
    const bundle = buildJavaCanonicalBundle(result, {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
    });
    expect(bundle).not.toHaveProperty('sources');
  });
});

describe('mapJavaExtractionToOkfDocument', () => {
  it('produces a real, valid OkfDocument', () => {
    const result = extract();
    const document = mapJavaExtractionToOkfDocument(result, {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
      sources: [SOURCE],
    });

    expect(document.okfVersion).toBeTruthy();
    expect(validateOkfDocument(document)).toEqual({ valid: true, errors: [] });
  });
});

describe('serializeJavaExtractionToOkfYaml', () => {
  it('produces YAML that round-trips through the real OKF parser/validator', () => {
    const result = extract();
    const yamlText = serializeJavaExtractionToOkfYaml(result, {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
      sources: [SOURCE],
    });

    expect(yamlText).toContain('systemId: aurora-commerce');
    expect(parseAndValidateOkfYaml(yamlText)).toEqual({ valid: true, errors: [] });
  });
});
