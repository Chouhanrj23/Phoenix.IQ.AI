# Sample Phoenix OKF (P2-11)

A representative sample OKF document proving the P2-10 schema can express a meaningful
cross-section of Phoenix knowledge in one coherent, valid document.

- **File**: [`packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml`](../../packages/knowledge-graph/samples/aurora-commerce.sample.okf.yaml)
- **Generator**: [`packages/knowledge-graph/samples/generate-sample.ts`](../../packages/knowledge-graph/samples/generate-sample.ts) — run via `pnpm --filter @phoenix-ai/knowledge-graph generate:sample`
- **Verification**: [`packages/knowledge-graph/tests/okf-sample.test.ts`](../../packages/knowledge-graph/tests/okf-sample.test.ts) — validates the checked-in file against the real `validateOkfDocument`/`parseAndValidateOkfYaml` (`okf.ts`, P2-10) on every test run

**This is not production repository extraction.** No connector read a real repository, document,
or ticket system to produce this file — it was hand-authored for this ticket, informed by the
same Aurora Commerce fixture data already used throughout Phase 2's other test suites
(`apps/web/src/data/mock/aurora/*`). Every `Provenance.derivedBy` in the sample is
`'phoenix-sample-author'`, never `'extraction-engine'`/`'inference-engine'` — an explicit,
consistent signal (see "What it intentionally does not represent" below) that nothing here was
produced by a real pipeline, regardless of how well-grounded the underlying facts are.

## What the sample represents

One coherent slice of the (fictional-but-consistent, already-established) Aurora Commerce system,
centered on checkout and payment authorization — chosen because it's the one path with the richest
existing real fixture data across every prior Phase 2 ticket's tests. 18 objects, 22 relationships,
8 registered sources.

| Concept (from the objective) | `kind`                                               | Sample object(s)                                                     | Grounding                                                                    |
| ---------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| System                       | `architecture.system`                                | `ctx-aurora`                                                         | Real (Aurora fixtures)                                                       |
| Container                    | `architecture.container`                             | `ctr-checkout`, `ctr-payments`                                       | Real                                                                         |
| Component                    | `architecture.component`                             | `cmp-cart-validator`                                                 | Illustrative — see below                                                     |
| Domain                       | `domain.domain`                                      | `dom-ordering`                                                       | Real                                                                         |
| Entity                       | `domain.entity`                                      | `ent-order`                                                          | Illustrative id/fields; real entity name                                     |
| Attribute                    | embedded in `EntityAttributes.fields`                | `ent-order.attributes.fields` (`id`, `status`)                       | Illustrative, minimal                                                        |
| Persona                      | `journey.persona`                                    | `persona-returning-shopper`                                          | Real                                                                         |
| Journey                      | `journey.journey`                                    | `journey-browse-to-purchase`                                         | Real                                                                         |
| (Flow — structural link)     | `journey.flow`                                       | `flow-checkout`                                                      | Real                                                                         |
| Action                       | `journey.action`                                     | `step-2` (Create Order), `step-6` (Confirm Order)                    | Real                                                                         |
| Entity State                 | `domain.entity-state`                                | `state-order-pending`, `state-order-confirmed`                       | Illustrative ids; real status values                                         |
| API                          | `integration.api`                                    | `api-payments-auth`                                                  | Illustrative — no real Phase 1 equivalent                                    |
| Interface                    | `integration.interface`                              | `iface-payments-auth`                                                | Illustrative — no real Phase 1 equivalent                                    |
| Integration                  | `integration.integration`                            | `int-meridian-pay`                                                   | Real                                                                         |
| DataFlow                     | `integration.dataflow`                               | `dataflow-meridian-authorization`                                    | Real content, illustrative id                                                |
| Relationship                 | 22 entries across all of the above                   | —                                                                    | Mix — see per-relationship `metadata.confidence.rationale`                   |
| Provenance                   | `metadata.provenance[]` on every object/relationship | —                                                                    | Always present (required)                                                    |
| Confidence                   | `metadata.confidence` + `confidenceDetail`           | —                                                                    | high/medium/low/inferred and both `observed`/`derived` bases all represented |
| Evidence                     | `evidence[]`                                         | `ctr-checkout`, `ctr-payments`, `step-2`, `step-6`, one relationship | Illustrative excerpts (see below)                                            |

**"Real" here means**: the id, label, description, or numeric confidence value is copied or
directly adapted from `apps/web/src/data/mock/aurora/*` — the same fixtures
`architecture.test.ts`/`domain.test.ts`/`journey.test.ts`/`integration.test.ts` already use as
proven Phase 1 compatibility examples. It does **not** mean this sample file itself was produced
by extracting a real repository.

### A genuinely real, not staged, low-confidence example

`ctr-payments` (Payments Gateway Adapter) carries `metadata.confidence.level: low` with two
conflicting `provenance` entries — source code says Node.js/Express, a 2024 architecture doc says
Java/Spring, unreconciled. This disagreement is copied directly from the real Aurora fixture data,
not staged for this sample — the model's low-confidence, multi-source, evidence-bearing
representation is being exercised on an example that actually needs it.

## What the sample intentionally does not represent

- **Real extraction or inference.** No connector, parser, or engine produced this file — see the
  `derivedBy` note above. Nothing here should be treated as evidence that extraction/inference
  works; that remains entirely unbuilt (P2-11's objective explicitly excludes it).
- **A complete Aurora Commerce model.** Real fixtures describe ~10 containers, ~8 domains, 3
  personas, 3 journeys, and 5 integrations; this sample uses a small, connected slice of that (2
  containers, 1 domain, 1 persona/journey, 1 integration) chosen for representativeness, not
  completeness. A container ("Order Orchestrator") that real fixture edges route the
  checkout→payments call through was omitted for brevity — `rel-checkout-communicates-payments`
  is a simplified direct edge, and its `metadata.confidence.rationale` says so explicitly.
- **A real API or Interface.** ADR 0008 (P2-06) already documents that Phase 1 has no API/Interface
  concept at all. `api-payments-auth`/`iface-payments-auth` are invented specifically to exercise
  those two `kind`s, labeled `"(illustrative)"` in their own `label` field, and carry
  `level: inferred, score: 0.3` with a rationale saying exactly this — not presented as if real.
- **Real field-level entity schema.** `ent-order.attributes.fields` (`id`, `status`) is minimal and
  illustrative. Phase 1 only ever records aggregate-level entity name strings (`Aggregate.entities:
string[]`) — a documented gap since ADR 0006 (P2-04) — not real per-field extraction.
- **Real evidence excerpts.** No source file was actually read. Excerpts like `await
paymentsAdapter.authorize(order)` are plausible, illustrative code shapes consistent with what
  the real fixtures' `description` text already states happens (e.g. "Calls Meridian Pay to
  authorize the card"), not transcriptions of real code.
- **Every possible relationship kind.** `readsEntity` (Action → Entity) is not used — both actions
  in this sample only demonstrate `writesEntity`; `relatesTo`/`aggregateMember` are not used either.
  These follow the identical pattern already demonstrated by the kinds that are present; omitted
  to keep the sample focused rather than exhaustive.

## How future connectors should produce equivalent structures

`samples/generate-sample.ts` is not just a one-off script — it's a worked template. Any future
repository/documentation/ticket connector (Phase 3, not built here) should follow the same four
steps it demonstrates:

1. **Build typed objects** using the real P2-03–P2-09 interfaces (`SystemObject`, `ContainerObject`,
   ..., `Source`, `Evidence`, `ConfidenceDetail`) — never hand-build plain untyped objects/YAML,
   so the compiler catches shape mistakes before validation does.
2. **Assemble a `CanonicalKnowledgeBundle`** (`systemId`, `generatedAt`, `sources`, `objects`,
   `relationships`) and wrap it with `toOkfDocument` (`okf.ts`).
3. **Validate before doing anything else with it** — `validateOkfDocument(document)` — and treat a
   non-empty `errors` array as a hard stop, exactly like `generate-sample.ts` does (`process.exit(1)`
   on failure). Never weaken or bypass the validator to force a document through.
4. **Serialize with `serializeOkfYaml`** — never hand-format YAML output; the deterministic
   `FIELD_ORDER` (ADR 0012 decision 5) only holds if the real serializer produces the text.

A real connector differs from `generate-sample.ts` only in _where the field values come from_
(a real API call, file read, or parsed document instead of a TypeScript literal) — the shape of
the code around that difference is the same.

## Regenerating the sample

```
pnpm --filter @phoenix-ai/knowledge-graph generate:sample
```

Rebuilds `aurora-commerce.sample.okf.yaml` from `generate-sample.ts` and exits non-zero if the
result fails `validateOkfDocument` — the same "run the actual validator, fix all schema errors,
never weaken the schema" discipline used to produce it originally. Re-run
`pnpm --filter @phoenix-ai/knowledge-graph test` afterward to confirm `okf-sample.test.ts` still
passes against the regenerated file.
