import { describe, expect, it } from 'vitest';
import { parseJavaSource } from '../src/java-parser-adapter.js';
import { extractJavaStructure } from '../src/java-structure.js';
import { extractJavaCallGraph } from '../src/java-calls.js';
import {
  extractConfigReferences,
  extractPropertiesConfig,
  extractYamlConfig,
} from '../src/java-config.js';

describe('extractPropertiesConfig', () => {
  it('parses key=value lines, skipping blanks and comments', () => {
    const content = `# a comment\nserver.port=8080\n\n! another comment\napp.name = checkout\n`;
    expect(extractPropertiesConfig('application.properties', content)).toEqual([
      { path: 'application.properties', line: 2, key: 'server.port', value: '8080' },
      { path: 'application.properties', line: 5, key: 'app.name', value: 'checkout' },
    ]);
  });
});

describe('extractYamlConfig', () => {
  it('flattens nested keys with dots and lists with indices, recording each key line', () => {
    const content = `server:\n  port: 8080\napp:\n  name: checkout\n  profiles:\n    - dev\n    - prod\n`;
    const facts = extractYamlConfig('application.yml', content);
    expect(facts).toContainEqual({
      path: 'application.yml',
      line: 2,
      key: 'server.port',
      value: '8080',
    });
    expect(facts).toContainEqual({
      path: 'application.yml',
      line: 4,
      key: 'app.name',
      value: 'checkout',
    });
    expect(facts).toContainEqual({
      path: 'application.yml',
      line: 6,
      key: 'app.profiles[0]',
      value: 'dev',
    });
    expect(facts).toContainEqual({
      path: 'application.yml',
      line: 7,
      key: 'app.profiles[1]',
      value: 'prod',
    });
  });
});

const CONFIG_SOURCE = `package com.aurora.checkout;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "checkout")
public class CheckoutProperties {

  @Value("\${checkout.timeout-ms:3000}")
  private int timeoutMs;

  public void readSecret() {
    String token = System.getenv("AURORA_REPO_TOKEN");
    String region = System.getProperty("aws.region");
  }
}
`;

function structureOf(path: string, source: string) {
  const result = parseJavaSource(path, source);
  if (!result.ok) throw new Error(`fixture failed to parse: ${result.detail}`);
  return { facts: extractJavaStructure(path, source, result.cst), cst: result.cst, source };
}

describe('extractConfigReferences', () => {
  it('finds @ConfigurationProperties prefix, @Value keys/defaults, and System.getenv/getProperty call sites', () => {
    const { facts, cst, source } = structureOf('CheckoutProperties.java', CONFIG_SOURCE);
    const { calls } = extractJavaCallGraph(
      [facts],
      new Map([[facts.path, cst]]),
      new Map([[facts.path, source]]),
    );

    const references = extractConfigReferences([facts], calls);

    expect(references).toContainEqual(
      expect.objectContaining({ kind: 'configuration-properties', prefix: 'checkout' }),
    );
    expect(references).toContainEqual(
      expect.objectContaining({
        kind: 'value-annotation',
        key: 'checkout.timeout-ms',
        defaultValue: '3000',
      }),
    );
    expect(references).toContainEqual(
      expect.objectContaining({ kind: 'system-getenv', key: 'AURORA_REPO_TOKEN' }),
    );
    expect(references).toContainEqual(
      expect.objectContaining({ kind: 'system-getproperty', key: 'aws.region' }),
    );
  });
});
