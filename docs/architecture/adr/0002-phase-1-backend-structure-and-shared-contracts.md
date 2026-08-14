# ADR 0002: Phase 1 backend structure and shared API/data contracts

- **Status:** Accepted
- **Date:** 2026-08-14
- **Owners:** Platform maintainers

## Context

Phase 1 ("Backend Foundation & Current UI Integration") required `@phoenix-ai/api` to serve
real data for the six functional areas `apps/web`'s mock provider already models — System
Summary, Architecture, Domain Model, Integrations, Deployment/NFR, and Review/Gaps/Drift —
without introducing persistence, a new web framework, or any later-phase pipeline logic (OKF
rendering, knowledge graph storage, the drift-detection engine, ontology, connectors, etc.).

Before this work, `@phoenix-ai/api` had a single `/health` route with no service layer, no
error handling, and no shared contract types. `apps/web/src/data/types.ts` independently
defined the same six areas' shapes that `@phoenix-ai/api` would now need to produce, which
risked the two drifting apart the moment either side changed a field.

## Decision

1. **Layering.** `@phoenix-ai/api` is organized as `routes/` (registration + request parsing)
   → `services/` (return typed data) → `data/seed.ts` (static fixture data) — one file per
   resource at each layer, extending the pattern already established by `routes/health.ts`
   rather than introducing a new structure.
2. **Shared contracts.** The six functional areas' response types are defined once in
   `packages/shared/src/contracts.ts`. `apps/web/src/data/types.ts` imports and re-exports
   them instead of redefining them locally, so both apps type-check against the same
   definitions. `GraphElementMetadata` (previously duplicated between `packages/shared` and
   `apps/web`) is now sourced only from `packages/shared`.
3. **Seed data.** `@phoenix-ai/api`'s responses are backed by a static, self-contained copy of
   the existing "Aurora Commerce" fixture data (ported, not imported — `apps/api` must not
   depend on `apps/web`), so `VITE_DATA_SOURCE=mock` and `VITE_DATA_SOURCE=api` render
   identical demo content.
4. **CORS.** Cross-origin support for `apps/web`'s Vite dev server (port 3000 calling port
   3001 directly, no dev-server proxy) is implemented as a plain Fastify `onRequest` hook
   rather than adding `@fastify/cors`.
5. **Error handling.** A global `setErrorHandler` and `setNotFoundHandler`
   (`apps/api/src/errors.ts`) return a consistent `{ statusCode, error, message }` shape for
   every route. Server errors (5xx) are logged but their message is masked from the client;
   expected errors (e.g. a thrown `ApiError`) pass their message through.
6. **Validation.** The one endpoint with a parameter (`GET /api/architecture?level=`) uses
   Fastify's native JSON-schema `querystring` validation instead of adding a validation
   library (zod/ajv).
7. **No response envelope.** Routes return the resource directly (an object or array matching
   the shared contract type), not wrapped in `{ data: ... }` — this matches what
   `apps/web/src/data/api/apiProvider.ts` already expected before this work.
8. `@phoenix-ai/api`'s existing (as yet unused) workspace dependencies on
   `@phoenix-ai/knowledge-graph`, `@phoenix-ai/okf-renderers`, and `@phoenix-ai/review-loop`
   were left untouched — removing them was out of scope for Phase 1 and would signal moving
   away from the architecture those packages represent.

## Consequences

`@phoenix-ai/api` and `apps/web` can no longer silently drift on the shape of these six
functional areas — a route or service that returns the wrong shape now fails
`@phoenix-ai/api`'s own type-check, not just `apps/web`'s. The six areas' contract types live
in `packages/shared`, the one package every other package may already depend on (see
`packages/shared/README.md`), so no new inter-package dependency was introduced. Adding the
remaining `OkfDataProvider` methods (Execution Flows, Personas, Journeys, Epics, full Graph) in
a later phase should follow the same routes → services → seed-data layering and add their
types to `packages/shared/src/contracts.ts` alongside the existing ones.

## Alternatives considered

- **Define contracts in `@phoenix-ai/api` and have `apps/web` import from it** — rejected:
  `apps/web` must remain independently deployable as a static site with no backend (its
  `mock` mode, per `apps/web/README.md`), so it cannot depend on `@phoenix-ai/api`.
- **Add `@fastify/cors`** — rejected for Phase 1: a five-line hook covers the one cross-origin
  case Phase 1 needs without a new dependency or a fresh `pnpm install`.
- **Wrap successful responses in an envelope** (e.g. `{ data: ... }`) — rejected: it would
  require changing `apiProvider.ts`, which already expects and works against raw JSON, for no
  benefit.
- **Add zod/ajv as a standalone validation layer** — rejected: Fastify's native `schema` option
  already covers Phase 1's one validated parameter.
