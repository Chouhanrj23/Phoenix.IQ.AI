import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SCHEMA_VERSION,
  parseAndValidateOkfYaml,
  parseOkfYaml,
  type CanonicalKnowledgeBundle,
  type CanonicalKnowledgeObject,
  type CanonicalKnowledgeRelationship,
  type OkfDocument,
} from '@phoenix-ai/knowledge-graph';
import {
  exportOkfPackage,
  OKF_ARTIFACT_IDS,
  renderAllArtifacts,
  renderArtifact,
  type RenderedArtifact,
} from '../src/index.js';

/**
 * P8 -- FR-OKF-01..13: the eleven renderers and the portable export, driven
 * by REAL committed knowledge: P3-11's extraction of spring-petclinic and the
 * P2 aurora-commerce reference sample.
 */

function sample(relative: string): CanonicalKnowledgeBundle {
  const yaml = readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8');
  expect(parseAndValidateOkfYaml(yaml).valid).toBe(true);
  return parseOkfYaml(yaml) as OkfDocument;
}

const PETCLINIC = sample('../../extraction-engine/samples/spring-petclinic.okf.yaml');
const AURORA = sample('../../knowledge-graph/samples/aurora-commerce.sample.okf.yaml');

function file(artifact: RenderedArtifact, path: string): string {
  const found = artifact.files.find((f) => f.path === path);
  if (found === undefined) throw new Error(`${artifact.id} has no ${path}`);
  return found.content;
}

const AT = '2026-10-07T00:00:00.000Z';
function object(
  id: string,
  kind: string,
  label: string,
  attributes: Record<string, unknown> = {},
  basis: 'observed' | 'derived' = 'observed',
): CanonicalKnowledgeObject {
  return {
    identity: {
      id,
      systemId: 'shop',
      createdAt: AT,
      updatedAt: AT,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind,
    label,
    attributes: attributes as CanonicalKnowledgeObject['attributes'],
    metadata: {
      provenance: [
        { sourceId: 'repo://shop', sourceType: 'source-code', derivedBy: 't', derivedAt: AT },
      ],
      confidence: basis === 'derived' ? { level: 'medium', score: 0.6 } : { level: 'high' },
    },
    evidence: [
      { id: `ev-${id}`, sourceId: 'repo://shop', locator: `${label}.src#L1`, capturedAt: AT },
    ],
    confidenceDetail: { basis },
  };
}
function rel(
  id: string,
  kind: string,
  source: string,
  target: string,
  category: CanonicalKnowledgeRelationship['category'] = 'association',
): CanonicalKnowledgeRelationship {
  return {
    id,
    kind,
    category,
    sourceObjectId: source,
    targetObjectId: target,
    metadata: {
      provenance: [
        { sourceId: 'repo://shop', sourceType: 'source-code', derivedBy: 't', derivedAt: AT },
      ],
      confidence: { level: 'high' },
    },
  };
}

describe('all eleven artifacts from real extraction output (spring-petclinic)', () => {
  const artifacts = renderAllArtifacts(PETCLINIC);
  const byId = Object.fromEntries(artifacts.map((a) => [a.id, a]));

  it('renders every FRD artifact type, in order, each with a trace', () => {
    expect(artifacts.map((a) => a.id)).toEqual([...OKF_ARTIFACT_IDS]);
    for (const artifact of artifacts) {
      expect(artifact.files.some((f) => f.path === 'trace.json')).toBe(true);
    }
  });

  it('logical data model: a DBML table per observed entity, with its physical table and fields', () => {
    const model = byId['logical-data-model']!;
    expect(model.status).toBe('rendered');
    const dbml = file(model, 'data-model.dbml');
    const entities = PETCLINIC.objects.filter((o) => o.kind === 'domain.entity');
    for (const entity of entities) expect(dbml).toContain(`Table "${entity.label}" {`);
    const dictionary = file(model, 'data-dictionary.md');
    expect(dictionary).toContain('## Owner');
    expect(dictionary).toContain('Physical table: `owners`');
    expect(dictionary).toMatch(/\| Field \| Type \| Required \|/);
  });

  it('integrations: every real API and its operations', () => {
    const integrations = byId['integrations-dataflows']!;
    const apis = PETCLINIC.objects.filter((o) => o.kind === 'integration.api');
    expect(integrations.elements.map((e) => e.id).sort()).toEqual(
      apis.map((a) => a.identity.id).sort(),
    );
    const md = file(integrations, 'integrations.md');
    for (const api of apis) expect(md).toContain(`### ${api.label}`);
  });

  it('says what it could not produce, and why, instead of padding (FR-OKF honest coverage)', () => {
    expect(byId.screens!.status).toBe('unavailable');
    expect(byId['non-functional-requirements']!.status).toBe('unavailable');
    expect(byId.backlog!.status).toBe('empty');
    expect(byId.backlog!.missingInputs.join(' ')).toMatch(/issue tracker/);
    expect(byId.deployment!.status).toBe('empty');
    expect(file(byId.deployment!, 'deployment.md')).toMatch(/deployment topology is unknown/);
    expect(byId['architecture-c4']!.missingInputs.length).toBeGreaterThan(0);
  });

  it('FR-OKF-12: every element shown is a real bundle element with its evidence', () => {
    const ids = new Set(PETCLINIC.objects.map((o) => o.identity.id));
    for (const artifact of artifacts) {
      for (const element of artifact.elements) {
        expect(ids.has(element.id)).toBe(true);
        if (element.basis === 'observed') expect(element.evidence.length).toBeGreaterThan(0);
      }
    }
    expect(file(byId['logical-data-model']!, 'data-dictionary.md')).toMatch(
      /observed · confidence \w+ · evidence: \S+#L\d+/,
    );
  });

  it('is deterministic: the same bundle renders byte-identically, regardless of input order', () => {
    const shuffled = {
      ...PETCLINIC,
      objects: [...PETCLINIC.objects].reverse(),
      relationships: [...PETCLINIC.relationships].reverse(),
    };
    expect(JSON.stringify(renderAllArtifacts(shuffled))).toBe(JSON.stringify(artifacts));
  });
});

describe('the reference sample (aurora-commerce): architecture, personas, flows', () => {
  const artifacts = Object.fromEntries(renderAllArtifacts(AURORA).map((a) => [a.id, a]));

  it('C4: a Structurizr workspace with the declared system and containers', () => {
    const c4 = artifacts['architecture-c4']!;
    const dsl = file(c4, 'workspace.dsl');
    const system = AURORA.objects.find((o) => o.kind === 'architecture.system')!;
    expect(dsl).toContain(`softwareSystem "${system.label}"`);
    for (const container of AURORA.objects.filter((o) => o.kind === 'architecture.container')) {
      expect(dsl).toContain(`container "${container.label}"`);
    }
    expect(dsl).toMatch(/container system "containers"/);
    expect(c4.missingInputs).toEqual([]);
  });

  it('personas, journeys and the flow-to-journey view', () => {
    const persona = AURORA.objects.find((o) => o.kind === 'journey.persona')!;
    expect(file(artifacts['personas-journeys']!, 'personas-journeys.md')).toContain(
      `### ${persona.label}`,
    );
    const flow = AURORA.objects.find((o) => o.kind === 'journey.flow')!;
    expect(file(artifacts['flow-to-journey']!, 'flow-to-journey.md')).toContain(flow.label);
    expect(file(artifacts['execution-flows']!, 'execution-flows.md')).toContain('```mermaid');
  });
});

describe('IaC deployment, backlog, and inferred knowledge', () => {
  const bundle: CanonicalKnowledgeBundle = {
    systemId: 'shop',
    generatedAt: AT,
    objects: [
      object('u-api', 'deployment.unit', 'api', {
        sourceFormat: 'docker-compose',
        image: 'shop/api:1',
        ports: ['8080:8080'],
        workload: 'service',
      }),
      object('u-db', 'deployment.unit', 'db', {
        sourceFormat: 'docker-compose',
        image: 'postgres:16',
        ports: [],
        workload: 'service',
      }),
      object('env', 'deployment.environment', 'shop', {
        sourceFormat: 'docker-compose',
        scope: 'compose-project',
      }),
      object('epic', 'workitem.issue', 'SHOP-1 Checkout', {
        issueType: 'Epic',
        status: 'Open',
        labels: [],
      }),
      object('story', 'workitem.issue', 'SHOP-2 Pay "now"', {
        issueType: 'Story',
        status: 'Done',
        labels: ['pay'],
      }),
      object('order', 'domain.entity', 'Order', {
        fields: [{ name: 'id', type: 'Long', required: true }],
      }),
      object('concept', 'domain.entity', 'Order Cancel', {}, 'derived'),
    ],
    relationships: [
      rel('r1', 'runsIn', 'u-api', 'env', 'composition'),
      rel('r2', 'runsIn', 'u-db', 'env', 'composition'),
      rel('r3', 'dependsOn', 'u-api', 'u-db'),
      rel('r4', 'contains', 'epic', 'story', 'composition'),
    ],
  };
  const artifacts = Object.fromEntries(renderAllArtifacts(bundle).map((a) => [a.id, a]));

  it('deployment: units in their environment, with declared dependencies', () => {
    const md = file(artifacts.deployment!, 'deployment.md');
    expect(md).toMatch(/subgraph d\d+\["shop"\]/);
    expect(md).toContain('| api | shop | shop/api:1 | 8080:8080 |');
    expect(md).toMatch(/d\d+ --> d\d+/);
  });

  it('C4 uses deployment units as containers when none are declared — and says so', () => {
    const c4 = artifacts['architecture-c4']!;
    expect(file(c4, 'workspace.dsl')).toContain('container "api"');
    expect(c4.notes.join(' ')).toMatch(
      /deployment unit\(s\) extracted from deployment descriptors/,
    );
  });

  it('backlog: epics before stories, containment shown, quotes survive', () => {
    const md = file(artifacts.backlog!, 'backlog.md');
    expect(md.indexOf('## Epic')).toBeLessThan(md.indexOf('## Story'));
    expect(md).toContain('- Contains **SHOP-2 Pay "now"**');
  });

  it('an inferred concept is never drawn as a table, and is marked as inferred', () => {
    const model = artifacts['logical-data-model']!;
    expect(file(model, 'data-model.dbml')).not.toContain('Order Cancel');
    expect(file(model, 'data-dictionary.md')).toMatch(
      /\*\*Order Cancel\*\* — _\*\*inferred — pending review\*\*/,
    );
  });
});

describe('portable export (FR-OKF-13 / FR-IF-03)', () => {
  const pkg = exportOkfPackage(PETCLINIC);

  it('contains the OKF document, every artifact, an index and a manifest', () => {
    const paths = pkg.files.map((f) => f.path);
    expect(paths).toContain('okf/knowledge.okf.yaml');
    expect(paths).toContain('index.md');
    expect(paths).toContain('manifest.json');
    for (const id of OKF_ARTIFACT_IDS) expect(paths).toContain(`artifacts/${id}/trace.json`);
    expect(paths).toEqual([...paths].sort());
  });

  it('the exported OKF is valid and round-trips', () => {
    const yaml = pkg.files.find((f) => f.path === 'okf/knowledge.okf.yaml')!.content;
    expect(parseAndValidateOkfYaml(yaml)).toEqual({ valid: true, errors: [] });
    expect((parseOkfYaml(yaml) as OkfDocument).objects).toHaveLength(PETCLINIC.objects.length);
  });

  it('the manifest hashes every other file correctly', () => {
    const manifest = JSON.parse(pkg.files.find((f) => f.path === 'manifest.json')!.content);
    expect(manifest.files).toHaveLength(pkg.files.length - 1);
    for (const entry of manifest.files) {
      const content = pkg.files.find((f) => f.path === entry.path)!.content;
      expect(createHash('sha256').update(content, 'utf8').digest('hex')).toBe(entry.sha256);
    }
    expect(manifest.artifacts).toHaveLength(11);
  });

  it('is byte-identical across exports', () => {
    expect(JSON.stringify(exportOkfPackage(PETCLINIC).files)).toBe(JSON.stringify(pkg.files));
  });

  it('single-artifact rendering matches the full set', () => {
    expect(renderArtifact('domains', PETCLINIC)).toEqual(renderAllArtifacts(PETCLINIC)[1]);
  });
});
