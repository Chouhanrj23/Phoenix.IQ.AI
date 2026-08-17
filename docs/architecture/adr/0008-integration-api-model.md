# ADR 0008: Integration/API model (P2-06)

- **Status:** Accepted
- **Date:** 2026-08-16
- **Owners:** Platform maintainers

## Context

P2-03 (ADR 0005), P2-04 (ADR 0006), and P2-05 (ADR 0007) formalized Architecture, Domain/Entity,
and Persona/Journey/State — the first three of four domain areas planned for Phase 2. P2-06 is the
fourth and last: API, Interface, Integration, and DataFlow, the FRD's "Integration/API" area.

Phase 1 has one real, already-shipped source of truth here: `packages/shared/src/contracts.ts`'s
`Integration` (`id`, `name`, `counterpart`, `direction`, `protocol`, `dataExchanged`, `metadata`),
rendered by `IntegrationsPage.tsx`. Phase 1 has **no** equivalent for API or Interface — no route,
no contract, no UI renders anything resembling an API surface or an exposed/consumed capability
independent of a specific integration. This is a real, pre-existing gap, not something P2-06
introduces or is expected to close (no API discovery, no repository scanning — see the requirements'
own exclusions).

## Decision

1. **All four concepts — API, Interface, Integration, DataFlow — are modeled as
   `CanonicalKnowledgeObject`s (`category: 'entity'`), not as relationships**, despite the
   requirements' "source, target" phrasing for Integration and DataFlow. `docs/ontology/README.md`
   already lists `Interface`, `Integration`, and `DataFlow` as **nodes** in the FRD's own node-type
   list — that phrasing describes what each node _connects to_, via relationships (same pattern as
   `Component`/`Container`/`System` in P2-03), not literal relationship fields. This matches how
   every other domain area in Phase 2 has modeled its nouns.
2. **Five relationship kinds connect the four objects to each other and to earlier domain areas**
   (`integration.ts`, same pattern as `architecture.ts`/`domain.ts`/`journey.ts`):
   - `hasIntegration` (association) — an internal object (typically a P2-03 `ContainerObject`) →
     Integration. Represents the requirements' "source" of the integration.
   - `carries` (composition) — Integration → DataFlow, per the FRD's "Integration carries
     DataFlow."
   - `exposes` / `consumes` (interaction) — an internal object → Interface, matching the P2-02
     verb-to-category mapping already established (an interaction, not a structural fact).
   - `realizes` (realization) — API → Interface: the API is the concrete technical implementation
     of the interface's contract, same category P2-05 used for Flow → Journey.
3. **`IntegrationAttributes.interactionType` reuses Phase 1's exact `IntegrationDirection` closed
   union (`'outbound' | 'inbound' | 'bidirectional'`)** rather than inventing new vocabulary — one
   more direct, literal reuse of an existing Phase 1 type, consistent with `packages/shared`
   already being the canonical source for `Provenance`/`Confidence`/`GraphElementMetadata`.
4. **An integration's counterpart (the external system) is _not_ modeled as a separate object.**
   P2-03's ADR 0005 already flagged "external actors have no canonical kind" as an open gap; Phase
   1 itself never resolves `Integration.counterpart` to a real object either — it is a plain
   string. Inventing a new object kind here to close that gap would be scope creep beyond P2-06's
   brief (API/Interface/Integration/DataFlow only). Instead, the counterpart's _name_ becomes the
   `IntegrationObject`'s own `label` (matching Phase 1's `Integration.name`), and its descriptive
   role is carried in `attributes.counterpartDescription` (matching Phase 1's `Integration.counterpart`,
   e.g. "External payment processor") — the information is preserved, just not resolved to a node,
   exactly matching Phase 1's own fidelity.
5. **`ApiAttributes.operations` is a lightweight embedded `OperationDefinition[]` (`name`,
   `description?`), not a first-class object** — the same reasoning as P2-04's
   `AttributeDefinition` (ADR 0006): an operation has no independent identity, provenance, or
   lifecycle apart from the API it belongs to.
6. **No `CANONICAL_SCHEMA_VERSION` bump; no changes to any earlier `.ts` file.** Everything is
   additive: one new file (`integration.ts`), one barrel export line. P2-03's generic `TAttributes`
   and optional relationship `attributes` already cover what P2-06 needed — the third domain area
   in a row (after P2-04 and P2-05) to require zero base-model changes.

## UI compatibility mapping

| Phase 1 UI field (`IntegrationsPage.tsx` / `Integration` contract) | Canonical model field                                                         | Status                                                                                                                                                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `integration.name`                                                 | `IntegrationObject.label`                                                     | Represented                                                                                                                                                                                    |
| `integration.counterpart`                                          | `IntegrationAttributes.counterpartDescription`                                | Represented — see decision 4                                                                                                                                                                   |
| `integration.direction`                                            | `IntegrationAttributes.interactionType`                                       | Represented — same closed union reused directly                                                                                                                                                |
| `integration.protocol`                                             | `IntegrationAttributes.protocol`                                              | Represented                                                                                                                                                                                    |
| `integration.dataExchanged`                                        | `DataFlowAttributes.data`, on a `DataFlowObject` connected via `carries`      | Represented, moved from an inline field to a related object — see decision 2                                                                                                                   |
| `integration.metadata`                                             | `IntegrationObject.metadata`                                                  | Represented — direct reuse                                                                                                                                                                     |
| _(none — no internal owner is recorded)_                           | `hasIntegration` relationship (internal object → Integration)                 | **No Phase 1 UI representation.** `IntegrationsPage.tsx` renders a flat list; it does not record which container/component owns a given integration. Forward-looking, connects P2-06 to P2-03. |
| _(none — no API/Interface concept exists)_                         | `ApiObject`, `InterfaceObject`, `realizes`/`exposes`/`consumes` relationships | **No Phase 1 UI or contract representation at all** — see Context. A real, pre-existing gap, not introduced by P2-06.                                                                          |

All "Represented" rows above are proven against Phase 1's real Aurora fixture data (the actual
`Integration.id === 'int-meridian-pay'` "Meridian Pay" record and the bidirectional
`'int-warehouse-3pl'` "Warehouse & 3PL System" record, read from
`apps/web/src/data/mock/aurora/integrations.ts`), not illustrative stand-ins — see
`packages/knowledge-graph/tests/integration.test.ts`'s "Phase 1 Integration compatibility" suite.

## Consequences

A future extraction/inference source that discovers API surfaces, exposed/consumed interfaces, and
system-to-system integrations has a defined, Phase-1-proven target shape. The pre-existing
API/Interface gap in Phase 1 is now visible and typed (an empty-but-defined destination) rather
than absent from the model entirely, without Phase 2 fabricating discovery it was explicitly told
not to build.

## Alternatives considered

- **Model Integration and DataFlow as relationships** (reading the requirements' "source, target"
  phrasing literally) — rejected: conflicts with the FRD's own authoritative node-type list in
  `docs/ontology/README.md`, and a relationship cannot carry the independent identity, evidence,
  and lifecycle an Integration or DataFlow needs (e.g. an Integration can itself be the source of
  `carries` relationships to one or more DataFlows — a relationship cannot itself be the endpoint
  of another relationship in this model).
- **Invent a canonical "external system" object kind** to resolve `Integration.counterpart` to a
  real node — rejected as out of scope for P2-06 specifically (it is a cross-cutting gap already
  flagged in ADR 0005, not unique to the integration/API area) and unsupported by any real Phase 1
  data beyond a plain string.
- **A single `interactionType` field directly on `DataFlowObject`, inherited implicitly from its
  parent Integration** — rejected: a DataFlow's own `direction` can differ in nuance from its
  parent Integration's `interactionType` in principle (e.g. one bidirectional integration composed
  of two directional flows, matching the real Warehouse & 3PL Phase 1 data: "Outbound: shipment
  requests. Inbound: stock levels, tracking events."), so `DataFlowAttributes.direction` is kept
  independent and optional rather than removed.
