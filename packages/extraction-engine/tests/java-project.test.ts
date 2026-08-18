import { describe, expect, it } from 'vitest';
import {
  discoverJavaProject,
  parseGradleCoordinates,
  parsePomCoordinates,
} from '../src/java-project.js';
import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';

function artifact(path: string, content: string): RawArtifact {
  return {
    path,
    sourceId: 'repo://aurora-commerce/services/checkout',
    locator: `repo://aurora-commerce/services/checkout/${path}`,
    content,
    contentEncoding: 'utf-8',
    capturedAt: '2026-08-18T00:00:00.000Z',
  };
}

const POM_WITH_PARENT = `<?xml version="1.0"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <parent>
    <groupId>com.aurora.parent</groupId>
    <artifactId>aurora-parent</artifactId>
    <version>9.9.9</version>
  </parent>
  <!-- direct coordinates -->
  <groupId>com.aurora.commerce</groupId>
  <artifactId>checkout</artifactId>
  <version>1.2.3</version>
  <packaging>jar</packaging>
  <dependencies>
    <dependency>
      <groupId>com.aurora.other</groupId>
      <artifactId>other-lib</artifactId>
      <version>4.5.6</version>
    </dependency>
  </dependencies>
</project>
`;

describe('parsePomCoordinates', () => {
  it('reads only the root project element direct children, not <parent> or <dependency> blocks', () => {
    expect(parsePomCoordinates(POM_WITH_PARENT)).toEqual({
      groupId: 'com.aurora.commerce',
      artifactId: 'checkout',
      version: '1.2.3',
      packaging: 'jar',
    });
  });

  it('returns an empty object for a pom with no project element', () => {
    expect(parsePomCoordinates('<not-a-pom/>')).toEqual({});
  });
});

describe('parseGradleCoordinates', () => {
  it('reads top-level group/version assignments, Groovy and Kotlin DSL shorthand alike', () => {
    expect(parseGradleCoordinates(`group = 'com.aurora.commerce'\nversion = '2.0.0'\n`)).toEqual({
      groupId: 'com.aurora.commerce',
      version: '2.0.0',
    });
    expect(parseGradleCoordinates(`group "com.aurora.commerce"\nversion "2.0.0"\n`)).toEqual({
      groupId: 'com.aurora.commerce',
      version: '2.0.0',
    });
  });
});

describe('discoverJavaProject', () => {
  it('assigns files to the nearest ancestor Maven module and splits main/test scope', () => {
    const artifacts = [
      artifact('services/checkout/pom.xml', POM_WITH_PARENT),
      artifact(
        'services/checkout/src/main/java/com/aurora/checkout/CheckoutController.java',
        'package com.aurora.checkout;\nclass CheckoutController {}\n',
      ),
      artifact(
        'services/checkout/src/test/java/com/aurora/checkout/CheckoutControllerTest.java',
        'package com.aurora.checkout;\nclass CheckoutControllerTest {}\n',
      ),
      artifact('README.md', '# Checkout\n'),
    ];

    const layout = discoverJavaProject(artifacts);
    expect(layout.modules).toHaveLength(1);
    const module = layout.modules[0]!;
    expect(module.buildSystem).toBe('maven');
    expect(module.coordinates).toEqual({
      groupId: 'com.aurora.commerce',
      artifactId: 'checkout',
      version: '1.2.3',
      packaging: 'jar',
    });
    expect(module.mainSourceFiles).toEqual([
      'services/checkout/src/main/java/com/aurora/checkout/CheckoutController.java',
    ]);
    expect(module.testSourceFiles).toEqual([
      'services/checkout/src/test/java/com/aurora/checkout/CheckoutControllerTest.java',
    ]);
    expect(layout.unassignedJavaFiles).toEqual([]);
  });

  it('picks the nearest (most specific) build file for a nested multi-module layout', () => {
    const artifacts = [
      artifact(
        'pom.xml',
        '<project><groupId>root</groupId><artifactId>root</artifactId><version>1</version></project>',
      ),
      artifact(
        'services/checkout/pom.xml',
        '<project><groupId>com.aurora</groupId><artifactId>checkout</artifactId><version>1</version></project>',
      ),
      artifact(
        'services/checkout/src/main/java/com/aurora/checkout/Main.java',
        'package com.aurora.checkout;\nclass Main {}\n',
      ),
    ];

    const layout = discoverJavaProject(artifacts);
    expect(layout.modules).toHaveLength(2);
    const checkoutModule = layout.modules.find(
      (m) => m.buildFilePath === 'services/checkout/pom.xml',
    )!;
    expect(checkoutModule.mainSourceFiles).toEqual([
      'services/checkout/src/main/java/com/aurora/checkout/Main.java',
    ]);
    const rootModule = layout.modules.find((m) => m.buildFilePath === 'pom.xml')!;
    expect(rootModule.mainSourceFiles).toEqual([]);
  });

  it('surfaces a .java file with no ancestor build file as unassigned rather than dropping it', () => {
    const artifacts = [artifact('scripts/Standalone.java', 'class Standalone {}\n')];
    const layout = discoverJavaProject(artifacts);
    expect(layout.modules).toEqual([]);
    expect(layout.unassignedJavaFiles).toEqual(['scripts/Standalone.java']);
  });

  it('detects a Gradle module', () => {
    const artifacts = [
      artifact(
        'services/payments/build.gradle',
        "group = 'com.aurora.payments'\nversion = '3.0.0'\n",
      ),
      artifact(
        'services/payments/src/main/java/com/aurora/payments/PaymentService.java',
        'package com.aurora.payments;\nclass PaymentService {}\n',
      ),
    ];
    const layout = discoverJavaProject(artifacts);
    expect(layout.modules).toHaveLength(1);
    expect(layout.modules[0]).toMatchObject({
      buildSystem: 'gradle',
      coordinates: { groupId: 'com.aurora.payments', version: '3.0.0' },
    });
  });
});
