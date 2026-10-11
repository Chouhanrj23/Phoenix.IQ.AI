import { describe, expect, it } from 'vitest';
import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import { detectSecrets, redactArtifacts } from '../src/index.js';

/**
 * P8 security hardening — regression tests for defects found in the gate.
 */

describe('the gate scans hostile input in linear time (P8)', () => {
  // Each of these stalled or crawled before the patterns were bounded: a
  // 40 KB `a.a.a.…` did not finish in five minutes. 100 KB inputs and a
  // 10 s budget keep the test decisive (the old code would need hours)
  // while staying robust to a loaded CI machine running every suite at once.
  const ADVERSARIAL: Record<string, string> = {
    'dotted run': 'a.'.repeat(50_000),
    'long word': 'a'.repeat(100_000),
    'email-shaped near miss': `${'a.b-'.repeat(25_000)}@x`,
    'unterminated quoted secret': `password = "${'a'.repeat(100_000)}`,
    'scheme-like near miss': `http://${'a'.repeat(100_000)}:`,
    'minified code': 'var a=1;'.repeat(12_500),
    'many secret keys, no values': 'password.'.repeat(11_000),
  };

  for (const [name, content] of Object.entries(ADVERSARIAL)) {
    for (const path of ['bundle.min.js', 'application.properties']) {
      it(`${name} (${content.length} chars, ${path}) finishes promptly`, () => {
        const started = performance.now();
        detectSecrets(content, path);
        expect(performance.now() - started).toBeLessThan(10_000);
      });
    }
  }
});

describe('the exact value is removed, never a look-alike elsewhere on the line (P8)', () => {
  it('redacts the value, not an identical string in a trailing comment', () => {
    const content = 'db.password=abc123   # abc123 was the old default\n';
    const [detection] = detectSecrets(content, 'application.properties');
    expect(detection).toEqual({ kind: 'assigned-secret', start: 12, end: 18 });

    const artifact: RawArtifact = {
      sourceId: 'repo://acme/app',
      path: 'application.properties',
      locator: 'repo://acme/app/application.properties',
      content,
      contentEncoding: 'utf-8',
      capturedAt: '2026-10-06T00:00:00.000Z',
    };
    const [passed] = redactArtifacts([artifact]).passed;
    expect(passed?.content).toMatch(
      /^db\.password=\[REDACTED:assigned-secret:[0-9a-f]{12}\] {3}# abc123 was the old default\n$/,
    );
  });

  it('excludes trailing blanks from an unquoted value', () => {
    const content = 'api_key: s3cr3t-value   \n';
    const [detection] = detectSecrets(content, 'config.yml');
    expect(content.slice(detection?.start, detection?.end)).toBe('s3cr3t-value');
  });
});

describe('detection coverage is unchanged by the bounds', () => {
  it.each([
    ['spring.datasource.password=petclinic', 'application.properties', 'petclinic'],
    ['const API_SECRET = "v@lue-1";', 'App.ts', 'v@lue-1'],
    ['postgres://admin:hunter22@db.internal:5432/app', 'notes.md', 'hunter22'],
    ['owner: first.last+tag@sub.example.co.uk', 'CODEOWNERS', 'first.last+tag@sub.example.co.uk'],
  ])('%s', (content, path, value) => {
    const [detection] = detectSecrets(content, path);
    expect(content.slice(detection?.start, detection?.end)).toBe(value);
  });
});

describe('redaction cost stays linear in the number of findings (P8 performance)', () => {
  function artifactWithEmails(count: number): RawArtifact {
    return {
      sourceId: 'repo://acme/app',
      path: 'owners.txt',
      locator: 'repo://acme/app/owners.txt',
      content: Array.from({ length: count }, (_, i) => `owner_${i} = user${i}@example.com`).join(
        '\n',
      ),
      contentEncoding: 'utf-8',
      capturedAt: '2026-10-07T00:00:00.000Z',
    };
  }

  it('redacts 40,000 findings (~1.4 MB) promptly — it took ~11 s for 20,000 before', () => {
    const started = performance.now();
    const result = redactArtifacts([artifactWithEmails(40_000)]);
    expect(result.findings).toHaveLength(40_000);
    expect(performance.now() - started).toBeLessThan(10_000);
  });

  it('still reports the exact line of every finding', () => {
    const result = redactArtifacts([artifactWithEmails(500)]);
    expect(result.findings.map((f) => f.line)).toEqual(
      Array.from({ length: 500 }, (_, i) => i + 1),
    );
  });
});
