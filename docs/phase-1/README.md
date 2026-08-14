# Phoenix Phase 1 — Completed Work

Living status record for Phase 1 ("Backend Foundation & Current UI Integration"). Updated as
each Phase 1 prompt/ticket lands, so contributors have one place to check what's actually done
vs. what the tracker says is done — see the **scope note** below, it matters.

Design rationale for the changes described here is recorded separately in
[`docs/architecture/adr/0002-phase-1-backend-structure-and-shared-contracts.md`](../architecture/adr/0002-phase-1-backend-structure-and-shared-contracts.md);
this document is the narrative status report, not a duplicate of that ADR.

## ⚠️ Scope note — read before starting P1-03 onward

The original Phase 1 tracker (produced during discovery) listed these as separate items:

> P1-03 System Summary API · P1-04 Architecture API · P1-05 Domain Model API ·
> P1-06 Integrations API · P1-07 Deployment/NFR APIs · P1-08 Review/Gaps/Drift APIs

**These six areas already have working backend routes and shared contract types**, built as
part of P1-01/P1-02 (see below) — P1-01 asked to "finalize backend/API structure" and P1-02
explicitly scoped its contracts to these same six areas, so the two were implemented together
using real routes as the concrete proof of the structure/contracts, rather than stub routes
followed by a separate implementation pass per area.

**Before starting P1-03–P1-08 as new work**: check `apps/api/src/routes/` and
`apps/api/src/services/` first. In most cases the ticket is already satisfied and only needs
verification, not new implementation. Re-implementing these from scratch would duplicate
existing, tested code.

What is genuinely still open: P1-09 (broader frontend integration validation), P1-10 (mock
dependency reduction), P1-11 (full end-to-end browser validation — only `curl`-level checks
have been done so far), P1-12 (demo readiness in `api` mode), and the endpoints outside these
six areas (execution flows, personas, journeys, epics, full graph — no route exists for these).

---

## P1-01 — Backend/API Structure

**Existing backend architecture identified** (discovery, Prompt 1): `apps/api` was a bare
Fastify v5 scaffold — one file (`src/index.ts`, 17 lines) bootstrapping the server and reading
`PORT` from `process.env` inline, plus one route module (`src/routes/health.ts`) exposing
`GET /health`. No service layer, no data access layer, no validation, no global error handler,
no config module. Three workspace dependencies (`@phoenix-ai/knowledge-graph`,
`@phoenix-ai/okf-renderers`, `@phoenix-ai/review-loop`) were declared but never imported.

**Structure finalized:**

```
apps/api/src/
  index.ts              — bootstrap: config, CORS hook, error handling, route registration
  config.ts             — env-driven PORT / HOST / CORS_ORIGIN (new)
  errors.ts             — global error handler + not-found handler (new)
  routes/
    health.ts             — GET /health (existing, unchanged)
    system-summary.ts      — GET /api/system-summary (new)
    architecture.ts         — GET /api/architecture?level= (new)
    domains.ts               — GET /api/domains (new)
    integrations.ts          — GET /api/integrations (new)
    deployment.ts             — GET /api/deployment-topology (new)
    nfrs.ts                    — GET /api/nfrs (new)
    review-items.ts             — GET /api/review-items (new)
    gap-items.ts                  — GET /api/gap-items (new)
    drift.ts                       — GET /api/drift-alerts, GET /api/drift-history (new)
  services/               — one *.service.ts per resource above (new); pure functions
                             returning typed data, no I/O
  data/
    seed.ts                — static seed data backing the services above (new)
```

**Modules/layers involved:** `routes/` (Fastify registration + request parsing) →
`services/` (typed data access) → `data/seed.ts` (static fixtures). No controllers layer —
route handlers call services directly, matching Fastify's idiomatic style and the size of
Phase 1's logic.

**Data access layer:** none (by design). Phase 1 has no persistence requirement; all responses
are backed by static, in-memory seed data ported from `apps/web`'s existing "Aurora Commerce"
mock fixtures. Introducing a database is explicitly out of scope for Phase 1.

**Configuration approach:** `config.ts` reads `PORT`, `HOST`, `CORS_ORIGIN` via the pre-existing
`getEnv()` helper from `@phoenix-ai/shared`, each with a working default — no `.env` file is
required to run the app.

**Error-handling approach:** a global `setErrorHandler` and `setNotFoundHandler`
(`errors.ts`) return a consistent `{ statusCode, error, message }` shape for every route.
Server (5xx) errors are logged via `@phoenix-ai/shared`'s `logger` but their message is masked
from the client; expected errors (e.g. a thrown `ApiError`, or Fastify's own validation
failures) pass their message through with the appropriate 4xx status.

**Important architectural decisions** (full rationale in ADR 0002):

- CORS handled via a plain Fastify `onRequest` hook, not a new `@fastify/cors` dependency.
- The one endpoint with a parameter (`GET /api/architecture?level=`) uses Fastify's native
  JSON-schema query validation rather than adding zod/ajv.
- Responses are returned raw (no `{ data: ... }` envelope), matching what
  `apps/web/src/data/api/apiProvider.ts` already expected.
- Seed data is a self-contained copy inside `apps/api`, not an import from `apps/web` (wrong
  dependency direction) or a new shared fixtures package (out of scope).

**Existing functionality preserved:** `GET /health` and its test are byte-for-byte unchanged.
`apps/web`'s mock mode (`VITE_DATA_SOURCE=mock`, the default) is entirely unaffected — nothing
under `apps/web/src/data/mock/` was touched.

## P1-02 — Shared API/Data Contracts

**Shared types introduced** — `packages/shared/src/contracts.ts` (new file), covering exactly
the six Phase 1 functional areas:

| Area              | Types                                                                                |
| ----------------- | ------------------------------------------------------------------------------------ |
| System Summary    | `SystemSummary`                                                                      |
| Architecture      | `C4Level`, `C4Node`, `C4Edge`                                                        |
| Domain Model      | `Domain`, `Aggregate`                                                                |
| Integrations      | `Integration`, `IntegrationDirection`                                                |
| Deployment/NFR    | `DeploymentNode`, `DeploymentNodeKind`, `NonFunctionalRequirement`, `NfrCategory`    |
| Review/Gaps/Drift | `ReviewItem`, `ConflictingValue`, `GapItem`, `GapSeverity`, `DriftAlert`, `DriftRun` |

`GraphElementMetadata` (already defined in `packages/shared/src/provenance.ts` but
independently re-declared in `apps/web`) was consolidated to the one definition in
`packages/shared` — this was a pre-existing duplication, fixed as part of this work, not a new
type.

**API request/response contracts:** each backend route returns exactly the shape of its
corresponding shared type (or an array of it, or `{ nodes, edges }` for architecture) — no
wrapper/envelope.

**Consumers:**

- `apps/api/src/services/*.service.ts` — return these types directly.
- `apps/web/src/data/types.ts` — imports and re-exports the same types from
  `@phoenix-ai/shared` instead of redefining them, so every existing `import type { X } from
'../data/types.js'` across ~15 files kept working unchanged.

**Naming conventions:** unchanged from what `apps/web` already used — types were relocated,
not renamed, to avoid any ripple effect on consuming code.

**Important fields:** every domain type carries a `metadata: GraphElementMetadata` field
(`{ provenance: Provenance[]; confidence: Confidence }`) — this is the load-bearing shape for
the product's "every element traceable to a source, every element has a confidence" principle,
and every new backend route populates it from real seed data (not omitted or stubbed).

**Compatibility considerations:** `apps/web`'s `OkfDataProvider` interface (15 methods) is
unchanged — only 10 of its methods are now backed by real routes; the other 5
(`getExecutionFlows`, `getPersonas`, `getJourneys`, `getEpics`, `getFullGraph`) still throw if
called in `api` mode, by design (out of Phase 1 scope). Types for those five stay local to
`apps/web/src/data/types.ts` and were deliberately **not** moved to `packages/shared` yet.

**Design decisions:** contracts live in `packages/shared` (not `apps/api` or `apps/web`)
because it's the one package every other package may already depend on
(`packages/shared/README.md`), and because `apps/web` must remain independently deployable as a
static site with no backend dependency in `mock` mode.

## Prompt 1 — Discovery Outcome

Prompt 1 was a read-only inspection — **no files were changed**; nothing below should be read
as a code change.

- **Frontend architecture:** React 18 + Vite, Tailwind, a hand-rolled shadcn-style component
  layer, `reactflow` + `recharts`, no global state library. A single `OkfDataProvider`
  interface (`apps/web/src/data/types.ts`) is implemented by two providers — `mockProvider`
  (in-browser fixtures, default) and `apiProvider` (real `fetch` calls) — switched by
  `VITE_DATA_SOURCE`. Every page consumes only `dataProvider`, never mock/api modules directly.
- **Backend architecture:** `apps/api` was a bare Fastify v5 scaffold with a single `/health`
  route — no services, no persistence, no validation, no error handler.
- **Existing API/provider structure:** `apiProvider.ts` already called 15 REST paths that had
  no backend implementation at the time; its own code comment said so explicitly.
- **Mock/static data identified:** `apps/web/src/data/mock/{aurora,fintech}/` — two complete
  fixture datasets, one per demo company, covering every `OkfDataProvider` method.
- **Phase 1 implementation mapping:** produced a 12-item tracker (P1-01 through P1-12); the
  six functional-area API items (P1-03–P1-08) were mapped as MISSING at the time — see the
  scope note above for how that changed once P1-01/P1-02 were implemented.
- **Dependencies/blockers identified:** contract-type duplication risk between `apps/web` and a
  future `apps/api` if not consolidated first; no persistence-layer decision needed for Phase 1;
  `apps/api`'s unused dependencies on `@phoenix-ai/knowledge-graph` /
  `@phoenix-ai/okf-renderers` / `@phoenix-ai/review-loop` are scaffolds, not usable yet.
- **Recommended implementation order** (as given, followed in Prompt 2): consolidate contract
  types → establish `apps/api` routing/error/config conventions → implement routes in
  UI-priority order → validate end-to-end.

---

## File-Level Change Summary

| File                                                                                                                               | Change   | Reason                                                                                   | Phase Item  |
| ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- | ----------- |
| `apps/api/src/index.ts`                                                                                                            | Modified | Wire config, CORS hook, error handling, register 9 new routes                            | P1-01       |
| `apps/api/src/config.ts`                                                                                                           | Created  | Env-driven `PORT`/`HOST`/`CORS_ORIGIN`                                                   | P1-01       |
| `apps/api/src/errors.ts`                                                                                                           | Created  | Consistent error/not-found response shape                                                | P1-01       |
| `apps/api/src/data/seed.ts`                                                                                                        | Created⚠ | Static seed data for the 6 functional areas — **currently gitignored, see Known Issues** | P1-01       |
| `apps/api/src/services/*.service.ts` (9 files)                                                                                     | Created  | Service layer, one per resource                                                          | P1-01       |
| `apps/api/src/routes/{system-summary,architecture,domains,integrations,deployment,nfrs,review-items,gap-items,drift}.ts` (9 files) | Created  | Route layer, one per resource                                                            | P1-01       |
| `apps/api/tests/*.test.ts` (10 files)                                                                                              | Created  | Coverage for new routes, error handler, config                                           | P1-01       |
| `apps/api/README.md`                                                                                                               | Modified | Document Phase 1 status, endpoint table, ADR link                                        | P1-01       |
| `packages/shared/src/contracts.ts`                                                                                                 | Created  | 6-area contract types                                                                    | P1-02       |
| `packages/shared/src/index.ts`                                                                                                     | Modified | Export `contracts.ts`                                                                    | P1-02       |
| `packages/shared/README.md`                                                                                                        | Modified | Correct stale "scaffold only" status                                                     | P1-02       |
| `apps/web/src/data/types.ts`                                                                                                       | Modified | Consume shared contracts instead of local duplicates                                     | P1-02       |
| `apps/web/src/data/api/apiProvider.ts`                                                                                             | Modified | Comment updated: which endpoints are now real                                            | P1-02       |
| `apps/web/README.md`                                                                                                               | Modified | Reflect new endpoint status                                                              | P1-02       |
| `CHANGELOG.md`                                                                                                                     | Modified | Record P1-01/P1-02 under `[Unreleased]`                                                  | P1-01/P1-02 |
| `docs/architecture/adr/0002-...md`                                                                                                 | Created  | Record design decisions for both                                                         | P1-01/P1-02 |
| `docs/phase-1/README.md`                                                                                                           | Created  | This document                                                                            | P1-01/P1-02 |

No files were deleted. Prompt 1 (discovery) produced no file changes.

## Developer Handover Notes (Dev 1 / Dev 2 / Dev 3)

**Current backend structure:** `routes/` → `services/` → `data/seed.ts`. Add new resources by
adding one file at each layer, following the existing files exactly — don't introduce a
controllers layer or DTO classes, that's not this project's convention.

**Current API contract structure:** shared response types live in
`packages/shared/src/contracts.ts`. Add new Phase-appropriate types there, not directly in
`apps/web/src/data/types.ts` (which now only re-exports what's in `shared` for the six Phase 1
areas — types for later-phase areas correctly still live only in `apps/web` until their phase).

**Conventions to follow:** no response envelope (return the resource directly); Fastify native
`schema` for query/body validation, not a new validation library; errors thrown as `ApiError`
(`apps/api/src/errors.ts`) or left to Fastify's own validation, never a bespoke error shape per
route; env vars read via `getEnv()` from `@phoenix-ai/shared`, never `process.env` directly.

**Do NOT duplicate:**

- The six functional areas' routes/services (`system-summary`, `architecture`, `domains`,
  `integrations`, `deployment`, `nfrs`, `review-items`, `gap-items`, `drift`) — check
  `apps/api/src/routes/` before starting P1-03–P1-08.
- `GraphElementMetadata`/`Provenance`/`Confidence` — already in `packages/shared/src/provenance.ts`.
- The CORS hook, error handler, or config loader in `apps/api/src/index.ts` / `errors.ts` / `config.ts`.

**Known limitations:**

- No persistence layer — all data is static/in-memory; restarting the API resets nothing
  (there's nothing mutable to reset).
- Seed data (`apps/api/src/data/seed.ts`) is a hand-ported copy of `apps/web`'s Aurora mock
  fixtures, not a shared source — if the Aurora mock fixtures change, the seed file needs a
  matching manual update.
- Only `curl`-level smoke testing has been done against the live server; no automated
  browser/E2E test exists yet for `api` mode.

**Dependencies for P1-03 onward:** per the scope note above, P1-03–P1-08 are largely already
satisfied — verify against `apps/api/src/routes/` before writing new code. P1-09 (frontend
integration validation), P1-10 (mock reduction), P1-11 (E2E validation), and P1-12 (demo
readiness) remain genuinely open and depend on nothing further from P1-01/P1-02.

---

## Phase 1 Status

### P1-01 — Backend/API Structure

**Status: Completed**

### P1-02 — Shared API/Data Contracts

**Status: Completed**

### Files changed

`CHANGELOG.md`, `apps/api/README.md`, `apps/api/src/index.ts`, `apps/web/README.md`,
`apps/web/src/data/api/apiProvider.ts`, `apps/web/src/data/types.ts`,
`packages/shared/README.md`, `packages/shared/src/index.ts`

### Files created

`docs/architecture/adr/0002-phase-1-backend-structure-and-shared-contracts.md`,
`docs/phase-1/README.md`, `packages/shared/src/contracts.ts`, `apps/api/src/config.ts`,
`apps/api/src/errors.ts`, `apps/api/src/data/seed.ts` (gitignored — see Known Issues), 9
`apps/api/src/services/*.service.ts`, 9 `apps/api/src/routes/*.ts`, 10
`apps/api/tests/*.test.ts`

### Tests executed

`apps/api` (19 tests, 12 files), `apps/web` (26 tests, 8 files), `packages/shared` (1 test) —
via `vitest run` per package.

### Build/type-check result

Clean across `packages/shared`, `apps/api`, `apps/web` — `tsc -b`/`tsc -b --noEmit` and `vite
build` all passed with no errors at the time P1-01/P1-02 were implemented.

### Known issues

- **`apps/api/src/data/seed.ts` is currently gitignored.** The root `.gitignore` has a blanket
  `data/` rule (intended for "Knowledge graph local runtime data — never commit
  ingested/analysed content") with an exception carved out only for `apps/web/src/data/`. This
  silently excludes `apps/api/src/data/`, so `seed.ts` shows as untracked with no `git status`
  entry and would **not** be committed as-is. This needs a `.gitignore` fix (e.g. an
  `!apps/api/src/data/` exception) before P1-01's work can be safely committed — flagged here,
  not fixed, since this documentation task is scoped to not modify anything.
- Nothing else outstanding from P1-01/P1-02 — see the scope note at the top of this document
  for the P1-03–P1-08 tracker/reality mismatch, which is a planning note, not a defect.

### Remaining Phase 1 work

P1-09 (frontend integration validation beyond what P1-01/P1-02 already unblocked), P1-10 (mock
dependency reduction), P1-11 (full E2E browser validation), P1-12 (demo readiness in `api`
mode), plus routes for the five areas outside the original six (execution flows, personas,
journeys, epics, full graph).
