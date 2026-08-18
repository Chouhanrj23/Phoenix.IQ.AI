import { describe, expect, it } from 'vitest';
import {
  collectArtifactFilterErrors,
  matchesArtifactFilter,
  matchesPathPattern,
} from '../src/filter.js';

// Paths here are the real ones behind Phase 1's Aurora fixtures — the source
// ids in `packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml`
// are `repo://aurora-commerce/services/checkout`,
// `.../services/payments-adapter`, and `.../services/order-orchestrator`.

describe('matchesPathPattern — segment semantics', () => {
  it('matches an exact path', () => {
    expect(matchesPathPattern('services/checkout/pom.xml', 'services/checkout/pom.xml')).toBe(true);
  });

  it('* stays within one segment', () => {
    expect(matchesPathPattern('services/checkout', 'services/*')).toBe(true);
    expect(matchesPathPattern('services/checkout/Main.java', 'services/*')).toBe(false);
  });

  it('** spans segments', () => {
    expect(matchesPathPattern('services/checkout/src/Main.java', 'services/**')).toBe(true);
    expect(matchesPathPattern('services/checkout/src/Main.java', '**/*.java')).toBe(true);
  });

  it('** matches zero segments', () => {
    expect(matchesPathPattern('services/checkout', 'services/**')).toBe(true);
  });

  it('matches an extension across a whole tree', () => {
    expect(matchesPathPattern('services/checkout/src/Main.java', '**/*.java')).toBe(true);
    expect(matchesPathPattern('services/checkout/README.md', '**/*.java')).toBe(false);
  });

  it('? matches exactly one character', () => {
    expect(matchesPathPattern('db/V1__init.sql', 'db/V?__init.sql')).toBe(true);
    expect(matchesPathPattern('db/V12__init.sql', 'db/V?__init.sql')).toBe(false);
  });

  it('treats a pattern as a glob, not a regular expression', () => {
    // `.` is a literal, so `a.b` must not match `axb`.
    expect(matchesPathPattern('axb', 'a.b')).toBe(false);
    expect(matchesPathPattern('a.b', 'a.b')).toBe(true);
  });

  it('is indifferent to leading and trailing slashes', () => {
    expect(matchesPathPattern('services/checkout/pom.xml', '/services/checkout/pom.xml')).toBe(
      true,
    );
    expect(matchesPathPattern('services/checkout', 'services/checkout/')).toBe(true);
  });

  it('rejects an empty pattern rather than matching everything', () => {
    expect(matchesPathPattern('services/checkout/pom.xml', '')).toBe(false);
  });
});

describe('matchesPathPattern — ancestor-directory rule', () => {
  // The documented rule that makes `excludePaths: ['node_modules']` actually
  // work; without it the single most common real filter is a silent no-op.
  it('a bare directory name matches everything beneath it', () => {
    expect(matchesPathPattern('node_modules/react/index.js', 'node_modules')).toBe(true);
  });

  it('a multi-segment directory matches its subtree', () => {
    expect(matchesPathPattern('services/checkout/src/Main.java', 'services/checkout')).toBe(true);
  });

  it('does not match a sibling directory with a shared prefix string', () => {
    // `services/checkout-legacy` must not be caught by `services/checkout`:
    // the rule works on segment boundaries, not string prefixes.
    expect(matchesPathPattern('services/checkout-legacy/src/Main.java', 'services/checkout')).toBe(
      false,
    );
  });

  it('does not treat a file pattern as matching unrelated files', () => {
    expect(matchesPathPattern('services/payments-adapter/pom.xml', 'services/checkout')).toBe(
      false,
    );
  });

  it('does not apply to wildcard patterns — otherwise "direct children only" would be inexpressible', () => {
    // `services/*` matches the DIRECTORY services/checkout, but must not
    // therefore match everything under it; that is what `services/**` is for.
    expect(matchesPathPattern('services/checkout', 'services/*')).toBe(true);
    expect(matchesPathPattern('services/checkout/src/Main.java', 'services/*')).toBe(false);
    expect(matchesPathPattern('services/checkout/src/Main.java', 'services/**')).toBe(true);
  });
});

describe('matchesArtifactFilter', () => {
  const ref = { path: 'services/checkout/src/Main.java', sizeBytes: 2_048 };

  it('selects everything when the filter is omitted', () => {
    expect(matchesArtifactFilter(ref)).toBe(true);
  });

  it('selects everything when the filter is empty', () => {
    expect(matchesArtifactFilter(ref, {})).toBe(true);
  });

  it('an empty includePaths array is treated as no restriction, not "match nothing"', () => {
    expect(matchesArtifactFilter(ref, { includePaths: [] })).toBe(true);
  });

  it('include selects only matching artifacts', () => {
    expect(matchesArtifactFilter(ref, { includePaths: ['services/checkout'] })).toBe(true);
    expect(matchesArtifactFilter(ref, { includePaths: ['services/payments-adapter'] })).toBe(false);
  });

  it('exclusion always wins over inclusion', () => {
    expect(
      matchesArtifactFilter(ref, {
        includePaths: ['**/*.java'],
        excludePaths: ['services/checkout'],
      }),
    ).toBe(false);
  });

  it('drops an artifact over maxSizeBytes', () => {
    expect(matchesArtifactFilter(ref, { maxSizeBytes: 1_024 })).toBe(false);
    expect(matchesArtifactFilter(ref, { maxSizeBytes: 4_096 })).toBe(true);
  });

  it('keeps an artifact of unknown size under maxSizeBytes — size can only be enforced at read time', () => {
    expect(matchesArtifactFilter({ path: ref.path }, { maxSizeBytes: 1 })).toBe(true);
  });

  it('drops an artifact older than changedSince', () => {
    const older = { path: ref.path, lastModifiedAt: '2026-07-01T00:00:00.000Z' };
    const newer = { path: ref.path, lastModifiedAt: '2026-08-17T00:00:00.000Z' };
    expect(matchesArtifactFilter(older, { changedSince: '2026-08-01T00:00:00.000Z' })).toBe(false);
    expect(matchesArtifactFilter(newer, { changedSince: '2026-08-01T00:00:00.000Z' })).toBe(true);
  });

  it('keeps an artifact with no known mtime under changedSince — absence is not evidence of no change', () => {
    expect(
      matchesArtifactFilter({ path: ref.path }, { changedSince: '2026-08-01T00:00:00.000Z' }),
    ).toBe(true);
  });
});

describe('collectArtifactFilterErrors', () => {
  it('accepts a fully-populated filter', () => {
    expect(
      collectArtifactFilterErrors(
        {
          includePaths: ['services/**'],
          excludePaths: ['node_modules'],
          maxSizeBytes: 1_048_576,
          changedSince: '2026-08-01T00:00:00.000Z',
        },
        'filter',
      ),
    ).toEqual([]);
  });

  it('accepts an empty filter', () => {
    expect(collectArtifactFilterErrors({}, 'filter')).toEqual([]);
  });

  it('rejects a non-object', () => {
    expect(collectArtifactFilterErrors('services/**', 'filter')).toEqual([
      'filter, if present, must be an object',
    ]);
  });

  it('rejects a non-array pattern list', () => {
    expect(collectArtifactFilterErrors({ includePaths: 'services/**' }, 'filter')).toContain(
      'filter.includePaths, if present, must be an array of glob patterns',
    );
  });

  it('rejects an empty pattern with its index', () => {
    expect(collectArtifactFilterErrors({ excludePaths: ['node_modules', ''] }, 'filter')).toContain(
      'filter.excludePaths[1] must be a non-empty string',
    );
  });

  it('rejects a non-positive or fractional maxSizeBytes', () => {
    expect(collectArtifactFilterErrors({ maxSizeBytes: 0 }, 'filter')).toContain(
      'filter.maxSizeBytes, if present, must be a positive integer',
    );
    expect(collectArtifactFilterErrors({ maxSizeBytes: 1.5 }, 'filter')).toContain(
      'filter.maxSizeBytes, if present, must be a positive integer',
    );
  });

  it('rejects a non-ISO changedSince', () => {
    expect(collectArtifactFilterErrors({ changedSince: 'last tuesday' }, 'filter')).toContain(
      'filter.changedSince, if present, must be an ISO-8601 timestamp',
    );
  });
});
