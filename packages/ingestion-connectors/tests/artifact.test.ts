import { describe, expect, it } from 'vitest';
import {
  artifactToEvidence,
  validateArtifactFailure,
  validateArtifactRef,
  validateRawArtifact,
  type RawArtifact,
} from '../src/artifact.js';

function checkoutArtifact(overrides: Partial<RawArtifact> = {}): RawArtifact {
  return {
    sourceId: 'repo://aurora-commerce/services/checkout',
    locator: 'repo://aurora-commerce/services/checkout/src/CheckoutController.java',
    path: 'src/CheckoutController.java',
    sizeBytes: 4_096,
    mediaType: 'text/x-java-source',
    lastModifiedAt: '2026-08-10T09:15:00.000Z',
    content: 'class CheckoutController { }',
    contentEncoding: 'utf-8',
    contentHash: { algorithm: 'sha256', value: 'abc123' },
    revision: '9f2c1ab',
    capturedAt: '2026-08-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('validateArtifactRef', () => {
  it('accepts a minimal ref', () => {
    expect(validateArtifactRef({ path: 'src/CheckoutController.java' })).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects a non-object', () => {
    expect(validateArtifactRef(null)).toEqual({
      valid: false,
      errors: ['must be a non-null object'],
    });
  });

  it('requires a path', () => {
    expect(validateArtifactRef({}).errors).toContain('path is required');
  });

  it('rejects an absolute path', () => {
    expect(validateArtifactRef({ path: '/src/Main.java' }).errors).toContain(
      'path must be source-relative (no leading "/")',
    );
  });

  it('rejects Windows separators — a connector normalizes, the caller does not', () => {
    expect(validateArtifactRef({ path: 'src\\Main.java' }).errors).toContain(
      'path must use "/" separators, not "\\"',
    );
  });

  it('rejects traversal segments', () => {
    expect(validateArtifactRef({ path: 'src/../../etc/passwd' }).errors).toContain(
      'path must not contain ".." segments',
    );
  });

  it('accepts a zero-byte artifact but rejects a negative or fractional size', () => {
    expect(validateArtifactRef({ path: 'a.txt', sizeBytes: 0 }).valid).toBe(true);
    expect(validateArtifactRef({ path: 'a.txt', sizeBytes: -1 }).errors).toContain(
      'sizeBytes, if present, must be a non-negative integer',
    );
    expect(validateArtifactRef({ path: 'a.txt', sizeBytes: 1.5 }).errors).toContain(
      'sizeBytes, if present, must be a non-negative integer',
    );
  });

  it('rejects a non-ISO lastModifiedAt', () => {
    expect(validateArtifactRef({ path: 'a.txt', lastModifiedAt: 'recently' }).errors).toContain(
      'lastModifiedAt, if present, must be an ISO-8601 timestamp',
    );
  });
});

describe('validateRawArtifact', () => {
  it('accepts a fully-populated artifact', () => {
    expect(validateRawArtifact(checkoutArtifact())).toEqual({ valid: true, errors: [] });
  });

  it('accepts an artifact with only the required fields', () => {
    expect(
      validateRawArtifact({
        sourceId: 'repo://aurora-commerce',
        locator: 'repo://aurora-commerce/README.md',
        path: 'README.md',
        content: '# Aurora Commerce',
        contentEncoding: 'utf-8',
        capturedAt: '2026-08-17T00:00:00.000Z',
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  it('accepts empty content — an empty file is real content, not a missing field', () => {
    expect(validateRawArtifact(checkoutArtifact({ content: '' })).valid).toBe(true);
  });

  it('requires the provenance-substrate fields', () => {
    const result = validateRawArtifact({ path: 'src/Main.java', content: 'x' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('sourceId is required');
    expect(result.errors).toContain('locator is required');
    expect(result.errors).toContain('capturedAt must be an ISO-8601 timestamp');
  });

  it('rejects an unknown content encoding', () => {
    expect(
      validateRawArtifact({ ...checkoutArtifact(), contentEncoding: 'utf-16' }).errors,
    ).toContain('contentEncoding must be one of: utf-8, base64');
  });

  it('accepts base64 content for a binary artifact', () => {
    expect(
      validateRawArtifact(
        checkoutArtifact({
          path: 'docs/architecture-2024.pdf',
          content: 'JVBERi0xLjQK',
          contentEncoding: 'base64',
          mediaType: 'application/pdf',
        }),
      ).valid,
    ).toBe(true);
  });

  it('rejects a half-populated content hash', () => {
    expect(
      validateRawArtifact({ ...checkoutArtifact(), contentHash: { algorithm: 'sha256' } }).errors,
    ).toContain('contentHash.value is required');
  });

  it('still reports ref-level errors', () => {
    expect(validateRawArtifact(checkoutArtifact({ path: '/src/Main.java' })).errors).toContain(
      'path must be source-relative (no leading "/")',
    );
  });
});

describe('validateArtifactFailure', () => {
  it('accepts each closed reason', () => {
    for (const reason of [
      'not-found',
      'access-denied',
      'too-large',
      'unreadable',
      'transport-error',
      'other',
    ]) {
      expect(validateArtifactFailure({ path: 'src/Main.java', reason }).valid).toBe(true);
    }
  });

  it('rejects an ad-hoc reason string', () => {
    expect(validateArtifactFailure({ path: 'src/Main.java', reason: 'exploded' }).errors).toContain(
      'reason must be one of: not-found, access-denied, too-large, unreadable, transport-error, other',
    );
  });

  it('requires a path so the caller knows what was missed', () => {
    expect(validateArtifactFailure({ reason: 'unreadable' }).errors).toContain('path is required');
  });
});

describe('artifactToEvidence — the P2-09 bridge', () => {
  it('carries the fields a connector legitimately knows', () => {
    const evidence = artifactToEvidence(checkoutArtifact(), { id: 'ev-checkout-controller' });
    expect(evidence).toEqual({
      id: 'ev-checkout-controller',
      sourceId: 'repo://aurora-commerce/services/checkout',
      locator: 'repo://aurora-commerce/services/checkout/src/CheckoutController.java',
      capturedAt: '2026-08-17T00:00:00.000Z',
      sourceVersion: '9f2c1ab',
    });
  });

  it('leaves excerpt to the caller — a whole file is not an excerpt', () => {
    expect(artifactToEvidence(checkoutArtifact(), { id: 'ev-1' })).not.toHaveProperty('excerpt');
    expect(
      artifactToEvidence(checkoutArtifact(), { id: 'ev-1', excerpt: 'class CheckoutController' })
        .excerpt,
    ).toBe('class CheckoutController');
  });

  it('accepts a narrower locator for a sub-file location', () => {
    expect(
      artifactToEvidence(checkoutArtifact(), {
        id: 'ev-1',
        locator: 'repo://aurora-commerce/services/checkout/src/CheckoutController.java#L14-L22',
      }).locator,
    ).toBe('repo://aurora-commerce/services/checkout/src/CheckoutController.java#L14-L22');
  });

  it('omits sourceVersion when the connector could not pin a revision', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it
    const { revision: _revision, ...unpinned } = checkoutArtifact();
    expect(artifactToEvidence(unpinned, { id: 'ev-1' })).not.toHaveProperty('sourceVersion');
  });

  it('keeps Evidence.sourceId equal to the artifact sourceId, so it resolves against the Source registry', () => {
    const artifact = checkoutArtifact();
    expect(artifactToEvidence(artifact, { id: 'ev-1' }).sourceId).toBe(artifact.sourceId);
  });
});
