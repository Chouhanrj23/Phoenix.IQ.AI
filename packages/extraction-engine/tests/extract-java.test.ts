import { describe, expect, it } from 'vitest';
import { extractJavaProject } from '../src/extract-java.js';
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
  <packaging>jar</packaging>
</project>
`;

const ENTITY_JAVA = `package com.aurora.checkout;

public class CheckoutItem {
  private Long id;
  private String sku;
}
`;

const ARTIFACTS: RawArtifact[] = [
  artifact('services/checkout/pom.xml', POM_XML),
  artifact('services/checkout/src/main/java/com/aurora/checkout/CheckoutItem.java', ENTITY_JAVA),
];

describe('extractJavaProject -- discovery + parsing + structural facts', () => {
  it('discovers the module and extracts structural facts for every main source file', () => {
    const result = extractJavaProject(ARTIFACTS);

    expect(result.parseFailures).toEqual([]);
    expect(result.layout.modules).toHaveLength(1);
    expect(result.layout.modules[0]?.coordinates).toEqual({
      groupId: 'com.aurora.commerce',
      artifactId: 'checkout',
      version: '1.0.0',
      packaging: 'jar',
    });

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.types[0]?.qualifiedName).toBe('com.aurora.checkout.CheckoutItem');
    expect(result.files[0]?.types[0]?.fields.map((f) => f.name)).toEqual(['id', 'sku']);
  });

  it('collects a parse failure without aborting the run, and excludes that file from structural facts', () => {
    const broken = artifact(
      'services/checkout/src/main/java/com/aurora/checkout/Broken.java',
      'package com.aurora.checkout;\nclass Broken { void bad( }\n',
    );
    const result = extractJavaProject([...ARTIFACTS, broken]);

    expect(result.parseFailures).toHaveLength(1);
    expect(result.parseFailures[0]?.path).toBe(broken.path);
    expect(result.files.some((f) => f.path === broken.path)).toBe(false);
    expect(result.files).toHaveLength(1);
  });
});
