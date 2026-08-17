# OKF ↔ Phase 1 UI Compatibility Validation (P2-12)

A compatibility/coverage exercise, not a UI redesign and not a model extension. Proves whether
the finalized canonical model (P2-01–P2-09) and OKF schema (P2-10, sample in P2-11) can represent
the information the six existing Phase 1 UI areas actually require — read directly from
`apps/web/src/pages/*.tsx`, not just the raw `packages/shared/src/contracts.ts` shapes, since a
contract field the UI never renders is a different kind of finding than one it does.

Verified programmatically in [`packages/knowledge-graph/tests/ui-coverage.test.ts`](../../packages/knowledge-graph/tests/ui-coverage.test.ts)
(20 tests) against the real P2-11 sample document and the real closed `kind` vocabularies — every
row below marked ✅/⚠️/❌ has a corresponding passing test, including the gaps (proven by negative
assertion, not left as unverified prose).

## UI coverage report

| UI Area           | UI Requirement                                                                     | Canonical Model                                            | OKF Path                                                                                  | Coverage                              | Gap                                                                                                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| System Summary    | `name`, `description`                                                              | `SystemObject` (P2-03)                                     | `objects[].label`, `objects[].attributes.description`                                     | ✅ Complete                           | —                                                                                                                                                                             |
| System Summary    | `tags: string[]`                                                                   | _(none)_                                                   | _(none)_                                                                                  | ❌ None                               | Model gap — `SystemAttributes` has no equivalent field                                                                                                                        |
| System Summary    | `lastAnalyzedAt`                                                                   | _(none)_                                                   | _(none)_                                                                                  | ❌ None                               | Category distinction — pipeline/run metadata, not system knowledge; see "Model gaps"                                                                                          |
| System Summary    | `coverageScore`, `totalElements`, `pendingReviewCount`, `driftAlertCount`          | _(none — computed)_                                        | _(none — computed)_                                                                       | N/A — not model data                  | Not a gap — these are dashboard aggregates computed **over** a bundle/document, not facts stored **in** one                                                                   |
| Architecture      | `C4Node.name`/`description`/`technology`                                           | `SystemObject`/`ContainerObject`/`ComponentObject` (P2-03) | `objects[].label`, `.attributes.description`\|`.responsibility`, `.attributes.technology` | ✅ Complete                           | —                                                                                                                                                                             |
| Architecture      | `C4Node.level` (context/container/component)                                       | `category`/`kind`                                          | `objects[].kind`                                                                          | ✅ Complete                           | Phase 1's "context" level = canonical `architecture.system`                                                                                                                   |
| Architecture      | `C4Node.metadata` (provenance/confidence)                                          | `metadata` (P2-01, `@phoenix-ai/shared`)                   | `objects[].metadata`                                                                      | ✅ Complete                           | —                                                                                                                                                                             |
| Architecture      | `C4Node.parentId`                                                                  | _(none — implicit via relationship)_                       | `relationships[]` where `kind: contains`                                                  | ⚠️ Representable, different mechanism | Mapping issue — field → relationship traversal (ADR 0005)                                                                                                                     |
| Architecture      | `C4Node.technology` on a Component                                                 | _(none)_                                                   | _(none)_                                                                                  | ❌ None (untested)                    | Minor model gap — `ComponentAttributes` has no `technology` field; unobserved since Phase 1 has no real component-level data at all                                           |
| Architecture      | `C4Edge.source`/`target`/`label`                                                   | `ArchitectureRelationship` (P2-03)                         | `relationships[].sourceObjectId`/`.targetObjectId`/`.attributes.description`              | ✅ Complete                           | `label` moves from a flat field to `attributes.description`                                                                                                                   |
| Architecture      | `C4Edge.level`                                                                     | _(none — derivable)_                                       | derived from `objects[sourceObjectId\|targetObjectId].kind`                               | ⚠️ Representable, different mechanism | Mapping issue — denormalized convenience field in Phase 1, not needed in the canonical model                                                                                  |
| Domain Model      | `Domain.name`/`description`/`metadata`                                             | `DomainObject` (P2-04)                                     | `objects[].label`/`.attributes.description`/`.metadata`                                   | ✅ Complete                           | —                                                                                                                                                                             |
| Domain Model      | `Aggregate.name`/`metadata`                                                        | `AggregateObject` (P2-04)                                  | `objects[].label`/`.metadata`                                                             | ✅ Complete                           | —                                                                                                                                                                             |
| Domain Model      | `Domain.aggregates` (embedded ownership)                                           | _(none — no direct relationship kind)_                     | _(none)_                                                                                  | ❌ None                               | **Model gap** — no `hasAggregate`-style Domain→Aggregate relationship kind exists at all (see "Model gaps")                                                                   |
| Domain Model      | `Aggregate.entities: string[]`                                                     | `EntityObject` + `aggregateRoot`/`aggregateMember` (P2-04) | `objects[]` (kind `domain.entity`) + `relationships[]`                                    | ⚠️ Representable, no real data        | Pre-existing gap (ADR 0006) — Phase 1 never supplies enough data to populate real `EntityObject`s per aggregate                                                               |
| Integrations      | `Integration.name`/`counterpart`/`direction`/`protocol`/`dataExchanged`/`metadata` | `IntegrationObject`/`DataFlowObject` (P2-06)               | `objects[].label`/`.attributes.*`/`.metadata`                                             | ✅ Complete                           | Full mapping in ADR 0008, re-confirmed here                                                                                                                                   |
| Integrations      | _(implicit: which container owns this integration)_                                | `hasIntegration` relationship (P2-06)                      | `relationships[]`                                                                         | ⚠️ Model ahead of UI                  | Not a gap — `IntegrationsPage.tsx` never renders this even though the model already supports it                                                                               |
| Deployment/NFR    | `DeploymentNode` (environment/instance, runtime, scale, `deployedTo`/`runsIn`)     | _(none)_                                                   | _(none)_                                                                                  | ❌ None                               | **Model gap** — `Node`/`DeploymentUnit`/`Environment` (FRD §4.1) never formalized in any P2-03–P2-06 ticket                                                                   |
| Deployment/NFR    | `NonFunctionalRequirement` (category, requirement, target, `appliesTo`)            | _(none)_                                                   | _(none)_                                                                                  | ❌ None                               | **Model gap** — NFR is not even in the FRD §4.1 node-type list; only its `appliesTo` _relationship_ concept was ever anticipated (P2-02's `association` category doc comment) |
| Review/Gaps/Drift | `ReviewItem` (elementType/elementName/currentValue/conflict/status)                | _(none)_                                                   | _(none)_                                                                                  | ❌ None                               | **Model gap** — no `kind` vocabulary built for `category: 'observation'`, despite P2-02 explicitly reserving it for exactly this                                              |
| Review/Gaps/Drift | `GapItem` (area/description/missingInputs/severity/suggestedAction)                | _(none)_                                                   | _(none)_                                                                                  | ❌ None                               | **Model gap** — same as above                                                                                                                                                 |
| Review/Gaps/Drift | `DriftAlert`/`DriftRun` (changeType/detectedAt/runDate)                            | _(none)_                                                   | _(none)_                                                                                  | ❌ None                               | **Model gap** — same as above                                                                                                                                                 |

**Coverage summary**: Areas 1–4 (System Summary core identity, Architecture, Domain Model,
Integrations) are ✅ **complete or representable** for every field the UI actually renders, with
five specific, itemized exceptions (tags, lastAnalyzedAt, Component.technology,
Domain→Aggregate ownership, and the four dashboard-aggregate stats — the last of which is
correctly _not_ a gap). Areas 5–6 (Deployment/NFR, Review/Gaps/Drift) are ❌ **entirely
unrepresented** in the canonical model — a pre-existing, already partially self-documented
condition (see `docs/ontology/README.md`'s own "not yet formalized" list), confirmed and made
concrete by this ticket, not newly discovered.

## Model gaps

Gaps in `packages/knowledge-graph`'s canonical model itself — not fixable by changing the UI.

1. **Deployment topology has no `kind` vocabulary.** FRD §4.1 names `Node`, `DeploymentUnit`,
   `Environment` as node types and `deployedTo`/`runsIn` as relationships (`docs/ontology/README.md`
   §4.2); none were ever formalized (P2-03 covered Architecture, not Deployment). `DeploymentPage.tsx`
   needs `kind` (environment/instance), `name`, `environmentId`/`containerId` (relationships),
   `runtime`, `scale`, `metadata` — all absent.
2. **NFR has no `kind` vocabulary, and isn't in the FRD ontology at all.** `NonFunctionalRequirement`
   is a real Phase 1 contract/UI concept with no FRD §4.1 node-type entry and no P2-0N object kind.
   Only its `appliesTo` _relationship_ shape was ever anticipated (P2-02, `ontology.ts`'s
   `RelationshipCategory.association` doc comment cites "an NFR's `appliesTo`" directly) — the
   object itself was never designed. This needs a scoping decision (is NFR in-ontology going
   forward, or a Phase-1-only concept layered above the graph?) before a future ticket can build it.
3. **Review/Gaps/Drift has no `kind` vocabulary**, despite P2-02 (`ontology.ts`) explicitly
   reserving `StructuralCategory.observation` for exactly this ("a review item surfacing a
   disputed value, a gap noting an absence of knowledge, a drift alert noting a change"). The
   scaffolding is prepared; the domain-specific types were never built. `LifecycleState`
   (`status`/`since`/`previousStatus`, P2-02) already fits `ReviewItem.status`
   (pending/confirmed/corrected) precisely, and would need no changes to adopt.
4. **No direct Domain → Aggregate relationship kind.** `domain.ts`'s
   `DOMAIN_RELATIONSHIP_KINDS` has `contains` (Domain→Entity), `aggregateRoot`/`aggregateMember`
   (Aggregate→Entity), `hasState`, `transitionsTo`, `relatesTo` — no `hasAggregate` or equivalent.
   Phase 1's `Domain.aggregates: Aggregate[]` is a direct, unambiguous embedding; reconstructing
   it from the canonical model today requires an indirect traversal through a shared root Entity,
   which only works if that Entity also happens to have a `contains` edge from the Domain — not
   guaranteed, and non-trivial for a future renderer to implement correctly.
5. **`ComponentAttributes` has no `technology` field** (only `responsibility`), while Phase 1's
   `C4Node.technology` is level-agnostic (settable on any node, container or component). Currently
   unobserved in practice — Phase 1 has no real component-level fixture data at all — but would
   surface the moment a real component-level extraction populated one.
6. **`SystemAttributes` has no `tags` field.** Minor; Phase 1's `SystemSummary.tags: string[]`
   has no canonical equivalent.

## OKF gaps

Gaps specific to the P2-10 YAML serialization layer itself, distinct from the underlying model
(none found that aren't already inherited from the model gaps above — the OKF format is a direct,
lossless serialization of whatever the canonical model already represents, per ADR 0012 decision 1,
so every field the model can represent, the OKF format can too). Two narrower, format-level
observations:

1. **No `okfVersion` field distinguishes "this document has zero deployment/NFR/review data because
   none exists yet" from "this document was produced by a source that doesn't know how to extract
   it."** Both currently look identical (absent `kind`s). Not a defect — a future connector
   simply has nothing to report either way — but worth noting for anyone building a completeness
   dashboard _over_ OKF documents later.
2. **The `sources` registry (P2-07) has no representation for "no sources apply"** vs. "sources
   were never registered" — both are an absent/empty `sources` array. Same category as above:
   not a defect, just something a future strict-completeness checker would need to handle
   explicitly.

## Recommended changes

Recommendations only — **not implemented in this ticket**, per its explicit scope ("Do not start
Phase 3"; this is a validation exercise). Each would be its own future ticket:

1. Formalize a Deployment/Environment `kind` vocabulary (`deployment.environment`,
   `deployment.instance` or FRD-aligned `deployment.node`/`deployment.unit`/`deployment.environment`
   — needs a naming decision, see "Open questions"), plus `deployedTo`/`runsIn` relationship kinds.
2. Decide NFR's ontology status, then (if in-scope) formalize an `nfr.requirement` `kind` with
   `category`/`requirement`/`target` attributes and an `appliesTo` association relationship —
   already anticipated by P2-02.
3. Formalize a Review/Gap/Drift `kind` vocabulary under `category: 'observation'`, reusing
   `LifecycleState` for `ReviewItem.status` rather than inventing new status tracking.
4. Add a `hasAggregate` (or equivalent) relationship kind to `domain.ts`'s
   `DOMAIN_RELATIONSHIP_KINDS`, category `association` (an aggregate doesn't structurally belong
   to a domain the way an entity does — composition would overstate the relationship).
5. Add `technology?: string` to `ComponentAttributes` (`architecture.ts`) for parity with
   `ContainerAttributes`.
6. Add `tags?: string[]` to `SystemAttributes` (`architecture.ts`).

None of these require any UI change — every recommendation above extends the model or OKF schema
to catch up to what the UI already needs, never the reverse, per the objective's explicit
instruction not to modify the UI to make the model fit.

## Tests

`packages/knowledge-graph/tests/ui-coverage.test.ts` (new, 20 tests): re-validates the P2-11
sample against `validateOkfDocument`, then one `describe` block per UI area asserting the
"Coverage report" table above field-by-field — including the gap rows, proven via explicit
negative assertions (`not.toHaveProperty`, `not.toContain`) against the sample document and the
real closed `kind` vocabularies, not left as unverified prose claims.

## Build results

Full regression (`pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`) run across all 19
packages; see the final response for exact counts. `git status` confirms zero changes to
`apps/api`, `apps/web`, or `packages/shared` — Phase 1 remains untouched and functional.

## Phase 3 dependencies

None of P2-12's findings block Phase 3 — they define its starting backlog:

- A future repository/documentation/ticket connector targeting Deployment topology needs
  Recommendation 1 (deployment `kind` vocabulary) to exist first.
- A future connector targeting NFRs needs Recommendation 2, and the underlying scoping question
  answered, first.
- A future review/gap/drift-surfacing engine needs Recommendation 3 first.
- Nothing about Areas 1–4 blocks Phase 3 — Architecture, Domain/Entity, Persona/Journey, and
  Integration/API connectors could target the existing model today, modulo Recommendations 4–6
  (minor, non-blocking parity fixes).
