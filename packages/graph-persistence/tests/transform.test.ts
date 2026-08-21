import { describe, expect, it } from 'vitest';
import type { GraphNodeMapping, GraphRelationshipMapping } from '../src/graph-mapping.js';
import {
  buildGraphWriteOperations,
  buildNodeWriteOperation,
  buildRelationshipWriteOperation,
} from '../src/transform.js';

const NODE: GraphNodeMapping = {
  id: 'ent-1',
  label: 'Entity',
  properties: { id: 'ent-1', kind: 'domain.entity', label: 'Order', confidenceLevel: 'high' },
  provenance: [
    {
      sourceId: 'repo://aurora-commerce',
      sourceType: 'source-code',
      derivedBy: 'extraction-engine',
      derivedAt: '2026-08-21T00:00:00.000Z',
    },
  ],
  evidence: [{ id: 'ev-1', sourceId: 'repo://aurora-commerce', locator: 'Order.java#L10' }],
};

const RELATIONSHIP: GraphRelationshipMapping = {
  id: 'rel-1',
  type: 'DEPENDS_ON',
  sourceId: 'api-1',
  targetId: 'ent-1',
  properties: { id: 'rel-1', kind: 'dependsOn', category: 'association' },
  provenance: [
    {
      sourceId: 'repo://aurora-commerce',
      sourceType: 'source-code',
      derivedBy: 'extraction-engine',
      derivedAt: '2026-08-21T00:00:00.000Z',
    },
  ],
  evidence: [],
};

describe('buildNodeWriteOperation', () => {
  it('produces a parameterized MERGE keyed on id, with the label interpolated (Cypher cannot parameterize labels)', () => {
    const op = buildNodeWriteOperation(NODE);
    expect(op.cypher).toBe('MERGE (n:Entity {id: $id}) SET n += $properties RETURN n');
    expect(op.params.id).toBe('ent-1');
  });

  it('serializes provenance/evidence to lossless JSON properties, not flattened scalars', () => {
    const op = buildNodeWriteOperation(NODE);
    expect(JSON.parse(op.params.properties.provenanceJson as string)).toEqual(NODE.provenance);
    expect(JSON.parse(op.params.properties.evidenceJson as string)).toEqual(NODE.evidence);
  });

  it('serializes an empty provenance/evidence array as valid JSON "[]", not omitted', () => {
    const noEvidence: GraphNodeMapping = { ...NODE, evidence: [] };
    const op = buildNodeWriteOperation(noEvidence);
    expect(op.params.properties.evidenceJson).toBe('[]');
  });

  it('carries every other flattened property through unchanged', () => {
    const op = buildNodeWriteOperation(NODE);
    expect(op.params.properties.kind).toBe('domain.entity');
    expect(op.params.properties.label).toBe('Order');
    expect(op.params.properties.confidenceLevel).toBe('high');
  });

  it('never inserts a random id -- the operation id is exactly the mapping input id', () => {
    const first = buildNodeWriteOperation(NODE);
    const second = buildNodeWriteOperation(NODE);
    expect(first.id).toBe(NODE.id);
    expect(first.id).toBe(second.id);
  });
});

describe('buildRelationshipWriteOperation', () => {
  it('matches endpoints by id only and merges keyed on the relationship id', () => {
    const op = buildRelationshipWriteOperation(RELATIONSHIP);
    expect(op.cypher).toBe(
      'MATCH (source {id: $sourceId}), (target {id: $targetId}) MERGE (source)-[r:DEPENDS_ON {id: $relationshipId}]->(target) SET r += $properties RETURN r',
    );
    expect(op.params.sourceId).toBe('api-1');
    expect(op.params.targetId).toBe('ent-1');
    expect(op.params.relationshipId).toBe('rel-1');
  });

  it('preserves provenance losslessly as JSON', () => {
    const op = buildRelationshipWriteOperation(RELATIONSHIP);
    expect(JSON.parse(op.params.properties.provenanceJson as string)).toEqual(
      RELATIONSHIP.provenance,
    );
  });
});

describe('buildGraphWriteOperations -- deterministic, no fabrication', () => {
  it('builds exactly one write operation per node/relationship, nothing invented', () => {
    const result = buildGraphWriteOperations({ nodes: [NODE], relationships: [RELATIONSHIP] });
    expect(result.nodeOperations).toHaveLength(1);
    expect(result.relationshipOperations).toHaveLength(1);
    expect(result.nodeOperations[0]?.id).toBe(NODE.id);
    expect(result.relationshipOperations[0]?.id).toBe(RELATIONSHIP.id);
  });

  it('produces byte-identical output across two runs over the same input', () => {
    const mapping = { nodes: [NODE], relationships: [RELATIONSHIP] };
    const first = buildGraphWriteOperations(mapping);
    const second = buildGraphWriteOperations(mapping);
    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it('handles an empty mapping without error', () => {
    const result = buildGraphWriteOperations({ nodes: [], relationships: [] });
    expect(result).toEqual({ nodeOperations: [], relationshipOperations: [] });
  });
});
