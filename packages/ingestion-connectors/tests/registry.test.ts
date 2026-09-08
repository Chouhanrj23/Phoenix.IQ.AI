import { describe, expect, it } from 'vitest';
import {
  AmbiguousConnectorError,
  ConnectorRegistrationError,
  NoMatchingConnectorError,
  createConnectorRegistry,
} from '../src/registry.js';
import { createInMemoryRepositoryConnector } from '../src/reference-connector.js';
import { createInMemoryDocumentSpaceConnector } from '../src/document-space-connector.js';
import type { SourceRepositoryDescriptor } from '../src/descriptor.js';

function repoDescriptor(
  overrides: Partial<SourceRepositoryDescriptor> = {},
): SourceRepositoryDescriptor {
  return {
    id: 'repo://aurora-commerce/services/checkout',
    sourceType: 'source-code',
    label: 'aurora-commerce/services/checkout',
    locator: 'repo://aurora-commerce/services/checkout',
    repository: { kind: 'git' },
    ...overrides,
  };
}

const wikiDescriptor = {
  id: 'docs://confluence/payments-architecture',
  sourceType: 'technical-doc' as const,
  label: 'Confluence: Payments Architecture',
  locator: 'docs://confluence/payments-architecture',
  documentSpace: { kind: 'wiki' as const, spaceId: 'PAY' },
};

describe('createConnectorRegistry — construction', () => {
  it('accepts a set of connectors with distinct ids', () => {
    const repo = createInMemoryRepositoryConnector({ artifacts: [], id: 'repo-connector' });
    const docs = createInMemoryDocumentSpaceConnector({ pages: [], id: 'docs-connector' });
    const registry = createConnectorRegistry([repo, docs]);
    expect(registry.connectors).toEqual([repo, docs]);
  });

  it('rejects a duplicate connector id', () => {
    const first = createInMemoryRepositoryConnector({ artifacts: [], id: 'dup' });
    const second = createInMemoryRepositoryConnector({
      artifacts: [],
      id: 'dup',
      sourceTypes: ['technical-doc'],
    });
    expect(() => createConnectorRegistry([first, second])).toThrow(ConnectorRegistrationError);
    expect(() => createConnectorRegistry([first, second])).toThrow(/duplicate connector id "dup"/);
  });

  it('rejects a structurally invalid connector rather than deferring to resolve() time', () => {
    const malformed = { id: 'broken', sourceTypes: ['source-code'] };
    expect(() => createConnectorRegistry([malformed as never])).toThrow(ConnectorRegistrationError);
    expect(() => createConnectorRegistry([malformed as never])).toThrow(
      /not a valid SourceConnector/,
    );
  });
});

describe('createConnectorRegistry — get', () => {
  it('looks up a registered connector by id', () => {
    const repo = createInMemoryRepositoryConnector({ artifacts: [], id: 'repo-connector' });
    const registry = createConnectorRegistry([repo]);
    expect(registry.get('repo-connector')).toBe(repo);
  });

  it('returns undefined for an unregistered id', () => {
    const registry = createConnectorRegistry([]);
    expect(registry.get('nope')).toBeUndefined();
  });
});

describe('createConnectorRegistry — resolve', () => {
  it('resolves the one connector that supports a descriptor', () => {
    const repo = createInMemoryRepositoryConnector({ artifacts: [], id: 'repo-connector' });
    const docs = createInMemoryDocumentSpaceConnector({ pages: [], id: 'docs-connector' });
    const registry = createConnectorRegistry([repo, docs]);

    expect(registry.resolve(repoDescriptor())).toBe(repo);
    expect(registry.resolve(wikiDescriptor)).toBe(docs);
  });

  it('throws NoMatchingConnectorError when nothing supports the descriptor', () => {
    const docs = createInMemoryDocumentSpaceConnector({ pages: [], id: 'docs-connector' });
    const registry = createConnectorRegistry([docs]);
    expect(() => registry.resolve(repoDescriptor())).toThrow(NoMatchingConnectorError);
    expect(() => registry.resolve(repoDescriptor())).toThrow(
      /no registered connector supports descriptor "repo:\/\/aurora-commerce\/services\/checkout"/,
    );
  });

  it('throws AmbiguousConnectorError, naming both ids, instead of silently picking the first match', () => {
    const first = createInMemoryRepositoryConnector({ artifacts: [], id: 'repo-connector-a' });
    const second = createInMemoryRepositoryConnector({ artifacts: [], id: 'repo-connector-b' });
    const registry = createConnectorRegistry([first, second]);

    let caught: unknown;
    try {
      registry.resolve(repoDescriptor());
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(AmbiguousConnectorError);
    expect((caught as AmbiguousConnectorError).connectorIds).toEqual([
      'repo-connector-a',
      'repo-connector-b',
    ]);
  });
});
