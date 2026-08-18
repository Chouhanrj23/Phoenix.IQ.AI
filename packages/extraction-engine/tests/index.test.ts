import { describe, expect, it } from 'vitest';
import {
  discoverJavaProject,
  extractJavaCallGraph,
  extractJavaHttp,
  extractJavaPersistence,
  extractConfigReferences,
  extractJavaProject,
  extractJavaStructure,
  bridgeJpaEntity,
  bridgeSpringController,
  buildJavaCanonicalBundle,
  mapJavaExtractionToOkfDocument,
  serializeJavaExtractionToOkfYaml,
  parseJavaSource,
} from '../src/index.js';

describe('extraction-engine barrel export', () => {
  it('re-exports the package public API from a single entry point', () => {
    expect(typeof discoverJavaProject).toBe('function');
    expect(typeof parseJavaSource).toBe('function');
    expect(typeof extractJavaStructure).toBe('function');
    expect(typeof extractJavaCallGraph).toBe('function');
    expect(typeof extractJavaHttp).toBe('function');
    expect(typeof bridgeSpringController).toBe('function');
    expect(typeof extractJavaPersistence).toBe('function');
    expect(typeof bridgeJpaEntity).toBe('function');
    expect(typeof extractConfigReferences).toBe('function');
    expect(typeof extractJavaProject).toBe('function');
    expect(typeof buildJavaCanonicalBundle).toBe('function');
    expect(typeof mapJavaExtractionToOkfDocument).toBe('function');
    expect(typeof serializeJavaExtractionToOkfYaml).toBe('function');
  });
});
