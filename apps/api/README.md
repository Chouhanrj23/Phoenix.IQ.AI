# @phoenix-ai/api

Backend API serving the OKF knowledge bundle, drift reports, and the human review/correction
workflow to `apps/web`. Built on Fastify.

## Status — Phase 1 (Backend Foundation)

Routes are organized as `routes/` (registration, request parsing) → `services/` (return typed
data) → `data/seed.ts` (static fixture data, mirroring the "Aurora Commerce" dataset
`apps/web`'s mock provider ships with). No persistence layer yet — that's a later phase.
Design rationale: `docs/architecture/adr/0002-phase-1-backend-structure-and-shared-contracts.md`.

Reuses the existing Fastify instance and `registerXRoutes(app)` pattern established by
`routes/health.ts` (which is unchanged), and the `logger`/`getEnv` helpers already in
`@phoenix-ai/shared`. New in Phase 1: `config.ts`, `errors.ts`, `data/seed.ts`, and one
`routes/*.ts` + `services/*.service.ts` pair per resource below.

Implemented endpoints:

| Method | Path                                                    |
| ------ | ------------------------------------------------------- |
| GET    | `/health`                                               |
| GET    | `/api/system-summary`                                   |
| GET    | `/api/architecture?level=context\|container\|component` |
| GET    | `/api/domains`                                          |
| GET    | `/api/integrations`                                     |
| GET    | `/api/deployment-topology`                              |
| GET    | `/api/nfrs`                                             |
| GET    | `/api/review-items`                                     |
| GET    | `/api/gap-items`                                        |
| GET    | `/api/drift-alerts`                                     |
| GET    | `/api/drift-history`                                    |

Not yet implemented (later phases, over `@phoenix-ai/knowledge-graph`, `@phoenix-ai/okf-renderers`,
`@phoenix-ai/review-loop`): execution flows, personas, journeys, epics/backlog, and the full
knowledge graph endpoint. See the FRD's Interface Requirements (§5).

Response shapes are defined once in `@phoenix-ai/shared` (`src/contracts.ts`) and consumed by
both this app and `apps/web`, so the two never drift apart.

Errors use a consistent JSON shape (`{ statusCode, error, message }`) via a global error handler
and not-found handler in `src/errors.ts`. Config (`PORT`, `HOST`, `CORS_ORIGIN`) is read from the
environment in `src/config.ts`, with dev-friendly defaults.
