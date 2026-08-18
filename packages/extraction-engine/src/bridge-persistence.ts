/**
 * P3-07 -- bridges a JPA `@Entity` into a real, validated `EntityObject`.
 * See `bridge-shared.ts` for the shared rationale (only annotation-decidable
 * mappings bridge; deterministic ids; everything else stays a fact).
 */

import {
  CANONICAL_SCHEMA_VERSION,
  type AttributeDefinition,
  type EntityObject,
} from '@phoenix-ai/knowledge-graph';
import type { JavaJpaEntityFact } from './java-persistence.js';
import { deterministicId, evidenceFor, simpleNameOf, type BridgeOptions } from './bridge-shared.js';

/** Maps a JPA `@Entity` to a real, validated `EntityObject` (`domain.entity`). */
export function bridgeJpaEntity(entity: JavaJpaEntityFact, options: BridgeOptions): EntityObject {
  const fields: AttributeDefinition[] = entity.columns.map((column) => ({
    name: column.fieldName,
    type: column.javaType,
    required: entity.idFields.includes(column.fieldName),
  }));

  return {
    identity: {
      id: deterministicId('entity', options.systemId, entity.qualifiedName),
      systemId: options.systemId,
      createdAt: options.generatedAt,
      updatedAt: options.generatedAt,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'domain.entity',
    label: simpleNameOf(entity.qualifiedName),
    attributes: {
      fields,
      ...(entity.tableName === undefined
        ? {}
        : { description: `Maps to table "${entity.tableName}".` }),
    },
    metadata: {
      provenance: [
        {
          sourceId: options.sourceId,
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: options.generatedAt,
        },
      ],
      confidence: { level: 'high' },
    },
    evidence: [evidenceFor(entity, options, 'entity', entity.qualifiedName)],
    confidenceDetail: { basis: 'observed' },
  };
}
