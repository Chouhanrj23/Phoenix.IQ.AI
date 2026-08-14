import type { C4Edge, C4Level, C4Node } from '@phoenix-ai/shared';
import { containerEdges, containerNodes, contextEdges, contextNodes } from '../data/seed.js';

export interface ArchitectureView {
  nodes: C4Node[];
  edges: C4Edge[];
}

export function getArchitecture(level: C4Level): ArchitectureView {
  if (level === 'context') {
    return { nodes: contextNodes, edges: contextEdges };
  }
  // Component level is not yet derivable from any ingested source (see Gap
  // Analysis); fall back to the container view rather than returning nothing,
  // matching apps/web's mock provider behavior for the same case.
  return { nodes: containerNodes, edges: containerEdges };
}
