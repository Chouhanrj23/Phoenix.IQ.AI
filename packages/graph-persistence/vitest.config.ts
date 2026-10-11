import { defineConfig } from 'vitest/config';

/**
 * Release readiness (P8): run this package's test files one at a time.
 *
 * Five files (`ingest`, `neo4j-client`, `provenance-confidence`, `query`,
 * `tenant-isolation`) each start their own real Neo4j container in
 * `beforeAll` and stop it in `afterAll`. Vitest runs files in parallel by
 * default, so under `pnpm test` -- alongside every other package's suites --
 * five Neo4j containers booted at once and some did not report "Started."
 * within the container's 120s startup wait; their tests were then skipped
 * and the package failed. Run on its own the package passed, so the cause
 * was contention, not the tests.
 *
 * Serialising the files removes the contention without touching what is
 * tested: every test still runs against its own real, isolated Neo4j
 * instance, and each container is still stopped in `afterAll` (which vitest
 * runs even when tests fail; testcontainers' reaper removes it if the
 * process dies). The remaining files are pure unit tests, so the cost is
 * only the sequential container start-up.
 */
export default defineConfig({
  test: {
    fileParallelism: false,
  },
});
