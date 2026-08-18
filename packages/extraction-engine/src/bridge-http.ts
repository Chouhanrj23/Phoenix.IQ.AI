/**
 * P3-06 -- bridges a Spring MVC controller into a real, validated `ApiObject`.
 * See `bridge-shared.ts` for the shared rationale (only annotation-decidable
 * mappings bridge; deterministic ids; everything else stays a fact).
 */

import {
  CANONICAL_SCHEMA_VERSION,
  type ApiObject,
  type OperationDefinition,
} from '@phoenix-ai/knowledge-graph';
import type { JavaControllerFact } from './java-http.js';
import { deterministicId, evidenceFor, simpleNameOf, type BridgeOptions } from './bridge-shared.js';

/** Maps a Spring MVC controller to a real, validated `ApiObject` (`integration.api`), one per controller. */
export function bridgeSpringController(
  controller: JavaControllerFact,
  options: BridgeOptions,
): ApiObject {
  const operations: OperationDefinition[] = controller.routes.map((route) => ({
    name: `${route.httpMethod} ${route.path}`,
    description: `Handled by ${controller.qualifiedName}#${route.handlerMethod}.`,
  }));

  return {
    identity: {
      id: deterministicId('api', options.systemId, controller.qualifiedName),
      systemId: options.systemId,
      createdAt: options.generatedAt,
      updatedAt: options.generatedAt,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'integration.api',
    label: simpleNameOf(controller.qualifiedName),
    attributes: { operations },
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
    evidence: [evidenceFor(controller, options, 'api', controller.qualifiedName)],
    confidenceDetail: { basis: 'observed' },
  };
}
