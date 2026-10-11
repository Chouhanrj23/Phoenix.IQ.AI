/**
 * P8 -- FR-DET-04: "The system shall extract deployment topology from
 * infrastructure-as-code, container, and configuration files."
 *
 * Deterministic parsing of three formats, producing the FRD §4.1 deployment
 * kinds (`deployment.unit`, `deployment.environment`, see
 * `@phoenix-ai/knowledge-graph`'s `deployment.ts`):
 *
 *  - Dockerfile / Containerfile -- one unit per file: the final-stage `FROM`
 *    image and every `EXPOSE`d port.
 *  - docker-compose -- one unit per service (image, ports), `depends_on` as
 *    `dependsOn`, and the compose project as an environment the services
 *    `runsIn`.
 *  - Kubernetes manifests -- one unit per workload (Deployment, StatefulSet,
 *    DaemonSet, ReplicaSet, Job, CronJob, Pod): images, container ports,
 *    replicas, and its namespace as an environment.
 *
 * Only what a file declares is recorded. In particular, no environment is
 * invented where none is declared: a Kubernetes manifest without
 * `metadata.namespace` lands wherever kubectl's current context points, and
 * a root-level compose file without `name:` takes the checkout directory's
 * name -- neither is knowable from the file, so neither gets a `runsIn`.
 *
 * Every element carries file:line evidence (FR-DET-08) and `basis:
 * observed`. Files that fail to parse are returned as failures, never
 * silently skipped. Output is sorted by id, so it is byte-stable (FR-DET-07).
 */

import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalKnowledgeObject,
  type CanonicalKnowledgeRelationship,
  type DeploymentSourceFormat,
  type Evidence,
} from '@phoenix-ai/knowledge-graph';
import { compareCodeUnits } from '@phoenix-ai/shared';
import { isMap, isScalar, LineCounter, parseAllDocuments, type Node } from 'yaml';
import { deterministicId, type BridgeOptions } from './bridge-shared.js';

export interface IacParseFailure {
  readonly path: string;
  readonly reason: string;
}

export interface IacExtractionResult {
  /** Paths recognised as IaC/container definitions. */
  readonly files: readonly string[];
  readonly objects: CanonicalKnowledgeObject[];
  readonly relationships: CanonicalKnowledgeRelationship[];
  readonly failures: readonly IacParseFailure[];
}

const DOCKERFILE = /(^|\/)(Dockerfile|Containerfile)(\.[^/]+)?$|\.dockerfile$/i;
const COMPOSE = /(^|\/)(docker-)?compose(\.[^/]+)?\.ya?ml$/i;
const YAML_FILE = /\.ya?ml$/i;
const WORKLOAD_KINDS = new Set([
  'Deployment',
  'StatefulSet',
  'DaemonSet',
  'ReplicaSet',
  'Job',
  'CronJob',
  'Pod',
]);

export function isDockerfilePath(path: string): boolean {
  return DOCKERFILE.test(path);
}

export function isComposePath(path: string): boolean {
  return COMPOSE.test(path);
}

function dirnameOf(path: string): string {
  const index = path.lastIndexOf('/');
  return index === -1 ? '' : path.slice(0, index);
}

function basenameOf(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

/** Accumulates elements, merging evidence for an element declared by several files (e.g. one namespace in many manifests). */
class Collector {
  private readonly objects = new Map<string, CanonicalKnowledgeObject>();
  private readonly relationships = new Map<string, CanonicalKnowledgeRelationship>();

  constructor(private readonly options: BridgeOptions) {}

  evidence(path: string, line: number, what: string): Evidence {
    return {
      id: deterministicId('evidence', 'iac', this.options.sourceId, path, String(line), what),
      sourceId: this.options.sourceId,
      locator: `${path}#L${line}`,
      capturedAt: this.options.generatedAt,
      ...(this.options.sourceVersion === undefined
        ? {}
        : { sourceVersion: this.options.sourceVersion }),
    };
  }

  private metadata() {
    return {
      provenance: [
        {
          sourceId: this.options.sourceId,
          sourceType: 'source-code' as const,
          derivedBy: 'extraction-engine',
          derivedAt: this.options.generatedAt,
        },
      ],
      confidence: { level: 'high' as const },
    };
  }

  object(
    id: string,
    kind: 'deployment.unit' | 'deployment.environment',
    label: string,
    attributes: Record<string, unknown>,
    evidence: Evidence,
  ): string {
    const existing = this.objects.get(id);
    if (existing !== undefined) {
      if (!existing.evidence.some((e) => e.id === evidence.id)) existing.evidence.push(evidence);
      return id;
    }
    this.objects.set(id, {
      identity: {
        id,
        systemId: this.options.systemId,
        createdAt: this.options.generatedAt,
        updatedAt: this.options.generatedAt,
        schemaVersion: CANONICAL_SCHEMA_VERSION,
      },
      category: 'entity',
      kind,
      label,
      attributes: attributes as CanonicalKnowledgeObject['attributes'],
      metadata: this.metadata(),
      evidence: [evidence],
      confidenceDetail: { basis: 'observed' },
    });
    return id;
  }

  relationship(
    kind: 'runsIn' | 'dependsOn',
    sourceObjectId: string,
    targetObjectId: string,
    evidence: Evidence,
  ): void {
    const id = deterministicId('relationship', kind, sourceObjectId, targetObjectId);
    if (this.relationships.has(id)) return;
    this.relationships.set(id, {
      id,
      category: kind === 'runsIn' ? 'composition' : 'association',
      kind,
      sourceObjectId,
      targetObjectId,
      metadata: this.metadata(),
      evidence: [evidence],
      confidenceDetail: { basis: 'observed' },
    });
  }

  result(files: string[], failures: IacParseFailure[]): IacExtractionResult {
    // A `dependsOn` naming a service no file declared is dropped from the
    // graph (its endpoint does not exist) but reported, never silently lost.
    const ids = new Set(this.objects.keys());
    const relationships: CanonicalKnowledgeRelationship[] = [];
    for (const relationship of this.relationships.values()) {
      if (ids.has(relationship.sourceObjectId) && ids.has(relationship.targetObjectId)) {
        relationships.push(relationship);
      } else {
        failures.push({
          path: relationship.evidence?.[0]?.locator ?? '(unknown)',
          reason: `declares a dependency on an element no file defines (${relationship.targetObjectId})`,
        });
      }
    }
    return {
      files: [...files].sort(compareCodeUnits),
      objects: [...this.objects.values()].sort((a, b) =>
        compareCodeUnits(a.identity.id, b.identity.id),
      ),
      relationships: relationships.sort((a, b) => compareCodeUnits(a.id, b.id)),
      failures: [...failures].sort(
        (a, b) => compareCodeUnits(a.path, b.path) || compareCodeUnits(a.reason, b.reason),
      ),
    };
  }
}

function unitId(
  options: BridgeOptions,
  format: DeploymentSourceFormat,
  ...parts: string[]
): string {
  return deterministicId('deployment-unit', options.sourceId, format, ...parts);
}

function environmentId(options: BridgeOptions, scope: string, name: string): string {
  return deterministicId('deployment-env', options.sourceId, scope, name);
}

// ---------------------------------------------------------------------------
// Dockerfile
// ---------------------------------------------------------------------------

function extractDockerfile(
  artifact: RawArtifact,
  collector: Collector,
  options: BridgeOptions,
): void {
  const lines = artifact.content.split(/\r?\n/);
  let image: string | undefined;
  let fromLine = 0;
  const ports: string[] = [];
  lines.forEach((raw, index) => {
    const line = raw.trim();
    const from = /^FROM\s+(?:--platform=\S+\s+)?(\S+)/i.exec(line);
    if (from?.[1] !== undefined) {
      image = from[1]; // the LAST FROM is the image that ships (multi-stage builds)
      fromLine = index + 1;
    }
    const expose = /^EXPOSE\s+(.+)$/i.exec(line);
    if (expose?.[1] !== undefined)
      ports.push(...expose[1].split(/\s+/).filter((p) => p.length > 0));
  });
  if (image === undefined) return; // not a buildable Dockerfile: nothing declared to record

  const directory = dirnameOf(artifact.path);
  collector.object(
    unitId(options, 'dockerfile', artifact.path),
    'deployment.unit',
    `${directory === '' ? '(repository root)' : directory} image`,
    { sourceFormat: 'dockerfile', image, ports, workload: 'image' },
    collector.evidence(artifact.path, fromLine, 'FROM'),
  );
}

// ---------------------------------------------------------------------------
// YAML helpers
// ---------------------------------------------------------------------------

function lineOf(node: Node | null | undefined, counter: LineCounter): number {
  const offset = node?.range?.[0];
  return offset === undefined ? 1 : counter.linePos(offset).line;
}

/** The map-pair key node for `key`, so evidence points at the line that declares it. */
function keyNode(map: Node | null | undefined, key: string): Node | undefined {
  if (!isMap(map)) return undefined;
  for (const pair of map.items) {
    if (isScalar(pair.key) && pair.key.value === key) return pair.key;
  }
  return undefined;
}

function valueNode(map: Node | null | undefined, key: string): Node | undefined {
  if (!isMap(map)) return undefined;
  for (const pair of map.items) {
    if (isScalar(pair.key) && pair.key.value === key)
      return (pair.value as Node | null) ?? undefined;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function composePort(port: unknown): string | undefined {
  if (typeof port === 'string' || typeof port === 'number') return String(port);
  const long = asRecord(port);
  if (long === undefined || long.target === undefined) return undefined;
  return long.published === undefined
    ? String(long.target)
    : `${String(long.published)}:${String(long.target)}`;
}

// ---------------------------------------------------------------------------
// docker-compose
// ---------------------------------------------------------------------------

function extractCompose(
  artifact: RawArtifact,
  collector: Collector,
  options: BridgeOptions,
  failures: IacParseFailure[],
): void {
  const counter = new LineCounter();
  const [document] = parseAllDocuments(artifact.content, { lineCounter: counter });
  if (document === undefined) return;
  if (document.errors.length > 0) {
    failures.push({
      path: artifact.path,
      reason: `YAML parse error: ${document.errors[0]?.message ?? ''}`,
    });
    return;
  }
  const root = asRecord(document.toJS());
  const servicesNode = valueNode(document.contents as Node, 'services');
  const services = asRecord(root?.services);
  if (services === undefined) return;

  const directory = dirnameOf(artifact.path);
  const projectName =
    typeof root?.name === 'string'
      ? root.name
      : directory === ''
        ? undefined
        : basenameOf(directory);
  const environment =
    projectName === undefined
      ? undefined
      : collector.object(
          environmentId(options, 'compose-project', projectName),
          'deployment.environment',
          projectName,
          { sourceFormat: 'docker-compose', scope: 'compose-project' },
          collector.evidence(
            artifact.path,
            lineOf(keyNode(document.contents as Node, 'name') ?? servicesNode, counter),
            `compose-project:${projectName}`,
          ),
        );

  const unitIds = new Map<string, string>();
  for (const name of Object.keys(services)) {
    unitIds.set(name, unitId(options, 'docker-compose', artifact.path, name));
  }

  for (const [name, definition] of Object.entries(services)) {
    const service = asRecord(definition) ?? {};
    const line = lineOf(keyNode(servicesNode, name), counter);
    const evidence = collector.evidence(artifact.path, line, `service:${name}`);
    const ports = Array.isArray(service.ports)
      ? service.ports.map(composePort).filter((p): p is string => p !== undefined)
      : [];
    const id = collector.object(
      unitIds.get(name) ?? unitId(options, 'docker-compose', artifact.path, name),
      'deployment.unit',
      name,
      {
        sourceFormat: 'docker-compose',
        workload: 'compose-service',
        ports,
        ...(typeof service.image === 'string' ? { image: service.image } : {}),
      },
      evidence,
    );
    if (environment !== undefined) collector.relationship('runsIn', id, environment, evidence);

    const dependsOn = Array.isArray(service.depends_on)
      ? service.depends_on
      : Object.keys(asRecord(service.depends_on) ?? {});
    for (const dependency of dependsOn) {
      if (typeof dependency !== 'string') continue;
      collector.relationship(
        'dependsOn',
        id,
        unitIds.get(dependency) ?? unitId(options, 'docker-compose', artifact.path, dependency),
        evidence,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Kubernetes
// ---------------------------------------------------------------------------

function podSpecOf(kind: string, spec: Record<string, unknown> | undefined) {
  if (spec === undefined) return undefined;
  if (kind === 'Pod') return spec;
  if (kind === 'CronJob') {
    return asRecord(asRecord(asRecord(asRecord(spec.jobTemplate)?.spec)?.template)?.spec);
  }
  return asRecord(asRecord(spec.template)?.spec);
}

function extractKubernetes(
  artifact: RawArtifact,
  collector: Collector,
  options: BridgeOptions,
  failures: IacParseFailure[],
): boolean {
  const counter = new LineCounter();
  const documents = parseAllDocuments(artifact.content, { lineCounter: counter });
  let recognised = false;
  for (const document of documents) {
    const manifest = asRecord(document.errors.length > 0 ? undefined : document.toJS());
    if (manifest === undefined || typeof manifest.apiVersion !== 'string') {
      if (document.errors.length > 0 && /^\s*apiVersion:/m.test(artifact.content)) {
        failures.push({
          path: artifact.path,
          reason: `YAML parse error: ${document.errors[0]?.message ?? ''}`,
        });
      }
      continue;
    }
    const kind = typeof manifest.kind === 'string' ? manifest.kind : '';
    if (!WORKLOAD_KINDS.has(kind)) continue;
    recognised = true;

    const metadata = asRecord(manifest.metadata) ?? {};
    const name = typeof metadata.name === 'string' ? metadata.name : '(unnamed)';
    const line = lineOf(document.contents as Node, counter);
    const evidence = collector.evidence(artifact.path, line, `${kind}:${name}`);
    const spec = asRecord(manifest.spec);
    const containers = (podSpecOf(kind, spec)?.containers as unknown[] | undefined) ?? [];
    const images = containers
      .map((container) => asRecord(container)?.image)
      .filter((image): image is string => typeof image === 'string');
    const ports = containers.flatMap((container) =>
      ((asRecord(container)?.ports as unknown[] | undefined) ?? [])
        .map((port) => asRecord(port)?.containerPort)
        .filter((port) => port !== undefined)
        .map(String),
    );
    const namespace = typeof metadata.namespace === 'string' ? metadata.namespace : undefined;

    const id = collector.object(
      unitId(options, 'kubernetes', namespace ?? '', kind, name),
      'deployment.unit',
      name,
      {
        sourceFormat: 'kubernetes',
        workload: kind,
        ports,
        ...(images.length === 0 ? {} : { image: images.join(', ') }),
        ...(typeof spec?.replicas === 'number' && Number.isInteger(spec.replicas)
          ? { replicas: spec.replicas }
          : {}),
      },
      evidence,
    );
    if (namespace !== undefined) {
      const environment = collector.object(
        environmentId(options, 'kubernetes-namespace', namespace),
        'deployment.environment',
        namespace,
        { sourceFormat: 'kubernetes', scope: 'kubernetes-namespace' },
        evidence,
      );
      collector.relationship('runsIn', id, environment, evidence);
    }
  }
  return recognised;
}

/**
 * Extracts deployment topology from every IaC/container artifact in the set.
 * Non-IaC artifacts are ignored; a YAML file that is neither a compose file
 * nor a Kubernetes workload manifest is not counted as IaC.
 */
export function extractInfrastructure(
  artifacts: readonly RawArtifact[],
  options: BridgeOptions,
): IacExtractionResult {
  const collector = new Collector(options);
  const files: string[] = [];
  const failures: IacParseFailure[] = [];

  for (const artifact of [...artifacts].sort((a, b) => compareCodeUnits(a.path, b.path))) {
    if (artifact.contentEncoding !== 'utf-8') continue;
    if (isDockerfilePath(artifact.path)) {
      files.push(artifact.path);
      extractDockerfile(artifact, collector, options);
    } else if (isComposePath(artifact.path)) {
      files.push(artifact.path);
      extractCompose(artifact, collector, options, failures);
    } else if (YAML_FILE.test(artifact.path)) {
      if (extractKubernetes(artifact, collector, options, failures)) files.push(artifact.path);
    }
  }
  return collector.result(files, failures);
}
