import type { Provenance } from '@phoenix-ai/shared';
import type {
  C4Node,
  DeploymentNode,
  Domain,
  ExecutionFlow,
  FlowStep,
  Integration,
  Journey,
} from '../data/index.js';

/**
 * PC-03 — derives everything a Journey genuinely connects to, using ONLY
 * relationships that already exist in the data (never a fabricated link):
 *
 *  - Journey -> ExecutionFlow -> FlowStep: `Journey.flowIds` (existing).
 *  - FlowStep -> Business Concept (Aggregate) / Domain Entity:
 *    `FlowStep.readsEntities`/`writesEntities` are exact string matches
 *    against `Aggregate.entities[]` — the same join `build-graph.ts` already
 *    uses to compute a domain aggregate's "read/written by" cross-refs.
 *  - FlowStep -> Service (C4 container): `FlowStep.metadata.provenance[]
 *    .sourceId` is an exact string match against the container's own
 *    `metadata.provenance[].sourceId` (both real `repo://...` URIs) — a real
 *    join key, not a guess.
 *  - Service -> Technology: `C4Node.technology`, already on the matched
 *    container.
 *  - Service -> Deployment: `DeploymentNode.containerId === C4Node.id`, an
 *    exact id match already used by the deployment topology itself.
 *  - Service -> Integration: `Integration.metadata.provenance[].sourceId`
 *    matched against the same service's provenance sourceId.
 *
 * Entity states and APIs are deliberately NEVER computed here: no
 * `apps/web` data source represents either today (confirmed by inspection —
 * `EntityStateAttributes` exists only as an unwired canonical-object type in
 * packages/knowledge-graph, and no `Api`/`Interface` fixture exists at all).
 * Inventing one to fill out the target section list would violate "do not
 * invent missing information" — so those two sections simply have no
 * deriver function and are never rendered, for any journey.
 */

export interface TouchedStep {
  readonly flowId: string;
  readonly flowName: string;
  readonly step: FlowStep;
}

export interface BusinessConcept {
  readonly id: string;
  readonly name: string;
  readonly domainName: string;
}

export interface JourneyDetailData {
  readonly steps: readonly TouchedStep[];
  readonly businessConcepts: readonly BusinessConcept[];
  readonly domainEntityNames: readonly string[];
  readonly services: readonly C4Node[];
  readonly technologies: readonly string[];
  readonly deploymentInstances: readonly DeploymentNode[];
  readonly integrations: readonly Integration[];
  /** Every distinct provenance entry across the journey's own steps — the real, traceable technical evidence behind everything above. */
  readonly provenance: readonly Provenance[];
}

function dedupeProvenance(items: readonly Provenance[]): Provenance[] {
  const seen = new Set<string>();
  const result: Provenance[] = [];
  for (const p of items) {
    const key = `${p.sourceId}::${p.sourceType}::${p.derivedBy}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(p);
  }
  return result;
}

export function deriveJourneyDetail(
  journey: Journey,
  flows: readonly ExecutionFlow[],
  domains: readonly Domain[],
  containers: readonly C4Node[],
  deploymentNodes: readonly DeploymentNode[],
  integrations: readonly Integration[],
): JourneyDetailData {
  const journeyFlows = journey.flowIds
    .map((flowId) => flows.find((f) => f.id === flowId))
    .filter((f): f is ExecutionFlow => f !== undefined);

  const steps: TouchedStep[] = journeyFlows.flatMap((flow) =>
    flow.steps.map((step) => ({ flowId: flow.id, flowName: flow.name, step })),
  );

  const touchedEntityNames = new Set<string>();
  for (const { step } of steps) {
    for (const entity of step.readsEntities) touchedEntityNames.add(entity);
    for (const entity of step.writesEntities) touchedEntityNames.add(entity);
  }

  const businessConcepts: BusinessConcept[] = [];
  for (const domain of domains) {
    for (const aggregate of domain.aggregates) {
      if (aggregate.entities.some((entity) => touchedEntityNames.has(entity))) {
        businessConcepts.push({ id: aggregate.id, name: aggregate.name, domainName: domain.name });
      }
    }
  }

  const stepSourceIds = new Set<string>();
  for (const { step } of steps) {
    for (const p of step.metadata.provenance) stepSourceIds.add(p.sourceId);
  }

  const services = containers.filter((container) =>
    container.metadata.provenance.some((p) => stepSourceIds.has(p.sourceId)),
  );
  const serviceIds = new Set(services.map((s) => s.id));
  const serviceSourceIds = new Set(
    services.flatMap((s) => s.metadata.provenance.map((p) => p.sourceId)),
  );

  const technologies = [
    ...new Set(services.map((s) => s.technology).filter((t): t is string => Boolean(t))),
  ];

  const deploymentInstances = deploymentNodes.filter(
    (node) =>
      node.kind === 'instance' &&
      node.containerId !== undefined &&
      serviceIds.has(node.containerId),
  );

  const relatedIntegrations = integrations.filter((integration) =>
    integration.metadata.provenance.some((p) => serviceSourceIds.has(p.sourceId)),
  );

  const provenance = dedupeProvenance(steps.flatMap(({ step }) => step.metadata.provenance));

  return {
    steps,
    businessConcepts,
    domainEntityNames: [...touchedEntityNames].sort(),
    services,
    technologies,
    deploymentInstances,
    integrations: relatedIntegrations,
    provenance,
  };
}
