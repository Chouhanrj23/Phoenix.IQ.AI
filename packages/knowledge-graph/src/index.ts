/**
 * @phoenix-ai/knowledge-graph
 * Module: Knowledge Graph & Provenance Store
 *
 * P2-01: the canonical knowledge model -- a domain-neutral, source-aware
 * representation that future extraction/inference sources will produce and
 * that future OKF renderers / graph storage will consume. See
 * docs/architecture/adr/0003-canonical-knowledge-model.md for the design
 * rationale.
 *
 * P2-02: the domain-neutral ontology foundation -- `StructuralCategory`/
 * `RelationshipCategory` (the small, closed, universal classification every
 * `kind` falls under) and optional `LifecycleState`. See
 * docs/architecture/adr/0004-domain-neutral-ontology.md.
 *
 * P2-03: the Architecture model -- typed `SystemObject`/`ContainerObject`/
 * `ComponentObject` and `ArchitectureRelationship`, the first
 * domain-specific `kind` vocabulary built on top of P2-02's categories. See
 * docs/architecture/adr/0005-architecture-model.md.
 *
 * P2-04: the Domain/Entity model -- typed `DomainObject`/`EntityObject`/
 * `AggregateObject`/`EntityStateObject` and `DomainRelationship`. See
 * docs/architecture/adr/0006-domain-entity-model.md.
 *
 * P2-05: the Persona/Journey/State model -- typed `PersonaObject`/
 * `JourneyObject`/`FlowObject`/`ActionObject` and `JourneyRelationship`,
 * plus a `triggersTransition` extension connecting Actions to P2-04's
 * `EntityStateObject`. See docs/architecture/adr/0007-persona-journey-state-model.md.
 *
 * P2-06: the Integration/API model -- typed `ApiObject`/`InterfaceObject`/
 * `IntegrationObject`/`DataFlowObject` and `IntegrationRelationship`, the
 * fourth and last of the domain-specific ontology areas planned for
 * Phase 2. See docs/architecture/adr/0008-integration-api-model.md and
 * docs/phase-2/README.md for the Phase 2 status record.
 *
 * P2-07: the provenance model -- `Source` (a resolvable description of an
 * origin artifact) and `validateSourceReferences` (cross-checks that every
 * `metadata.provenance[].sourceId`/`evidence[].sourceId` in a bundle
 * resolves against its `sources` registry), plus stricter per-entry
 * validation of `Provenance` (`@phoenix-ai/shared`, reused as-is) folded
 * into the base object/relationship validators. See
 * docs/architecture/adr/0009-provenance-model.md.
 *
 * P2-08: the confidence model -- `ConfidenceBasis` (`observed`/`derived`)
 * and `ConfidenceDetail`, a new optional `confidenceDetail` sibling field
 * on `CanonicalKnowledgeObject`/`CanonicalKnowledgeRelationship` that keeps
 * the FACT/DIRECTLY-OBSERVED vs DERIVED/INFERRED distinction explicit and
 * separate from confidence *strength* (`metadata.confidence.level`/`score`,
 * `@phoenix-ai/shared`, untouched). See
 * docs/architecture/adr/0010-confidence-model.md.
 *
 * P2-09: the evidence/reference model -- rounds out P2-01's `Evidence`
 * (`evidence.ts`) with `capturedAt`/`sourceVersion` (timestamp/version
 * "where applicable"), adds an optional `evidence` sibling field on
 * `CanonicalKnowledgeRelationship` (objects already had one), and folds
 * stricter per-entry `evidence[]` validation into the base object/
 * relationship validators -- the same kind of gap-fix P2-07 already did for
 * `metadata.provenance[]`. See docs/architecture/adr/0011-evidence-reference-model.md.
 *
 * P2-10: the OKF (Open Knowledge Format) YAML schema -- `OkfDocument`
 * (`okf.ts`), the finalized, deterministic, versionable YAML serialization
 * of `CanonicalKnowledgeBundle` (not a second model), plus
 * `serializeOkfYaml`/`parseOkfYaml`/`parseAndValidateOkfYaml`/
 * `validateOkfDocument`. This is the contract Phase 3 connectors will
 * eventually target. See docs/architecture/adr/0012-okf-yaml-schema.md and
 * docs/okf/README.md for the authoritative field-level reference.
 *
 * Deliberately NOT implemented yet: real source connectors (repository,
 * documentation, project/issue system, configuration, or inference-engine
 * integrations), any confidence calculation engine, any persistence/storage
 * layer, file-system I/O helpers, and any real extraction source -- this
 * remains a model/schema-only package. Phase 2's remaining items (P2-11
 * onward) are separate work.
 */

export * from './identity.js';
export * from './evidence.js';
export * from './ontology.js';
export * from './confidence.js';
export * from './relationships.js';
export * from './canonical-object.js';
export * from './provenance.js';
export * from './bundle.js';
export * from './validation.js';
export * from './okf.js';
export * from './architecture.js';
export * from './domain.js';
export * from './journey.js';
export * from './integration.js';
