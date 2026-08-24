# ADR 0025: Phase 5 — Business Understanding (semantic inference architecture)

- **Status:** Accepted
- **Date:** 2026-08-22
- **Owners:** Platform maintainers

## Context

Phase 5's exit criterion: "Business understanding works across different domains." The system must
move beyond technical extraction (Phase 3) and graph persistence (Phase 4) toward inferring the
business meaning represented by the software — without hard-coding e-commerce, fintech, or any other
specific domain's vocabulary into the inference logic itself (FR-SEM-01 through FR-SEM-06,
`docs/requirements/FRD.docx` §3.4 "Semantic Inference Engine").

`packages/inference-engine` was, until this ticket, an untouched scaffold (`MODULE_NAME`/
`placeholder()`). No LLM integration exists anywhere in this repository — verified directly: no
provider SDK in any `package.json`, no `LLM_*`/`OPENAI_*`/`ANTHROPIC_*` environment variable anywhere.

## Decision

### 1. Pipeline shape

```
OKF (Phase 2/3/4, unmodified)
  -> extractTechnicalEvidence     (raw OKF objects -> flat evidence items)
  -> extractVocabulary            (P5-02: normalized candidate terms)
  -> inferBusinessConcepts        (P5-03: candidate business concepts)
  -> inferBusinessCapabilities    (P5-04: concept clusters)
  -> inferJourneys                (P5-05: real operation sequences)
  -> inferEntityStates            (P5-06: real status-verb evidence)
  -> mapJourneysToEntitiesAndStates (P5-07: readsEntity/writesEntity/triggersTransition)
  -> traceability.ts              (P5-08: groundedIn + explainTraceability)
```

Each stage is a plain, synchronous (or `Promise`-returning) function over the previous stage's real
output — never a second copy of the OKF, never a parallel knowledge model. `packages/knowledge-graph`
is **not modified**.

### 2. The inference contract (P5-01)

`InferenceProvider<TInput, TOutput>` (`inference-contract.ts`): `{ name: string; infer(input: TInput):
Promise<TOutput> }`. Generic over input/output so the same shape describes every stage without forcing
a single fixed business schema. This repository ships exactly one family of implementations —
deterministic, rule-based logic operating on STRUCTURE (naming conventions, CRUD-verb ordering, module
co-location) — never a business-noun lookup table. Per this ticket's explicit instruction ("if the
current project does not have an LLM integration mechanism, implement the inference contract and
deterministic test implementation first"), no LLM provider is implemented or connected. An LLM-backed
`InferenceProvider` implementation is a valid, drop-in future extension (same interface, `infer`
returning a real network call instead of a synchronous computation) — not built here, since none was
required to satisfy P5-01 through P5-10, and connecting one without a real, reviewed need would be
exactly the "unnecessary provider coupling" this ticket warned against.

### 3. Output: existing OKF kinds reused, one new kind added

Phase 2's `kind` field is an **open string** at the base validator level (`validateCanonicalKnowledgeObject`/
`validateCanonicalKnowledgeRelationship` only check `category` against a closed enum; `kind` is checked
only for non-emptiness) — confirmed by direct inspection, and already exploited by Phase 4's
`bridge-relationships.ts` to add `dependsOn`/`hasAssociation` without any schema-file change. Phase 5
reuses the same mechanism:

| Concept                                     | OKF representation                                                | Schema change?                     |
| ------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------- |
| Business entity/concept                     | `domain.entity` (P2-04, reused)                                   | None                               |
| Business capability                         | `business.capability` (new, open-vocabulary `kind`)               | None (additive `kind` string only) |
| Journey / flow / action                     | `journey.journey`/`journey.flow`/`journey.action` (P2-05, reused) | None                               |
| Entity lifecycle state                      | `domain.entity-state` (P2-04, reused)                             | None                               |
| Journey step -> entity                      | `readsEntity`/`writesEntity` (P2-05, reused)                      | None                               |
| Journey step -> state                       | `triggersTransition` (P2-05, reused)                              | None                               |
| Entity -> state                             | `hasState` (P2-04, reused)                                        | None                               |
| State -> state                              | `transitionsTo` (P2-02/04, reused)                                | None                               |
| Capability -> concept                       | `comprises` (new, open-vocabulary `kind`)                         | None                               |
| Capability -> technical object              | `realizedBy` (new, open-vocabulary `kind`)                        | None                               |
| Business concept/action -> technical object | `groundedIn` (new, open-vocabulary `kind`)                        | None                               |

`business.capability` is the only concept with no existing OKF kind at all (none of the 15 existing
kinds represents "a named business ability delivered by the system" — Domain is a knowledge/bounded-
context grouping, a materially different concept). Everything else was **already defined in Phase 2 and
never populated by Phase 3/4** — P2-05's whole journey/persona/state model was designed exactly for
this, and Phase 5 is its first real producer. `packages/knowledge-graph` itself was not touched.

### 4. Domain-neutral vocabulary extraction (P5-02)

`normalizeIdentifierText` (`vocabulary.ts`) strips, in order: an HTTP method, a leading CRUD/lifecycle
verb (`create`/`get`/`confirm`/`activate`/`ship`/...), a trailing technical suffix (`Controller`/
`Service`/`Repository`/`Orchestrator`/...), and infrastructure noise words (`Config`/`Util`/`Base`/...),
then singularizes what remains. Every one of these tables describes a **structural/technical shape**,
never a business noun — the same code runs unmodified over any vocabulary (proven mechanically, see
decision 8).

### 5. Identity strategy

`deterministicId(prefix, ...parts)` (`inference-contract.ts`) — sha256-based, the same construction as
`extraction-engine`'s `bridge-shared.ts` and `ingestion-connectors`'s `reference-connector.ts`,
reimplemented locally (not imported) to avoid a downward dependency from Phase 5 onto Phase 3. Never
random; re-running the pipeline over identical input reproduces identical ids.

### 6. Provenance

Every stage's output re-derives `metadata.provenance` from the technical evidence that supported it
(`deriveProvenanceFrom`), stamping `derivedBy: 'inference-engine'` — distinct from the underlying
technical facts' own `derivedBy: 'extraction-engine'` provenance, which is never overwritten, only
referenced. The chain **business inference → inference evidence → technical evidence → source artifact
→ source location** is walkable end to end via `explainTraceability` (P5-08), which follows
`groundedIn`/`comprises`/`realizedBy` edges back to real technical objects and collects every
`Evidence.locator` found along the way.

### 7. Confidence

No new confidence vocabulary — every inferred object/relationship uses Phase 2's existing `Confidence`/
`ConfidenceDetail` types unmodified. `deriveInferenceConfidence(signalCount, method, calculatedAt,
inputs?)` (`inference-contract.ts`) is the **one** documented, deterministic calculation every stage
uses: `score = min(1, 0.3 + 0.15 * (signalCount - 1))`, level thresholds `>=0.75` high / `>=0.55` medium
/ `>=0.35` low / else `inferred` (reusing Phase 1's closed `ConfidenceLevel` vocabulary unmodified).
`confidenceDetail.basis` is **always** `'derived'` for Phase 5 output — FR-SEM-05's requirement that
inferred elements stay distinguished from directly-observed facts. The calculation method name and
signal count are always recorded in `confidenceDetail.calculation` — no score is ever hand-typed with
no explanation.

### 8. Ambiguity handling

Where a stage's own internal logic must choose (e.g. which normalized term a vocabulary bucket
belongs to), ambiguous/weak signals are still returned as low-confidence candidates, never silently
dropped to look more certain than the evidence supports (`AmbiguousInferenceResult`/
`InferenceCandidate`, `inference-contract.ts`). Concepts/capabilities/journeys/states below a stage's
documented minimum-evidence threshold (e.g. `MIN_CONCEPTS_PER_CAPABILITY`, `MIN_STAGES_FOR_JOURNEY`)
are not created at all, rather than fabricated from a single weak signal.

### 9. Domain neutrality (P5-09), verified mechanically

`tests/domain-agnostic.test.ts` does two things no amount of author assertion can substitute for:

1. Reads every actual `src/*.ts` file's text and asserts it contains none of a real forbidden-noun list
   (`Order`, `Product`, `Cart`, `Customer`, `Payment`, `Account`, `Transaction`, `Loan`, `Card`, ...,
   Title-Case/word-boundary matched so the legitimate lowercase `attributes.order` ordinal-position
   field — a real P2-05 schema field — is never a false positive).
2. Runs the full pipeline over two lexically unrelated, structurally similar vocabularies (`Zorble`/
   `Fennix` and `Quintel`/`Barnacle`) and asserts both produce analogous concepts/capabilities/journeys/
   states — proving the SAME code, not a per-domain branch, produces the result.

One genuine self-inconsistency was found and fixed during this work: two doc-comments in
`inference-contract.ts`/`vocabulary.ts` used "Order" as an illustrative example, which the domain-
neutrality principle they were describing shouldn't do even in prose — fixed to use the same neutral
placeholder ("Widget") the test fixtures already use. A second real gap was found the same way:
`vocabulary.ts`'s verb-prefix list didn't include every verb `state-inference.ts`'s status-verb table
recognized (e.g. `activate`/`suspend`), which would have stripped them inconsistently — reconciled so
both tables draw from the same generic verb vocabulary.

### 10. Real-data principle (P5-10)

Neither Aurora nor fintech validation fixture is a real repository extraction — no OKF-level technical
evidence exists for either an e-commerce or fintech domain in this repository (Phase 3's only real
extracted OKF, `spring-petclinic.okf.yaml`, is a veterinary-clinic domain). Per the ticket's own
explicit fallback ("if a real fintech repository is not available, clearly document that limitation and
use a representative controlled fixture"), both fixtures are representative, hand-built technical
evidence — but neither invents vocabulary: Aurora's entity/service names and source paths are taken
directly from the existing, already-committed P2-11 sample
(`packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml`); fintech's are taken directly from
the existing, already-committed fintech demo dataset (`apps/web/src/data/mock/fintech/fixtures.ts`, the
"nimbus-financial" digital-banking system) — a genuinely different domain (onboarding/KYC, accounts,
card issuing, transfers, fraud/AML), not e-commerce with renamed fields. See
`packages/inference-engine/tests/aurora-fintech-fixtures.ts` for the full disclosure and
`docs/phase-5/README.md` for the validation results.

## Consequences

- `packages/inference-engine` now has a real, tested implementation (90 tests) instead of a scaffold.
- `packages/knowledge-graph` (the canonical OKF model) is unmodified — zero changes.
- `packages/extraction-engine`/`packages/graph-persistence` (Phase 3/4) are unmodified.
- Three new, additive, open-vocabulary `kind`s now exist in real output: `business.capability`,
  `comprises`, `realizedBy`, `groundedIn` — none require a schema-file change to validate, since the
  base validators already accept any non-empty `kind` string.
- P2-05's `journey.*`/`domain.entity-state`/`hasState`/`transitionsTo`/`readsEntity`/`writesEntity`/
  `triggersTransition` kinds and relationship kinds have their first real producer.
- No route, API, or UI integration is implemented — Phase 5 produces canonical objects/relationships
  ready for a later ticket to persist via `@phoenix-ai/graph-persistence` exactly as Phase 3/4's output
  already is; wiring that up was not part of this ticket's scope.

## Alternatives considered

- **A second, business-specific knowledge model, separate from the OKF** — rejected outright; the
  ticket's own "do not duplicate business concepts across multiple incompatible models" rule, and this
  project's established discipline (Phase 4 bridge-relationships.ts precedent) both forbid it.
- **Extending `packages/knowledge-graph` with a formal `BusinessCapability` type/domain file** (matching
  P2-03 through P2-06's pattern) — considered and rejected for now: the open-`kind` mechanism already
  satisfies every real requirement (validation, persistence, UI-agnostic graph mapping) without a
  schema-file change; a fuller domain file remains a reasonable FUTURE option if capability-specific
  typed attributes are ever needed, not a requirement today.
- **Connecting a real LLM provider** — rejected per explicit instruction; no existing integration
  mechanism, and none of P5-01 through P5-10's acceptance criteria required one. The contract is built
  so adding one later is additive, not a redesign.
- **Ordering journey/state verbs alphabetically** — rejected outright; the ticket explicitly prohibits
  it, and it would silently produce wrong sequences (e.g. "Cancelled" sorts before "Confirmed"
  alphabetically, the opposite of their real order). A fixed, documented lifecycle-stage number per verb
  is used instead.

## Addendum: post-acceptance corrective audit

A strict validation audit (after this ADR's original acceptance) found that the pipeline, though fully
green against its own curated fixtures, had never been run against Phase 3's real producer output shape
and had two genuine architectural gaps. Five corrective decisions, implemented in dependency order:

11. **REST-evidence CRUD signal.** Phase 3's only real producer (`bridgeSpringController`) emits
    `operation.name` as `"GET /owners/{id}"`-style REST strings, never bare Java-method verbs.
    `normalizeIdentifierText` (`vocabulary.ts`) gained a generic, HTTP-method-derived
    `normalizedAction` (`create`/`read`/`update`/`terminate`) fallback, populated only when no bare
    leading verb exists — journey ordering (P5-05) and read/write mapping (P5-07) consume it fully;
    state naming (P5-06) consumes it only for `create`/`terminate` (→`Created`/`Deleted`), deliberately
    excluding `read`/`update` as too generic to name a specific business state from an HTTP method
    alone. Rejected alternative: inferring a specific named state from every HTTP method — rejected as
    fabricating business meaning beyond what a bare verb (e.g. `PUT`) structurally justifies.
12. **Module-key fallback for flat repositories.** `moduleKeyOf` (`capability-inference.ts`) assumed a
    microservices-style `repo://x/services/y` provenance layout; a flat/monolith `repo://x` sourceId
    (Phase 3's real `spring-petclinic` shape) resolved no module at all, zeroing P5-04. Added a
    documented SECONDARY fallback deriving a real Java-package-directory module key from
    `Evidence.locator` file paths, tried only when the PRIMARY (provenance-based) signal fails for
    every provenance entry. Rejected alternative: a fabricated constant module key (e.g.
    `"default-module"`) — explicitly rejected as inventing structure the evidence does not contain.
13. **Entity-state traceability.** `domain.entity-state` objects previously used a generic, systemId-only
    provenance and an always-empty `evidence` array, with no grounding relationship — `explainTraceability`
    returned nothing for any state, failing the ticket's own "system must be able to explain where the
    inference came from" requirement for this one object kind. `state-inference.ts` now derives real
    provenance/evidence via the SAME `deriveProvenanceFrom`/`deriveEvidenceFrom` mechanism
    `concept-inference.ts` already used (never a second, parallel mechanism), and returns
    `stateGroundingLinks` consumed by `traceability.ts`'s new `buildStateGroundingRelationships` — the
    same `groundedIn` relationship kind and construction already used for concepts/actions.
14. **P5-01 contract wiring.** `InferenceProvider`/`InferenceCandidate`/`AmbiguousInferenceResult` were
    defined but unused by any real stage. `concept-inference.ts`'s `existingEntityResolutionProvider` now
    wires the contract through the one genuine ambiguity point in the pipeline (an existing entity-like
    object label match); `inferBusinessConcepts` calls the identical underlying resolution logic
    synchronously, so this package's many existing synchronous callers were not forced to become `async`.
    Rejected alternative: making `inferBusinessConcepts` itself `async` — rejected as an unnecessarily
    wide, mechanical ripple (9 call sites) for a resolution step with no real I/O.
15. **Realistic cross-domain validation.** `domain-agnostic.test.ts` (P5-09) and
    `aurora-fintech-validation.test.ts` (P5-10) gained REST-style evidence fixtures ADDED ALONGSIDE
    (never replacing) the existing curated ones, so the corrected pipeline's REST-evidence path is
    proven, not just its curated-fixture path.

All five were validated directly against the real `packages/extraction-engine/samples/
spring-petclinic.okf.yaml` extraction: capabilities went from 0 → 3 real clusters, journeys 0 → 5, entity
states 0 → 5, and `explainTraceability` now resolves a real state object back to a real source location.
See `docs/phase-5/README.md` "Corrective fixes" for the full account.
