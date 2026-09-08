import { describe, expect, it } from 'vitest';
import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import {
  parseAndValidateOkfYaml,
  validateCanonicalKnowledgeBundle,
  validateOkfDocument,
  validateSourceReferences,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import { bridgeJiraArtifacts } from '../src/jira-bridge.js';
import {
  buildJiraCanonicalBundle,
  mapJiraToOkfDocument,
  serializeJiraToOkfYaml,
} from '../src/jira-okf-mapping.js';

const SOURCE_ID = 'ticket://acme-jira/AUR';
const GENERATED_AT = '2026-09-08T01:00:00.000Z';

function artifact(path: string, content: unknown): RawArtifact {
  return {
    path,
    sourceId: SOURCE_ID,
    locator: `${SOURCE_ID}/${path}`,
    content: JSON.stringify(content, null, 2),
    contentEncoding: 'utf-8',
    capturedAt: '2026-09-08T00:00:00.000Z',
  };
}

const ARTIFACTS: RawArtifact[] = [
  artifact('AUR-101', {
    key: 'AUR-101',
    summary: 'Support partial refunds',
    description: 'Customers cannot request a partial refund.',
    issueType: 'Story',
    status: 'In Progress',
    labels: ['checkout', 'payments'],
    issueLinks: [],
  }),
  artifact('AUR-102', {
    key: 'AUR-102',
    summary: 'Refund exceeds order total',
    description: '',
    issueType: 'Bug',
    status: 'Done',
    labels: [],
    parentKey: 'AUR-101',
    issueLinks: [],
  }),
];

const SOURCE: Source = {
  id: SOURCE_ID,
  type: 'ticket',
  label: 'Jira: Aurora Commerce (AUR)',
  locator: SOURCE_ID,
};

function bridge() {
  return bridgeJiraArtifacts(ARTIFACTS, { systemId: 'aurora-commerce', generatedAt: GENERATED_AT });
}

describe('buildJiraCanonicalBundle', () => {
  it('wraps the bridge result objects/relationships into a valid bundle', () => {
    const result = bridge();
    const bundle = buildJiraCanonicalBundle(result, {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
      sources: [SOURCE],
    });

    expect(bundle.objects).toBe(result.objects);
    expect(bundle.relationships).toBe(result.relationships);
    expect(bundle.sources).toEqual([SOURCE]);
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('omits sources entirely when none are given, rather than an empty array', () => {
    const result = bridge();
    const bundle = buildJiraCanonicalBundle(result, {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
    });
    expect(bundle).not.toHaveProperty('sources');
  });
});

describe('mapJiraToOkfDocument', () => {
  it('produces a real, valid OkfDocument', () => {
    const result = bridge();
    const document = mapJiraToOkfDocument(result, {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
      sources: [SOURCE],
    });

    expect(document.okfVersion).toBeTruthy();
    expect(validateOkfDocument(document)).toEqual({ valid: true, errors: [] });
  });
});

describe('serializeJiraToOkfYaml', () => {
  it('produces YAML that round-trips through the real OKF parser/validator', () => {
    const result = bridge();
    const yamlText = serializeJiraToOkfYaml(result, {
      systemId: 'aurora-commerce',
      generatedAt: GENERATED_AT,
      sources: [SOURCE],
    });

    expect(yamlText).toContain('systemId: aurora-commerce');
    expect(yamlText).toContain('kind: workitem.issue');
    expect(parseAndValidateOkfYaml(yamlText)).toEqual({ valid: true, errors: [] });
  });
});
