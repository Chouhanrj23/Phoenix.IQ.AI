# Knowledge Graph Ontology

Reference documentation for the OKF knowledge graph ontology defined in the FRD (§4,
Data Requirements — Knowledge Graph Ontology). This is the schema that
`packages/knowledge-graph` implements and that every OKF renderer projects from.

## Node types (per FRD §4.1)

To be documented per node type: `System`, `Container`, `Component`, `Aggregate`, `Entity`,
`Screen`, `Flow`, `FlowStep`, `Interface`, `Integration`, `DataFlow`, `Epic`, `Feature`,
`Story`, `AcceptanceCriterion`, `Node` (deployment), `DeploymentUnit`, `Environment`,
`Journey`, `Persona`.

## Key relationships (per FRD §4.2)

- `Component` implements `Aggregate`; `Container` contains `Component`; `System` contains `Container`.
- `Screen` triggers `Flow`; `Flow` has `FlowStep`; `Flow` reads/writes `Entity`.
- `Integration` carries `DataFlow`; `Interface` exposes/consumes `DataFlow`.
- `Story` realizes `Feature`; `Feature` belongs to `Epic`; `Story` satisfies `AcceptanceCriterion`.
- `Container` deployedTo `Node`; `DeploymentUnit` runsIn `Environment`.
- `Flow` supports `Journey` (produces OKF output #11: flow-to-journey relationship).

## Element metadata (mandatory on every node/edge, per FRD §4.3)

Every node and edge carries `Provenance[]` and `Confidence` — see
`packages/shared/src/provenance.ts` for the canonical TypeScript types. P2-07 adds a resolvable
`Source` registry these `Provenance[]` entries (and `Evidence[]`) can reference by `sourceId` —
see "Provenance model (P2-07)" below. P2-08 adds an orthogonal `ConfidenceDetail` (fact/observed
vs derived/inferred) alongside `Confidence` — see "Confidence model (P2-08)" below. P2-09 rounds
out `Evidence[]` (present since P2-01) into the full evidence/reference model — see "Evidence
model (P2-09)" below. Provenance answers _where information came from_; evidence answers _what
specifically supports it_; confidence answers _how strongly Phoenix trusts it_ — three separate,
structurally independent questions, by design.

## Universal structural categories (P2-02)

Before the node types above are formalized as closed `kind` values (P2-03 through P2-06), every
node and edge already classifies under one small, universal category — see
`packages/knowledge-graph/src/ontology.ts` and
`docs/architecture/adr/0004-domain-neutral-ontology.md` for the full rationale and the
FRD-concept-to-category mapping table:

- Node categories: `entity` (the default — most node types above), `process` (`Flow`,
  `FlowStep`, `Journey`), `observation` (review/gap/drift-style meta-facts about other nodes,
  not in this list yet), `other` (escape hatch).
- Relationship categories: `composition` (`contains`, `deployedTo`, `runsIn`), `realization`
  (`implements`, `realizes`, `satisfies`), `interaction` (`triggers`, `has`, `reads/writes`,
  `carries`, `exposes/consumes`, `supports`), `association` (generic references), `other`.

## Architecture ontology (P2-03)

The first node types/relationships from the lists above are now formalized as closed `kind`
values, in `packages/knowledge-graph/src/architecture.ts` — see
`docs/architecture/adr/0005-architecture-model.md` for the full field-level schema, the
Phase 1 UI compatibility mapping, and known limitations (external actors and
`Epic`/`Feature`/`Story` are not yet categorized).

- Node kinds: `architecture.system` (`System`), `architecture.container` (`Container`),
  `architecture.component` (`Component`). Each carries `responsibility`
  (Container/Component, required) or `description` (System, optional), plus `technology`/
  `runtime` (Container only, optional).
- Relationship kinds: `contains` (`System` contains `Container`; `Container` contains
  `Component` — composition), `communicatesWith` (any runtime interaction, deliberately
  technology-agnostic — no protocol/vendor names in `kind`; specific detail like "authorizes
  payment" goes in the relationship's `attributes.description` instead).

## Domain/Entity ontology (P2-04)

Formalized in `packages/knowledge-graph/src/domain.ts` — see
`docs/architecture/adr/0006-domain-entity-model.md` for the full field-level schema, the Phase 1
UI compatibility mapping, and the honest gap it documents (Phase 1 has no real per-entity data,
only aggregate-level entity name strings).

- Node kinds: `domain.domain` (`Domain`), `domain.entity` (`Entity`, with an optional
  `attributes.fields: AttributeDefinition[]` — `Attribute`'s `name`/`type`/`required`, embedded
  rather than a first-class node), `domain.aggregate` (`Aggregate`), `domain.entity-state`
  (one state in an entity's state machine, distinct from the per-instance `LifecycleState`
  every canonical object already has).
- Relationship kinds: `contains` (Domain contains Entity — composition), `aggregateRoot`/
  `aggregateMember` (Aggregate's root/member entities — composition), `hasState` (Entity has a
  legal state — association), `transitionsTo` (state → state — interaction), `relatesTo` (a
  deliberately generic entity-to-entity relationship with no assumed business meaning).

## Persona/Journey/State ontology (P2-05)

Formalized in `packages/knowledge-graph/src/journey.ts` — see
`docs/architecture/adr/0007-persona-journey-state-model.md` for the full field-level schema, the
Phase 1 UI compatibility mapping (proven against real Aurora persona/journey/flow/step data —
unlike P2-04, Phase 1 has rich real data here), and the one real gap it documents (no Phase 1 UI
represents Entity State or a triggering action at all).

- Node kinds: `journey.persona` (`Persona`), `journey.journey`/`journey.flow` (`Journey`/`Flow`,
  both category `process`), `journey.action` (`FlowStep`).
- Relationship kinds: `contains` (Flow's ordered steps — composition, with `attributes.order` for
  sequencing), `hasPersona` (Journey → Persona — association), `supports` (`Flow` supports
  `Journey`, per the FRD wording above — realization), `readsEntity`/`writesEntity` (Action →
  Entity, an action's effects — interaction, reusing P2-04's `EntityObject`), `triggersTransition`
  (Action → EntityState — interaction; **extends** P2-04's `domain.entity-state`, not a new
  object type, satisfying "triggering action/event where supported").

Not yet formalized: `Screen`, `Interface`, `Integration`, `DataFlow`, `Epic`, `Feature`, `Story`,
`AcceptanceCriterion`, `Node` (deployment), `DeploymentUnit`, `Environment` — that's P2-06
(Integration/API model) and beyond.

## Integration/API ontology (P2-06)

Formalized in `packages/knowledge-graph/src/integration.ts` — see
`docs/architecture/adr/0008-integration-api-model.md` for the full field-level schema, the Phase 1
UI compatibility mapping, and the honest gap it documents (Phase 1 has no API or Interface concept
at all — no route, no contract, no UI — so those two object kinds have no real data to map).

- Node kinds: `integration.api` (`API`, with an optional `attributes.operations:
OperationDefinition[]` — `name`/`description`, embedded rather than a first-class node, same
  pattern as P2-04's `AttributeDefinition`), `integration.interface` (`Interface`),
  `integration.integration` (`Integration`, `attributes.interactionType` reuses Phase 1's exact
  `IntegrationDirection` union), `integration.dataflow` (`DataFlow`).
- Relationship kinds: `hasIntegration` (an internal object, typically a P2-03 `Container`, →
  Integration — association), `carries` (`Integration` carries `DataFlow`, per the FRD wording
  above — composition), `exposes`/`consumes` (an internal object → Interface, per the FRD's
  "`Interface` exposes/consumes `DataFlow`" — interaction), `realizes` (API → Interface, the API
  is the concrete implementation of the interface's contract — realization).

All four node types above are modeled as first-class `CanonicalKnowledgeObject`s, not
relationships, per this document's own node-type list — see ADR 0008 decision 1.

## Provenance model (P2-07)

Not a new node type — a cross-cutting addition to the "Element metadata" layer above, formalized
in `packages/knowledge-graph/src/provenance.ts`. See
`docs/architecture/adr/0009-provenance-model.md` for the full design rationale.

- **`Source`** — a structured, resolvable description of an origin artifact (`id`, `type` — reuses
  `Provenance.sourceType`'s exact `SourceType` vocabulary, `label`, `locator?`, `version?`).
  Deliberately **not** a graph node: §4.3 treats provenance/confidence as metadata every node/edge
  carries, not a node in its own right, and this document's node-type list has no "Source" entry —
  same non-node precedent P2-01's `Evidence` already set.
- **`CanonicalKnowledgeBundle.sources?: Source[]`** — an optional bundle-level registry that
  `Provenance[].sourceId`/`Evidence[].sourceId` entries resolve against, so one source's
  `type`/`label`/`locator`/`version` isn't repeated on every object/edge that references it.
- **`validateSourceReferences`** — cross-checks that every `sourceId` referenced anywhere in a
  bundle resolves against its `sources` registry, when one is provided.
- Future source kinds (a source repository, documentation, a project/issue system, configuration,
  a future inference engine) all map onto the existing `SourceType` union without extension — see
  ADR 0009 decision 1.

## Confidence model (P2-08)

Not a new node type — a cross-cutting addition to the "Element metadata" layer above, orthogonal
to (and structurally independent from) the provenance model. Formalized in
`packages/knowledge-graph/src/confidence.ts` — see
`docs/architecture/adr/0010-confidence-model.md` for the full design rationale, the documented
numerical score-range interpretation, and alternatives considered.

- **`ConfidenceBasis`** (`'observed' | 'derived'`) — FACT/DIRECTLY OBSERVED vs DERIVED/INFERRED,
  kept separate from confidence _strength_ (`Confidence.level`/`score`, `@phoenix-ai/shared`,
  untouched). Phase 1's own `level: 'inferred'` value conflated both into a single scale; real
  fixture data shows every `'inferred'` entry also carries a low `score`, meaning Phase 1 could
  never represent a confident inference.
- **`ConfidenceCalculation`** (`method`, `calculatedAt`, `inputs?`) — optional, free-text metadata
  about how a numerical score was produced, for a future engine to populate; not a calculation
  engine itself.
- **`ConfidenceDetail`** (`basis` + optional `calculation`) — a new optional
  `confidenceDetail` field on `CanonicalKnowledgeObject`/`CanonicalKnowledgeRelationship`,
  sibling to `metadata`. `basis` is required whenever `ConfidenceDetail` is present at all.

## Evidence model (P2-09)

Not a new node type — a cross-cutting addition to the "Element metadata" layer above, rounding out
`Evidence` (present since P2-01) and kept distinguishable from both provenance and confidence.
Formalized in `packages/knowledge-graph/src/evidence.ts` — see
`docs/architecture/adr/0011-evidence-reference-model.md` for the full design rationale and
alternatives considered.

- **`Evidence`** (`id`, `sourceId`, `excerpt?`, `locator?`, plus new `capturedAt?`/`sourceVersion?`)
  — concrete supporting material for a claim: what was read, where within its source, when it was
  captured, and at what source revision. `sourceId` resolves to a `Source` (P2-07) or a
  `Provenance.sourceId`; no `sourceType`/`label` duplicated onto `Evidence` itself.
- **`CanonicalKnowledgeObject.evidence: Evidence[]`** (P2-01, always present) and
  **`CanonicalKnowledgeRelationship.evidence?: Evidence[]`** (P2-09, optional) — "relationship to
  the canonical knowledge item" is containment: evidence lives inside the array of the specific
  object/relationship it supports, not a separate foreign-key reference.
- Future source-artifact kinds (source file, documentation, API definition, configuration,
  issue/project record) require no new vocabulary — they resolve via `Evidence.sourceId` to a
  `Source.type`, already fully mapped by P2-07 (ADR 0009 decision 1).

## Status

Architecture (P2-03), Domain/Entity (P2-04), Persona/Journey/State (P2-05), Integration/API
(P2-06), the Provenance model (P2-07), the Confidence model (P2-08), and the Evidence/Reference
model (P2-09) are formalized — all four domain areas planned for Phase 2, plus all three
cross-cutting metadata models, are now complete. Remaining FRD node types not yet formalized:
`Screen`, `Epic`, `Feature`, `Story`, `AcceptanceCriterion`, `Node` (deployment), `DeploymentUnit`,
`Environment` — out of scope for Phase 2's P2-01–P2-09.
