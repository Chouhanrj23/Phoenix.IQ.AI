# Phoenix.ai

> Verified, continuously current system knowledge — reconstructed from a system's existing artifacts, every claim backed by evidence.

Enterprise systems accumulate knowledge faster than they document it. Phoenix reads a system's existing artifacts and produces a structured, evidence-backed knowledge bundle — the **OKF bundle** — describing its data model, domains, integrations, execution flows and deployment topology. Every element carries provenance (where it came from), evidence (file and line) and confidence, and successive runs are versioned and diffed to report drift.

See `docs/requirements/` for the Business, Product and Functional Requirements, and [`docs/phase-8/README.md`](./docs/phase-8/README.md) for the current end-to-end status, stage contracts and remaining gaps.

## What works today

- **One analysis run reads one git repository** (remote `https://`/`ssh://`, or a local directory when explicitly allowed) and runs the full pipeline: ingestion → redaction of secrets/PII → deterministic extraction → rule-based inference → validated knowledge graph → OKF → graph version → drift changelog → gap plan.
- **Extraction** is deterministic (parsing, not model inference) and covers: Java/Spring source (JPA entities, repositories, REST controllers, calls, configuration), Maven module layout, `application.properties`/`.yml`, Dockerfiles, docker-compose files and Kubernetes workload manifests, and git commit history (change coupling, single-owner knowledge risk).
- **Outputs**: the OKF document, the eleven OKF artifact views (DBML + data dictionary, Structurizr C4 DSL, mermaid flow and deployment diagrams, markdown), a portable export with a SHA-256 manifest, a drift changelog, a gap plan and a round-trip evaluation report.
- **Review loop**: human decisions (confirm / correct / reject) are recorded durably in Neo4j and propagated to the corrected node; the OKF output can be regenerated with corrections applied.
- **API and UI**: `apps/api` registers sources, runs analyses and serves their outputs; `apps/web` is the review UI (see its README for which pages show real data).

Jira and document-space connectors, and the Jira-to-canonical mapping, exist as tested libraries in `packages/ingestion-connectors` and `packages/extraction-engine`, but are **not** part of an API run. `runPipeline` accepts claims from other sources programmatically (for reconciliation); the API does not.

## Current limitations

Verified against the implementation; details in [`docs/phase-8/README.md`](./docs/phase-8/README.md).

- **Most web domain pages show seed data.** System summary, Architecture, Domain Model, Integrations, Deployment, NFRs and the review queue are served from the API's static seed (`apps/api/src/data/seed.ts`), not from analysis runs. Drift and Gaps show real run output once a run exists (and say "sample data" until then). Execution Flows, Personas & Journeys, Business capabilities and Backlog come from bundled demo fixtures in API mode, labelled as such. A run's real views are available over the API (`/api/runs/:id/artifacts`, `/api/runs/:id/export`).
- **No screen or NFR extractor.** Those two of the eleven artifacts are rendered as `unavailable`, with the input they would need, and appear as gaps.
- **Code extraction produces no `architecture.*` objects.** The C4 view uses IaC deployment units as containers when no container is declared, and says so.
- **Tenancy is data isolation, not authentication.** Graph nodes are keyed on `(id, systemId)` and every scoped query filters on `systemId`; API listings filter by `systemId`. The API has no authentication: `systemId` is a request parameter, not a verified identity.
- **Existing graph data may need re-persisting.** Nodes written before tenancy was introduced carry no `systemId`, so tenant-scoped reads and review corrections do not match them.
- **Inference is rule-based** and has limited precision (e.g. descriptive text such as `Map To Table "orders"` can surface as a concept). Inferred elements are always marked `derived` and await review.
- **No model is called** by any stage, so model-tier routing (FR-ORC-02) and agent/model-context isolation (FR-SEC-05/06) are not applicable. Prompt-injection neutralisation is likewise not implemented.
- **API runs do not persist to Neo4j.** A run's `graph-persistence` stage reports `skipped`; its output is stored in the run workspace and versions store, and `/api/full-graph` shows only what was persisted by other means (e.g. tests or programmatic `runPipeline` with a graph target).

## Repository structure

```
.
├── apps/
│   ├── api/                 # Fastify API: sources, runs, run outputs, review workflow, graph
│   └── web/                 # React review & correction UI (Vite)
├── packages/                # One package per pipeline module (see below)
├── docs/
│   ├── requirements/        # BRD, PRD, FRD (source of truth for scope)
│   ├── architecture/adr/    # Architecture Decision Records
│   ├── ontology/, okf/      # Knowledge model and OKF references
│   ├── phase-1/ … phase-8/  # Per-phase status records (phase-8 is the current one)
│   ├── runbooks/, web-ui/
├── infra/                   # Deployment notes (placeholder)
├── scripts/                 # Repo automation
└── docker-compose.yml       # Local Neo4j
```

## Pipeline modules (`packages/`)

| Package                 | Responsibility (as implemented)                                                                                       |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `ingestion-connectors`  | Git repository connector (files, revision, commit history); Jira and document-space connectors (library only)         |
| `redaction-hardening`   | Detects and redacts secrets/PII before extraction; quarantines content it cannot scan; encrypted, non-retaining vault |
| `extraction-engine`     | Deterministic extraction: Java/Spring, config, IaC, commit history; bridges facts to canonical objects; parse cache   |
| `inference-engine`      | Rule-based inference of business concepts, capabilities, journeys and entity states (always marked `derived`)         |
| `knowledge-graph`       | Canonical knowledge model, validation, OKF document and YAML serialisation                                            |
| `reconciliation-engine` | Reconciles claims across sources; keeps every position of a conflict; confidence from source agreement                |
| `graph-persistence`     | Maps the bundle to Neo4j and persists/queries it, tenant-scoped                                                       |
| `okf-renderers`         | The eleven OKF artifact views and the portable export                                                                 |
| `gap-analysis`          | Coverage per artifact and collaborative gap items naming the missing input                                            |
| `drift-detection`       | Content-addressed graph versions, version stores, drift changelog                                                     |
| `review-loop`           | Records review decisions and propagates corrections to the graph and canonical bundle                                 |
| `evaluation-harness`    | Golden system, precision/recall and clustering metrics, round-trip verification, CI gate                              |
| `orchestration`         | `runPipeline` / `runReviewCycle`: the stage sequence with per-stage accounting                                        |
| `shared`                | Shared contracts, logging, config and ordering utilities                                                              |

## Getting started

Prerequisites: Node.js ≥ 20 (`.nvmrc`), pnpm 9 (`corepack enable` provides the pinned version), git, and Docker (for Neo4j and for the integration tests).

```bash
corepack enable
pnpm install
pnpm build          # required once: workspace packages resolve through their dist/ output
```

### 1. Neo4j (optional for the UI demo; required for graph and durable review storage)

```bash
cp .env.example .env        # then set NEO4J_PASSWORD in .env
docker compose up -d        # Neo4j 5 on bolt://localhost:7687, browser on http://localhost:7474
```

`docker compose` reads `.env` itself and refuses to start without `NEO4J_PASSWORD`. **The API does not read `.env`** — pass the variables in its environment (see below).

### 2. API (port 3001)

```bash
pnpm --filter @phoenix-ai/api build
cd apps/api
node --env-file=../../.env dist/index.js     # or export the variables, then: pnpm start
# development, with reload:  pnpm --filter @phoenix-ai/api dev   (reads the shell environment)
```

Without Neo4j the API still starts: `/api/full-graph` answers 503 with an explanation, and review decisions fall back to an in-process store whose responses say `durability: "memory"`.

To analyse a repository:

```bash
curl -X POST localhost:3001/api/sources -H 'content-type: application/json' \
  -d '{"id":"shop","label":"Shop","locator":"https://github.com/org/repo.git"}'
curl -X POST localhost:3001/api/runs -H 'content-type: application/json' -d '{"sourceId":"shop"}'
curl localhost:3001/api/runs/<run-id>            # poll until "succeeded"; then /okf, /artifacts, /export, …
```

### 3. Web UI (port 3000)

```bash
pnpm --filter @phoenix-ai/web dev               # demo mode: bundled fixture data, no backend
```

To use the API instead, create `apps/web/.env.local` with `VITE_DATA_SOURCE=api` (see `apps/web/.env.example`).

`pnpm dev` at the root starts every package's watcher plus the API and the web dev server together.

## Environment variables

| Variable                                  | Used by                | Default                 | Notes                                                                        |
| ----------------------------------------- | ---------------------- | ----------------------- | ---------------------------------------------------------------------------- |
| `NEO4J_URI`                               | API, graph-persistence | `bolt://localhost:7687` |                                                                              |
| `NEO4J_USER`                              | API, docker compose    | `neo4j`                 |                                                                              |
| `NEO4J_PASSWORD`                          | API, docker compose    | **none — required**     | No default anywhere; without it the graph is reported unavailable            |
| `NEO4J_DATABASE`                          | API                    | `neo4j`                 |                                                                              |
| `NEO4J_CONNECTION_TIMEOUT_MS`             | API                    | `5000`                  | Bound on establishing a connection                                           |
| `NEO4J_CONNECTION_ACQUISITION_TIMEOUT_MS` | API                    | `10000`                 | Bound on acquiring a pooled connection                                       |
| `PORT` / `HOST`                           | API                    | `3001` / `0.0.0.0`      |                                                                              |
| `CORS_ORIGIN`                             | API                    | `http://localhost:3000` | The web app's origin                                                         |
| `PHOENIX_WORKSPACE_DIR`                   | API                    | `.phoenix-workspace`    | Sources, runs, outputs and graph versions; relative to the API's working dir |
| `PHOENIX_SYSTEM_ID`                       | API                    | `aurora-commerce`       | Default tenant for routes called without `?systemId=` and for review storage |
| `PHOENIX_ALLOW_LOCAL_SOURCES`             | API                    | `false`                 | `true` allows `file://` sources — development only                           |
| `VITE_DATA_SOURCE`                        | web                    | `mock`                  | `mock` (fixtures) or `api`                                                   |
| `VITE_API_BASE_URL`                       | web                    | `http://localhost:3001` | Used when `VITE_DATA_SOURCE=api`                                             |
| `PHOENIX_NEO4J_INTEGRATION`               | tests                  | (unset)                 | `skip` skips the live-Neo4j suites                                           |

## Tests and checks

```bash
pnpm test          # all suites (Turborepo); container-backed suites need Docker
pnpm typecheck
pnpm lint
pnpm build
pnpm format:check
```

- `graph-persistence` and `orchestration`'s `pipeline.neo4j` start their own throwaway Neo4j containers (Testcontainers). Without a container runtime the orchestration suite skips with the reason; `graph-persistence`'s container suites cannot run.
- `review-loop`'s live suite uses a running Neo4j at `NEO4J_URI` (e.g. the compose instance) and skips when none is reachable, or when `PHOENIX_NEO4J_INTEGRATION=skip`.
- `evaluation-harness` runs the real pipeline over its golden repository and fails if precision/recall drop below 0.9 or any claim contradicts its cited source.

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for branching, commit conventions, and the PR process. See [docs/architecture/adr](./docs/architecture/adr) before making a significant architectural change.

## Security

This platform is designed to operate on regulated, sensitive source material (see BRD §9, Constraints). See [SECURITY.md](./SECURITY.md) for the vulnerability disclosure process and data-handling constraints.

## License

See [LICENSE](./LICENSE).
