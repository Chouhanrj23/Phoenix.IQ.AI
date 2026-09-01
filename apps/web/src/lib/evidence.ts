import type { Provenance, SourceType } from '@phoenix-ai/shared';

/**
 * PC-HR-04 — human-readable labels for `Provenance.sourceType`, the same
 * enum `provenance-list.tsx` already renders (as an icon + the raw literal
 * string). Used only to make the "Evidence Sources" summary legible — the
 * underlying values are unchanged, real `sourceType`s, never invented ones.
 */
export const SOURCE_TYPE_LABEL: Readonly<Record<SourceType, string>> = {
  'source-code': 'Source Code',
  'technical-doc': 'Technical Documentation',
  'business-doc': 'Business Documentation',
  ticket: 'Tickets',
  log: 'Logs',
  'data-model': 'Data Model',
  test: 'Tests',
  recording: 'Recordings',
  other: 'Other',
};

export interface EvidenceSourceType {
  readonly type: SourceType;
  readonly label: string;
}

/**
 * The distinct real source TYPES represented in a real provenance list
 * (STEP 4 — "Evidence Sources: Source Code, Documentation, Configuration").
 * Order follows first appearance in the real provenance array; a source
 * type with zero real citations never appears. Returns an empty list —
 * never an invented one — when there is no provenance at all.
 */
export function distinctSourceTypes(
  provenance: readonly Provenance[],
): readonly EvidenceSourceType[] {
  const seen = new Set<SourceType>();
  const result: EvidenceSourceType[] = [];
  for (const p of provenance) {
    if (seen.has(p.sourceType)) continue;
    seen.add(p.sourceType);
    result.push({ type: p.sourceType, label: SOURCE_TYPE_LABEL[p.sourceType] });
  }
  return result;
}
