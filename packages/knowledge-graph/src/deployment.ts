/**
 * P8 -- the Deployment vocabulary: FRD §4.1 "Deployment: Node,
 * DeploymentUnit, Environment" and §4.2 "DeploymentUnit runsIn
 * Environment", which no kind in the canonical model represented until now
 * (deployment topology existed only as the Phase 1 `DeploymentNode` UI
 * contract, never as extracted knowledge).
 *
 * Produced by deterministic extraction from infrastructure-as-code and
 * container definitions (FR-DET-04): Dockerfiles, docker-compose files and
 * Kubernetes manifests. Model only -- the extraction lives in
 * `@phoenix-ai/extraction-engine`'s `iac.ts`, the same model/algorithm split
 * every other domain file follows.
 *
 * Only what the source states is recorded: an image, ports, a replica count,
 * a namespace. Nothing is inferred about hosts or runtime placement that the
 * files do not declare -- so FRD's `Node` (a physical/virtual host) has no
 * kind yet: no supported IaC format here names one.
 */

import type { CanonicalKnowledgeObject } from './canonical-object.js';
import type { CanonicalKnowledgeRelationship } from './relationships.js';
import type { KnowledgeValue } from './identity.js';
import {
  isNonEmptyString,
  isPlainObject,
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
  type ValidationResult,
} from './validation.js';

export const DEPLOYMENT_OBJECT_KINDS = ['deployment.unit', 'deployment.environment'] as const;
export type DeploymentObjectKind = (typeof DEPLOYMENT_OBJECT_KINDS)[number];

/** Which kind of file declared the element -- the evidence's format. */
export const DEPLOYMENT_SOURCE_FORMATS = ['dockerfile', 'docker-compose', 'kubernetes'] as const;
export type DeploymentSourceFormat = (typeof DEPLOYMENT_SOURCE_FORMATS)[number];

export interface DeploymentUnitAttributes {
  [key: string]: KnowledgeValue;
  sourceFormat: DeploymentSourceFormat;
  /** Container image (`image:` / `FROM`), when declared. */
  image?: string;
  /** Declared ports, verbatim (`"8080:8080"`, `"80"`). Empty when none are declared. */
  ports: string[];
  /** Declared replica count (Kubernetes `spec.replicas`), when declared. */
  replicas?: number;
  /** The workload type, e.g. `Deployment`, `StatefulSet`, `compose-service`, `image`. */
  workload: string;
}

export interface DeploymentEnvironmentAttributes {
  [key: string]: KnowledgeValue;
  sourceFormat: DeploymentSourceFormat;
  /** A Kubernetes namespace or a docker-compose project, as declared. */
  scope: 'kubernetes-namespace' | 'compose-project';
}

export interface DeploymentUnitObject extends CanonicalKnowledgeObject<DeploymentUnitAttributes> {
  category: 'entity';
  kind: 'deployment.unit';
}

export interface DeploymentEnvironmentObject extends CanonicalKnowledgeObject<DeploymentEnvironmentAttributes> {
  category: 'entity';
  kind: 'deployment.environment';
}

export const DEPLOYMENT_RELATIONSHIP_KINDS = ['runsIn', 'dependsOn'] as const;
export type DeploymentRelationshipKind = (typeof DEPLOYMENT_RELATIONSHIP_KINDS)[number];

const DEPLOYMENT_RELATIONSHIP_CATEGORY: Record<
  DeploymentRelationshipKind,
  'composition' | 'association'
> = {
  // FRD §4.2: "DeploymentUnit runsIn Environment".
  runsIn: 'composition',
  // A declared start-up dependency (compose `depends_on`).
  dependsOn: 'association',
};

export interface DeploymentRelationship extends CanonicalKnowledgeRelationship {
  kind: DeploymentRelationshipKind;
}

export function validateDeploymentObject(candidate: unknown): ValidationResult {
  const base = validateCanonicalKnowledgeObject(candidate);
  const errors = [...base.errors];
  if (!isPlainObject(candidate)) return { valid: false, errors };

  if (candidate.category !== 'entity')
    errors.push('category must be "entity" for a deployment object');
  const kind = candidate.kind;
  if (!(DEPLOYMENT_OBJECT_KINDS as readonly unknown[]).includes(kind)) {
    errors.push(`kind must be one of: ${DEPLOYMENT_OBJECT_KINDS.join(', ')}`);
  }
  const attributes = candidate.attributes;
  if (isPlainObject(attributes)) {
    if (!(DEPLOYMENT_SOURCE_FORMATS as readonly unknown[]).includes(attributes.sourceFormat)) {
      errors.push(
        `attributes.sourceFormat must be one of: ${DEPLOYMENT_SOURCE_FORMATS.join(', ')}`,
      );
    }
    if (kind === 'deployment.unit') {
      if (!isNonEmptyString(attributes.workload)) errors.push('attributes.workload is required');
      if (
        !Array.isArray(attributes.ports) ||
        !attributes.ports.every((port) => typeof port === 'string')
      ) {
        errors.push('attributes.ports must be an array of strings (may be empty)');
      }
      if (
        attributes.replicas !== undefined &&
        (typeof attributes.replicas !== 'number' || !Number.isInteger(attributes.replicas))
      ) {
        errors.push('attributes.replicas, if present, must be an integer');
      }
    }
    if (
      kind === 'deployment.environment' &&
      attributes.scope !== 'kubernetes-namespace' &&
      attributes.scope !== 'compose-project'
    ) {
      errors.push('attributes.scope must be "kubernetes-namespace" or "compose-project"');
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateDeploymentRelationship(candidate: unknown): ValidationResult {
  const base = validateCanonicalKnowledgeRelationship(candidate);
  const errors = [...base.errors];
  if (isPlainObject(candidate)) {
    const kind = candidate.kind;
    if (!(DEPLOYMENT_RELATIONSHIP_KINDS as readonly unknown[]).includes(kind)) {
      errors.push(`kind must be one of: ${DEPLOYMENT_RELATIONSHIP_KINDS.join(', ')}`);
    } else {
      const expected = DEPLOYMENT_RELATIONSHIP_CATEGORY[kind as DeploymentRelationshipKind];
      if (candidate.category !== expected) {
        errors.push(`category must be "${expected}" for relationship kind "${String(kind)}"`);
      }
    }
  }
  return { valid: errors.length === 0, errors };
}
