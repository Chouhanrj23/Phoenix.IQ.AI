# Phoenix Phase 4 — Knowledge Graph (Neo4j)

Living status record for Phase 4 ("Knowledge Graph"). Mirrors the convention established in
[`docs/phase-2/README.md`](../phase-2/README.md) and [`docs/phase-3/README.md`](../phase-3/README.md).

Phase 3 (P3-01 through P3-12) is closed. Phase 4's job is to project the canonical OKF model
(`@phoenix-ai/knowledge-graph`, still the sole canonical knowledge representation) into a queryable
Neo4j graph, and connect the existing Knowledge Graph UI to it.

## Readiness audit and prerequisite fix

Before any P4-0X ticket started, a read-only architecture/readiness audit inspected the actual
codebase (not documentation, not prior assumptions) and identified five blockers. All five were
resolved as scoped prerequisite work — design rationale in
[`docs/architecture/adr/0023-phase-4-prerequisites.md`](../architecture/adr/0023-phase-4-prerequisites.md).
**No P4-0X ticket has been implemented yet** — this was prerequisite work only.

| Blocker                                | Resolution                                                                                                                                                                                                |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Neo4j strategy                      | `docker-compose.yml` (local dev) + Testcontainers (`@testcontainers/neo4j`, automated tests) — both real, neither mocked. See ADR 0023 decisions 1–2.                                                     |
| 2. Phase 3 relationships always empty  | Root-caused (mapping gap, not extraction gap) and fixed — `packages/extraction-engine/src/bridge-relationships.ts`. See ADR 0023 decision 4.                                                              |
| 3. OKF producer coverage undocumented  | Documented below — unchanged by this fix (still 2/15 object kinds; see the P4-01 correction note below); the new relationship kinds are additive to the open `kind` vocabulary, not new object producers. |
| 4. UI/OKF vocabulary mismatch          | Documented, not implemented — ADR 0023 decision 7. `apps/web` was not modified.                                                                                                                           |
| 5. `apps/api` has no persistence layer | Architectural boundary established (`@phoenix-ai/graph-persistence`); `apps/api` was not modified. ADR 0023 decision 3.                                                                                   |

## OKF object producer coverage (Blocker 3, corrected by P4-01)

**Correction:** the OKF actually defines **15** object kinds, not 12 — re-counted directly against
`ARCHITECTURE_OBJECT_KINDS`/`DOMAIN_OBJECT_KINDS`/`JOURNEY_OBJECT_KINDS`/`INTEGRATION_OBJECT_KINDS`
during P4-01. The original "12" conflated the P4-01 tracker requirement's illustrative list (which
names "attribute" as if it were an object kind, and omits aggregate/entity-state/flow) with the real
schema. `AttributeDefinition`/`OperationDefinition` are confirmed embedded, non-object descriptors —
not `CanonicalKnowledgeObject`s. See
[`docs/architecture/adr/0024-p4-01-graph-mapping.md`](../architecture/adr/0024-p4-01-graph-mapping.md)
decision 1 for the full correction.

Real Phase 3 extraction produces exactly 2 of the OKF's 15 object kinds. This is unchanged by either
the Phase 4 prerequisite fix or P4-01 — expanding producer coverage was explicitly out of scope for
both.

| OKF object kind           | Real producer? | Producer                                                                       |
| ------------------------- | -------------- | ------------------------------------------------------------------------------ |
| `integration.api`         | **Yes**        | `bridgeSpringController` (`bridge-http.ts`, P3-06) — one per `@RestController` |
| `domain.entity`           | **Yes**        | `bridgeJpaEntity` (`bridge-persistence.ts`, P3-07) — one per `@Entity`         |
| `architecture.system`     | No             | —                                                                              |
| `architecture.container`  | No             | —                                                                              |
| `architecture.component`  | No             | —                                                                              |
| `domain.domain`           | No             | —                                                                              |
| `domain.aggregate`        | No             | —                                                                              |
| `domain.entity-state`     | No             | —                                                                              |
| `journey.persona`         | No             | —                                                                              |
| `journey.journey`         | No             | —                                                                              |
| `journey.flow`            | No             | —                                                                              |
| `journey.action`          | No             | —                                                                              |
| `integration.interface`   | No             | —                                                                              |
| `integration.integration` | No             | —                                                                              |
| `integration.dataflow`    | No             | —                                                                              |

The other 13 kinds exist only in the hand-authored P2-11 sample (`packages/knowledge-graph/samples/
aurora-commerce.sample.okf.yaml`) — real OKF-schema-conformant data, but not repository-derived. A
real repository extraction (e.g. the P3-11 spring-petclinic POC) will only ever contain
`integration.api`/`domain.entity` objects until Phase 3's producer coverage is separately extended —
not something this prerequisite fix, P4-01, or Phase 4 itself is scoped to do. P4-01's graph mapping
module (`packages/graph-persistence/src/graph-mapping.ts`) maps all 15 kinds regardless — the mapper's
job is to be capable of the full schema, not to only handle what one source currently produces.

## OKF relationship producer coverage (added by this fix)

Before this fix: 0 relationship kinds had any real producer (`relationships` was hardcoded empty).
After: 2 new, additive relationship kinds (not part of the original closed per-domain vocabularies —
see ADR 0023 decision 4) have real producers:

| Relationship `kind` | Real producer                                        | Evidence                                                                                                            |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `dependsOn`         | `bridgeTypeDependencies` (`bridge-relationships.ts`) | Resolved `paramType`/`returnType`/`extends`/`implements`/`throws` type-dependency facts between two bridged objects |
| `hasAssociation`    | `bridgeJpaAssociations` (`bridge-relationships.ts`)  | `@OneToMany`/`@ManyToOne`/`@OneToOne`/`@ManyToMany` JPA associations between two bridged Entities                   |

Verified against real spring-petclinic source: 29 relationships (24 `dependsOn`, 4 `hasAssociation`)
from 12 bridged objects — see the regenerated
`packages/extraction-engine/samples/spring-petclinic-analysis-report.md`. The call graph (`calls`)
remains unbridged — a documented, deliberate deferral (ADR 0023 decision 4), not a silent gap.

## P4-0X ticket status

All of P4-01 through P4-10 are complete.

| Ticket | Objective                    | Status                                                                                                      |
| ------ | ---------------------------- | ----------------------------------------------------------------------------------------------------------- |
| P4-01  | Finalize graph mapping       | **Complete.** `packages/graph-persistence/src/graph-mapping.ts` — see ADR 0024.                             |
| P4-02  | OKF → Neo4j transformation   | **Complete.** `packages/graph-persistence/src/transform.ts` — pure, parameterized `MERGE` write operations. |
| P4-03  | Node creation                | **Complete.** `packages/graph-persistence/src/ingest.ts` — real Neo4j, transactional, idempotent.           |
| P4-04  | Relationship creation        | **Complete.** Same module as P4-03 — endpoint validation, idempotent, no fabrication.                       |
| P4-05  | Provenance in graph          | **Complete.** Structured `provenanceJson` property (P4-02); round-trip proven against real Neo4j.           |
| P4-06  | Confidence in graph          | **Complete.** Flattened confidence/confidenceDetail properties + `evidenceJson`; round-trip proven.         |
| P4-07  | Graph query layer            | **Complete.** `packages/graph-persistence/src/query.ts` + `apps/api` `/api/full-graph` route.               |
| P4-08  | Integrate real graph data    | **Complete.** `apiProvider.getFullGraph` hits the real route; `GraphExplorerPage`'s `KIND_ORDER` extended.  |
| P4-09  | Graph consistency validation | **Complete.** `packages/graph-persistence/src/consistency.ts` — OKF vs. queried-graph diff.                 |
| P4-10  | Real repository graph demo   | **Complete.** Real spring-petclinic run — see "P4-10 real repository demo evidence" below.                  |

## P4-02 through P4-09 — implementation summary

- **P4-02 (transformation, `transform.ts`):** `buildNodeWriteOperation`/`buildRelationshipWriteOperation`/
  `buildGraphWriteOperations` turn a P4-01 `GraphMappingResult` into parameterized `MERGE` Cypher +
  params. Deterministic, no Neo4j import, no I/O. `provenance`/`evidence` (both arrays) serialize to
  `provenanceJson`/`evidenceJson` string properties — the "structured property object" representation
  the P4-05 tracker requirement explicitly allows, chosen over exploding into separate `(:Source)`/
  `(:Evidence)` nodes (still a documented future option, ADR 0024 decision 5) to keep this pass's scope
  bounded. The only text ever interpolated directly into Cypher is the node label / relationship type —
  unavoidable (Neo4j cannot bind these as parameters) and safe (both come only from P4-01's closed
  `OBJECT_KIND_TO_LABEL`/`RELATIONSHIP_KIND_TO_TYPE` lookup tables, never external input). 10 unit tests.
- **P4-03/P4-04 (persistence, `ingest.ts`):** `ingestGraphWriteOperations` runs every node operation then
  every relationship operation inside one `session.executeWrite` managed transaction — auto-commits on
  success, auto-rolls-back on any thrown error. A relationship whose endpoint doesn't exist (its `MATCH`
  matches zero rows) fails the whole transaction with an actionable `GraphIngestionError`, not a silent
  partial success. Connectivity/auth failures are detected via a `verifyNeo4jConnectivity` guard clause
  and surface as the existing `Neo4jUnavailableError`, never wrapped. 8 real-Neo4j integration tests
  (Testcontainers): node/relationship creation, idempotent re-ingestion (no duplicates), malformed-write
  rollback, dangling-endpoint rollback, no-fabrication, and the `Neo4jUnavailableError`/`GraphIngestionError`
  distinction.
- **P4-05/P4-06 (provenance/confidence, `provenance-confidence.test.ts`):** no new production code beyond
  P4-02/03 — six real-Neo4j tests prove a full, real OKF object (two provenance entries, full evidence
  fields, a `confidenceDetail.calculation` with `inputs`) round-trips exactly through
  `mapOkfBundleToGraph` → `buildGraphWriteOperations` → `ingestGraphWriteOperations` → a real Neo4j read-back,
  for both nodes and relationships. No confidence score is calculated anywhere.
- **P4-07 (query layer, `query.ts` + `apps/api`):** `getFullGraph`/`getNodeById`/`getRelationshipsForNode` —
  a small, fixed set of parameterized Cypher reads, UI-agnostic (returns real Neo4j labels/types, e.g.
  `"Entity"`/`"DEPENDS_ON"`, not the UI's vocabulary). `apps/api/src/routes/graph.ts` +
  `services/graph.service.ts` expose `GET /api/full-graph`, translating `Neo4jUnavailableError` into a
  clean `503`. No arbitrary Cypher is ever accepted from a caller. 5 real-Neo4j tests (`query.test.ts`) +
  3 Fastify route tests (mocked service, matching the existing `domains.test.ts` convention exactly).
- **P4-08 (UI integration):** `apiProvider.getFullGraph` now calls `/api/full-graph` instead of falling
  back to mock data — a backend/Neo4j failure propagates as a real rejection (`ErrorState`), never a
  silent fixture fallback. **Real bug found and fixed**: `GraphExplorerPage.tsx`'s hardcoded `KIND_ORDER`
  list did not include `Api`/`Entity` — the only two labels real Phase 3 data ever produces — which would
  have made `allKinds`/`activeKinds` empty for any real graph, silently filtering out every node
  (`if (!activeKinds.has(n.kind)) continue;`) despite a successful API response. Fixed by extending
  `KIND_ORDER` additively (all 15 real OKF-derived labels, existing mock-mode kinds unchanged/untouched).
  8 frontend tests (`apiProvider.test.ts`, extended).
- **P4-09 (consistency, `consistency.ts`):** `checkGraphConsistency(bundle, queriedGraph)` re-runs P4-01's
  mapping as the "expected" graph and diffs it against a real queried graph — missing/extra nodes,
  missing/extra relationships, label/type/endpoint/confidence/provenance mismatches. Never repairs
  anything; an OKF element with no P4-01 mapping is reported separately (`unmappable`), not as a false
  "missing" inconsistency. Deterministic (sorted by id). 13 unit tests covering every required scenario
  (consistent, missing/extra node, missing/extra relationship, mismatched endpoint, provenance mismatch,
  confidence mismatch, unmappable-element handling, determinism, non-mutation).

## P4-10 real repository demo evidence

**Repository:** `https://github.com/spring-projects/spring-petclinic.git` (real, uncurated, third-party
Spring Boot/JPA reference application — same repository as the P3-11 POC).
**Revision:** `88e37c15cf6fc8490b01bc3e8e2c800cec1ac272` (pinned; resolved revision matched the pin exactly).

**Pipeline run** (`packages/graph-persistence/samples/demo-spring-petclinic-graph.ts`, run via
`pnpm --filter @phoenix-ai/graph-persistence poc:demo-spring-petclinic-graph`) — one uninterrupted
execution of the full real chain:

1. Real git clone (P3-02): 54 artifacts read, 0 failures.
2. Real Java extraction (P3-03–P3-10): 30 files parsed, 0 parse failures, 12 bridged canonical objects,
   **29 bridged canonical relationships**.
3. Real OKF bundle (P3-09): validates, source references resolve, YAML round-trips.
4. Real graph mapping (P4-01): 12 nodes mapped, 29 relationships mapped, **0 unmappable**.
5. Real Neo4j write operations (P4-02): 12 node + 29 relationship `MERGE` operations built.
6. Real Neo4j ingestion (P4-03/P4-04), against a real, ephemeral Testcontainers `neo4j:5-community`
   instance: 12 nodes + 29 relationships ingested. **Ingested a second time to prove idempotency: 12
   nodes + 29 relationships again — no duplicates.**
7. Real query-back (P4-07): 12 nodes / 29 relationships retrieved, matching exactly. Representative real
   findings: `(:Api {label: "PetController"})`, `(:Entity {label: "Owner"})`,
   `(Owner)-[:HAS_ASSOCIATION]->(Pet)`, `(Pet)-[:HAS_ASSOCIATION]->(Visit)`,
   `(Vet)-[:HAS_ASSOCIATION]->(Specialty)`, `(PetController)-[:DEPENDS_ON]->(Owner)`.
8. Real consistency validation (P4-09): **`consistent: true`, 0 differences, 0 unmappable elements.**

Full output: `packages/graph-persistence/samples/spring-petclinic-graph-demo-report.md`. Full OKF:
`packages/graph-persistence/samples/spring-petclinic-graph-demo.okf.yaml`.

**API/UI verification** (a separate, persistent run, since the demo script above uses a fresh ephemeral
container each time): started the real `docker-compose.yml` Neo4j instance, ingested the exact OKF file
above into it via `samples/ingest-okf-file.ts`, started the real `apps/api` server pointed at it, and
called the real endpoint:

```
$ curl http://localhost:3011/api/full-graph
{"nodes":[{"id":"api-...","label":"WelcomeController","kind":"Api","confidenceLevel":"high"}, ...],
 "edges":[{"id":"relationship-...","source":"api-...","target":"entity-...","label":"dependsOn"}, ...]}
```

Confirmed via direct JSON inspection: 12 nodes, 29 edges, `kind` values exactly `["Api", "Entity"]` —
both present in `GraphExplorerPage.tsx`'s (now-extended) `KIND_ORDER`, so the real graph renders and
filters correctly rather than being silently empty. `apps/web` was then started with
`VITE_DATA_SOURCE=api` pointed at this API and confirmed serving (`200`, real HTML). Full interactive
browser confirmation (clicking nodes, visually checking layout) was not directly observed — the response
shape, `KIND_ORDER` fix, and existing `GraphExplorerPage`/`NodeDetailPanel` rendering logic were verified
by code inspection plus this live HTTP-contract check, which is what can be confirmed without a browser.

**Real vs. sample data:** this demo graph contains only spring-petclinic-derived nodes/relationships —
no hand-authored sample OKF (e.g. the P2-11 aurora-commerce sample) was ever ingested into it.

**Limitations:** only `integration.api`/`domain.entity` kinds appear (Phase 3's current producer
coverage, unchanged by Phase 4); the call graph remains unbridged, so no `CALLS`-type relationship
exists; the ephemeral-Testcontainers run and the persistent-docker-compose run are two separate
executions (by design — one proves reproducibility, the other proves the API/UI layer against a
long-lived instance).

## Phase 4 design references

- Prerequisite fix (Neo4j strategy, relationship bridging, OKF→graph boundary):
  [`docs/architecture/adr/0023-phase-4-prerequisites.md`](../architecture/adr/0023-phase-4-prerequisites.md)
- P4-01 graph mapping (node/relationship tables, identity strategy, provenance/confidence
  representation, UI adapter boundary):
  [`docs/architecture/adr/0024-p4-01-graph-mapping.md`](../architecture/adr/0024-p4-01-graph-mapping.md)

## Phase 1, 2, and 3 status

Unaffected. Phase 3's only change remains the relationship-bridging fix (`bridge-relationships.ts`,
`extract-java.ts`) — P3-01 through P3-10's own source is untouched; full regression suite green (77/77
`@phoenix-ai/extraction-engine` tests, including 7 new `bridge-relationships.test.ts` tests and the
extended `pipeline-e2e.test.ts` assertions).
