import { defineConfig } from 'vitest/config';

/**
 * Release readiness (P8): a per-test time budget that holds under `pnpm test`.
 *
 * Nineteen route tests (`*.empty`, `*.error`, `graph`, `review-audit`) mock a
 * service with `vi.mock` and then `await import()` the route module INSIDE the
 * test body, so a cold module load counts against the test's time budget.
 * Alone that takes well under a second; under `pnpm test`, with every
 * package's suite competing for the CPU, one such test took 5.4s and failed
 * vitest's 5s default -- a timing failure, not a behavioural one (the same
 * test passed in the next full run).
 *
 * Nothing about what is tested changes: every assertion is as before. The
 * budget only stops machine load from being reported as a test failure.
 */
export default defineConfig({
  test: {
    testTimeout: 20_000,
  },
});
