# Phoenix Phase 5 — Business Understanding

Living status record for Phase 5 ("Business Understanding"). Mirrors the convention established in
[`docs/phase-3/README.md`](../phase-3/README.md) and [`docs/phase-4/README.md`](../phase-4/README.md).

Phase 4 (P4-01 through P4-10) is complete and accepted. Phase 5's job is to move beyond technical
extraction and graph persistence toward inferring the business meaning represented by the software —
domain-agnostically, across at least two genuinely different business domains. Full design rationale:
[`docs/architecture/adr/0025-phase-5-business-understanding.md`](../architecture/adr/0025-phase-5-business-understanding.md).

## P5-0X ticket status

All of P5-01 through P5-10 are complete.

| Ticket | Objective                         | Status                                                                              |
| ------ | --------------------------------- | ----------------------------------------------------------------------------------- |
| P5-01  | Define domain inference approach  | **Complete.** `packages/inference-engine/src/inference-contract.ts` — see ADR 0025. |
| P5-02  | Business vocabulary extraction    | **Complete.** `src/vocabulary.ts`.                                                  |
| P5-03  | Entity/business concept inference | **Complete.** `src/concept-inference.ts`.                                           |
| P5-04  | Business capability inference     | **Complete.** `src/capability-inference.ts`.                                        |
| P5-05  | User journey inference            | **Complete.** `src/journey-inference.ts`.                                           |
| P5-06  | Entity state inference            | **Complete.** `src/state-inference.ts`.                                             |
| P5-07  | Journey → entity/state mapping    | **Complete.** `src/journey-mapping.ts`.                                             |
| P5-08  | Business → technical mapping      | **Complete.** `src/traceability.ts`.                                                |
| P5-09  | Domain-agnostic validation        | **Complete.** `tests/domain-agnostic.test.ts`.                                      |
| P5-10  | Aurora + Fintech validation       | **Complete.** `tests/aurora-fintech-validation.test.ts` — see below.                |

## Corrective fixes (post-audit)

A strict validation audit found that the pipeline, while fully green on its own curated test fixtures,
had never been proven against Phase 3's REAL producer output shape and had two genuine traceability/
contract gaps. Five corrective fixes closed these:

1. **REST operation normalization.** Phase 3's only real producer (`bridgeSpringController`) emits
   operation names as `"GET /owners/{id}"`-style REST strings, never bare Java-method verbs — so
   `leadingVerb` was never set for any real evidence, silently zeroing P5-05/P5-06/P5-07 output.
   `normalizeIdentifierText` now derives a generic `normalizedAction` (`create`/`read`/`update`/
   `terminate`) from the HTTP method alone (`POST`→create, `GET`→read, `PUT`/`PATCH`→update,
   `DELETE`→terminate) whenever no bare leading verb exists — never a specific business action, only a
   structural CRUD signal. `journey-inference.ts`/`state-inference.ts`/`journey-mapping.ts` all consume
   this as a documented fallback. State-naming from this fallback is deliberately narrow: only `create`
   (→`Created`) and `terminate` (→`Deleted`) are unambiguous enough to name a generic state; `read`/
   `update` never do.
2. **Capability module-key fallback.** `moduleKeyOf`'s microservices-style `repo://x/services/y`
   assumption returned `undefined` for a flat/monolith repository's `repo://x` provenance (Phase 3's
   real `spring-petclinic` shape) — zeroing P5-04. `capability-inference.ts` now falls back to a real
   Java-package-directory signal derived from `Evidence.locator` file paths (e.g.
   `src/main/java/.../petclinic/owner/OwnerController.java` → `petclinic/owner`) whenever no provenance
   entry resolves a primary module key — never a fabricated constant.
3. **Entity-state traceability.** `domain.entity-state` objects previously carried a generic,
   systemId-only provenance and an always-empty `evidence` array, with no `groundedIn` relationship —
   `explainTraceability` returned nothing for any state. `state-inference.ts` now derives real
   provenance/evidence from the actual status-verb operation's technical evidence (`deriveProvenanceFrom`/
   `deriveEvidenceFrom`, the same mechanism `concept-inference.ts` uses), and returns
   `stateGroundingLinks` that `traceability.ts`'s new `buildStateGroundingRelationships` turns into real
   `groundedIn` edges — the same grounding mechanism already used for concepts/actions, not a second one.
4. **Realistic cross-domain validation.** `domain-agnostic.test.ts` (P5-09) and
   `aurora-fintech-validation.test.ts` (P5-10) gained REST-style evidence fixtures ALONGSIDE (never
   replacing) the existing curated ones, proving the corrected pipeline works on Phase 3's real
   operation-naming shape, not only on evidence hand-tuned for pipeline success.
5. **P5-01 contract wiring.** `InferenceProvider`/`InferenceCandidate`/`AmbiguousInferenceResult` were
   previously defined but never used by any real stage. `concept-inference.ts` now wires the one genuine
   ambiguity point in the pipeline (an existing entity-like object label match) through
   `existingEntityResolutionProvider`, a real, tested, async `InferenceProvider` implementation sharing
   its core logic with `inferBusinessConcepts`'s synchronous resolution path — never two parallel,
   drifting implementations.

All five were validated against the real `packages/extraction-engine/samples/spring-petclinic.okf.yaml`
extraction directly, not only against unit-test fixtures: capabilities went from 0 → 3 real clusters,
journeys from 0 → 5, entity states from 0 → 5, and `explainTraceability` now resolves a real state object
back to a real source location (`OwnerController.java#L48-L179`).

## Architecture summary

```
OKF (Phase 2/3/4, unmodified)
  -> extractTechnicalEvidence      (raw OKF objects -> flat evidence items)
  -> extractVocabulary             (P5-02: normalized candidate terms)
  -> inferBusinessConcepts         (P5-03: candidate business concepts)
  -> inferBusinessCapabilities     (P5-04: concept clusters)
  -> inferJourneys                 (P5-05: real operation sequences)
  -> inferEntityStates             (P5-06: real status-verb evidence)
  -> mapJourneysToEntitiesAndStates (P5-07)
  -> traceability.ts               (P5-08: groundedIn + explainTraceability)
```

Every stage is a plain function over the previous stage's real output. `packages/knowledge-graph` (the
canonical OKF model) is **unmodified** — Phase 5 reuses P2-04's `domain.entity`/`domain.entity-state`
and P2-05's `journey.persona`/`.journey`/`.flow`/`.action` kinds and relationship kinds (`hasState`,
`transitionsTo`, `readsEntity`, `writesEntity`, `triggersTransition`, `contains`, `supports`) —
**all defined in Phase 2, never populated by Phase 3/4 until now**. The only new concept,
`business.capability` (plus its `comprises`/`realizedBy` relationship kinds and the cross-cutting
`groundedIn` kind), uses P2-01/P2-02's deliberately open `kind: string` design — the same mechanism
Phase 4's `bridge-relationships.ts` already used for `dependsOn`/`hasAssociation` — so no schema-file
change was needed anywhere.

## Semantic inference approach (P5-01)

No LLM integration exists anywhere in this repository (verified directly — no provider SDK, no
`LLM_*`/`OPENAI_*`/`ANTHROPIC_*` env var). Per the ticket's own instruction, the inference **contract**
(`InferenceProvider<TInput, TOutput>`) was implemented first, together with the one deterministic,
rule-based implementation this repository actually ships and runs — never a business-noun lookup
table, only structural rules (naming conventions, CRUD-verb ordering, module co-location). An LLM-backed
provider is a valid, additive future extension of the same interface, not built here. See ADR 0025
decisions 1–2.

The contract is genuinely wired through the pipeline, not aspirational: `concept-inference.ts`'s
`existingEntityResolutionProvider` is a real `InferenceProvider` implementation resolving the one
genuine ambiguity point in Phase 5 (an existing entity-like object label match) — when more than one
real object shares a label, ALL are returned as `InferenceCandidate`s with their own confidence and
rationale (never silently collapsed to the first match), sorted highest-confidence-first.
`inferBusinessConcepts` consumes the same underlying resolution logic synchronously (no forced `async`
ripple through this package's many existing synchronous callers).

## Business vocabulary extraction (P5-02)

`normalizeIdentifierText` strips a leading HTTP method, a leading CRUD/lifecycle verb, a trailing
technical suffix (`Controller`/`Service`/`Repository`/`Orchestrator`/...), and infrastructure noise
words, then singularizes what remains — every rule is structural, never a business word. Terms are
deduplicated across every technical object that produced them, with confidence driven by how many
distinct technical objects corroborate each term.

## Business concept inference (P5-03)

Does not do "Java class = business entity". A candidate's confidence is driven by corroborating signal
count (existing real technical entity match, distinct supporting technical objects, vocabulary
occurrence count). A concept already backed by a real `domain.entity`/`domain.aggregate` object is
**not duplicated** — `materializeBusinessConcepts` only creates a new object for concepts with no
existing technical match.

## Capability inference (P5-04)

Clusters business concepts sharing a source **module** into one capability — never one capability per
class/service. Requires at least 2 distinct concepts co-located under the same module before a
capability is inferred at all. Module-key resolution has a documented precedence: PRIMARY, a
`Provenance.sourceId` path segment (e.g. `services/payments`, for a microservices-style layout);
SECONDARY (fallback, only when no provenance entry resolves a primary key), a real Java-package
directory derived from `Evidence.locator` file paths (e.g. `petclinic/owner`) — the one real structural
signal a flat/monolith repository actually carries. Never a fabricated constant.

## Journey inference (P5-05)

A journey is inferred only where real API operations span at least 2 distinct CRUD/lifecycle stages for
the same business concept — never fabricated from a single operation, never ordered alphabetically. A
fixed, generic verb-precedence table (create/open < read/check < update/confirm < cancel/close) orders
the steps. No persona is fabricated — no actor/user evidence exists anywhere in the current OKF. For
real REST operation names with no bare leading verb, a generic HTTP-method-derived fallback
(`create`/`read`/`update`/`terminate`) provides the same stage signal.

## State inference (P5-06)

States and transitions are inferred only from real operations whose verb denotes a status change
(`confirm`, `activate`, `ship`, `suspend`, `cancel`, ...) — a generic linguistic pattern (verb → past-
participle state name), not a business-noun list. A transition is only created between two states BOTH
evidenced by a real operation on the same entity, ordered by a fixed lifecycle-phase number — never
alphabetically. For real REST operation names with no bare status verb, a deliberately NARROW
HTTP-method fallback applies: only `POST` (→`Created`) and `DELETE` (→`Deleted`) carry unambiguous
enough REST semantics to name a generic state; `GET`/`PUT`/`PATCH` never do. Every inferred state's
provenance/evidence is derived from the real operation evidence that justified it (never a generic
systemId-only placeholder), and every state is `groundedIn` the real technical object it came from.

## Journey/entity/state mapping (P5-07)

Wires P2-05's previously-unpopulated `readsEntity`/`writesEntity`/`triggersTransition` relationship
kinds: each journey action is mapped to the real entity it reads or writes (by verb), and to the real
entity-state it triggers, when P5-06 actually inferred that state for the same entity.

## Business → technical traceability (P5-08)

`groundedIn` relationships connect newly-inferred concepts, journey actions, AND entity states to the
real technical objects that justified them — all three via the SAME mechanism, never a second parallel
one. `explainTraceability(objectId, ...)` is a callable, tested function that walks
`groundedIn`/`comprises`/`realizedBy` edges back to real source locations — "the system must be able to
explain where the inference came from" is a concrete utility, not just a documentation claim. Verified
directly against real spring-petclinic data: a real inferred `Created` state resolves back to
`OwnerController.java#L48-L179`.

## Provenance and confidence

Every inferred object's `metadata.provenance` is re-derived from the real technical evidence that
supported it, stamped `derivedBy: 'inference-engine'` (distinct from the underlying facts' own
`derivedBy: 'extraction-engine'`, never overwritten). No new confidence vocabulary — every object uses
Phase 2's existing `Confidence`/`ConfidenceDetail` types, with one documented, deterministic calculation
(`deriveInferenceConfidence`) and `confidenceDetail.basis` always `'derived'`. See ADR 0025 decisions
6–7 for the exact formula.

## Domain neutrality (P5-09)

Verified mechanically, not by author assertion: `tests/domain-agnostic.test.ts` reads every actual
`src/*.ts` file's text and asserts none contains a real forbidden business noun (Order, Product, Cart,
Customer, Payment, Account, Transaction, Loan, Card, ...), and separately runs the full pipeline over
two lexically unrelated placeholder vocabularies, proving the same code produces analogous output for
both. Several genuine issues were found and fixed this way across two rounds: an illustrative "Order" in
doc-comments (replaced with the neutral placeholder "Widget", twice — the second occurrence was
introduced and caught during the Blocker 5 corrective fix itself, proof the scanner catches regressions,
not just one-time issues), and an inconsistent verb list between `vocabulary.ts` and `state-inference.ts`
(reconciled). A second cross-vocabulary proof (Blocker 4) additionally covers REST-style operation
naming, not just camelCase. See ADR 0025 decision 9.

## Aurora validation (P5-10)

**Aurora is not a real repository extraction** — grounded in the existing, already-committed P2-11
sample (`packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml`)'s real entity/service names
and source paths (`Order`, `repo://aurora-commerce/services/order-orchestrator`,
`repo://aurora-commerce/services/checkout`). Running the full pipeline over this technical evidence
produces, actually and verifiably (`tests/aurora-fintech-validation.test.ts`):

- **Business vocabulary:** `Order`, `Payment`, `Cart`, among others.
- **Business entities:** `Order` (recognized as the same concept as the real `entity-order` technical
  object, not duplicated), `Payment` and `Cart` (newly inferred, no existing technical entity).
- **Capabilities:** a real capability clustering `Payment`+`Cart` under the shared `services/checkout`
  module.
- **Journeys:** a real, multi-step `Order` journey (create → read → confirm/ship → cancel).
- **Entity states:** real `Order` lifecycle states including `Created` and `Cancelled`.
- **Journey/entity/state mapping:** real `writesEntity`/`readsEntity` edges from journey actions to
  `Order`.
- **Business → technical traceability:** `Payment` (newly inferred) is `groundedIn` the real
  `PaymentController` (`api-payments`) technical object.
- **Provenance/confidence:** every object carries real provenance and `confidenceDetail.basis: 'derived'`.

Additionally, `AURORA_REST_OBJECTS` (Blocker 4) re-runs the same pipeline over REAL Spring-MVC REST-style
operation names (`"POST /orders"`, `"GET /orders/{id}"`, ...) for the same `Order` entity — proving
concept/journey/state inference and state traceability all work on Phase 3's actual evidence shape, not
only on the curated Java-method-style fixture above.

## Fintech validation (P5-10)

**Not a real repository extraction either** — no real fintech OKF exists anywhere in this repository.
Grounded instead in the existing, already-committed fintech demo dataset
(`apps/web/src/data/mock/fintech/fixtures.ts`, the "nimbus-financial" digital-banking system) — a
genuinely different domain (onboarding/KYC, accounts, card issuing, P2P/ACH transfers, fraud/AML), not
e-commerce with renamed fields. Running the SAME, unmodified pipeline produces:

- **Business vocabulary:** `Account`, `Transfer`, `Card`, among others — genuinely different from
  Aurora's.
- **Business entities:** `Account` and `Transfer` (recognized as the same concepts as the real
  `entity-account`/`entity-transfer` technical objects), `Card` (newly inferred).
- **Capabilities:** real capabilities clustering under `services/onboarding` and `services/payments`.
- **Journeys:** a real, multi-step `Account` journey (create → activate → suspend).
- **Entity states:** real `Account` lifecycle states including `Created` and `Active`.
- **Business → technical traceability:** `Card` (newly inferred) is `groundedIn` the real
  `CardIssuingController` (`api-card-issuing`) technical object.
- **Cross-check:** `Order`/`Cart` (Aurora-specific) do **not** appear anywhere in the fintech output.

Additionally, `FINTECH_REST_OBJECTS` (Blocker 4) re-runs the same pipeline over REAL REST-style operation
names for `Account` — proving the same generalization holds for both validation domains, not just Aurora.

## Cross-domain result

`aurora-fintech-validation.test.ts`'s final `describe` block asserts, directly, that the identical
pipeline code produces structurally analogous output (concepts, capabilities, journeys, states all
populated, provenance/confidence preserved, nothing fabricated) for both domains — the same proof
`domain-agnostic.test.ts` (P5-09) already ran against two nonsense placeholder vocabularies, repeated
here against two real, established, genuinely different business domains.

## Known limitations

- **No LLM provider is connected** — by design (see P5-01 above); the contract supports one, none was
  required.
- **The call graph remains unbridged** from Phase 4 — Phase 5's technical-evidence input comes from
  already-bridged `integration.api`/`domain.entity` objects' labels/operations/fields only, not from
  the raw call graph. A future ticket could feed call-graph evidence in for richer journey sequencing.
- **A fixed, global verb-to-lifecycle-stage table** is used for both journey ordering and state
  detection — the same verb always maps to the same stage regardless of which entity it appears on,
  which can occasionally produce a coarser transition graph than a true per-entity state machine (e.g.
  two same-stage verbs on one entity do not chain a transition between them). An honest, documented
  simplification, not silently hidden.
- **Vocabulary quality degrades on compound REST paths** — real spring-petclinic operation names like
  `"GET /owners/{ownerId}/pets/new"` produce noisier compound terms (e.g. `"Owner Owner Pet New"`) than
  a single camelCase Java identifier would. The corrective fixes address the missing CRUD/action signal
  (Blocker 1) and downstream journey/state/capability output (Blockers 1–3), not general multi-segment
  REST-path noun-phrase quality — a separate, disclosed, not-yet-addressed refinement opportunity for a
  future ticket.
- **The HTTP-method state fallback is deliberately narrow** — only `POST`/`DELETE` name a generic state
  (`Created`/`Deleted`); `PUT`/`PATCH` never do, since a generic "Updated" state would be too vague to
  assert as a specific business state from the HTTP method alone. This means an entity whose lifecycle
  is expressed ONLY through updates (no bare status verb, no POST/DELETE) still produces no states —
  an honest limitation of a generic, non-fabricating heuristic, not a bug.
- **No route, API, or UI integration** — this ticket produces canonical objects/relationships ready for
  `@phoenix-ai/graph-persistence` to ingest exactly as Phase 3/4's output already is; wiring a route/UI
  for business-understanding output was not part of this ticket's scope.
- **Neither Aurora nor fintech validation used a real external repository** — both are representative,
  controlled fixtures grounded in this project's own existing demo data (see ADR 0025 decision 10 and
  the disclosure in `packages/inference-engine/tests/aurora-fintech-fixtures.ts`), not fabricated for
  this task and not claimed to be real extractions.

## Phase 1 through 4 status

Unaffected. No file under `packages/knowledge-graph`, `packages/extraction-engine`, or
`packages/graph-persistence` was modified by Phase 5 — full regression suite green (see the final
validation report for exact counts).
