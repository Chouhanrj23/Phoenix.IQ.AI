import { describe, expect, it } from 'vitest';
import { inspect } from 'node:util';
import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import {
  assertRedactionGatePassed,
  createRedactionVault,
  detectSecrets,
  hasPassedRedactionGate,
  redactArtifacts,
  RedactionGateBypassError,
} from '../src/index.js';

function artifact(
  path: string,
  content: string,
  overrides: Partial<RawArtifact> = {},
): RawArtifact {
  return {
    sourceId: 'repo://acme/app',
    path,
    locator: `repo://acme/app/${path}`,
    content,
    contentEncoding: 'utf-8',
    capturedAt: '2026-10-06T00:00:00.000Z',
    ...overrides,
  };
}

const AWS_KEY = 'AKIAABCDEFGHIJKLMNOP';
const GITHUB_TOKEN = `ghp_${'a1B2'.repeat(9)}`;
const PRIVATE_KEY = [
  '-----BEGIN RSA PRIVATE KEY-----',
  'MIIBOgIBAAJBAKj34GkxFhD90vcNLYLInFEX6Ppy1tPf9Cnzj4p4WGeKLs1Pt8Qu',
  'KUpRKfFLfRYC9AIKjbJTWit+CqvjWYzvQwECAwEAAQ==',
  '-----END RSA PRIVATE KEY-----',
].join('\n');

describe('detectSecrets (FR-SEC-01)', () => {
  it.each([
    ['aws-access-key-id', `key = ${AWS_KEY}`, AWS_KEY],
    ['github-token', `token: ${GITHUB_TOKEN}`, GITHUB_TOKEN],
    ['url-credential', 'jdbc:postgresql://admin:s3cr3t@db:5432/app', 's3cr3t'],
    ['email-address', 'Contact owner jane.doe@example.com today', 'jane.doe@example.com'],
  ])('detects %s and removes exactly the value', (kind, content, value) => {
    const [detection] = detectSecrets(content, 'notes.txt');
    expect(detection?.kind).toBe(kind);
    expect(content.slice(detection?.start, detection?.end)).toBe(value);
  });

  it('removes only the VALUE of a quoted secret assignment, in code', () => {
    const content = 'String dbPassword = "hunter2";';
    const [detection] = detectSecrets(content, 'App.java');
    expect(content.slice(detection?.start, detection?.end)).toBe('hunter2');
  });

  it('treats an unquoted assignment as a secret only in config files', () => {
    const code = 'String password = request.getParameter("p");';
    expect(detectSecrets(code, 'Login.java')).toEqual([]);

    const config = 'spring.datasource.password=petclinic\nspring.datasource.username=pc\n';
    const [detection] = detectSecrets(config, 'src/main/resources/application.properties');
    expect(config.slice(detection?.start, detection?.end)).toBe('petclinic');
  });

  it('leaves references to secrets intact — they carry structure, not secrets', () => {
    const config = 'db.password=${DB_PASSWORD}\napi_key: <your-key>\ntoken = "{{ token }}"\n';
    expect(detectSecrets(config, 'application.yml')).toEqual([]);
  });

  it('does not mistake package specifiers or annotations for emails', () => {
    expect(detectSecrets('"pnpm@9.12.0" @Entity @phoenix-ai/shared', 'package.json')).toEqual([]);
  });
});

describe('redactArtifacts (FR-SEC-02/03/04)', () => {
  it('replaces each value in place with a content-free token; only the vault holds the original', () => {
    const result = redactArtifacts([artifact('application.properties', `aws.key=${AWS_KEY}\n`)]);
    const [passed] = result.passed;
    expect(passed?.content).not.toContain(AWS_KEY);
    expect(passed?.content).toMatch(/^aws\.key=\[REDACTED:aws-access-key-id:[0-9a-f]{12}\]\n$/);

    const [finding] = result.findings;
    expect(finding).toMatchObject({
      kind: 'aws-access-key-id',
      path: 'application.properties',
      line: 1,
    });
    expect(finding?.token).not.toContain(AWS_KEY);
    expect(result.vault.reveal(finding?.token ?? '')).toBe(AWS_KEY);
  });

  it('preserves line numbers when a multi-line value is removed', () => {
    const content = `line1\n${PRIVATE_KEY}\nclass After {}\n`;
    const [passed] = redactArtifacts([artifact('Keys.java', content)]).passed;
    const lines = passed?.content.split('\n') ?? [];
    const original = content.split('\n');
    expect(lines).toHaveLength(original.length);
    expect(lines.indexOf('class After {}')).toBe(original.indexOf('class After {}'));
    expect(passed?.content).not.toContain('PRIVATE KEY');
  });

  it('is deterministic: the same input yields byte-identical output', () => {
    const input = [artifact('a.env', 'SECRET=abc123\nemail=x@example.com\n')];
    expect(redactArtifacts(input).passed).toEqual(redactArtifacts(input).passed);
  });

  it('quarantines content it cannot scan — it is never passed downstream', () => {
    const result = redactArtifacts([
      artifact('logo.png', 'iVBORw0KGgo=', { contentEncoding: 'base64' }),
      artifact('weird.txt', 'a\u0000b'),
    ]);
    expect(result.passed).toEqual([]);
    expect(result.quarantined.map((q) => q.reason)).toEqual([
      'binary-content-not-scannable',
      'content-not-text',
    ]);
  });

  it('stamps every passed artifact, including ones with nothing to redact', () => {
    const [passed] = redactArtifacts([artifact('Clean.java', 'class Clean {}')]).passed;
    expect(passed?.content).toBe('class Clean {}');
    expect(passed !== undefined && hasPassedRedactionGate(passed)).toBe(true);
  });

  it('keeps the original content hash as the record of what was read', () => {
    const hash = { algorithm: 'git-blob-sha1', value: 'abc' };
    const [passed] = redactArtifacts([
      artifact('a.properties', 'password=x1', { contentHash: hash }),
    ]).passed;
    expect(passed?.contentHash).toEqual(hash);
    expect(passed?.content).not.toContain('x1');
  });
});

describe('assertRedactionGatePassed (FR-SEC-04)', () => {
  it('refuses any artifact that did not pass the gate', () => {
    const raw = artifact('Raw.java', 'class Raw {}');
    expect(() => assertRedactionGatePassed([raw])).toThrow(RedactionGateBypassError);
    expect(() => assertRedactionGatePassed(redactArtifacts([raw]).passed)).not.toThrow();
  });
});

describe('the vault never leaks through logging (FR-SEC-03)', () => {
  it('serialises and inspects as an opaque summary', () => {
    const vault = createRedactionVault();
    vault.put({ token: 't', sourceId: 's', path: 'p', line: 1 }, 'super-secret');
    expect(JSON.stringify(vault)).not.toContain('super-secret');
    expect(inspect(vault)).toBe('RedactionVault { size: 1 }');
    expect(vault.entries()).toEqual([{ token: 't', sourceId: 's', path: 'p', line: 1 }]);
    expect(vault.reveal('t')).toBe('super-secret');
  });
});
