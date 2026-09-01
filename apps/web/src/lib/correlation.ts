import type {
  BusinessCapability,
  C4Node,
  DeploymentNode,
  Domain,
  ExecutionFlow,
  GraphElementMetadata,
  Integration,
  Journey,
  Persona,
  ReviewItem,
} from '../data/index.js';
import { mentions } from './mentions.js';

/**
 * PC-04 — cross-correlation engine. One graph, built once from the SAME
 * real relationships already established and verified in PC-01/PC-02/PC-03
 * (`lib/journey-detail.ts`), never a second/parallel data model:
 *
 *  - persona --experiences--> journey            (Journey.personaId)
 *  - journey --touches--> entity                 (FlowStep.readsEntities/writesEntities)
 *  - journey --realised by--> service             (FlowStep provenance <-> C4Node provenance, exact sourceId match)
 *  - entity --belongs to--> concept (aggregate)   (Aggregate.entities[] contains the entity name)
 *  - concept --realizes--> capability             (Aggregate's parent Domain.id === BusinessCapability.domainId)
 *  - service --built with--> technology           (C4Node.technology)
 *  - service --deployed as--> deployment          (DeploymentNode.containerId === C4Node.id)
 *  - service --integrates via--> integration      (Integration provenance <-> C4Node provenance, exact sourceId match)
 *
 * Entity State and API are deliberately absent from `CorrelationKind` --
 * exactly as in `journey-detail.ts`, no real data source for either exists
 * anywhere in this app, so no edge/node kind is invented for them.
 *
 * The graph is undirected for traversal purposes (correlation is
 * symmetric -- the conceptual model's "↕" arrows) even though each edge is
 * recorded with a real, one-directional relationship label for display.
 */

export type CorrelationKind =
  | 'persona'
  | 'journey'
  | 'capability'
  | 'concept'
  | 'entity'
  | 'service'
  | 'technology'
  | 'deployment'
  | 'integration';

export interface CorrelationNode {
  readonly key: string;
  readonly kind: CorrelationKind;
  readonly id: string;
  readonly label: string;
  readonly secondary?: string;
  /**
   * PC-09 — the object's own real `description` field, only when the
   * underlying type actually has one (Journey, BusinessCapability, C4Node).
   * Never composed or invented for kinds without one (Persona, Concept,
   * Entity, Technology, Deployment, Integration) — see `describe()` below.
   */
  readonly description?: string;
  /**
   * PC-09 — the real provenance + confidence carried by the underlying
   * object, when it is a full tracked object. Entity and Technology are
   * derived label strings (not their own tracked objects anywhere in
   * Phase 1-5), so they carry no metadata of their own — left undefined
   * rather than borrowed from a neighboring object.
   */
  readonly metadata?: GraphElementMetadata;
}

export interface CorrelationEdge {
  readonly from: string;
  readonly to: string;
  readonly relationship: string;
}

export interface CorrelationGraph {
  readonly nodesByKey: ReadonlyMap<string, CorrelationNode>;
  readonly nodes: readonly CorrelationNode[];
  readonly edges: readonly CorrelationEdge[];
}

export interface CorrelationBundle {
  readonly personas: readonly Persona[];
  readonly journeys: readonly Journey[];
  readonly flows: readonly ExecutionFlow[];
  readonly domains: readonly Domain[];
  readonly capabilities: readonly BusinessCapability[];
  readonly containers: readonly C4Node[];
  readonly deploymentNodes: readonly DeploymentNode[];
  readonly integrations: readonly Integration[];
  /**
   * PC-09 — optional: only needed by callers that surface Review Status
   * (currently the Cross-Correlation detail panel). Optional so every
   * existing caller that doesn't fetch review items (System Map, Connected
   * Sources, the correlation tests) keeps working unchanged.
   */
  readonly reviewItems?: readonly ReviewItem[];
}

export function nodeKey(kind: CorrelationKind, id: string): string {
  return `${kind}:${id}`;
}

export function buildCorrelationGraph(bundle: CorrelationBundle): CorrelationGraph {
  const nodesByKey = new Map<string, CorrelationNode>();
  const edges: CorrelationEdge[] = [];

  function addNode(node: CorrelationNode): void {
    if (!nodesByKey.has(node.key)) nodesByKey.set(node.key, node);
  }

  function addEdge(fromKey: string, toKey: string, relationship: string): void {
    if (!nodesByKey.has(fromKey) || !nodesByKey.has(toKey) || fromKey === toKey) return;
    edges.push({ from: fromKey, to: toKey, relationship });
  }

  for (const persona of bundle.personas) {
    addNode({
      key: nodeKey('persona', persona.id),
      kind: 'persona',
      id: persona.id,
      label: persona.name,
      secondary: persona.role,
      // Persona has no `description` field in the data model (only
      // `role`/`goals`/`painPoints`) -- left undefined rather than composed.
      metadata: persona.metadata,
    });
  }
  for (const journey of bundle.journeys) {
    addNode({
      key: nodeKey('journey', journey.id),
      kind: 'journey',
      id: journey.id,
      label: journey.name,
      description: journey.description,
      metadata: journey.metadata,
    });
  }
  for (const capability of bundle.capabilities) {
    addNode({
      key: nodeKey('capability', capability.id),
      kind: 'capability',
      id: capability.id,
      label: capability.name,
      description: capability.description,
      metadata: capability.metadata,
    });
  }

  const aggregateDomainId = new Map<string, string>();
  const entityToAggregateIds = new Map<string, Set<string>>();
  for (const domain of bundle.domains) {
    for (const aggregate of domain.aggregates) {
      addNode({
        key: nodeKey('concept', aggregate.id),
        kind: 'concept',
        id: aggregate.id,
        label: aggregate.name,
        secondary: domain.name,
        // Aggregate has no `description` field (only `name`/`entities`) --
        // its parent Domain has one, but that describes the domain, not
        // this concept, so it is intentionally not borrowed here.
        metadata: aggregate.metadata,
      });
      aggregateDomainId.set(aggregate.id, domain.id);
      for (const entityName of aggregate.entities) {
        addNode({
          key: nodeKey('entity', entityName),
          kind: 'entity',
          id: entityName,
          label: entityName,
          // A Domain Entity is a bare name string inside `Aggregate.entities`
          // -- it is never its own tracked object anywhere in Phase 1-5, so
          // it has no description and no independent metadata of its own.
        });
        const set = entityToAggregateIds.get(entityName) ?? new Set<string>();
        set.add(aggregate.id);
        entityToAggregateIds.set(entityName, set);
      }
    }
  }

  for (const container of bundle.containers) {
    addNode({
      key: nodeKey('service', container.id),
      kind: 'service',
      id: container.id,
      label: container.name,
      ...(container.technology === undefined ? {} : { secondary: container.technology }),
      description: container.description,
      metadata: container.metadata,
    });
  }

  const technologies = new Set(
    bundle.containers.map((c) => c.technology).filter((t): t is string => Boolean(t)),
  );
  for (const tech of technologies) {
    // Technology is a bare string read off `C4Node.technology` -- never its
    // own tracked object, so no description/metadata of its own exists.
    addNode({ key: nodeKey('technology', tech), kind: 'technology', id: tech, label: tech });
  }

  for (const node of bundle.deploymentNodes) {
    if (node.kind !== 'instance') continue;
    const env = bundle.deploymentNodes.find(
      (n) => n.kind === 'environment' && n.id === node.environmentId,
    );
    addNode({
      key: nodeKey('deployment', node.id),
      kind: 'deployment',
      id: node.id,
      label: node.name,
      ...(env?.name === undefined ? {} : { secondary: env.name }),
      // DeploymentNode has no `description` field (only runtime/scale, shown
      // as attributes elsewhere) -- left undefined rather than composed.
      metadata: node.metadata,
    });
  }

  for (const integration of bundle.integrations) {
    addNode({
      key: nodeKey('integration', integration.id),
      kind: 'integration',
      id: integration.id,
      label: integration.name,
      // Integration has no `description` field (protocol/counterpart/
      // dataExchanged are shown as attributes elsewhere, not a description).
      metadata: integration.metadata,
    });
  }

  // --- Edges: every one below reuses a join already verified in journey-detail.ts ---

  for (const journey of bundle.journeys) {
    addEdge(nodeKey('persona', journey.personaId), nodeKey('journey', journey.id), 'experiences');
  }

  for (const journey of bundle.journeys) {
    const journeyFlows = journey.flowIds
      .map((flowId) => bundle.flows.find((f) => f.id === flowId))
      .filter((f): f is ExecutionFlow => f !== undefined);

    const touchedEntities = new Set<string>();
    const touchedSourceIds = new Set<string>();
    for (const flow of journeyFlows) {
      for (const step of flow.steps) {
        for (const e of step.readsEntities) touchedEntities.add(e);
        for (const e of step.writesEntities) touchedEntities.add(e);
        for (const p of step.metadata.provenance) touchedSourceIds.add(p.sourceId);
      }
    }

    for (const entityName of touchedEntities) {
      addEdge(nodeKey('journey', journey.id), nodeKey('entity', entityName), 'touches');
    }
    for (const container of bundle.containers) {
      if (container.metadata.provenance.some((p) => touchedSourceIds.has(p.sourceId))) {
        addEdge(nodeKey('journey', journey.id), nodeKey('service', container.id), 'realised by');
      }
    }
  }

  for (const [entityName, aggregateIds] of entityToAggregateIds) {
    for (const aggregateId of aggregateIds) {
      addEdge(nodeKey('entity', entityName), nodeKey('concept', aggregateId), 'belongs to');
    }
  }

  for (const capability of bundle.capabilities) {
    for (const [aggregateId, domainId] of aggregateDomainId) {
      if (domainId === capability.domainId) {
        addEdge(nodeKey('concept', aggregateId), nodeKey('capability', capability.id), 'realizes');
      }
    }
  }

  for (const container of bundle.containers) {
    if (container.technology) {
      addEdge(
        nodeKey('service', container.id),
        nodeKey('technology', container.technology),
        'built with',
      );
    }
  }

  for (const node of bundle.deploymentNodes) {
    if (node.kind === 'instance' && node.containerId !== undefined) {
      addEdge(nodeKey('service', node.containerId), nodeKey('deployment', node.id), 'deployed as');
    }
  }

  for (const integration of bundle.integrations) {
    const integrationSourceIds = new Set(integration.metadata.provenance.map((p) => p.sourceId));
    for (const container of bundle.containers) {
      if (container.metadata.provenance.some((p) => integrationSourceIds.has(p.sourceId))) {
        addEdge(
          nodeKey('service', container.id),
          nodeKey('integration', integration.id),
          'integrates via',
        );
      }
    }
  }

  return { nodesByKey, nodes: [...nodesByKey.values()], edges };
}

export interface RelatedGroup {
  readonly kind: CorrelationKind;
  readonly nodes: readonly CorrelationNode[];
}

export interface RelatedResult {
  readonly center: CorrelationNode;
  /** Related nodes reachable within `maxDepth` hops, grouped by kind, nearest first within each group. */
  readonly groups: readonly RelatedGroup[];
  /** Direct (1-hop) neighbors only -- what the visual diagram renders by default, so it never starts "enormous". */
  readonly immediateNeighborKeys: ReadonlySet<string>;
}

const GROUP_ORDER: readonly CorrelationKind[] = [
  'persona',
  'journey',
  'capability',
  'concept',
  'entity',
  'service',
  'technology',
  'deployment',
  'integration',
];

/**
 * `journey`, `entity`, and `capability` are HUB kinds -- each is
 * many-to-many with at least one neighboring kind (many journeys touch many
 * entities; many concepts share one capability/domain). Left unchecked, a
 * blind BFS uses a hub reached partway through the traversal as a bridge to
 * a SIBLING of the same kind (e.g. "this journey also touches this OTHER
 * entity", or "this concept's capability also comprises this OTHER
 * concept") and then keeps expanding from that sibling -- which surfaces
 * technically-real but misleadingly-indirect correlations (e.g. a Persona
 * who experiences a completely different journey that merely happens to
 * share one entity with the selected journey, or a Domain Entity that only
 * "relates" to the selected one because both aggregates happen to sit under
 * the same business capability). To keep every shown correlation genuinely
 * meaningful rather than "reachable if you squint", a hub node may only be
 * used as a further bridge when it IS the traversal's own center, or when it
 * was reached directly (1 hop) from the center -- any hub reached at depth
 * >= 2 is still shown (a real, honestly-reported connection), just not
 * expanded past.
 */
const HUB_KINDS: ReadonlySet<CorrelationKind> = new Set(['journey', 'entity', 'capability']);

/**
 * Breadth-first correlation from any node, in either direction along every
 * edge (the conceptual chain is symmetric) -- the SAME traversal answers
 * "what relates to this Journey", "what relates to this Service", "what
 * relates to this Entity", etc., without a bespoke reverse-lookup function
 * per kind. Depth is capped (default 4, generous -- the real limiter against
 * an oversized result is the hub rule above, not this number) so a
 * pathological case still terminates.
 */
export function getRelated(
  graph: CorrelationGraph,
  centerKey: string,
  maxDepth = 4,
): RelatedResult | undefined {
  const center = graph.nodesByKey.get(centerKey);
  if (center === undefined) return undefined;

  const adjacency = new Map<string, string[]>();
  for (const edge of graph.edges) {
    (adjacency.get(edge.from) ?? adjacency.set(edge.from, []).get(edge.from)!).push(edge.to);
    (adjacency.get(edge.to) ?? adjacency.set(edge.to, []).get(edge.to)!).push(edge.from);
  }

  function isExpandable(key: string, depth: number): boolean {
    if (key === centerKey || depth <= 1) return true;
    const node = graph.nodesByKey.get(key);
    return node === undefined ? false : !HUB_KINDS.has(node.kind);
  }

  const depthByKey = new Map<string, number>([[centerKey, 0]]);
  const queue: string[] = [centerKey];
  const immediateNeighborKeys = new Set<string>();

  while (queue.length > 0) {
    const current = queue.shift()!;
    const depth = depthByKey.get(current)!;
    if (depth >= maxDepth || !isExpandable(current, depth)) continue;
    for (const neighborKey of adjacency.get(current) ?? []) {
      if (depthByKey.has(neighborKey)) continue;
      depthByKey.set(neighborKey, depth + 1);
      queue.push(neighborKey);
      if (depth === 0) immediateNeighborKeys.add(neighborKey);
    }
  }

  const byKind = new Map<CorrelationKind, { node: CorrelationNode; depth: number }[]>();
  for (const [key, depth] of depthByKey) {
    if (key === centerKey) continue;
    const node = graph.nodesByKey.get(key);
    if (node === undefined) continue;
    const list = byKind.get(node.kind) ?? [];
    list.push({ node, depth });
    byKind.set(node.kind, list);
  }

  const groups: RelatedGroup[] = GROUP_ORDER.filter((k) => k !== center.kind && byKind.has(k)).map(
    (k) => ({
      kind: k,
      nodes: [...byKind.get(k)!]
        .sort((a, b) => a.depth - b.depth || a.node.label.localeCompare(b.node.label))
        .map((entry) => entry.node),
    }),
  );

  return { center, groups, immediateNeighborKeys };
}

export const CORRELATION_KIND_LABEL: Readonly<Record<CorrelationKind, string>> = {
  persona: 'Persona',
  journey: 'Journey',
  capability: 'Business Capability',
  concept: 'Business Concept',
  entity: 'Domain Entity',
  service: 'Service',
  technology: 'Technology',
  deployment: 'Deployment',
  integration: 'Integration',
};

/**
 * PC-HR-03 — mirrors `ReviewItem.status` exactly (`'pending' | 'confirmed' |
 * 'corrected'`), plus `'none'` for "no review item currently references
 * this object" -- never collapsed into a single "reviewed" bucket, so the
 * detail panel can honestly distinguish "Human Reviewed / Validated" from
 * "Human Corrected" rather than reporting both as one undifferentiated
 * status.
 */
export type ReviewStatus = 'pending' | 'confirmed' | 'corrected' | 'none';

/**
 * PC-09/PC-HR-03 — every real review item that currently references this
 * object, reusing the exact same whole-word name-matching join
 * `build-graph.ts`'s cross-refs already use to connect a review item to the
 * element it's about (never a second, parallel review-linking scheme).
 */
export function reviewMatchesFor(
  reviewItems: readonly ReviewItem[] | undefined,
  label: string,
): readonly ReviewItem[] {
  if (!reviewItems || reviewItems.length === 0) return [];
  return reviewItems.filter((item) => mentions(item.elementName, label));
}

/**
 * PC-09/PC-HR-03 — the object's real review status, derived from its
 * matching review item(s)' real `status` field. `'none'` means no open or
 * resolved review item currently references this object -- not
 * "validated", which would claim more than the data actually shows. When
 * multiple matches disagree, `pending` wins (still needs attention), then
 * `corrected` (a real change was made), then `confirmed`.
 */
export function reviewStatusFor(
  reviewItems: readonly ReviewItem[] | undefined,
  label: string,
): ReviewStatus {
  const matches = reviewMatchesFor(reviewItems, label);
  if (matches.length === 0) return 'none';
  if (matches.some((item) => item.status === 'pending')) return 'pending';
  if (matches.some((item) => item.status === 'corrected')) return 'corrected';
  return 'confirmed';
}

export const CORRELATION_KIND_LABEL_PLURAL: Readonly<Record<CorrelationKind, string>> = {
  persona: 'Personas',
  journey: 'Journeys',
  capability: 'Business Capabilities',
  concept: 'Business Concepts',
  entity: 'Domain Entities',
  service: 'Services',
  technology: 'Technology',
  deployment: 'Deployment',
  integration: 'Integrations',
};
