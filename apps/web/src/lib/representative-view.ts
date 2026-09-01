import type { GraphEdge, GraphNode } from '../data/index.js';

export interface RepresentativeSelection {
  readonly visibleNodesByKind: ReadonlyMap<string, readonly GraphNode[]>;
  /** How many nodes are actually being rendered (across all active kinds). */
  readonly shownCount: number;
  /** How many nodes of the active kinds exist in total — never fewer than `shownCount`, and always the FULL real count (nothing was deleted, only not-yet-rendered). */
  readonly totalCount: number;
}

/**
 * PC-07 — representative view selection for the Knowledge Graph Explorer.
 * A large, real repository analysis can produce hundreds of nodes; showing
 * all of them the instant the page loads is exactly the "huge raw graph"
 * problem the ticket asks to avoid. This function decides which subset is
 * RENDERED by default — it never removes anything from the underlying
 * dataset (`totalCount` always reflects every real node of an active kind,
 * and `showAll: true` reveals all of them with zero data loss).
 *
 * When a kind must be trimmed to `limitPerKind`, nodes that participate in
 * at least one real relationship are kept ahead of isolated ones ("prioritize
 * directly related nodes"), then ties break alphabetically for a stable,
 * predictable result — never a fabricated or non-deterministic sample.
 */
export function selectRepresentativeNodes(
  nodes: readonly GraphNode[],
  edges: readonly GraphEdge[],
  activeKinds: ReadonlySet<string>,
  limitPerKind: number,
  showAll: boolean,
): RepresentativeSelection {
  const connectedIds = new Set<string>();
  for (const edge of edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  const byKind = new Map<string, GraphNode[]>();
  let totalCount = 0;
  for (const node of nodes) {
    if (!activeKinds.has(node.kind)) continue;
    totalCount += 1;
    const list = byKind.get(node.kind) ?? [];
    list.push(node);
    byKind.set(node.kind, list);
  }

  for (const list of byKind.values()) {
    list.sort((a, b) => {
      const aConnected = connectedIds.has(a.id) ? 0 : 1;
      const bConnected = connectedIds.has(b.id) ? 0 : 1;
      return aConnected - bConnected || a.label.localeCompare(b.label);
    });
  }

  const visibleNodesByKind = new Map<string, readonly GraphNode[]>();
  let shownCount = 0;
  for (const [kind, list] of byKind) {
    const capped = showAll ? list : list.slice(0, limitPerKind);
    visibleNodesByKind.set(kind, capped);
    shownCount += capped.length;
  }

  return { visibleNodesByKind, shownCount, totalCount };
}
