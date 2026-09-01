import type { Provenance } from '@phoenix-ai/shared';
import type { CorrelationNode, RelatedGroup } from './correlation.js';

/**
 * PC-HR-02 — technical traceability: "where did this information come from
 * technically?" Both functions below are pure reads over the SAME
 * "service"/"concept" related groups `getRelated()` already computes (see
 * `lib/correlation.ts`) — never a second relationship system, never an
 * invented join.
 */

/**
 * The real Service(s) technically realising this object — reuses the
 * "service" related group already computed for the object (for a
 * Journey/Entity/Concept/Persona/Capability this is reached through the
 * journey/entity/concept joins already established in `lib/correlation.ts`);
 * empty for a Service itself (nothing to chain to below itself), and empty
 * whenever no service genuinely correlates.
 */
export function technicalEvidenceServices(
  node: CorrelationNode,
  groups: readonly RelatedGroup[],
): readonly CorrelationNode[] {
  if (node.kind === 'service') return [];
  return groups.find((g) => g.kind === 'service')?.nodes ?? [];
}

/**
 * Real `sourceType: 'data-model'` provenance entries connecting this
 * business object to the physical/technical schema it was derived from.
 * Concept (Aggregate) carries this directly; Entity (a bare name inside an
 * Aggregate) reads it off the same "concept" related group already
 * computed above, never a new join. Returns an empty list — never an
 * invented mapping — when no such provenance exists, e.g. a concept only
 * ever cited from a wiki page rather than a schema file.
 */
export function physicalModelProvenance(
  node: CorrelationNode,
  groups: readonly RelatedGroup[],
): readonly Provenance[] {
  const candidates: readonly CorrelationNode[] =
    node.kind === 'entity' ? (groups.find((g) => g.kind === 'concept')?.nodes ?? []) : [node];
  const seen = new Set<string>();
  const result: Provenance[] = [];
  for (const candidate of candidates) {
    for (const p of candidate.metadata?.provenance ?? []) {
      if (p.sourceType === 'data-model' && !seen.has(p.sourceId)) {
        seen.add(p.sourceId);
        result.push(p);
      }
    }
  }
  return result;
}
