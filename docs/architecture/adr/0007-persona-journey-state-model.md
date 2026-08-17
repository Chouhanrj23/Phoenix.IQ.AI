# ADR 0007: Persona/Journey/State model (P2-05)

- **Status:** Accepted
- **Date:** 2026-08-16
- **Owners:** Platform maintainers

## Context

P2-03 (ADR 0005) and P2-04 (ADR 0006) formalized Architecture and Domain/Entity, the third and
fourth of four planned domain areas. P2-05 is the third: Persona, Journey, Action, Flow, and an
extension to P2-04's Entity State ("triggering action/event where supported").

Unlike P2-04 — where Phase 1's `Aggregate.entities` turned out to be plain name strings with no
real entity-level data — Phase 1 already has rich, real data here:
`apps/web/src/data/types.ts`'s `Persona`, `Journey`, `ExecutionFlow`, and `FlowStep`, rendered by
`PersonasJourneysPage.tsx` and `ExecutionFlowsPage.tsx`, each carrying independent
`metadata` (provenance/confidence) per persona, journey, flow, _and per step_. This gave P2-05 a
much stronger bar to clear: prove lossless compatibility with real data, not just define a shape.

## Decision

1. **Four typed objects** (`journey.ts`, same pattern as `architecture.ts`/`domain.ts`):
   `PersonaObject` (`category: 'entity'`), `JourneyObject` and `FlowObject`
   (`category: 'process'` — P2-02's own `StructuralCategory.process` doc comment names "a flow, a
   journey, a workflow" directly as examples), `ActionObject` (`category: 'entity'`, analogous to
   how P2-03 categorized `Component` — a discrete part, not a process itself).
2. **Persona requires _at least one_ of `description` or `role`, enforced at runtime, not by the
   type system.** Phase 1's `Persona` always has `role` (e.g. "Customer") and never a separate
   free-text `description`. Making either one alone required in the type would either break real
   compatibility (if `description`) or silently ignore the requirement's explicit mention of
   `description` (if `role` only). `PersonaAttributes` keeps both optional in TypeScript;
   `validatePersonaObject` adds the "at least one" rule as a runtime check — the same technique
   Phase 1 itself never needed but that fits this genuinely two-sided uncertainty better than a
   type-level union would.
3. **Journey does not embed its own ordered steps.** Phase 1's real `Journey` has no inline steps
   either — only `flowIds: string[]` pointing at the `Flow`(s) that realize it, and the flows
   carry the steps. P2-05 mirrors this exactly: `JourneyObject` has no step-related field; a
   `supports` relationship (Flow → Journey) connects them, and the flow's `contains` relationships
   (below) carry the actual ordered steps. This is a deliberate structural match to Phase 1, not
   a shortfall.
4. **Actions are first-class objects, linked via ordered `contains` relationships — not embedded
   in an attributes array.** This _refines_ P2-02's original `process` category comment
   ("its steps are ordered by array position in `attributes`, not by relationships"), which was
   written speculatively before any `process`-category object had real per-step data to weigh
   against. Phase 1's real `FlowStep`s each carry independent `metadata` (their own
   provenance/confidence) — proven in `journey.test.ts`, which checks each mapped `ActionObject`
   retains its _own_ source `FlowStep`'s exact metadata, not a shared/lost one. Only a first-class
   `CanonicalKnowledgeObject` can represent that losslessly; a plain `KnowledgeValue` array
   cannot. Ordering is carried as `attributes.order: number` on the `contains` relationship
   itself, since the base model has no other relationship-ordering mechanism.
5. **`supports` relationship direction follows the FRD, not intuition.**
   `docs/ontology/README.md` already documents "`Flow` supports `Journey`" (source=Flow,
   target=Journey) — the flow is _how_ the journey's intent is fulfilled. Categorized
   `realization` (P2-02: "X fulfills or implements the intent of Y"), not `composition` — a
   journey doesn't structurally _contain_ its flows the way a domain contains an entity.
6. **Action effects reuse P2-04's `EntityObject`, not a new concept.** `readsEntity`/
   `writesEntity` relationships (Action → Entity, `interaction`) directly satisfy "resulting
   effects where known" by pointing at P2-04's existing entity model — the requirements' "use the
   existing canonical model" instruction, honored concretely, not just in spirit.
7. **Entity State is extended, not redefined.** P2-05 does not add a new state-machine object
   type; P2-04's `EntityStateObject` (`domain.ts`) already covers "state identity" and (via
   `transitionsTo`) "transitions". The only new piece is `triggersTransition`
   (Action → EntityState, `interaction`): "this action can move an entity into this state" —
   exactly "triggering action/event where supported," added as one relationship kind, proven
   working against P2-04's real type in `journey.test.ts` without modifying `domain.ts` at all.
8. **No `CANONICAL_SCHEMA_VERSION` bump; no changes to `canonical-object.ts`/`relationships.ts`.**
   Everything is additive (a new file, new optional/embedded fields). P2-03's generic
   `TAttributes` and optional relationship `attributes` (added for exactly this kind of future
   need) already covered what P2-05 required — the second domain area in a row to need zero base
   changes, which is evidence those two P2-03 additions were well-scoped.

## UI compatibility mapping

| Phase 1 UI field (`PersonasJourneysPage.tsx`/`ExecutionFlowsPage.tsx`) | Canonical model field                                            | Status                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `persona.name`                                                         | `PersonaObject.label`                                            | Represented                                                                                                                                                                                                                                                                                                                           |
| `persona.role`                                                         | `PersonaAttributes.role`                                         | Represented                                                                                                                                                                                                                                                                                                                           |
| `persona.goals` / `persona.painPoints`                                 | `PersonaAttributes.goals` / `.painPoints`                        | Represented — added beyond the literal requirements list, justified by being necessary for lossless Phase 1 compatibility                                                                                                                                                                                                             |
| `persona.metadata`                                                     | `PersonaObject.metadata`                                         | Represented — direct reuse                                                                                                                                                                                                                                                                                                            |
| `journey.name`                                                         | `JourneyObject.label`                                            | Represented                                                                                                                                                                                                                                                                                                                           |
| `journey.description`                                                  | `JourneyAttributes.purpose`                                      | Represented (renamed, per the requirements' own wording)                                                                                                                                                                                                                                                                              |
| `journey.personaId`                                                    | `hasPersona` relationship (Journey → Persona)                    | Represented, moved from field to relationship                                                                                                                                                                                                                                                                                         |
| `journey.flowIds`                                                      | `supports` relationship (Flow → Journey)                         | Represented, moved to relationship, **direction inverted** to match the FRD's documented wording — see decision 5                                                                                                                                                                                                                     |
| `flow.name`                                                            | `FlowObject.label`                                               | Represented                                                                                                                                                                                                                                                                                                                           |
| `flow.description` / `flow.triggerScreen`                              | `FlowAttributes.description` / `.triggerScreen`                  | Represented                                                                                                                                                                                                                                                                                                                           |
| `flow.steps` (ordered array)                                           | `contains` relationships (Flow → Action) with `attributes.order` | Represented, moved from embedded array to ordered relationships — see decision 4                                                                                                                                                                                                                                                      |
| `step.name` / `step.description`                                       | `ActionObject.label` / `ActionAttributes.description`            | Represented                                                                                                                                                                                                                                                                                                                           |
| `step.readsEntities` / `step.writesEntities`                           | `readsEntity` / `writesEntity` relationships (Action → Entity)   | Represented, moved from string-array fields to typed relationships against P2-04's `EntityObject`                                                                                                                                                                                                                                     |
| `step.metadata` (own provenance/confidence per step)                   | `ActionObject.metadata`                                          | Represented — **proven not lost**, see decision 4                                                                                                                                                                                                                                                                                     |
| _(none)_                                                               | Entity State / `triggersTransition`                              | **No Phase 1 UI representation at all.** No page renders anything resembling a state machine or a triggering action. `ReviewPage.tsx`'s `status: 'pending'\|'confirmed'\|'corrected'` is a review-workflow status, not a domain entity's business state — a different concept entirely. Purely forward-looking, per the requirements. |

All "Represented" rows above are proven, not asserted — see
`packages/knowledge-graph/tests/journey.test.ts`'s "Phase 1 ... compatibility" suite, built from
the actual values in `apps/web/src/data/mock/aurora/personas.ts` and `fixtures.ts` (the real
`persona-returning-shopper`, `journey-browse-to-purchase`, `flow-checkout` with its real
`step-1`/`step-2`), not illustrative stand-ins.

## Consequences

A future extraction/inference source that discovers persona/journey/flow/action data (e.g. from
user research docs, analytics, or session recordings) has a defined, Phase-1-proven target shape.
Crucially, per-step provenance is no longer at risk of being flattened away by an
embedding-based design — each `Action` keeps its own independent confidence and source trail, all
the way through to a future OKF projection.

## Alternatives considered

- **A single `stepOrder: number` field on `ActionObject` itself**, instead of
  `attributes.order` on the `contains` relationship — rejected: an action's position is a fact
  about its _relationship to a specific flow_, not an intrinsic property of the action (the same
  action could, in principle, appear in more than one flow with a different position in each);
  putting order on the relationship keeps that correctly scoped.
- **Journey embeds its own steps directly** (duplicating Flow's) — rejected: Phase 1 doesn't do
  this, and duplicating step data between Journey and Flow would create two sources of truth for
  the same steps.
- **A single `EntityState` object reused for both "state exists" and "action triggers it"**
  (skip the separate `triggersTransition` relationship, encode the trigger as an attribute on the
  state) — rejected: an attribute can't reference another object (only `KnowledgeValue`s);
  representing "which action triggers this" as a real relationship keeps it queryable and
  consistent with how every other cross-object fact in this model is represented.
