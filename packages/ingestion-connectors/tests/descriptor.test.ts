import { describe, expect, it } from 'vitest';
import { validateSource, validateSources } from '@phoenix-ai/knowledge-graph';
import {
  buildArtifactLocator,
  descriptorToSource,
  isSourceLocator,
  validateSourceDescriptor,
  validateSourceDocumentSpaceDescriptor,
  validateSourceRepositoryDescriptor,
  type SourceDocumentSpaceDescriptor,
  type SourceRepositoryDescriptor,
} from '../src/descriptor.js';

// Grounded in the real source registry of
// `packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml` (P2-11):
// `repo://aurora-commerce/services/checkout` is an actual registered Source
// id there, not an invented one.
function checkoutDescriptor(
  overrides: Partial<SourceRepositoryDescriptor> = {},
): SourceRepositoryDescriptor {
  return {
    id: 'repo://aurora-commerce/services/checkout',
    sourceType: 'source-code',
    label: 'aurora-commerce/services/checkout',
    locator: 'repo://aurora-commerce/services/checkout',
    repository: { kind: 'git', branch: 'main' },
    ...overrides,
  };
}

// A wiki-shaped descriptor, illustrative rather than drawn from a real Phase
// 1 fixture (none exists yet for a document space) — the same status as
// `docs://confluence/payments-architecture` already used below in
// `validateSourceDescriptor`'s own minimal-descriptor test.
function paymentsWikiDescriptor(
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

describe('isSourceLocator', () => {
  it('accepts the locator schemes Phase 1 fixtures already use', () => {
    expect(isSourceLocator('repo://aurora-commerce')).toBe(true);
    expect(isSourceLocator('repo://aurora-commerce/services/checkout')).toBe(true);
    expect(isSourceLocator('data-model://aurora-schema.sql')).toBe(true);
    expect(isSourceLocator('openapi://aurora-commerce/payments-authorization.yaml')).toBe(true);
  });

  it('rejects a bare path with no scheme', () => {
    // `docs/architecture-2024.pdf` is a real Source id in the P2-11 sample —
    // a documented pre-existing inconsistency, not a locator this contract
    // will accept going forward. See ADR 0013 "Limitations".
    expect(isSourceLocator('docs/architecture-2024.pdf')).toBe(false);
  });

  it('rejects an uppercase scheme, a missing "//", and whitespace', () => {
    expect(isSourceLocator('REPO://aurora-commerce')).toBe(false);
    expect(isSourceLocator('repo:aurora-commerce')).toBe(false);
    expect(isSourceLocator('repo://aurora commerce')).toBe(false);
    expect(isSourceLocator('repo://')).toBe(false);
  });
});

describe('validateSourceDescriptor', () => {
  it('accepts a minimal generic descriptor', () => {
    const result = validateSourceDescriptor({
      id: 'docs://confluence/payments-architecture',
      sourceType: 'technical-doc',
      label: 'Confluence: Payments Architecture',
      locator: 'docs://confluence/payments-architecture',
    });
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects a non-object', () => {
    expect(validateSourceDescriptor('repo://aurora-commerce')).toEqual({
      valid: false,
      errors: ['must be a non-null object'],
    });
  });

  it('names every missing required field rather than failing generically', () => {
    const result = validateSourceDescriptor({});
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id is required');
    expect(result.errors).toContain('sourceType is required');
    expect(result.errors).toContain('label is required');
    expect(result.errors).toContain(
      'locator must match <scheme>://<rest>, e.g. "repo://aurora-commerce"',
    );
  });

  it('accepts a credential reference', () => {
    expect(
      validateSourceDescriptor(
        checkoutDescriptor({ credential: { scheme: 'environment', ref: 'AURORA_REPO_TOKEN' } }),
      ).valid,
    ).toBe(true);
  });

  it('requires a ref for every scheme except "none"', () => {
    expect(
      validateSourceDescriptor(checkoutDescriptor({ credential: { scheme: 'secret-store' } }))
        .errors,
    ).toContain('credential.ref is required when scheme is "secret-store"');
    expect(
      validateSourceDescriptor(checkoutDescriptor({ credential: { scheme: 'none' } })).valid,
    ).toBe(true);
  });

  it('rejects a ref supplied alongside scheme "none"', () => {
    expect(
      validateSourceDescriptor(
        checkoutDescriptor({ credential: { scheme: 'none', ref: 'AURORA_REPO_TOKEN' } }),
      ).errors,
    ).toContain('credential.ref must be omitted when scheme is "none"');
  });

  it('rejects an unknown credential scheme', () => {
    expect(
      validateSourceDescriptor({
        ...checkoutDescriptor(),
        credential: { scheme: 'inline', ref: 'ghp_xxx' },
      }).errors,
    ).toContain('credential.scheme must be one of: none, environment, secret-store');
  });

  it('propagates filter errors', () => {
    expect(
      validateSourceDescriptor({ ...checkoutDescriptor(), filter: { changedSince: 'yesterday' } })
        .errors,
    ).toContain('filter.changedSince, if present, must be an ISO-8601 timestamp');
  });
});

describe('validateSourceDescriptor — inline secrets', () => {
  // The guard exists because descriptors get logged, cached, and echoed in
  // run summaries; a pasted token in one is a real leak.
  it('rejects a top-level inline secret', () => {
    const result = validateSourceDescriptor({ ...checkoutDescriptor(), token: 'ghp_realtoken' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'token is not allowed — a descriptor must reference a credential (credential.ref), never carry one',
    );
  });

  it('rejects a nested inline secret', () => {
    const result = validateSourceDescriptor({
      ...checkoutDescriptor(),
      credential: { scheme: 'environment', ref: 'AURORA_REPO_TOKEN', password: 'hunter2' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'credential.password is not allowed — a descriptor must reference a credential (credential.ref), never carry one',
    );
  });

  it('does not reject the legitimate credential field itself', () => {
    expect(
      validateSourceDescriptor(
        checkoutDescriptor({ credential: { scheme: 'environment', ref: 'AURORA_REPO_TOKEN' } }),
      ).errors,
    ).toEqual([]);
  });

  it('cannot catch a secret stored under an innocent key — a structural guard, not a scanner', () => {
    // Documented limitation, asserted so nobody mistakes this for redaction.
    expect(validateSourceDescriptor({ ...checkoutDescriptor(), note: 'ghp_realtoken' }).valid).toBe(
      true,
    );
  });
});

describe('validateSourceRepositoryDescriptor', () => {
  it('accepts a fully-populated repository descriptor', () => {
    const result = validateSourceRepositoryDescriptor(
      checkoutDescriptor({
        repository: {
          kind: 'git',
          branch: 'main',
          revision: '9f2c1ab',
          subpaths: ['services/checkout'],
        },
        filter: { includePaths: ['**/*.java'], excludePaths: ['**/target'] },
        credential: { scheme: 'environment', ref: 'AURORA_REPO_TOKEN' },
      }),
    );
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('requires repository coordinates', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it
    const { repository: _repository, ...withoutRepository } = checkoutDescriptor();
    expect(validateSourceRepositoryDescriptor(withoutRepository).errors).toContain(
      'repository is required',
    );
  });

  it('rejects an unknown repository kind', () => {
    expect(
      validateSourceRepositoryDescriptor({
        ...checkoutDescriptor(),
        repository: { kind: 'subversion' },
      }).errors,
    ).toContain('repository.kind must be one of: git, local-directory, archive');
  });

  it('accepts a workingTreePath, so identity can be decoupled from location', () => {
    const result = validateSourceRepositoryDescriptor(
      checkoutDescriptor({
        repository: { kind: 'local-directory', workingTreePath: '/var/checkouts/checkout' },
      }),
    );
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('rejects an empty workingTreePath', () => {
    expect(
      validateSourceRepositoryDescriptor(
        checkoutDescriptor({ repository: { kind: 'local-directory', workingTreePath: '' } }),
      ).errors,
    ).toContain('repository.workingTreePath, if present, must be a non-empty string');
  });

  it('rejects an absolute subpath', () => {
    expect(
      validateSourceRepositoryDescriptor(
        checkoutDescriptor({ repository: { kind: 'git', subpaths: ['/services/checkout'] } }),
      ).errors,
    ).toContain('repository.subpaths[0] must be repository-relative (no leading "/")');
  });

  it('still reports generic descriptor errors alongside repository ones', () => {
    const result = validateSourceRepositoryDescriptor({ repository: { kind: 'git' } });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id is required');
    expect(result.errors).toContain('label is required');
  });
});

describe('validateSourceDocumentSpaceDescriptor', () => {
  it('accepts a minimal document-space descriptor', () => {
    expect(validateSourceDocumentSpaceDescriptor(paymentsWikiDescriptor())).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('accepts a fully-populated document-space descriptor', () => {
    const result = validateSourceDocumentSpaceDescriptor(
      paymentsWikiDescriptor({
        documentSpace: {
          kind: 'static-site',
          spaceId: 'PAY',
          pathPrefix: 'payments',
          revision: 'build-42',
        },
        filter: { excludePaths: ['**/*.draft'] },
      }),
    );
    expect(result).toEqual({ valid: true, errors: [] });
  });

  it('requires documentSpace coordinates', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit it
    const { documentSpace: _documentSpace, ...withoutDocumentSpace } = paymentsWikiDescriptor();
    expect(validateSourceDocumentSpaceDescriptor(withoutDocumentSpace).errors).toContain(
      'documentSpace is required',
    );
  });

  it('rejects an unknown documentSpace kind', () => {
    expect(
      validateSourceDocumentSpaceDescriptor({
        ...paymentsWikiDescriptor(),
        documentSpace: { kind: 'confluence-cloud', spaceId: 'PAY' },
      }).errors,
    ).toContain('documentSpace.kind must be one of: wiki, static-site');
  });

  it('requires spaceId', () => {
    expect(
      validateSourceDocumentSpaceDescriptor({
        ...paymentsWikiDescriptor(),
        documentSpace: { kind: 'wiki' },
      }).errors,
    ).toContain('documentSpace.spaceId is required');
  });

  it('rejects an empty pathPrefix', () => {
    expect(
      validateSourceDocumentSpaceDescriptor(
        paymentsWikiDescriptor({ documentSpace: { kind: 'wiki', spaceId: 'PAY', pathPrefix: '' } }),
      ).errors,
    ).toContain('documentSpace.pathPrefix, if present, must be a non-empty string');
  });

  it('still reports generic descriptor errors alongside document-space ones', () => {
    const result = validateSourceDocumentSpaceDescriptor({
      documentSpace: { kind: 'wiki', spaceId: 'PAY' },
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id is required');
    expect(result.errors).toContain('label is required');
  });
});

describe('descriptorToSource — the P2-07 bridge', () => {
  it('produces a Source that passes the real validateSource', () => {
    const source = descriptorToSource(checkoutDescriptor());
    expect(validateSource(source)).toEqual({ valid: true, errors: [] });
    expect(source).toEqual({
      id: 'repo://aurora-commerce/services/checkout',
      type: 'source-code',
      label: 'aurora-commerce/services/checkout',
      locator: 'repo://aurora-commerce/services/checkout',
    });
  });

  it('keeps Source.id identical to the descriptor id — one identifier space, not two', () => {
    const descriptor = checkoutDescriptor();
    expect(descriptorToSource(descriptor).id).toBe(descriptor.id);
  });

  it('prefers the revision the connector actually resolved over the one the descriptor asked for', () => {
    const descriptor = checkoutDescriptor({ repository: { kind: 'git', revision: 'main' } });
    expect(descriptorToSource(descriptor, '9f2c1ab').version).toBe('9f2c1ab');
  });

  it('falls back to the descriptor revision when nothing was resolved', () => {
    const descriptor = checkoutDescriptor({ repository: { kind: 'git', revision: '9f2c1ab' } });
    expect(descriptorToSource(descriptor).version).toBe('9f2c1ab');
  });

  it('omits version entirely rather than inventing a placeholder', () => {
    const source = descriptorToSource(checkoutDescriptor());
    expect(source).not.toHaveProperty('version');
  });

  it('never leaks the credential reference or the filter into the Source', () => {
    const source = descriptorToSource(
      checkoutDescriptor({
        credential: { scheme: 'environment', ref: 'AURORA_REPO_TOKEN' },
        filter: { excludePaths: ['node_modules'] },
      }),
    );
    expect(source).not.toHaveProperty('credential');
    expect(source).not.toHaveProperty('filter');
    expect(Object.keys(source).sort()).toEqual(['id', 'label', 'locator', 'type']);
  });

  it('falls back to a declared documentSpace.revision too, not just repository.revision', () => {
    // P6-01: `descriptorToSource` was generalized off `repository.revision`
    // alone to also read `documentSpace.revision` -- this is the case that
    // would have silently dropped the version before that change.
    const descriptor = paymentsWikiDescriptor({
      documentSpace: { kind: 'static-site', spaceId: 'PAY', revision: 'build-42' },
    });
    expect(descriptorToSource(descriptor).version).toBe('build-42');
  });

  it('produces a registry that validates as a whole', () => {
    const sources = [
      descriptorToSource(checkoutDescriptor()),
      descriptorToSource(
        checkoutDescriptor({
          id: 'repo://aurora-commerce/services/payments-adapter',
          label: 'aurora-commerce/services/payments-adapter',
          locator: 'repo://aurora-commerce/services/payments-adapter',
        }),
      ),
    ];
    expect(validateSources(sources)).toEqual({ valid: true, errors: [] });
  });
});

describe('buildArtifactLocator', () => {
  it('joins the descriptor locator with a repository-relative path', () => {
    expect(buildArtifactLocator(checkoutDescriptor(), 'src/Main.java')).toBe(
      'repo://aurora-commerce/services/checkout/src/Main.java',
    );
  });

  it('is insensitive to a trailing slash on the locator — OKF output must be deterministic', () => {
    const withSlash = checkoutDescriptor({
      locator: 'repo://aurora-commerce/services/checkout/',
    });
    expect(buildArtifactLocator(withSlash, 'src/Main.java')).toBe(
      buildArtifactLocator(checkoutDescriptor(), 'src/Main.java'),
    );
  });

  it('is insensitive to a leading slash on the path', () => {
    expect(buildArtifactLocator(checkoutDescriptor(), '/src/Main.java')).toBe(
      'repo://aurora-commerce/services/checkout/src/Main.java',
    );
  });

  it('returns the bare locator for an empty path', () => {
    expect(buildArtifactLocator(checkoutDescriptor(), '')).toBe(
      'repo://aurora-commerce/services/checkout',
    );
  });
});
