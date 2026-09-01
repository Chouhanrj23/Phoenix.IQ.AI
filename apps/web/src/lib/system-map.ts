import type { CorrelationGraph, CorrelationKind } from './correlation.js';

/**
 * PC-05 — the fixed 11-layer system map definition. `entity-state`/`api`
 * are NOT real `CorrelationKind`s (no data source for either exists
 * anywhere in this app -- see `correlation.ts`'s header) but are still
 * listed as layers, honestly marked `available: false`, since the target
 * system model includes them.
 */
export type LayerId = CorrelationKind | 'entity-state' | 'api';

export interface LayerDef {
  readonly id: LayerId;
  readonly label: string;
  readonly x: number;
  readonly y: number;
  readonly available: boolean;
}

export const LAYERS: readonly LayerDef[] = [
  { id: 'persona', label: 'Persona', x: 360, y: 0, available: true },
  { id: 'journey', label: 'Journey', x: 360, y: 110, available: true },
  { id: 'entity', label: 'Domain Entity', x: 80, y: 220, available: true },
  { id: 'service', label: 'Service', x: 640, y: 220, available: true },
  { id: 'concept', label: 'Business Concept', x: 0, y: 330, available: true },
  { id: 'entity-state', label: 'Entity State', x: 220, y: 330, available: false },
  { id: 'technology', label: 'Technology', x: 440, y: 330, available: true },
  { id: 'deployment', label: 'Deployment', x: 620, y: 330, available: true },
  { id: 'integration', label: 'Integration', x: 800, y: 330, available: true },
  { id: 'api', label: 'API', x: 980, y: 330, available: false },
  { id: 'capability', label: 'Business Capability', x: 0, y: 440, available: true },
];

export const LAYER_EDGES: ReadonlyArray<{ from: LayerId; to: LayerId }> = [
  { from: 'persona', to: 'journey' },
  { from: 'journey', to: 'entity' },
  { from: 'journey', to: 'service' },
  { from: 'entity', to: 'concept' },
  { from: 'entity', to: 'entity-state' },
  { from: 'concept', to: 'capability' },
  { from: 'service', to: 'technology' },
  { from: 'service', to: 'deployment' },
  { from: 'service', to: 'integration' },
  { from: 'service', to: 'api' },
];

/** The real count of instances for a layer -- 0, never invented, for the 2 unavailable layers. */
export function countFor(graph: CorrelationGraph, layer: LayerDef): number {
  if (!layer.available) return 0;
  return graph.nodes.filter((n) => n.kind === layer.id).length;
}

/**
 * Whether the graph genuinely contains at least one edge directly
 * connecting these two kinds -- computed directly from the real graph,
 * never hand-asserted, so a layer pair with zero real connections (e.g.
 * anything touching `entity-state`/`api`, which structurally can never
 * appear in the graph) is always drawn as unavailable, and any OTHER pair
 * that happens to have no data in a given dataset is drawn the same way.
 */
export function hasRealEdge(graph: CorrelationGraph, a: LayerId, b: LayerId): boolean {
  return graph.edges.some((edge) => {
    const fromKind = graph.nodesByKey.get(edge.from)?.kind;
    const toKind = graph.nodesByKey.get(edge.to)?.kind;
    return (fromKind === a && toKind === b) || (fromKind === b && toKind === a);
  });
}
