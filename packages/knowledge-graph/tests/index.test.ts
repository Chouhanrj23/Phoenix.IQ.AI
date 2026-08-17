import { describe, expect, it } from 'vitest';
import { CANONICAL_SCHEMA_VERSION } from '../src/index.js';

// P2-01 replaced the scaffold's MODULE_NAME/placeholder() with the real
// canonical model (see canonical-object.test.ts, relationships.test.ts,
// bundle.test.ts, validation.test.ts for the substantive coverage). This
// file just confirms the package's public entry point exports it.

describe('@phoenix-ai/knowledge-graph entry point', () => {
  it('exports the canonical schema version', () => {
    expect(CANONICAL_SCHEMA_VERSION).toBe('2026-08-p2-02');
  });
});
