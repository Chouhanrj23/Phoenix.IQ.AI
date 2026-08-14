# Changelog

All notable changes to this project will be documented in this file. Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versioning follows [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Initial corporate-grade repository scaffold: pnpm/Turborepo monorepo, one package per FRD pipeline module (`ingestion-connectors`, `redaction-hardening`, `extraction-engine`, `inference-engine`, `knowledge-graph`, `reconciliation-engine`, `okf-renderers`, `gap-analysis`, `drift-detection`, `review-loop`, `evaluation-harness`, `orchestration`, `shared`), `apps/api` and `apps/web` stubs.
- Governance docs (CONTRIBUTING, CODE_OF_CONDUCT, SECURITY), CI workflows, issue/PR templates, ADR template.
- Requirements documents (BRD, PRD, FRD) relocated to `docs/requirements/`.
- **Phase 1 — P1-01 (Backend/API structure):** real `@phoenix-ai/api` routes for the six Phase 1
  functional areas (System Summary, Architecture, Domain Model, Integrations, Deployment/NFR,
  Review/Gaps/Drift), organized as `routes/` → `services/` → `data/seed.ts`; a global error
  handler with a consistent `{ statusCode, error, message }` shape (`src/errors.ts`);
  environment-driven config for `PORT`/`HOST`/`CORS_ORIGIN` (`src/config.ts`); CORS support for
  `apps/web`'s dev server; and test coverage for every new route plus the error handler and
  config loader (`apps/api/tests/`). See ADR 0002.
- **Phase 1 — P1-02 (Shared API/data contracts):** `packages/shared/src/contracts.ts` — the
  response types for the six Phase 1 functional areas, shared between `@phoenix-ai/api` and
  `apps/web`. See ADR 0002.

### Changed

- `apps/web/src/data/types.ts` now imports the six Phase 1 functional areas' types (and
  `GraphElementMetadata`) from `@phoenix-ai/shared` instead of redefining them locally, removing
  a pre-existing duplication of `GraphElementMetadata` between the two packages.
- `apps/web/src/data/api/apiProvider.ts`, `apps/api/README.md`, and `apps/web/README.md` updated
  to reflect which endpoints are now implemented vs. still pending for later phases.
