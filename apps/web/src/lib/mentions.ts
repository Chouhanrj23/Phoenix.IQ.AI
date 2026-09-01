/**
 * Whole-word, case-insensitive containment check — shared by every place in
 * the app that cross-references one real object against another by name
 * (`build-graph.ts`'s review/drift/gap/nfr/integration cross-refs; PC-09's
 * review-status lookup in `lib/correlation.ts`). Naive substring matching
 * produced false positives ("Product" matching "production"), so matches
 * only resolve on word boundaries.
 */
export function mentions(haystack: string, needle: string): boolean {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
}
