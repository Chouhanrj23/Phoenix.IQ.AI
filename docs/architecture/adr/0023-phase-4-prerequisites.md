# ADR 0023: Phase 4 prerequisites — Neo4j strategy, relationship bridging, and the OKF→graph boundary

- **Status:** Accepted
- **Date:** 2026-08-20
- **Owners:** Platform maintainers

## Context

The Phase 4 architecture/readiness audit (`docs/phase-4/README.md`) identified five blockers that had
to be resolved before P4-02/P4-03/P4-04 (OKF→Neo4j transformation, node creation, relationship
creation) could start:

1. Neo4j has zero presence in the repository — no driver, no env convention, no dev/test strategy.
2. `extractJavaProject` (`packages/extraction-engine`) always produced `relationships: []`, even
   though the underlying call graph and type-dependency graph were already fully extracted.
3. Only 2 of the OKF's object kinds have a real Phase 3 producer — undocumented, this risked the
   Phase 4 graph mapper silently treating fixture/sample data as if it were repository-derived.
   **Correction (P4-01, ADR 0024):** the object-kind count stated here as "12" was miscounted; the
   real number, re-verified directly against source, is 15. The 2/15 producer ratio itself is
   unaffected by the correction.
4. The existing Knowledge Graph UI's vocabulary (`GraphNode.kind` Title-Case, `GraphEdge` with no
   typed `kind`) does not match the OKF's vocabulary (lowercase-dotted `kind`, typed relationships).
5. `apps/api` has no persistence layer, no schema-validated config, and no external-dependency
   failure-handling precedent — the Neo4j architectural boundary had never been drawn.

This ADR resolves all five as scoped prerequisites, without implementing P4-01 through P4-10
themselves. The Phase 2 canonical OKF model is unchanged; nothing here introduces a second knowledge
representation.

## Decision

### 1. Neo4j local development strategy

A single-service `docker-compose.yml` at the repo root runs `neo4j:5-community`, exposing the Browser
UI (7474) and Bolt (7687). Credentials come from `.env` (gitignored; `.env.example` documents the
variable names with a placeholder value, never a real one) via compose's `${VAR:?message}` syntax,
which makes `docker compose up` **refuse to start** rather than fall back to a hardcoded or guessable
password. `NEO4J_URI`/`NEO4J_USER`/`NEO4J_DATABASE` default to Neo4j's own well-known local values
(not secrets); `NEO4J_PASSWORD` has no default anywhere in this repository. Data persists in a named
Docker volume (`neo4j_data`), not a bind mount, so no graph data can ever land inside the repository
tree. See `packages/graph-persistence/README.md` for exact startup steps.

### 2. Neo4j integration testing strategy

Automated tests use a **real** Neo4j instance via Testcontainers (`@testcontainers/neo4j`), never a
mocked driver — matching this repo's existing discipline of exercising real infrastructure
(`packages/ingestion-connectors/tests/git-connector.test.ts`'s real git subprocess,
`packages/extraction-engine/tests/pipeline-e2e.test.ts`'s real end-to-end pipeline).
`packages/graph-persistence/tests/neo4j-client.test.ts` starts a real, ephemeral `neo4j:5-community`
container per test run and was verified passing against a live Docker daemon on this machine (3/3
tests: successful connection + real query, unreachable-host failure, wrong-credentials failure — all
three real, not simulated). This is the template future P4-03/P4-04 ingestion tests should follow.

### 3. OKF → Neo4j boundary

```
OKF (canonical, @phoenix-ai/knowledge-graph)
  -> graph mapping / adapter        (P4-01, not yet implemented)
  -> ingestion                       (P4-02/03/04, not yet implemented)
  -> @phoenix-ai/graph-persistence   (this package: connection layer only, today)
  -> Neo4j
```

The OKF remains the sole canonical knowledge representation. `@phoenix-ai/graph-persistence` is a new
package (verified: no existing package name or stub fit this concern — `packages/knowledge-graph`
holds the canonical model itself, not persistence) that will own the Neo4j client, graph mapping,
ingestion, queries, and consistency logic (per the audit's proposed boundary). As of this ADR, it owns
**only** the client (`neo4j-client.ts`) and its configuration (`config.ts`) — deliberately, so this
prerequisite fix does not implicitly start P4-01 through P4-09. `apps/api` does not depend on this
package yet; that wiring is P4-07's job (a future `routes/graph.ts` + `services/graph.service.ts`,
matching `apps/api`'s existing one-file-per-resource convention, calling into
`@phoenix-ai/graph-persistence` rather than issuing Cypher directly from a route handler).

### 4. Relationship representation

Root-caused: the call graph and type-dependency graph (`java-calls.ts`) and JPA associations
(`java-persistence.ts`) were already fully extracted, resolved, and provenance-stamped — the gap was
never in extraction, only in mapping. `extractJavaProject` (`extract-java.ts`) hardcoded
`relationships: []` because no bridge from those already-resolved facts to
`CanonicalKnowledgeRelationship` existed. Confirmed: P3-09's OKF-wrapping logic
(`buildJavaCanonicalBundle`) already passed `result.relationships` through unmodified — it required no
change once `relationships` stopped being an empty array.

Fixed with a new, narrow bridge (`packages/extraction-engine/src/bridge-relationships.ts`), following
the same discipline `bridge-http.ts`/`bridge-persistence.ts` already established: only directly,
deterministically evidenced relationships bridge, and only between two objects this package has
_already_ bridged into a canonical shape (an `ApiObject` or `EntityObject`) — a dependency whose
target has no canonical object yet (e.g. a Spring Data Repository, which has no OKF kind) produces no
relationship. Nothing is invented or inferred.

Two non-overlapping evidence sources:

- **`bridgeTypeDependencies`** — resolved `paramType`/`returnType`/`extends`/`implements`/`throws`
  type-dependency facts. `kind: 'dependsOn'`, `category: 'association'`. The specific relation is
  preserved verbatim in `attributes.relation`. `fieldType` is deliberately excluded when the source is
  a bridged Entity (see next bullet — avoids double-counting and a real precision loss: generic
  collection fields like `List<Pet>` resolve to `List`, not `Pet`, under this path).
- **`bridgeJpaAssociations`** — `@OneToMany`/`@ManyToOne`/`@OneToOne`/`@ManyToMany` fields, which
  `java-persistence.ts` already unwraps from their collection generic (`List<Pet>` → `Pet`) with full
  fidelity. `kind: 'hasAssociation'`, `category: 'association'`, with `attributes.associationKind`/
  `fieldName`/`mappedBy` preserved. The target is resolved by exact simple-name match against this
  run's own bridged entities; an ambiguous match (two entities sharing a simple name in different
  packages) is skipped, never guessed — the same "resolve only when unambiguous" discipline
  `java-calls.ts` already established for call targets.

The call graph (`calls`) itself is **still not bridged** — its target resolution is shallower and
noisier than the type-dependency graph's (see `java-calls.ts`'s own file header), and bridging it now
without a classpath/symbol table risked exactly the "sophisticated semantic inference" this
prerequisite fix was told to avoid. This is a documented, deliberate deferral, not a silent gap.

`kind: 'dependsOn'`/`'hasAssociation'` are new, additive entries in the OKF's already-open
relationship-kind vocabulary (P2-01/P2-02 designed `kind` as an open string precisely so a
cross-domain relationship kind doesn't require a schema change) — **not** part of the closed,
per-domain kind lists `architecture.ts`/`domain.ts`/`journey.ts`/`integration.ts` each validate against
their own `kind`. No existing domain file, validator, or the base `CanonicalKnowledgeObject`/
`CanonicalKnowledgeRelationship` schema was modified.

Verified against real evidence: re-running the P3-11 positive-path POC
(`packages/extraction-engine/samples/analyze-spring-petclinic.ts`) against real spring-petclinic
source now produces 29 real relationships (24 `dependsOn`, 4 `hasAssociation`, e.g. `Owner
--hasAssociation(OneToMany, pets)--> Pet`) from 193 raw type-dependency facts and 12 bridged objects —
consistent with only 2/15 OKF object kinds having real producers today (see decision 6; count
corrected by ADR 0024). The new
`pipeline-e2e.test.ts` CI assertion and the new `bridge-relationships.test.ts` unit suite (7 tests,
including two "must not guess" negative cases) both pass; see Validation section.

### 5. Provenance representation (graph)

Not yet implemented (P4-05) — documented here as the intended design, since it directly shapes
decision 3's boundary. `metadata.provenance` is an **array**; flattening it onto scalar node/edge
properties would silently drop every entry past the first. The intended mapping is
`(:Object)-[:DERIVED_FROM {derivedBy, derivedAt, sourceType}]->(:Source)`, one edge per provenance
entry, with OKF's `sources[]` registry (P2-07) mapping 1:1 to `(:Source {id, type, label, locator,
version})` nodes. `evidence[]` similarly explodes into `(:Evidence)` nodes
(`(:Object)-[:HAS_EVIDENCE]->(:Evidence)-[:FROM_SOURCE]->(:Source)`), not a flattened property, since
evidence already carries its own stable `id`.

### 6. Confidence representation (graph)

Not yet implemented (P4-06) — documented here for the same reason. `metadata.confidence` is
**singular** (one `{level, score?, rationale?}` per object/relationship), so it flattens safely onto
scalar properties (`confidence_level`, `confidence_score`, `confidence_rationale`). `confidenceDetail`
(`basis: 'observed'|'derived'`, optional `calculation`) flattens `basis` directly; `calculation.inputs`
is an arbitrary nested `KnowledgeValue` map, which Neo4j properties cannot store as nested structures —
it must be JSON-stringified when persisted, a real constraint, not a style choice.

### 7. UI vocabulary adapter

Confirmed by direct inspection of `apps/web/src/data/types.ts` and `GraphExplorerPage.tsx` (read-only;
the UI itself was not modified):

```ts
GraphNode { id, label, kind: string, confidenceLevel, detail? }  // kind: 'System' | 'Persona' | ... (Title-Case)
GraphEdge { id, source, target, label? }                          // no typed kind at all
```

versus the OKF's `kind: string` (lowercase-dotted, e.g. `'architecture.system'`, `'journey.persona'`)
and typed `CanonicalKnowledgeRelationship.kind`/`category`. The canonical OKF vocabulary is **not**
changed to match the UI, and the UI's vocabulary is not changed either (out of scope for this
prerequisite fix; P4-08's job). The boundary is a translation table, to live in the future graph query
API response (P4-07's `services/graph.service.ts`), not in the UI and not in the OKF model:

| OKF `kind` (dotted)                                       | UI `GraphNode.kind` (Title-Case)                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------- |
| `architecture.system`                                     | `System`                                                                    |
| `architecture.container`                                  | `Container`                                                                 |
| `architecture.component`                                  | `Component`                                                                 |
| `domain.domain`                                           | `Domain`                                                                    |
| `domain.entity`                                           | `Aggregate` or a new `Entity` value*                                        |
| `domain.aggregate`                                        | `Aggregate`                                                                 |
| `domain.entity-state`                                     | _(no existing UI kind — would need one)_                                    |
| `journey.persona`                                         | `Persona`                                                                   |
| `journey.journey`                                         | `Journey`                                                                   |
| `journey.flow`                                            | `Flow`                                                                      |
| `journey.action`                                          | _(closest existing UI kinds are `Epic`/`Feature`/`Story` — no exact match)_ |
| `integration.api`/`.interface`/`.integration`/`.dataflow` | _(no existing UI kind — Phase 1's UI never modeled these)_                  |

\* `apps/web`'s current `KIND_ORDER`/mock fixtures use `Aggregate` for what the OKF splits into
`domain.entity` and `domain.aggregate` as two distinct kinds — this is a genuine, not-yet-resolved
mismatch, not a typo; P4-08 has to decide whether the UI gains new kind values or the API collapses
OKF kinds to fit the existing ones. **Documented, not silently hidden**, exactly because the audit
flagged it as a real blocker to wiring real data through cleanly.

For relationships: `GraphEdge` has no typed field to preserve `kind`/`category` into at all today —
only a free-text `label`. To avoid silently losing relationship-type information, the future API
response should still include the OKF `kind` (e.g. as a `label` string, or by extending `GraphEdge`
with an optional typed field). **Extending `GraphEdge` is a documented requirement, not implemented
here** — no UI/type changes were made in this prerequisite fix; P4-08 must decide how, not this ADR.

### 8. Neo4j failure behavior

Every function in `@phoenix-ai/graph-persistence` that talks to Neo4j either succeeds or throws
`Neo4jUnavailableError` (`neo4j-client.ts`) — never hangs, never silently no-ops, never lets a raw
`neo4j-driver` exception escape uncaught. The error always carries the original driver error as
`.cause`. Verified against a real, unreachable port and real wrong credentials (not simulated) — both
throw `Neo4jUnavailableError`, not a generic/raw error. Downstream (P4-07's future API layer) is
expected to translate this into a clear 5xx response, not swallow it — that translation is not yet
implemented, since no route exists yet.

### 9. Real-data vs sample-data distinction

Not a new mechanism — the existing model already carries this distinction, and this decision is to
**use it, not bypass it**, once P4-10 builds the real repository demo. `Source.locator` (P2-07) records
where a source actually came from (a real `https://github.com/...` URL and pinned commit SHA for
`spring-petclinic`, vs. a hand-authored sample with no such locator); `metadata.provenance[].sourceType`
and `derivedBy` are stamped identically by real extraction (`'source-code'`/`'extraction-engine'`)
regardless of which repository was read, so real vs. sample data is distinguished by **where a `Source`
resolves to**, not by a separate flag. P4-10's report must state, per node/relationship in its demo
graph, whether it came from the real spring-petclinic extraction or (if any hand-authored OKF is
blended in to exercise a kind Phase 3 doesn't yet produce) a sample — never presenting the latter as
repository-derived. This ADR does not implement P4-10; it states the rule P4-10 must follow.

## Consequences

- `packages/extraction-engine`'s `JavaExtractionResult.relationships` is no longer always empty for
  any repository containing resolvable cross-object dependencies or JPA associations — existing
  callers that assumed an empty array (none were found; verified via full test suite) are unaffected.
- A new workspace package, `@phoenix-ai/graph-persistence`, exists with a real, tested Neo4j
  connection but no mapping/ingestion/query logic — P4-01 onward has a proven foundation to build on,
  not a green field.
- `docker-compose.yml` and `.env.example` are new root-level files; no other root configuration
  changed.
- No dependency was added to `apps/api` or `apps/web`; neither app is aware Neo4j exists yet.
- The UI vocabulary mismatch (decision 7) remains unresolved by design — this ADR documents the
  required translation, it does not perform it.

## Limitations

- The call graph (`calls`) remains unbridged (see decision 4) — a future ticket, not this one.
- `bridgeTypeDependencies`/`bridgeJpaAssociations` only ever connect two already-bridged objects;
  expanding Phase 3's producer coverage (decision 9 / Blocker 3) was explicitly out of scope here and
  was not done — see `docs/phase-4/README.md` for the current producer-coverage table.
- `@phoenix-ai/graph-persistence` has no `graph-mapping.ts`/`ingest.ts`/`query.ts`/`consistency.ts` —
  intentionally not created yet, to avoid starting P4-01/02/03/04/07/09 under cover of a prerequisite
  fix.
- The docker-compose Neo4j instance is for manual local development only; it is not used by, and has
  no bearing on, CI — CI-equivalent testing uses Testcontainers exclusively (decision 2).

## Alternatives considered

- **Bridging the call graph too, for richer relationship coverage** — rejected for now. Call-target
  resolution is explicitly shallower/noisier than type-dependency resolution (no classpath, qualifier
  segments through instance fields are `unresolved: true`); bridging it today would either yield very
  little (most calls target unbridged classes) or require heuristics closer to the "sophisticated
  semantic inference" this fix was told to avoid. Left as a documented, later option.
- **A single generic relationship `kind` for both type-dependencies and JPA associations** — rejected.
  JPA associations carry genuinely richer, more specific evidence (an explicit `@OneToMany`/`@ManyToOne`
  annotation, a field name, an optional `mappedBy`) than a bare type reference; collapsing both into one
  kind would discard real information the source code actually states.
- **A mocked Neo4j driver for `graph-persistence` tests** — rejected outright per explicit instruction
  and this repo's own established precedent; a mock would prove nothing about whether the real
  connection/failure-handling strategy actually works, which was the entire point of this blocker.
- **Changing `GraphNode`/`GraphEdge` in `apps/web` now, to close the vocabulary gap immediately** —
  rejected. Explicitly out of scope ("do not implement the complete UI integration yet"); documented
  as a requirement for P4-08 instead.
