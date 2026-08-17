# OKF — Open Knowledge Format

The authoritative reference for Phoenix's canonical knowledge YAML format. This is the contract
Phase 3 repository/documentation/ticket connectors will target when they exist, and the input a
future `packages/okf-renderers` implementation will read. Implemented in
`packages/knowledge-graph/src/okf.ts` (P2-10). Design rationale and alternatives considered:
[`docs/architecture/adr/0012-okf-yaml-schema.md`](../architecture/adr/0012-okf-yaml-schema.md).

**Terminology note**: "OKF" here means the canonical model's own serialized representation — what
this document describes. It is distinct from the FRD's eleven numbered _OKF output artifacts_
(`docs/ontology/README.md`, e.g. "OKF output #11: flow-to-journey relationship"), which a future
`okf-renderers` implementation will project _from_ an OKF document described here. One OKF
document is the source a renderer reads; the eleven outputs are what it produces.

**See a full worked example?** [`docs/okf/sample.md`](sample.md) documents a complete, validating
sample OKF document (P2-11) — what it represents, what it intentionally does not, and how future
connectors should follow its generator script as a template.

**Wondering how this compares to the existing Phoenix UI?** [`docs/okf/ui-validation.md`](ui-validation.md)
(P2-12) is the field-by-field compatibility report against all six Phase 1 UI areas — what's
covered, what isn't, and why.

## What an OKF document is

An OKF document is **not a second model** — it is `CanonicalKnowledgeBundle` (P2-01,
`packages/knowledge-graph/src/bundle.ts`) with one additional required field, `okfVersion`,
serialized to YAML with a deterministic key order. Every object kind (Architecture P2-03,
Domain/Entity P2-04, Persona/Journey/State P2-05, Integration/API P2-06) and every metadata
concern (Provenance P2-07, Confidence P2-08, Evidence P2-09) already defined by prior Phase 2
tickets is represented exactly as those tickets defined it — nothing here redefines a field.

## Top-level structure

```yaml
okfVersion: string # required — see "Versioning" below
systemId: string # required — the analyzed system this document describes
generatedAt: string # required — ISO-8601 timestamp this document was assembled
sources: # optional — registry of origin artifacts (P2-07)
  - { ... }
objects: # required (array; may be empty)
  - { ... }
relationships: # required (array; may be empty)
  - { ... }
```

## Full worked example

A trimmed but complete, valid OKF document — one `Source`, one `architecture.container` object,
one `integration.integration` object (with `confidenceDetail` and `evidence`), and the
relationship connecting them. Produced by `serializeOkfYaml`; field order matches what the
serializer actually emits (see "Naming conventions" below).

```yaml
okfVersion: 2026-08-p2-02
systemId: aurora-commerce
generatedAt: 2026-08-01T00:00:00.000Z
sources:
  - id: repo://aurora-commerce/services/checkout
    type: source-code
    label: aurora-commerce/services/checkout
    version: a1b2c3d
objects:
  - identity:
      id: ctr-checkout
      systemId: aurora-commerce
      createdAt: 2026-08-01T00:00:00.000Z
      updatedAt: 2026-08-01T00:00:00.000Z
      schemaVersion: 2026-08-p2-02
    category: entity
    kind: architecture.container
    label: Checkout Service
    attributes:
      responsibility: Handles cart and checkout flow
      technology: Node.js
    metadata:
      provenance:
        - sourceId: repo://aurora-commerce/services/checkout
          sourceType: source-code
          derivedBy: extraction-engine
          derivedAt: 2026-08-01T00:00:00.000Z
      confidence:
        level: high
        score: 0.9
    evidence:
      - id: ev-checkout-entry
        sourceId: repo://aurora-commerce/services/checkout
        excerpt: export const app = createServer()
        locator: src/index.ts:1
    confidenceDetail:
      basis: observed
  - identity:
      id: int-meridian-pay
      systemId: aurora-commerce
      createdAt: 2026-08-01T00:00:00.000Z
      updatedAt: 2026-08-01T00:00:00.000Z
      schemaVersion: 2026-08-p2-02
    category: entity
    kind: integration.integration
    label: Meridian Pay
    attributes:
      interactionType: outbound
      protocol: REST/HTTPS (synchronous)
      counterpartDescription: External payment processor
    metadata:
      provenance:
        - sourceId: repo://aurora-commerce/services/checkout
          sourceType: source-code
          derivedBy: extraction-engine
          derivedAt: 2026-08-01T00:00:00.000Z
      confidence:
        level: high
        score: 0.9
    evidence: []
    confidenceDetail:
      basis: derived
      calculation:
        method: log-pattern-match
        calculatedAt: 2026-08-01T00:00:00.000Z
        inputs:
          corroboratingSources: 2
relationships:
  - id: rel-checkout-has-meridian
    category: association
    kind: hasIntegration
    sourceObjectId: ctr-checkout
    targetObjectId: int-meridian-pay
    metadata:
      provenance:
        - sourceId: repo://aurora-commerce/services/checkout
          sourceType: source-code
          derivedBy: extraction-engine
          derivedAt: 2026-08-01T00:00:00.000Z
      confidence:
        level: high
        score: 0.9
    evidence:
      - id: ev-integration-call
        sourceId: repo://aurora-commerce/services/checkout
        excerpt: meridianClient.authorize(order)
        locator: src/payments/client.ts:22
```

## YAML conventions

### Naming conventions

YAML keys are the TypeScript field names verbatim — camelCase, no renaming layer. There is no
translation table between the model's field names and the YAML representation; whatever
`CanonicalKnowledgeObject`/`CanonicalKnowledgeRelationship`/etc. call a field, the YAML calls it
the same thing. `kind` values follow the pattern already established per domain area: object kinds
are dot-namespaced and lowercase (`architecture.container`, `domain.aggregate`,
`journey.persona`, `integration.integration`); relationship kinds are bare camelCase verbs
(`contains`, `communicatesWith`, `hasIntegration`, `carries`).

### Required vs. optional fields

| Structure                      | Required                                                                      | Optional                                            |
| ------------------------------ | ----------------------------------------------------------------------------- | --------------------------------------------------- |
| Document                       | `okfVersion`, `systemId`, `generatedAt`, `objects`, `relationships`           | `sources`                                           |
| Object (`identity`)            | `id`, `systemId`, `createdAt`, `updatedAt`, `schemaVersion`                   | —                                                   |
| Object                         | `identity`, `category`, `kind`, `label`, `attributes`, `metadata`, `evidence` | `lifecycle`, `confidenceDetail`                     |
| Relationship                   | `id`, `category`, `kind`, `sourceObjectId`, `targetObjectId`, `metadata`      | `attributes`, `confidenceDetail`, `evidence`        |
| `metadata.provenance[]` entry  | `sourceId`, `sourceType`, `derivedBy`, `derivedAt`                            | —                                                   |
| `metadata.confidence`          | `level`                                                                       | `score`, `rationale`                                |
| `evidence[]` entry             | `id`, `sourceId`                                                              | `excerpt`, `locator`, `capturedAt`, `sourceVersion` |
| `confidenceDetail`             | `basis`                                                                       | `calculation`                                       |
| `confidenceDetail.calculation` | `method`, `calculatedAt`                                                      | `inputs`                                            |
| `sources[]` entry (`Source`)   | `id`, `type`, `label`                                                         | `locator`, `version`                                |

Per-domain-area required/optional attribute fields (e.g. `ContainerAttributes.responsibility`)
are documented in each area's own ADR (0005–0008), not repeated here — the envelope above is
domain-neutral by design (Step 2 requirement); attribute-level requirements are domain-specific.

### IDs

Opaque strings, unique within a document's `objects[]` (enforced) and within `sources[]`
(enforced). No format is imposed by the schema — a real connector may use anything stable
(a slug, a UUID, a content hash). The convention observed across every example and test fixture in
this project so far is `<kind-prefix>-<slug>` (e.g. `ctr-checkout`, `agg-order`,
`int-meridian-pay`) and a URI-like form for `Source.id`/`sourceId` (e.g.
`repo://aurora-commerce/services/checkout`, `ticket://JIRA-4821`) — recommended for readability,
not enforced, since a future connector's natural identifier (a git blob SHA, a database primary
key) should not have to be reshaped to fit an arbitrary convention.

### Relationship representation

Nodes + edges, not embedded: `relationships[]` is a flat array alongside `objects[]`, each entry
pointing at two object ids via `sourceObjectId`/`targetObjectId` (ADR 0003 decision 5). Reads as
"source `kind` target" (ADR 0004) — e.g. `sourceObjectId: ctr-checkout, kind: hasIntegration,
targetObjectId: int-meridian-pay` reads "Checkout Service hasIntegration Meridian Pay."

### Timestamps

ISO-8601 strings everywhere a timestamp appears: `generatedAt`, `identity.createdAt`/`updatedAt`,
`metadata.provenance[].derivedAt`, `evidence[].capturedAt`, `confidenceDetail.calculation.calculatedAt`,
`lifecycle.since`. No other timestamp format is accepted.

### Enumerations

Closed sets (validated against a fixed list): `category` (`entity`/`process`/`observation`/`other`),
relationship `category` (`composition`/`association`/`interaction`/`realization`/`other`),
`confidenceDetail.basis` (`observed`/`derived`), `metadata.confidence.level`
(`high`/`medium`/`low`/`inferred`, `@phoenix-ai/shared`), `sources[].type`
(`SourceType`, `@phoenix-ai/shared`). Open vocabularies (plain strings, no fixed list): `kind` on
both objects and relationships — new domain areas add new `kind` values without a schema change.

### References

Two join mechanisms, both by plain string id, no nesting: `sourceObjectId`/`targetObjectId` on a
relationship reference `objects[].identity.id`; `sourceId` on a `provenance`/`evidence` entry
references `sources[].id`. Both are validated when the referenced collection is present (relationship
endpoints always checked; source references checked whenever `sources` exists at all — see
"Validation approach").

### Versioning

`okfVersion` at the document level reuses `identity.schemaVersion`'s value
(`CANONICAL_SCHEMA_VERSION`) — one version axis, not two (ADR 0012 decision 2). A document's
objects may in principle carry different `identity.schemaVersion` values from each other during a
future migration window; `okfVersion` describes the document as assembled, not a guarantee every
object inside it shares one exact version.

### Extensibility rules

- New object `kind` values are added to the open `kind` vocabulary — never by changing the
  envelope shape (`identity`/`category`/`kind`/`label`/`attributes`/`metadata`/`evidence` stays
  fixed for every kind, forever).
- New optional fields may be added to the envelope (as `confidenceDetail`/`evidence` on
  relationships were, P2-08/P2-09) without a version bump, as long as they are optional and don't
  change any existing field's meaning.
- Required fields are never added without a `CANONICAL_SCHEMA_VERSION` (and therefore `okfVersion`)
  bump — none has been needed since P2-02.
- Consumers must not reject a document for containing unrecognized extra top-level or nested keys
  — every validator in this project checks for required fields being present and well-formed, never
  for the _absence_ of unexpected ones. This is what "extensible" and "suitable for future
  repository connectors" require in practice: a connector populating a new field ahead of a
  validator update must not be treated as producing an invalid document.
- Free-form bags (`attributes`, `confidenceDetail.calculation.inputs`) may contain any
  `KnowledgeValue`-shaped keys; they are validated for shape (must be an object) but never for
  which keys they contain.

## Validation approach

`validateOkfDocument` (`okf.ts`) checks `okfVersion` directly and delegates everything else to the
validators P2-01 through P2-09 already built — no new validation logic exists in this file:

- `validateCanonicalKnowledgeBundle` (`validation.ts`) — `systemId`/`generatedAt` presence, every
  object via `validateCanonicalKnowledgeObject` (identity, category, kind, label, attributes,
  `metadata.provenance[]`/`metadata.confidence` shape, evidence shape, lifecycle, confidenceDetail),
  every relationship via `validateCanonicalKnowledgeRelationship` (the relationship-equivalent
  checks, plus no-self-reference), duplicate object ids, and relationship endpoint resolution.
- `validateSourceReferences` (`provenance.ts`, P2-07) — cross-checks every `sourceId` referenced
  anywhere in the document resolves against `sources`, when `sources` is present.

`parseAndValidateOkfYaml` wraps YAML _text_ parsing (via the `yaml` package) around the above, so
malformed YAML syntax and structurally invalid-but-parseable documents are both reported the same
way: `{ valid: false, errors: [...] }`, never a thrown exception.

## Phase 1 compatibility

No Phase 1 contract (`packages/shared/src/contracts.ts`, `apps/api`, `apps/web`) changed for this
or any prior Phase 2 ticket. Field-by-field mappings from each Phase 1 API area into the canonical
model — which is what an OKF document ultimately serializes — are already fully documented and are
not repeated here:

- Architecture (`C4Node`/`C4Edge`) → [ADR 0005](../architecture/adr/0005-architecture-model.md)
- Domain/Entity (`Domain`/`Aggregate`) → [ADR 0006](../architecture/adr/0006-domain-entity-model.md)
- Persona/Journey/Flow (`Persona`/`Journey`/`ExecutionFlow`) → [ADR 0007](../architecture/adr/0007-persona-journey-state-model.md)
- Integration (`Integration`) → [ADR 0008](../architecture/adr/0008-integration-api-model.md)

## What P2-10 deliberately does not include

- Git/repository connectors, Java parsing, repository ingestion, Neo4j node creation, a Jira
  connector, or an inference engine — explicitly out of scope per the objective.
- File-system read/write helpers — `okf.ts` operates on in-memory strings/objects only.
- A confidence-calculation engine — unchanged from P2-08.
- P2-11 (whatever wires this format into real usage) and P2-12 (validating OKF against the UI) —
  not started.
