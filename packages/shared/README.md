# @phoenix-ai/shared

Common types, logging, configuration, and utilities used across every pipeline package
(`ingestion-connectors` through `orchestration`). This is the only package every other
package may depend on directly — it must never depend back on a pipeline module.

## Contents

- `provenance.ts` — shared `Provenance` / `Confidence` / `GraphElementMetadata` types attached
  to every knowledge graph element (per FRD §4.3, Element Metadata).
- `contracts.ts` — Phase 1 API/data contract types (System Summary, Architecture, Domain Model,
  Integrations, Deployment/NFR, Review/Gaps/Drift) shared between `@phoenix-ai/api` and
  `apps/web` — see `docs/architecture/adr/0002-phase-1-backend-structure-and-shared-contracts.md`.
- `logger.ts` — structured logging wrapper.
- `config.ts` — environment/config loading helper.

## Status

Provenance/confidence metadata, logging, config, and the Phase 1 contract types (`contracts.ts`)
are implemented and consumed by `@phoenix-ai/api` and `apps/web`. Contract types for later-phase
functional areas (execution flows, personas/journeys, epics, the full knowledge graph) have not
been added yet — those still live only in `apps/web/src/data/types.ts` pending later phases.
