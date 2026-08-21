# @phoenix-ai/graph-persistence

**Module:** Knowledge Graph (Neo4j persistence)
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Knowledge Graph"

## Responsibility

Owns the Neo4j connection boundary for projecting the canonical OKF model (`@phoenix-ai/knowledge-graph`)
into a queryable graph. The Phase 2 OKF remains the canonical knowledge representation; Neo4j is a
derived, disposable, re-ingestible projection of it — not a second knowledge representation.

## Status — Phase 4 prerequisites + P4-01 (P4-02 through P4-09: not started)

This package contains the Phase 4 prerequisite fix (a real, working Neo4j connection with clear, typed
failure behavior, and a proven local-dev/testing strategy — see
`docs/architecture/adr/0023-phase-4-prerequisites.md`) plus P4-01's OKF → graph mapping (see
`docs/architecture/adr/0024-p4-01-graph-mapping.md`).

- `loadNeo4jConfig` (`config.ts`) — reads `NEO4J_URI`/`NEO4J_USER`/`NEO4J_PASSWORD`/`NEO4J_DATABASE`
  from the environment via `@phoenix-ai/shared`'s `getEnv`. `NEO4J_PASSWORD` has no default anywhere
  in this repository — a credential must never have a hardcoded fallback.
- `createNeo4jDriver`/`verifyNeo4jConnectivity`/`closeNeo4jDriver` (`neo4j-client.ts`) — creates a
  real `neo4j-driver` instance, proves it can reach and authenticate against a real Neo4j database
  with a real query (not just an open socket), and closes it. Any failure (unreachable host, wrong
  credentials, wrong database) surfaces as a `Neo4jUnavailableError`, never a raw, unhandled driver
  exception.
- `mapOkfObjectToGraphNode`/`mapOkfRelationshipToGraphRelationship`/`mapOkfBundleToGraph`
  (`graph-mapping.ts`, **P4-01**) — maps every one of the OKF's 15 real object kinds and 19 relationship
  kinds (17 schema-supported + 2 currently Phase-3-produced) to a Neo4j label/relationship-type, a
  Neo4j-safe property bag, and losslessly-preserved provenance/evidence. Pure and synchronous: does not
  import `neo4j-driver`, open a session, or run Cypher. See `docs/architecture/adr/0024-p4-01-graph-mapping.md`
  for the complete node/relationship tables and identity/provenance/confidence strategy.

**Not yet implemented** (separate, later tickets — do not exist in this package yet):
OKF→Cypher transformation (P4-02), node/relationship persistence (P4-03/P4-04), provenance/confidence
persistence (P4-05/P4-06), the graph query layer (P4-07), consistency validation (P4-09). `apps/api`
does not import this package yet either — that wiring is P4-07. `apps/web`'s Knowledge Graph UI is
unmodified — the OKF↔UI vocabulary adapter this will eventually need is documented, not built
(ADR 0024 decision 7).

## Local development

1. `cp .env.example .env` (repo root) and set `NEO4J_PASSWORD` — no default is provided.
2. `docker compose up -d` (repo root `docker-compose.yml`) — starts a persistent local Neo4j 5
   Community instance. Neo4j Browser: <http://localhost:7474>; Bolt: `bolt://localhost:7687`.
3. `docker compose down` to stop it; the `neo4j_data` named volume persists data across restarts,
   `docker compose down -v` to also discard it.

## Testing

Automated tests use a **real** Neo4j instance via [Testcontainers](https://testcontainers.com/) —
`tests/neo4j-client.test.ts` starts and tears down its own ephemeral container per test run.
**Neo4j is never mocked** for graph-persistence integration tests, matching this repo's existing
"don't mock real infrastructure" discipline (`packages/ingestion-connectors/tests/git-connector.test.ts`,
`packages/extraction-engine/tests/pipeline-e2e.test.ts`).

Requires a working Docker daemon on the machine running `pnpm --filter @phoenix-ai/graph-persistence
test` — the same requirement every Testcontainers-based test has. The `neo4j:5-community` image is
pulled on first run (the very first run is noticeably slower; the image is cached afterward).

## Failure behavior

Every function that talks to Neo4j (`verifyNeo4jConnectivity`, and every future function built on top
of it) either succeeds or throws `Neo4jUnavailableError` — never hangs indefinitely, never silently
no-ops, never lets a raw `neo4j-driver` exception escape uncaught. `Neo4jUnavailableError` always
carries the original driver error as `.cause`, so nothing about the underlying failure is lost.
