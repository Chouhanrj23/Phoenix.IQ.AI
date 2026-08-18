import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SCHEMA_VERSION,
  parseAndValidateOkfYaml,
  serializeOkfYaml,
  toOkfDocument,
  validateCanonicalKnowledgeBundle,
  validateContainerObject,
  validateOkfDocument,
  validateSourceReferences,
  type CanonicalKnowledgeBundle,
  type ContainerObject,
} from '@phoenix-ai/knowledge-graph';
import {
  collectArtifacts,
  selectConnector,
  validateSourceConnector,
  withConnectorSession,
  type ConnectorSession,
} from '../src/connector.js';
import { artifactToEvidence, validateRawArtifact } from '../src/artifact.js';
import { createInMemoryRepositoryConnector } from '../src/reference-connector.js';
import type { SourceRepositoryDescriptor } from '../src/descriptor.js';

// The checkout service is a real Phase 1 element: `ctr-checkout` ("Checkout
// Service", technology "Node.js") in the Aurora fixtures and in the P2-11
// sample OKF, sourced from the registered Source
// `repo://aurora-commerce/services/checkout`. Everything below drives the
// contract against that, not against invented data.

const CAPTURED_AT = '2026-08-17T00:00:00.000Z';

const CHECKOUT_FILES = [
  {
    path: 'src/CheckoutController.java',
    content: 'class CheckoutController { /* cart validation, order creation */ }',
    mediaType: 'text/x-java-source',
    lastModifiedAt: '2026-08-10T09:15:00.000Z',
  },
  {
    path: 'src/PaymentClient.java',
    content: 'class PaymentClient { /* calls Meridian Pay via the payments adapter */ }',
    mediaType: 'text/x-java-source',
    lastModifiedAt: '2026-06-01T09:15:00.000Z',
  },
  { path: 'pom.xml', content: '<project/>', mediaType: 'text/xml' },
  { path: 'target/checkout.jar', content: 'UEsDBAo=', contentEncoding: 'base64' as const },
  { path: 'node_modules/left-pad/index.js', content: 'module.exports = () => {};' },
] as const;

function descriptor(
  overrides: Partial<SourceRepositoryDescriptor> = {},
): SourceRepositoryDescriptor {
  return {
    id: 'repo://aurora-commerce/services/checkout',
    sourceType: 'source-code',
    label: 'aurora-commerce/services/checkout',
    locator: 'repo://aurora-commerce/services/checkout',
    repository: { kind: 'git', branch: 'main', revision: '9f2c1ab' },
    ...overrides,
  };
}

function connector(options: Partial<Parameters<typeof createInMemoryRepositoryConnector>[0]> = {}) {
  return createInMemoryRepositoryConnector({
    artifacts: [...CHECKOUT_FILES],
    now: () => CAPTURED_AT,
    ...options,
  });
}

async function paths(session: ConnectorSession): Promise<string[]> {
  const listed: string[] = [];
  for await (const ref of session.list()) listed.push(ref.path);
  return listed.sort();
}

describe('SourceConnector — shape', () => {
  it('the reference connector satisfies the runtime contract check', () => {
    expect(validateSourceConnector(connector())).toEqual({ valid: true, errors: [] });
  });

  it('rejects an object missing the lifecycle methods', () => {
    const result = validateSourceConnector({ id: 'x', sourceTypes: ['source-code'] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('supports must be a function');
    expect(result.errors).toContain('open must be a function');
    expect(result.errors).toContain('capabilities is required');
  });

  it('rejects a non-boolean capability flag — a capability is a promise, not a hint', () => {
    expect(
      validateSourceConnector({
        ...connector(),
        capabilities: { ...connector().capabilities, revisionPinning: 'yes' },
      }).errors,
    ).toContain('capabilities.revisionPinning must be a boolean');
  });

  it('declares every capability flag explicitly', () => {
    expect(connector().capabilities).toEqual({
      revisionPinning: true,
      incrementalScan: true,
      subtreeFiltering: true,
      contentHashing: true,
      binaryContent: true,
    });
  });
});

describe('selectConnector', () => {
  it('picks the connector that supports the descriptor', () => {
    const repo = connector();
    const docs = createInMemoryRepositoryConnector({
      artifacts: [],
      sourceTypes: ['technical-doc'],
    });
    expect(selectConnector([docs, repo], descriptor())).toBe(repo);
  });

  it('returns undefined when nothing supports the descriptor', () => {
    const docs = createInMemoryRepositoryConnector({
      artifacts: [],
      sourceTypes: ['technical-doc'],
    });
    expect(selectConnector([docs], descriptor())).toBeUndefined();
  });

  it('does not support a structurally invalid descriptor', () => {
    expect(connector().supports({ ...descriptor(), locator: 'aurora-commerce' })).toBe(false);
  });
});

describe('ConnectorSession — lifecycle', () => {
  it('resolves a Source with the revision it actually read', async () => {
    const session = await connector({ revision: 'ab12cd34' }).open(descriptor());
    expect(session.revision).toBe('ab12cd34');
    expect(session.source).toEqual({
      id: 'repo://aurora-commerce/services/checkout',
      type: 'source-code',
      label: 'aurora-commerce/services/checkout',
      locator: 'repo://aurora-commerce/services/checkout',
      version: 'ab12cd34',
    });
    await session.close();
  });

  it('rejects an invalid descriptor at open, not per artifact', async () => {
    await expect(connector().open({ ...descriptor(), locator: 'aurora-commerce' })).rejects.toThrow(
      /invalid descriptor/,
    );
  });

  it('close is idempotent', async () => {
    const session = await connector().open(descriptor());
    await session.close();
    await expect(session.close()).resolves.toBeUndefined();
  });

  it('refuses to list or read after close', async () => {
    const session = await connector().open(descriptor());
    await session.close();
    expect(() => session.list()).toThrow(/session is closed/);
    await expect(session.read({ path: 'pom.xml' })).rejects.toThrow(/session is closed/);
  });

  it('withConnectorSession closes the session even when the body throws', async () => {
    let captured: ConnectorSession | undefined;
    await expect(
      withConnectorSession(connector(), descriptor(), async (session) => {
        captured = session;
        throw new Error('extraction blew up');
      }),
    ).rejects.toThrow('extraction blew up');

    expect(captured).toBeDefined();
    // Proven closed by the contract's own post-close behaviour.
    expect(() => captured?.list()).toThrow(/session is closed/);
  });
});

describe('ConnectorSession — listing and filtering', () => {
  it('lists everything when no filter is set', async () => {
    const session = await connector().open(descriptor());
    expect(await paths(session)).toEqual([
      'node_modules/left-pad/index.js',
      'pom.xml',
      'src/CheckoutController.java',
      'src/PaymentClient.java',
      'target/checkout.jar',
    ]);
    await session.close();
  });

  it('applies the descriptor filter', async () => {
    const session = await connector().open(
      descriptor({ filter: { includePaths: ['**/*.java'], excludePaths: ['node_modules'] } }),
    );
    expect(await paths(session)).toEqual(['src/CheckoutController.java', 'src/PaymentClient.java']);
    await session.close();
  });

  it('excludes a build directory via the ancestor-directory rule', async () => {
    const session = await connector().open(
      descriptor({ filter: { excludePaths: ['target', 'node_modules'] } }),
    );
    expect(await paths(session)).toEqual([
      'pom.xml',
      'src/CheckoutController.java',
      'src/PaymentClient.java',
    ]);
    await session.close();
  });

  it('narrows further with a per-call filter without replacing the descriptor filter', async () => {
    const session = await connector().open(
      descriptor({ filter: { excludePaths: ['node_modules'] } }),
    );
    const listed: string[] = [];
    for await (const ref of session.list({ includePaths: ['pom.xml'] })) listed.push(ref.path);
    expect(listed).toEqual(['pom.xml']);
    await session.close();
  });

  it('honours repository.subpaths', async () => {
    const session = await connector().open(
      descriptor({ repository: { kind: 'git', subpaths: ['src'] } }),
    );
    expect(await paths(session)).toEqual(['src/CheckoutController.java', 'src/PaymentClient.java']);
    await session.close();
  });

  it('supports an incremental scan via changedSince', async () => {
    const session = await connector().open(
      descriptor({ filter: { changedSince: '2026-08-01T00:00:00.000Z' } }),
    );
    // PaymentClient.java (June) is out; pom.xml has no mtime so it stays in.
    expect(await paths(session)).toEqual([
      'node_modules/left-pad/index.js',
      'pom.xml',
      'src/CheckoutController.java',
      'target/checkout.jar',
    ]);
    await session.close();
  });

  it('reports a size for each listed artifact so a caller can skip before reading', async () => {
    const session = await connector().open(descriptor({ filter: { includePaths: ['pom.xml'] } }));
    for await (const ref of session.list()) {
      expect(ref.sizeBytes).toBe(10); // '<project/>'
    }
    await session.close();
  });
});

describe('ConnectorSession — reading', () => {
  it('produces a RawArtifact that passes the real validator', async () => {
    const session = await connector().open(descriptor());
    const result = await session.read({ path: 'src/CheckoutController.java' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(validateRawArtifact(result.artifact)).toEqual({ valid: true, errors: [] });
    expect(result.artifact).toMatchObject({
      sourceId: 'repo://aurora-commerce/services/checkout',
      locator: 'repo://aurora-commerce/services/checkout/src/CheckoutController.java',
      path: 'src/CheckoutController.java',
      contentEncoding: 'utf-8',
      revision: '9f2c1ab',
      capturedAt: CAPTURED_AT,
    });
    await session.close();
  });

  it('hashes content deterministically', async () => {
    const session = await connector().open(descriptor());
    const first = await session.read({ path: 'pom.xml' });
    const second = await session.read({ path: 'pom.xml' });
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.artifact.contentHash).toEqual(second.artifact.contentHash);
    expect(first.artifact.contentHash?.algorithm).toBe('sha256');
    await session.close();
  });

  it('returns base64 content for a binary artifact', async () => {
    const session = await connector().open(descriptor());
    const result = await session.read({ path: 'target/checkout.jar' });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.artifact.contentEncoding).toBe('base64');
    await session.close();
  });
});

describe('partial failure — the contract must not lose coverage information', () => {
  it('reports an unreadable artifact as data instead of throwing', async () => {
    const session = await connector({
      unreadablePaths: { 'src/PaymentClient.java': 'access-denied' },
    }).open(descriptor());
    const result = await session.read({ path: 'src/PaymentClient.java' });
    expect(result).toEqual({
      ok: false,
      failure: {
        path: 'src/PaymentClient.java',
        reason: 'access-denied',
        detail: 'simulated read failure',
      },
    });
    await session.close();
  });

  it('reports not-found for a path that is not in the source', async () => {
    const session = await connector().open(descriptor());
    const result = await session.read({ path: 'src/DoesNotExist.java' });
    expect(result).toEqual({
      ok: false,
      failure: { path: 'src/DoesNotExist.java', reason: 'not-found' },
    });
    await session.close();
  });

  it('collectArtifacts keeps going past a failure and reports both sides', async () => {
    const collection = await withConnectorSession(
      connector({ unreadablePaths: { 'src/PaymentClient.java': 'unreadable' } }),
      descriptor({ filter: { includePaths: ['**/*.java'], excludePaths: ['node_modules'] } }),
      (session) => collectArtifacts(session),
    );

    expect(collection.artifacts.map((artifact) => artifact.path)).toEqual([
      'src/CheckoutController.java',
    ]);
    expect(collection.failures).toEqual([
      { path: 'src/PaymentClient.java', reason: 'unreadable', detail: 'simulated read failure' },
    ]);
  });

  it('always reports a failures array, so a partial run cannot be mistaken for a complete one', async () => {
    const collection = await withConnectorSession(connector(), descriptor(), (session) =>
      collectArtifacts(session),
    );
    expect(collection.failures).toEqual([]);
  });

  it('enforces maxSizeBytes at read time when size was unknown at listing time', async () => {
    const session = await connector().open(descriptor({ filter: { maxSizeBytes: 5 } }));
    const result = await session.read({ path: 'pom.xml' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.reason).toBe('too-large');
    await session.close();
  });
});

describe('end to end — connector output feeds a valid OKF document', () => {
  // The point of the whole contract: what a connector produces must plug
  // into P2-07's Source registry and P2-09's Evidence without hand-assembly,
  // and the resulting bundle must validate and serialize as OKF (P2-10).
  it('assembles a bundle whose sources and evidence all resolve', async () => {
    const activeConnector = connector();
    const target = descriptor({
      filter: { includePaths: ['**/*.java'], excludePaths: ['node_modules'] },
    });

    const { session, collection } = await (async () => {
      const opened = await activeConnector.open(target);
      const collected = await collectArtifacts(opened);
      await opened.close();
      return { session: opened, collection: collected };
    })();

    expect(collection.artifacts).toHaveLength(2);

    // Extraction's job, stubbed here to exactly one object — this test proves
    // the ingestion-to-canonical seam, not extraction itself.
    const container: ContainerObject = {
      identity: {
        id: 'ctr-checkout',
        systemId: 'aurora-commerce',
        createdAt: CAPTURED_AT,
        updatedAt: CAPTURED_AT,
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      },
      category: 'entity',
      kind: 'architecture.container',
      label: 'Checkout Service',
      attributes: {
        responsibility: 'Orchestrates cart validation, order creation, and payment/fraud calls.',
        technology: 'Node.js',
      },
      metadata: {
        provenance: [
          {
            sourceId: session.source.id,
            sourceType: target.sourceType,
            derivedBy: activeConnector.id,
            derivedAt: CAPTURED_AT,
          },
        ],
        confidence: { level: 'high', score: 0.94 },
      },
      evidence: collection.artifacts.map((artifact, index) =>
        artifactToEvidence(artifact, { id: `ev-checkout-${index}` }),
      ),
      confidenceDetail: { basis: 'observed' },
    };

    expect(validateContainerObject(container)).toEqual({ valid: true, errors: [] });

    const bundle: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: CAPTURED_AT,
      sources: [session.source],
      objects: [container],
      relationships: [],
    };

    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    // Every evidence sourceId produced by the connector resolves against the
    // registry built from the same session — the assertion that the two
    // bridges (descriptorToSource, artifactToEvidence) agree on one id space.
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });

    const document = toOkfDocument(bundle);
    expect(validateOkfDocument(document)).toEqual({ valid: true, errors: [] });
    expect(parseAndValidateOkfYaml(serializeOkfYaml(document))).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('a source registry assembled from the session carries the resolved revision into evidence', async () => {
    const collection = await withConnectorSession(
      connector({ revision: 'ab12cd34' }),
      descriptor({ filter: { includePaths: ['pom.xml'] } }),
      (session) => collectArtifacts(session),
    );
    const [artifact] = collection.artifacts;
    expect(artifact).toBeDefined();
    if (artifact === undefined) return;
    expect(artifactToEvidence(artifact, { id: 'ev-pom' }).sourceVersion).toBe('ab12cd34');
  });

  it('an unresolved sourceId is caught, not silently accepted', async () => {
    const collection = await withConnectorSession(
      connector(),
      descriptor({ filter: { includePaths: ['pom.xml'] } }),
      (session) => collectArtifacts(session),
    );
    const [artifact] = collection.artifacts;
    if (artifact === undefined) throw new Error('expected one artifact');

    const bundle = {
      systemId: 'aurora-commerce',
      generatedAt: CAPTURED_AT,
      // Deliberately the WRONG source registered.
      sources: [{ id: 'repo://aurora-commerce', type: 'source-code' as const, label: 'root repo' }],
      objects: [
        {
          identity: {
            id: 'ctr-checkout',
            systemId: 'aurora-commerce',
            createdAt: CAPTURED_AT,
            updatedAt: CAPTURED_AT,
            schemaVersion: CANONICAL_SCHEMA_VERSION,
          },
          category: 'entity' as const,
          kind: 'architecture.container',
          label: 'Checkout Service',
          attributes: { responsibility: 'Orchestrates checkout.' },
          metadata: {
            provenance: [
              {
                sourceId: 'repo://aurora-commerce',
                sourceType: 'source-code' as const,
                derivedBy: 'in-memory-reference',
                derivedAt: CAPTURED_AT,
              },
            ],
            confidence: { level: 'high' as const },
          },
          evidence: [artifactToEvidence(artifact, { id: 'ev-pom' })],
        },
      ],
      relationships: [],
    };

    const result = validateSourceReferences(bundle);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain(
      '"repo://aurora-commerce/services/checkout" does not reference a known source',
    );
  });
});
