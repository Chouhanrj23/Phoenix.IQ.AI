# @phoenix-ai/inference-engine

**Module:** Semantic Inference Engine
**FRD reference:** see `docs/requirements/FRD.docx`, module section for "Semantic Inference Engine"

## Responsibility

Interprets verified facts into domains, bounded contexts, and rationale using AI over the deterministic skeleton — never over raw files.

## Status — Phase 5 (Business Understanding), P5-01 through P5-10: complete

`src/` turns the OKF's already-verified technical facts (Phase 2/3/4, never raw source) into business
vocabulary, concepts, capabilities, journeys, entity states, and business↔technical traceability. See
[`docs/phase-5/README.md`](../../docs/phase-5/README.md) and
[`docs/architecture/adr/0025-phase-5-business-understanding.md`](../../docs/architecture/adr/0025-phase-5-business-understanding.md)
for the full design rationale and Aurora/fintech validation results.

- `inference-contract.ts` (P5-01) — `InferenceProvider<TInput, TOutput>`, the one contract every stage
  implements (genuinely wired through `concept-inference.ts`'s `existingEntityResolutionProvider`);
  `extractTechnicalEvidence` (raw OKF objects → flat evidence items); `deriveInferenceConfidence` (the
  one documented confidence calculation every stage uses); `deterministicId` (stable, content-derived
  ids, never random).
- `vocabulary.ts` (P5-02) — `extractVocabulary`/`normalizeIdentifierText`: structural, domain-neutral
  identifier normalization (strips CRUD verbs, technical suffixes, noise words), plus a generic,
  HTTP-method-derived `normalizedAction` fallback (`create`/`read`/`update`/`terminate`) for real REST
  operation names with no bare leading verb (Phase 3's actual `bridgeSpringController` output shape).
- `concept-inference.ts` (P5-03) — `inferBusinessConcepts`/`materializeBusinessConcepts`: candidate
  business concepts, reusing P2-04's `domain.entity` kind, never duplicating an already-real entity;
  `existingEntityResolutionProvider`, a real `InferenceProvider` surfacing genuine ambiguity (>1 real
  object sharing a label) as ranked candidates, never silently collapsed to the first match.
- `capability-inference.ts` (P5-04) — `inferBusinessCapabilities`: clusters concepts by shared source
  module into a new, additive `business.capability` kind; falls back to a real Java-package-directory
  signal (derived from `Evidence.locator`) for flat/monolith repositories with no service-boundary path.
- `journey-inference.ts` (P5-05) — `inferJourneys`: real, evidence-driven operation sequences, reusing
  P2-05's `journey.journey`/`.flow`/`.action` kinds; works from a bare leading verb OR the HTTP-method
  fallback.
- `state-inference.ts` (P5-06) — `inferEntityStates`: real, status-verb-evidenced lifecycle states,
  reusing P2-04's `domain.entity-state` kind; every state's provenance/evidence is derived from its real
  source operation and grounded (`groundedIn`) back to the technical object that evidenced it.
- `journey-mapping.ts` (P5-07) — `mapJourneysToEntitiesAndStates`: wires P2-05's previously-unpopulated
  `readsEntity`/`writesEntity`/`triggersTransition` relationship kinds.
- `traceability.ts` (P5-08) — `groundedIn` relationships (concepts, journey actions, AND entity states)
  plus `explainTraceability`, a callable walker from any business object back to its real technical
  evidence and source location — verified directly against real spring-petclinic data.

**Not yet implemented:** an LLM-backed `InferenceProvider` (the contract supports one; none was
required — see ADR 0025 decision 2); any route/API/UI integration of business-understanding output;
general noun-phrase quality improvements for multi-segment REST paths (a disclosed, separate refinement
opportunity — see `docs/phase-5/README.md` "Known limitations").
