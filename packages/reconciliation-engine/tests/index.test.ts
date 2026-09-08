import { describe, expect, it } from 'vitest';
import {
  CLAIM_CATEGORIES,
  authorityOf,
  boundCompositeConfidence,
  claimFromObject,
  deterministicId,
  rankConflicts,
  reconcileClaims,
} from '../src/index.js';

// P6-05 replaced the scaffold's MODULE_NAME/placeholder() with the real
// Reconciliation & Confidence Engine (see claim.test.ts, reconcile.test.ts,
// composite-confidence.test.ts for the substantive coverage) — the same
// thing every other package's P-0X ticket did to its own scaffold. This
// file just confirms the package's public entry point re-exports each part.

describe('@phoenix-ai/reconciliation-engine entry point', () => {
  it('exports the claim contract', () => {
    expect(CLAIM_CATEGORIES).toEqual(['structure', 'behaviour', 'deployment', 'intent']);
    expect(typeof authorityOf).toBe('function');
    expect(typeof claimFromObject).toBe('function');
  });

  it('exports the reconciliation algorithm', () => {
    expect(typeof reconcileClaims).toBe('function');
    expect(typeof rankConflicts).toBe('function');
  });

  it('exports composite confidence bounding', () => {
    expect(typeof boundCompositeConfidence).toBe('function');
  });

  it('exports the deterministic id helper', () => {
    expect(deterministicId('x', 'a', 'b')).toBe(deterministicId('x', 'a', 'b'));
  });
});
