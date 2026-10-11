import { describe, expect, it } from 'vitest';
import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import {
  validateCanonicalKnowledgeBundle,
  validateDeploymentObject,
  validateDeploymentRelationship,
} from '@phoenix-ai/knowledge-graph';
import { extractInfrastructure } from '../src/iac.js';

/** P8 -- FR-DET-04: deployment topology from IaC and container definitions. */

const OPTIONS = {
  systemId: 'shop',
  sourceId: 'repo://acme/shop',
  generatedAt: '2026-10-07T00:00:00.000Z',
  sourceVersion: 'abc123',
};

function artifact(path: string, content: string): RawArtifact {
  return {
    sourceId: OPTIONS.sourceId,
    path,
    locator: `${OPTIONS.sourceId}/${path}`,
    content,
    contentEncoding: 'utf-8',
    capturedAt: OPTIONS.generatedAt,
  };
}

const DOCKERFILE = `FROM maven:3.9 AS build
COPY . .
RUN mvn package

FROM eclipse-temurin:21-jre
EXPOSE 8080 9090
ENTRYPOINT ["java","-jar","app.jar"]
`;

const COMPOSE = `name: shop
services:
  orders:
    image: acme/orders:1.4
    ports:
      - "8080:8080"
      - target: 9090
        published: 19090
    depends_on:
      - db
  db:
    image: postgres:16
`;

const K8S = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: orders
  namespace: production
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: orders
          image: acme/orders:1.4
          ports:
            - containerPort: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: orders
---
apiVersion: batch/v1
kind: CronJob
metadata:
  name: nightly-report
spec:
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: report
              image: acme/report:2
`;

const INPUT = [
  artifact('services/orders/Dockerfile', DOCKERFILE),
  artifact('docker-compose.yml', COMPOSE),
  artifact('k8s/orders.yaml', K8S),
  artifact('src/main/resources/application.yml', 'spring:\n  application:\n    name: x\n'),
  artifact('README.md', '# shop\n'),
];

describe('extractInfrastructure (FR-DET-04)', () => {
  const result = extractInfrastructure(INPUT, OPTIONS);
  const unit = (label: string, format: string) =>
    result.objects.find(
      (o) =>
        o.kind === 'deployment.unit' && o.label === label && o.attributes.sourceFormat === format,
    );

  it('recognises only the IaC files', () => {
    expect(result.files).toEqual([
      'docker-compose.yml',
      'k8s/orders.yaml',
      'services/orders/Dockerfile',
    ]);
    expect(result.failures).toEqual([]);
  });

  it('Dockerfile: the final-stage image and every exposed port, evidenced at the FROM line', () => {
    const image = unit('services/orders image', 'dockerfile');
    expect(image?.attributes).toMatchObject({
      image: 'eclipse-temurin:21-jre',
      ports: ['8080', '9090'],
    });
    expect(image?.evidence[0]?.locator).toBe('services/orders/Dockerfile#L5');
    expect(image?.evidence[0]?.sourceVersion).toBe('abc123');
  });

  it('compose: services, short and long port syntax, the project, runsIn and dependsOn', () => {
    const orders = unit('orders', 'docker-compose');
    const db = unit('db', 'docker-compose');
    expect(orders?.attributes).toMatchObject({
      image: 'acme/orders:1.4',
      ports: ['8080:8080', '19090:9090'],
    });
    expect(orders?.evidence[0]?.locator).toBe('docker-compose.yml#L3');
    const project = result.objects.find(
      (o) => o.kind === 'deployment.environment' && o.label === 'shop',
    );
    expect(project?.attributes.scope).toBe('compose-project');
    const kinds = result.relationships
      .filter((r) => r.sourceObjectId === orders?.identity.id)
      .map((r) => [r.kind, r.targetObjectId]);
    expect(kinds).toEqual(
      expect.arrayContaining([
        ['runsIn', project?.identity.id],
        ['dependsOn', db?.identity.id],
      ]),
    );
  });

  it('kubernetes: workloads only (not Services), replicas, images, ports, and the declared namespace', () => {
    const deployment = unit('orders', 'kubernetes');
    expect(deployment?.attributes).toMatchObject({
      workload: 'Deployment',
      replicas: 3,
      image: 'acme/orders:1.4',
      ports: ['8080'],
    });
    const cron = unit('nightly-report', 'kubernetes');
    expect(cron?.attributes).toMatchObject({ workload: 'CronJob', image: 'acme/report:2' });
    expect(
      result.objects.filter(
        (o) => o.attributes.sourceFormat === 'kubernetes' && o.kind === 'deployment.unit',
      ),
    ).toHaveLength(2);
  });

  it('never invents an environment that is not declared', () => {
    const cron = unit('nightly-report', 'kubernetes');
    expect(result.relationships.some((r) => r.sourceObjectId === cron?.identity.id)).toBe(false);
    const production = result.objects.find((o) => o.label === 'production');
    expect(production?.attributes.scope).toBe('kubernetes-namespace');
  });

  it('every element validates against the canonical deployment model, as one valid bundle', () => {
    for (const object of result.objects)
      expect(validateDeploymentObject(object)).toEqual({ valid: true, errors: [] });
    for (const relationship of result.relationships) {
      expect(validateDeploymentRelationship(relationship)).toEqual({ valid: true, errors: [] });
    }
    expect(
      validateCanonicalKnowledgeBundle({
        systemId: 'shop',
        generatedAt: OPTIONS.generatedAt,
        objects: result.objects,
        relationships: result.relationships,
      }),
    ).toEqual({ valid: true, errors: [] });
  });

  it('is deterministic regardless of artifact order', () => {
    expect(extractInfrastructure([...INPUT].reverse(), OPTIONS)).toEqual(result);
  });

  it('reports unparseable files and undeclared dependencies instead of skipping them', () => {
    const broken = extractInfrastructure(
      [
        artifact('compose.yaml', 'services:\n  web:\n    depends_on: [ghost]\n'),
        artifact('k8s/bad.yaml', 'apiVersion: v1\nkind: Pod\nmetadata: [unclosed\n'),
      ],
      OPTIONS,
    );
    expect(broken.failures.map((f) => f.reason)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/YAML parse error/),
        expect.stringMatching(/dependency on an element no file defines/),
      ]),
    );
    expect(broken.relationships).toEqual([]);
  });
});
