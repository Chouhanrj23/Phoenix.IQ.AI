import { describe, expect, it } from 'vitest';
import {
  ARTIFACT_FAILURE_REASONS,
  CREDENTIAL_SCHEMES,
  SOURCE_DOCUMENT_SPACE_KINDS,
  SOURCE_REPOSITORY_KINDS,
  SOURCE_TICKET_TRACKER_KINDS,
  createConnectorRegistry,
  createInMemoryDocumentSpaceConnector,
  createInMemoryRepositoryConnector,
  createJiraConnector,
  descriptorToSource,
  matchesArtifactFilter,
  renderAdfToText,
  validateSourceConnector,
  validateSourceDocumentSpaceDescriptor,
  validateSourceRepositoryDescriptor,
  validateSourceTicketTrackerDescriptor,
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

  it('exports the document-space narrowing added in P6-01', () => {
    expect(typeof validateSourceDocumentSpaceDescriptor).toBe('function');
    expect(SOURCE_DOCUMENT_SPACE_KINDS).toEqual(['wiki', 'static-site']);
    expect(validateSourceConnector(createInMemoryDocumentSpaceConnector({ pages: [] }))).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('exports the connector registry added in P6-01', () => {
    expect(typeof createConnectorRegistry).toBe('function');
    const registry = createConnectorRegistry([
      createInMemoryRepositoryConnector({ artifacts: [], id: 'repo-connector' }),
    ]);
    expect(registry.get('repo-connector')).toBeDefined();
  });

  it('exports the ticket-tracker narrowing and Jira connector added in P6-02', () => {
    expect(typeof validateSourceTicketTrackerDescriptor).toBe('function');
    expect(SOURCE_TICKET_TRACKER_KINDS).toEqual(['jira']);
    expect(typeof renderAdfToText).toBe('function');
    expect(
      validateSourceConnector(createJiraConnector({ fetchImpl: async () => new Response('{}') })),
    ).toEqual({ valid: true, errors: [] });
  });
});
