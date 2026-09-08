import { describe, expect, it } from 'vitest';
import { validateSourceReferences } from '@phoenix-ai/knowledge-graph';
import { validateSourceConnector } from '../src/connector.js';
import { validateRawArtifact } from '../src/artifact.js';
import { createInMemoryDocumentSpaceConnector } from '../src/document-space-connector.js';
import type { SourceDocumentSpaceDescriptor } from '../src/descriptor.js';

const CAPTURED_AT = '2026-09-08T00:00:00.000Z';

const PAGES = [
  { path: 'payments/authorization', content: 'Meridian Pay authorization flow.' },
  { path: 'payments/refunds', content: 'Refund policy and reconciliation.' },
  { path: 'payments/refunds/draft-notes', content: 'unfinished notes' },
  { path: 'onboarding/getting-started', content: 'How new engineers get set up.' },
] as const;

function descriptor(
  overrides: Partial<SourceDocumentSpaceDescriptor> = {},
): SourceDocumentSpaceDescriptor {
  return {
    id: 'docs://confluence/payments-architecture',
    sourceType: 'technical-doc',
    label: 'Confluence: Payments Architecture',
    locator: 'docs://confluence/payments-architecture',
    documentSpace: { kind: 'wiki', spaceId: 'PAY' },
    ...overrides,
  };
}

function connector(
  options: Partial<Parameters<typeof createInMemoryDocumentSpaceConnector>[0]> = {},
) {
  return createInMemoryDocumentSpaceConnector({
    pages: [...PAGES],
    now: () => CAPTURED_AT,
    ...options,
  });
}

describe('createInMemoryDocumentSpaceConnector — shape', () => {
  it('satisfies the runtime contract check', () => {
    expect(validateSourceConnector(connector())).toEqual({ valid: true, errors: [] });
  });

  it('declares revisionPinning false by default — most document spaces have no immutable revision', () => {
    expect(connector().capabilities).toEqual({
      revisionPinning: false,
      incrementalScan: true,
      subtreeFiltering: true,
      contentHashing: true,
      binaryContent: false,
    });
  });
});

describe('ADR 0013 decision 6 — a capability declaration is a promise', () => {
  // P3-01/P3-02 documented "a connector declaring revisionPinning: false must
  // REJECT a descriptor that pins a revision" but no connector in the
  // package ever declared that flag false, so the rule was never actually
  // exercised. This is the first one that does.

  it('rejects a descriptor that pins documentSpace.revision when revisionPinning is false', async () => {
    await expect(
      connector().open(
        descriptor({ documentSpace: { kind: 'wiki', spaceId: 'PAY', revision: 'export-7' } }),
      ),
    ).rejects.toThrow(/revisionPinning: false/);
  });

  it('accepts a live descriptor with no revision', async () => {
    const session = await connector().open(descriptor());
    expect(session.revision).toBeUndefined();
    await session.close();
  });

  it('honours a pinned revision when the connector opts into revisionPinning', async () => {
    const pinned = createInMemoryDocumentSpaceConnector({
      pages: [...PAGES],
      revisionPinning: true,
      now: () => CAPTURED_AT,
    });
    expect(pinned.capabilities.revisionPinning).toBe(true);

    const session = await pinned.open(
      descriptor({ documentSpace: { kind: 'static-site', spaceId: 'PAY', revision: 'build-42' } }),
    );
    expect(session.revision).toBe('build-42');
    expect(session.source.version).toBe('build-42');
    await session.close();
  });
});

describe('ConnectorSession — document-space listing and filtering', () => {
  it('lists every page when no filter is set', async () => {
    const session = await connector().open(descriptor());
    const listed: string[] = [];
    for await (const ref of session.list()) listed.push(ref.path);
    await session.close();
    expect(listed.sort()).toEqual([
      'onboarding/getting-started',
      'payments/authorization',
      'payments/refunds',
      'payments/refunds/draft-notes',
    ]);
  });

  it('narrows by documentSpace.pathPrefix, mirroring repository.subpaths', async () => {
    const session = await connector().open(
      descriptor({ documentSpace: { kind: 'wiki', spaceId: 'PAY', pathPrefix: 'payments' } }),
    );
    const listed: string[] = [];
    for await (const ref of session.list()) listed.push(ref.path);
    await session.close();
    expect(listed.sort()).toEqual([
      'payments/authorization',
      'payments/refunds',
      'payments/refunds/draft-notes',
    ]);
  });

  it('still applies the descriptor filter on top of pathPrefix', async () => {
    const session = await connector().open(
      descriptor({
        documentSpace: { kind: 'wiki', spaceId: 'PAY', pathPrefix: 'payments' },
        filter: { excludePaths: ['payments/refunds/draft-notes'] },
      }),
    );
    const listed: string[] = [];
    for await (const ref of session.list()) listed.push(ref.path);
    await session.close();
    expect(listed.sort()).toEqual(['payments/authorization', 'payments/refunds']);
  });
});

describe('ConnectorSession — document-space reading', () => {
  it('produces a RawArtifact that passes the real validator', async () => {
    const session = await connector().open(descriptor());
    const result = await session.read({ path: 'payments/authorization' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(validateRawArtifact(result.artifact)).toEqual({ valid: true, errors: [] });
    expect(result.artifact).toMatchObject({
      sourceId: 'docs://confluence/payments-architecture',
      locator: 'docs://confluence/payments-architecture/payments/authorization',
      contentEncoding: 'utf-8',
      capturedAt: CAPTURED_AT,
    });
    expect(result.artifact.revision).toBeUndefined();
    await session.close();
  });

  it('reports not-found for an unknown page', async () => {
    const session = await connector().open(descriptor());
    const result = await session.read({ path: 'payments/does-not-exist' });
    expect(result).toEqual({
      ok: false,
      failure: { path: 'payments/does-not-exist', reason: 'not-found' },
    });
    await session.close();
  });

  it('enforces maxSizeBytes at read time', async () => {
    const session = await connector().open(descriptor({ filter: { maxSizeBytes: 5 } }));
    const result = await session.read({ path: 'payments/authorization' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('too-large');
    await session.close();
  });

  it('the resulting source and evidence resolve against each other', async () => {
    const activeConnector = connector();
    const session = await activeConnector.open(descriptor());
    const result = await session.read({ path: 'payments/authorization' });
    await session.close();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: CAPTURED_AT,
      sources: [session.source],
      objects: [],
      relationships: [],
    };
    // No objects reference the source here — this asserts the source record
    // itself is well-formed and registered, the same seam connector.test.ts
    // exercises end to end for the repository narrowing.
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });
});
