# @phoenix-ai/api

Fastify API for Phoenix: registers sources, runs analyses through the real pipeline
(`@phoenix-ai/orchestration`) and serves their outputs; records human review decisions; serves the
persisted knowledge graph; and serves the Phase 1 seed views the web app still uses.

`src/app.ts` builds the app (routes, CORS, error handling, resource cleanup); `src/index.ts`
starts it and handles SIGINT/SIGTERM with a graceful, bounded shutdown.

## Running

The API reads configuration from its **process environment only** — it does not load `.env`.

```bash
pnpm build                                   # once, from the repo root (workspace packages resolve via dist/)
cd apps/api
node --env-file=../../.env dist/index.js     # Node ≥ 20.6; or export the variables and run `pnpm start`
pnpm dev                                     # development: tsx watch, reads the shell environment
```

It starts without Neo4j: graph routes then answer 503 with an explanation, and review decisions
use an in-process store (see Review below).

## Configuration

| Variable                                  | Default                 | Purpose                                                                                                              |
| ----------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `PORT` / `HOST`                           | `3001` / `0.0.0.0`      | Listen address. `PORT` must be an integer 1–65535                                                                    |
| `CORS_ORIGIN`                             | `http://localhost:3000` | The web app's origin                                                                                                 |
| `NEO4J_URI`                               | `bolt://localhost:7687` | Graph and durable review storage                                                                                     |
| `NEO4J_USER` / `NEO4J_DATABASE`           | `neo4j` / `neo4j`       |                                                                                                                      |
| `NEO4J_PASSWORD`                          | none — required         | Without it the graph is reported unavailable (no fallback credential)                                                |
| `NEO4J_CONNECTION_TIMEOUT_MS`             | `5000`                  |                                                                                                                      |
| `NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS` | `10000`                 |                                                                                                                      |
| `PHOENIX_WORKSPACE_DIR`                   | `.phoenix-workspace`    | Where sources, runs, run outputs and graph versions are stored (gitignored)                                          |
| `PHOENIX_SYSTEM_ID`                       | `aurora-commerce`       | Default tenant (`systemId`) for routes called without `?systemId=`, and the tenant review decisions are stored under |
| `PHOENIX_ALLOW_LOCAL_SOURCES`             | `false`                 | `true` allows `file://` sources (development only)                                                                   |

## Endpoints

### Sources, runs and run outputs (real pipeline output)

| Method | Path                           | Notes                                                                                                                                                                                            |
| ------ | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/sources?systemId=`       | Registered sources of one system                                                                                                                                                                 |
| POST   | `/api/sources`                 | `{ id, locator, label?, branch?, systemId? }` → 201. Locator: `https://` or `ssh://` git URL; `file://` only with `PHOENIX_ALLOW_LOCAL_SOURCES=true`; URLs with embedded credentials are refused |
| GET    | `/api/runs?systemId=`          | Runs of one system, oldest first                                                                                                                                                                 |
| POST   | `/api/runs`                    | `{ sourceId, systemId? }` → 202 `queued`; runs execute one at a time, in order                                                                                                                   |
| GET    | `/api/runs/:id`                | Status (`queued`/`running`/`succeeded`/`failed`), stage reports, summary, version id                                                                                                             |
| GET    | `/api/runs/:id/okf`            | The OKF document (YAML)                                                                                                                                                                          |
| GET    | `/api/runs/:id/artifacts`      | The eleven artifact views: status, missing inputs, files                                                                                                                                         |
| GET    | `/api/runs/:id/export`         | Export manifest (every file with its SHA-256)                                                                                                                                                    |
| GET    | `/api/runs/:id/export/<path>`  | One export file, by its manifest path                                                                                                                                                            |
| GET    | `/api/runs/:id/changelog`      | Drift changelog against the previous version (a baseline on the first run)                                                                                                                       |
| GET    | `/api/runs/:id/gaps`           | Coverage per artifact and gap items                                                                                                                                                              |
| GET    | `/api/runs/:id/knowledge-risk` | Per-element ownership and staleness from commit history                                                                                                                                          |
| GET    | `/api/runs/:id/evaluation`     | Round-trip verification of claims against their cited source                                                                                                                                     |
| GET    | `/api/artifact-types`          | The eleven artifact ids                                                                                                                                                                          |

Output routes answer 409 for a run that has not succeeded, and 404 for another tenant's run. A
failed run reports the failing stage and its errors; failures outside the pipeline are logged
server-side and reported to the client only generically.

**Runs do not persist to Neo4j.** The run's `graph-persistence` stage reports `skipped`; its
knowledge is kept in the workspace (OKF, outputs, immutable graph versions).

### Drift and gaps

| Method | Path                 | Source                                                                  |
| ------ | -------------------- | ----------------------------------------------------------------------- |
| GET    | `/api/drift-history` | Changelogs of the default system's runs; the seed before any run exists |
| GET    | `/api/drift-alerts`  | The latest run's changes; the seed before any run exists                |
| GET    | `/api/gap-items`     | The latest run's gap plan; the seed before any run exists               |

Each response carries `x-phoenix-data-origin: pipeline` or `seed`.

### Knowledge graph

| Method | Path                        | Notes                                                                                                                                                                                       |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/full-graph?systemId=` | Nodes and relationships persisted in Neo4j; `systemId` scopes to one tenant. 503 when Neo4j is not configured or unreachable. Fixed, parameterised queries only — no caller-supplied Cypher |

### Review

| Method | Path                              | Notes                                                                                                                                          |
| ------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/review-items`               | The review queue (from the seed) with recorded decisions applied                                                                               |
| GET    | `/api/review-queue`               | The same items ranked by graph leverage and inverse confidence; confidence only (and `leverageAvailable: false`) when the graph is unreachable |
| POST   | `/api/review-decisions`           | Record a confirm / correct / reject decision; corrections are propagated to the graph node when Neo4j is available                             |
| GET    | `/api/review-decisions?targetId=` | Decisions recorded for one element                                                                                                             |
| GET    | `/api/review-metrics?from=&to=`   | Correction-rate metrics over the decision log                                                                                                  |
| GET    | `/api/review-audit?targetId=`     | Audit trail for one element (`targetId` required)                                                                                              |
| GET    | `/api/okf-sync-state`             | Whether OKF output is stale relative to recorded decisions                                                                                     |

Decisions are stored in Neo4j, scoped to `PHOENIX_SYSTEM_ID`, when it is configured and reachable.
Otherwise they go to an in-process store that does not survive a restart; every response then
says `durability: "memory"`, so it is never presented as durable.

### Seed views (Phase 1 sample data, not analysis output)

`/health`, `/api/system-summary`, `/api/architecture?level=context|container|component`,
`/api/domains`, `/api/integrations`, `/api/deployment-topology`, `/api/nfrs` are served from
`src/data/seed.ts` (the fictional "Aurora Commerce" system).

## Errors

Every error has the shape `{ statusCode, error, message }`. Messages written for clients (4xx and
Phoenix's own `ApiError`s) are returned; any other server failure returns a generic message and
is logged, so driver errors, Cypher and file paths never reach a client.

## Tenancy and security

`systemId` isolates data (graph nodes keyed on `(id, systemId)`, scoped queries, filtered
listings). There is **no authentication**: `systemId` is a request parameter, not a verified
identity. Graph nodes persisted before tenancy was introduced have no `systemId` and are not
matched by tenant-scoped reads or corrections; re-persist such data with a new pipeline run.

## Tests

`pnpm --filter @phoenix-ai/api test`. `tests/runs.test.ts` runs the real pipeline over a real
git repository; `tests/web-contract.test.ts` checks that every endpoint the web app calls exists.
