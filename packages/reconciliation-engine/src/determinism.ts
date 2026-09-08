/**
 * P6-05 -- a stable, content-derived identifier, never a random UUID
 * (FR-DET-07). The same `sha256`-over-stable-inputs technique
 * `@phoenix-ai/extraction-engine`'s `bridge-shared.ts` already uses,
 * reimplemented locally here rather than imported: `reconciliation-engine`
 * and `extraction-engine` are sibling, same-stage pipeline packages
 * (`packages/*-engine`), and depending on another engine package for one
 * ten-line helper would be the wrong direction of coupling for what is
 * genuinely a shared, generic utility, not shared domain logic.
 */

import { createHash } from 'node:crypto';

export function deterministicId(prefix: string, ...parts: string[]): string {
  const hash = createHash('sha256').update(parts.join(' '), 'utf8').digest('hex');
  return `${prefix}-${hash.slice(0, 16)}`;
}
