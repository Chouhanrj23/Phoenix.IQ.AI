import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SCHEMA_VERSION,
  validateCanonicalKnowledgeBundle,
  type CanonicalKnowledgeBundle,
  type ContainerObject,
} from '@phoenix-ai/knowledge-graph';
import { checkGraphConsistency } from '../src/consistency.js';
import type { QueriedGraph } from '../src/query.js';

const CONTAINER: ContainerObject = {
  identity: {
    id: 'ctr-1',
    systemId: 'aurora-commerce',
    createdAt: '2026-08-21T00:00:00.000Z',
    updatedAt: '2026-08-21T00:00:00.000Z',
    schemaVersion: CANONICAL_SCHEMA_VERSION,
  },
  category: 'entity',
  kind: 'architecture.container',
  label: 'Checkout Service',
  attributes: { responsibility: 'Orchestrates checkout.' },
  metadata: {
    provenance: [
      {
        sourceId: 'repo://aurora-commerce',
        sourceType: 'source-code',
        derivedBy: 'extraction-engine',
        derivedAt: '2026-08-21T00:00:00.000Z',
      },
    ],
    confidence: { level: 'high' },
  },
  evidence: [],
};

const BUNDLE: CanonicalKnowledgeBundle = {
  systemId: 'aurora-commerce',
  generatedAt: '2026-08-21T00:00:00.000Z',
  objects: [CONTAINER],
  relationships: [],
};

/** The graph a correct P4-02/P4-03 ingestion of BUNDLE would actually produce. */
function matchingGraph(): QueriedGraph {
  return {
    nodes: [
      {
        id: CONTAINER.identity.id,
        label: 'Container',
        properties: {
          id: CONTAINER.identity.id,
          kind: 'architecture.container',
          category: 'entity',
          label: 'Checkout Service',
          confidenceLevel: 'high',
          provenanceJson: JSON.stringify(CONTAINER.metadata.provenance),
          evidenceJson: '[]',
        },
      },
    ],
    relationships: [],
  };
}

describe('fixture sanity', () => {
  it('the fixture bundle is a real, valid Phase 2 OKF bundle', () => {
    expect(validateCanonicalKnowledgeBundle(BUNDLE)).toEqual({ valid: true, errors: [] });
  });
});

describe('checkGraphConsistency', () => {
  it('reports consistent for a graph that exactly matches the OKF bundle', () => {
    const report = checkGraphConsistency(BUNDLE, matchingGraph());
    expect(report).toEqual({ consistent: true, differences: [], unmappable: [] });
  });

  it('detects a missing node (in the OKF, not in the graph)', () => {
    const report = checkGraphConsistency(BUNDLE, { nodes: [], relationships: [] });
    expect(report.consistent).toBe(false);
    expect(report.differences).toEqual([
      {
        kind: 'missing-node',
        id: CONTAINER.identity.id,
        detail: expect.stringContaining('expected in the graph'),
      },
    ]);
  });

  it('detects an extra node (in the graph, not in the OKF)', () => {
    const graph = matchingGraph();
    const extended: QueriedGraph = {
      nodes: [
        ...graph.nodes,
        {
          id: 'ctr-fabricated',
          label: 'Container',
          properties: { id: 'ctr-fabricated', kind: 'architecture.container' },
        },
      ],
      relationships: [],
    };
    const report = checkGraphConsistency(BUNDLE, extended);
    expect(report.consistent).toBe(false);
    expect(report.differences).toEqual([
      {
        kind: 'extra-node',
        id: 'ctr-fabricated',
        detail: expect.stringContaining('not in the OKF bundle'),
      },
    ]);
  });

  it('detects a provenance mismatch', () => {
    const graph = matchingGraph();
    const mutated: QueriedGraph = {
      nodes: [
        {
          ...graph.nodes[0]!,
          properties: { ...graph.nodes[0]!.properties, provenanceJson: JSON.stringify([]) },
        },
      ],
      relationships: [],
    };
    const report = checkGraphConsistency(BUNDLE, mutated);
    expect(report.consistent).toBe(false);
    expect(report.differences.some((d) => d.kind === 'provenance-mismatch')).toBe(true);
  });

  it('detects a confidence mismatch', () => {
    const graph = matchingGraph();
    const mutated: QueriedGraph = {
      nodes: [
        {
          ...graph.nodes[0]!,
          properties: { ...graph.nodes[0]!.properties, confidenceLevel: 'low' },
        },
      ],
      relationships: [],
    };
    const report = checkGraphConsistency(BUNDLE, mutated);
    expect(report.consistent).toBe(false);
    expect(report.differences.some((d) => d.kind === 'confidence-mismatch')).toBe(true);
  });

  describe('relationships', () => {
    const SECOND: ContainerObject = {
      ...CONTAINER,
      identity: { ...CONTAINER.identity, id: 'ctr-2' },
    };
    const bundleWithRelationship: CanonicalKnowledgeBundle = {
      systemId: 'aurora-commerce',
      generatedAt: '2026-08-21T00:00:00.000Z',
      objects: [CONTAINER, SECOND],
      relationships: [
        {
          id: 'rel-1',
          category: 'composition',
          kind: 'contains',
          sourceObjectId: CONTAINER.identity.id,
          targetObjectId: SECOND.identity.id,
          metadata: {
            provenance: [
              {
                sourceId: 'repo://aurora-commerce',
                sourceType: 'source-code',
                derivedBy: 'extraction-engine',
                derivedAt: '2026-08-21T00:00:00.000Z',
              },
            ],
            confidence: { level: 'high' },
          },
        },
      ],
    };

    function graphWithRelationship(): QueriedGraph {
      return {
        nodes: [
          {
            id: CONTAINER.identity.id,
            label: 'Container',
            properties: {
              id: CONTAINER.identity.id,
              kind: 'architecture.container',
              category: 'entity',
              label: 'Checkout Service',
              confidenceLevel: 'high',
              provenanceJson: JSON.stringify(CONTAINER.metadata.provenance),
              evidenceJson: '[]',
            },
          },
          {
            id: SECOND.identity.id,
            label: 'Container',
            properties: {
              id: SECOND.identity.id,
              kind: 'architecture.container',
              category: 'entity',
              label: 'Checkout Service',
              confidenceLevel: 'high',
              provenanceJson: JSON.stringify(SECOND.metadata.provenance),
              evidenceJson: '[]',
            },
          },
        ],
        relationships: [
          {
            id: 'rel-1',
            type: 'CONTAINS',
            sourceId: CONTAINER.identity.id,
            targetId: SECOND.identity.id,
            properties: {
              id: 'rel-1',
              kind: 'contains',
              category: 'composition',
              confidenceLevel: 'high',
              provenanceJson: JSON.stringify(
                bundleWithRelationship.relationships[0]!.metadata.provenance,
              ),
              evidenceJson: '[]',
            },
          },
        ],
      };
    }

    it('reports consistent when relationships match exactly', () => {
      const report = checkGraphConsistency(bundleWithRelationship, graphWithRelationship());
      expect(report.consistent).toBe(true);
    });

    it('detects a missing relationship', () => {
      const graph = graphWithRelationship();
      const report = checkGraphConsistency(bundleWithRelationship, {
        nodes: graph.nodes,
        relationships: [],
      });
      expect(report.differences).toEqual([
        {
          kind: 'missing-relationship',
          id: 'rel-1',
          detail: expect.stringContaining('expected in the graph'),
        },
      ]);
    });

    it('detects an extra relationship', () => {
      const graph = graphWithRelationship();
      const extended: QueriedGraph = {
        nodes: graph.nodes,
        relationships: [
          ...graph.relationships,
          {
            id: 'rel-fabricated',
            type: 'CONTAINS',
            sourceId: CONTAINER.identity.id,
            targetId: SECOND.identity.id,
            properties: { id: 'rel-fabricated' },
          },
        ],
      };
      const report = checkGraphConsistency(bundleWithRelationship, extended);
      expect(report.differences).toEqual([
        {
          kind: 'extra-relationship',
          id: 'rel-fabricated',
          detail: expect.stringContaining('not in the OKF bundle'),
        },
      ]);
    });

    it('detects a mismatched relationship endpoint', () => {
      const graph = graphWithRelationship();
      const mutated: QueriedGraph = {
        nodes: graph.nodes,
        relationships: [{ ...graph.relationships[0]!, targetId: CONTAINER.identity.id }],
      };
      const report = checkGraphConsistency(bundleWithRelationship, mutated);
      expect(report.differences.some((d) => d.kind === 'relationship-endpoint-mismatch')).toBe(
        true,
      );
    });
  });

  it('is deterministic -- repeated calls over the same input produce byte-identical reports', () => {
    const first = checkGraphConsistency(BUNDLE, matchingGraph());
    const second = checkGraphConsistency(BUNDLE, matchingGraph());
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('never repairs anything -- it only reports, the input bundle/graph objects are untouched', () => {
    const graph = { nodes: [], relationships: [] };
    const bundleCopy = JSON.parse(JSON.stringify(BUNDLE));
    checkGraphConsistency(BUNDLE, graph);
    expect(BUNDLE).toEqual(bundleCopy);
  });

  it('reports an unmappable OKF object separately from a graph inconsistency', () => {
    const bundleWithUnknownKind: CanonicalKnowledgeBundle = {
      ...BUNDLE,
      objects: [{ ...CONTAINER, kind: 'not.a.real.kind' } as unknown as ContainerObject],
    };
    const report = checkGraphConsistency(bundleWithUnknownKind, { nodes: [], relationships: [] });
    expect(report.unmappable).toHaveLength(1);
    expect(report.differences).toEqual([]);
    expect(report.consistent).toBe(true);
  });
});
