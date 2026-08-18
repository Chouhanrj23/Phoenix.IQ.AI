import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_FAILURE_REASONS,
  CREDENTIAL_SCHEMES,
  SOURCE_REPOSITORY_KINDS,
  createInMemoryRepositoryConnector,
  descriptorToSource,
  matchesArtifactFilter,
  validateSourceConnector,
  validateSourceRepositoryDescriptor,
} from '../src/index.js';

// P3-01 replaced the scaffold's MODULE_NAME/placeholder() with the real
// connector contract (see descriptor.test.ts, artifact.test.ts,
// filter.test.ts, connector.test.ts for the substantive coverage) — the same
// thing P2-01 did to packages/knowledge-graph's scaffold. This file just
// confirms the package's public entry point re-exports each part of the
// contract, since a consumer imports from the package root, not from files.

describe('@phoenix-ai/ingestion-connectors entry point', () => {
  it('exports the descriptor contract', () => {
    expect(typeof validateSourceRepositoryDescriptor).toBe('function');
    expect(typeof descriptorToSource).toBe('function');
    expect(SOURCE_REPOSITORY_KINDS).toEqual(['git', 'local-directory', 'archive']);
    expect(CREDENTIAL_SCHEMES).toEqual(['none', 'environment', 'secret-store']);
  });

  it('exports the artifact contract', () => {
    expect(ARTIFACT_FAILURE_REASONS).toContain('too-large');
  });

  it('exports the filter semantics', () => {
    expect(
      matchesArtifactFilter({ path: 'node_modules/x.js' }, { excludePaths: ['node_modules'] }),
    ).toBe(false);
  });

  it('exports the connector contract and its reference implementation', () => {
    expect(validateSourceConnector(createInMemoryRepositoryConnector({ artifacts: [] }))).toEqual({
      valid: true,
      errors: [],
    });
  });
});
