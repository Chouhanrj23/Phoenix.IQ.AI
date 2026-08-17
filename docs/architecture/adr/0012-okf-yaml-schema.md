# ADR 0012: OKF (Open Knowledge Format) YAML schema (P2-10)

- **Status:** Accepted
- **Date:** 2026-08-17
- **Owners:** Platform maintainers

## Context

P2-01 through P2-09 built the full canonical knowledge model incrementally: the domain-neutral
envelope and ontology (P2-01/P2-02), four domain-specific `kind` vocabularies (Architecture P2-03,
Domain/Entity P2-04, Persona/Journey/State P2-05, Integration/API P2-06), and three cross-cutting
metadata models (Provenance P2-07, Confidence P2-08, Evidence/Reference P2-09). ADR 0003 (P2-01)
already named the destination for all of this: "the future OKF renderers and knowledge graph
storage will consume" this model, and `CanonicalKnowledgeBundle` was deliberately shaped as
"the same shape any graph store or the future OKF bundle (P2-10/P2-11) will need."

P2-10 is that step: define the finalized, deterministic, versionable YAML serialization of the
canonical model — the contract Phase 3 repository/documentation/ticket connectors will eventually
target, and the input `packages/okf-renderers` (currently a scaffold, still untouched) will
eventually project into the FRD's eleven downstream output artifact types. **Terminology note**:
"OKF" in this ticket means the canonical model's own serialized representation (what P2-10
defines), not the eleven rendered _outputs_ `docs/ontology/README.md` numbers (e.g. "OKF output
#11: flow-to-journey relationship") — those are downstream projections a future
`okf-renderers` implementation produces _from_ an OKF document, a different, later concern.

## Step 1 — Reconciliation

No field, type, or naming conflict exists across P2-01 through P2-09: every domain-specific object
(`SystemObject`/`ContainerObject`/.../`DataFlowObject`) already extends the same
`CanonicalKnowledgeObject<TAttributes>` envelope; every relationship extends
`CanonicalKnowledgeRelationship`; provenance/confidence/evidence are additive sibling fields none
of which redefine each other's concerns (ADR 0010 decision 9, ADR 0011 decision 6). Reconciliation
therefore required no redesign — proven concretely in
`packages/knowledge-graph/tests/okf.test.ts`'s `buildReconciledBundle()`, one bundle containing a
`SystemObject`/`ContainerObject` (P2-03), a `DomainObject`/`AggregateObject` (P2-04), a
`PersonaObject` (P2-05), an `IntegrationObject`/`DataFlowObject` (P2-06), a `Source` registry
(P2-07), `confidenceDetail` (P2-08), and `evidence` (P2-09) together, validating as one coherent
document.

## Step 2 — OKF structure: decision

1. **`OkfDocument` is `CanonicalKnowledgeBundle` with `okfVersion` narrowed from optional to
   required — not a second, competing model.** `CanonicalKnowledgeBundle` (`bundle.ts`) gains one
   new optional field, `okfVersion?: string`; `OkfDocument` (`okf.ts`) is
   `interface OkfDocument extends CanonicalKnowledgeBundle { okfVersion: string }`. Every field
   Step 2 asks for is already present, inherited, not redefined:

   | Step 2 requirement                | Where it lives                                                              |
   | --------------------------------- | --------------------------------------------------------------------------- |
   | top-level version/schema metadata | `OkfDocument.okfVersion` (new)                                              |
   | knowledge objects                 | `objects: CanonicalKnowledgeObject[]` (P2-01)                               |
   | identifiers                       | `identity.id`/`identity.systemId` (P2-01)                                   |
   | types                             | `category` (P2-02, closed) + `kind` (P2-03–P2-06, open)                     |
   | relationships                     | `relationships: CanonicalKnowledgeRelationship[]` (P2-01)                   |
   | metadata                          | `metadata: GraphElementMetadata` (`@phoenix-ai/shared`, reused since P2-01) |
   | provenance                        | `metadata.provenance[]` + `sources: Source[]` (P2-07)                       |
   | evidence                          | `evidence: Evidence[]` on objects and relationships (P2-01/P2-09)           |
   | confidence                        | `metadata.confidence` + `confidenceDetail` (P2-08)                          |

2. **`okfVersion` reuses `CANONICAL_SCHEMA_VERSION` (`identity.ts`) as its default, not a second,
   independently-incrementing counter.** The OKF envelope and the object/relationship shapes it
   carries have evolved in lockstep since P2-01 — every P2-03 through P2-09 change was additive
   and never required a `CANONICAL_SCHEMA_VERSION` bump (each ADR says so explicitly). Introducing
   a separate format-version counter now, with nothing yet to distinguish it from the model
   version, would be exactly the unnecessary duplication this project has consistently avoided
   (ADR 0009 decision 1, ADR 0011 decision 1). See "Open questions" for when this might need to
   split.
3. **Consistent structure across all object types is structural, not enumerated per-kind.**
   Because every domain object already extends the same envelope, "use a consistent structure
   across all object types" (Step 2) is satisfied by construction — there is no per-`kind` YAML
   sub-schema to keep in sync, and `okf.ts` contains no `kind`-specific logic at all.

## Step 3 — YAML conventions: decision

Full field-level conventions (naming, required/optional, IDs, relationship representation,
timestamps, enumerations, references, versioning, extensibility) are documented as the
authoritative reference in `docs/okf/README.md`, not duplicated here. Key decisions:

4. **YAML keys are the TS field names verbatim (camelCase), with no renaming layer.** A
   translation table between TS field names and YAML key names would be exactly the kind of
   unnecessary duplication/complexity this project has avoided everywhere else — the serializer
   emits the object's own field names directly.
5. **Deterministic key order via a single, hand-authored `FIELD_ORDER` priority list
   (`okf.ts`), applied globally through the `yaml` package's `sortMapEntries` schema option** —
   not alphabetical. Alphabetical would be simpler to implement but reads worse (e.g. `attributes`
   would sort before `category`/`identity`/`kind`); a fixed priority list keeps identity/type
   fields first and metadata/evidence last, matching how every ADR in this project already
   presents these shapes, while remaining fully deterministic (the list never depends on runtime
   object construction order — proven in `okf.test.ts` by serializing the same document built with
   two different key insertion orders and asserting byte-identical output). Fields outside the
   list (free-form `attributes`/`calculation.inputs` keys) sort alphabetically among themselves,
   after every listed field.
6. **`lineWidth: 0`** (disables line-folding) so long strings (excerpts, rationale) are never
   wrapped in a way that depends on their exact character count — another point where determinism
   and readability point the same direction.

## Step 4 — Validation: decision

7. **`validateOkfDocument` (`okf.ts`) is deliberately thin: it checks `okfVersion` directly and
   delegates everything else to already-existing validators** — `validateCanonicalKnowledgeBundle`
   (required fields, ids, category/kind types, relationship endpoint resolution, duplicate ids;
   which itself calls `validateCanonicalKnowledgeObject`/`validateCanonicalKnowledgeRelationship`
   for every object/relationship, which in turn validate provenance, confidence, and evidence —
   P2-07/P2-08/P2-09's work) and `validateSourceReferences` (source cross-references, P2-07). Zero
   new validation logic is reimplemented — reimplementing any of it here would itself be the
   "second competing model" the objective forbids, just at the validator layer instead of the type
   layer.
8. **No schema-validation library (ajv/zod/etc.) introduced**, consistent with `validation.ts`'s
   original stance (ADR 0003) — the validators above are plain, zero-dependency TypeScript, and
   P2-10 adds nothing that would require a schema-validation library to check.
9. **A YAML _parsing_ library (`yaml`, npm) IS introduced — a different call than decision 8.**
   Parsing arbitrary, syntactically-correct YAML text (multi-line strings, anchors, flow vs. block
   style, comments) is a solved, non-trivial problem inappropriate to hand-roll for a
   schema-definition ticket; validating _this project's own types_ once parsed is what decision 8
   is about, and that remains dependency-free. `yaml@2.9.0` was already present in this monorepo's
   resolved dependency graph (a transitive dependency of existing tooling) before this ticket —
   confirmed via the lockfile — so adding it as a direct dependency of `@phoenix-ai/knowledge-graph`
   is literally "using the project's existing technology," per the objective's own phrasing, not a
   new external dependency being pulled in for the first time.
10. **`parseAndValidateOkfYaml` gives one non-throwing entry point** covering both syntactically
    invalid YAML (caught, reported as a validation error) and syntactically valid YAML describing
    a structurally invalid document (delegated to `validateOkfDocument`) — "the schema must reject
    invalid structures" (Step 4) holds for both failure modes through one consistent interface.

## Step 5 — Backward compatibility: decision

11. **Zero changes to `packages/shared/src/contracts.ts` or any Phase 1 route/UI file.** Confirmed
    by `git status` showing no diff under `apps/api`, `apps/web`, or `packages/shared` (same
    verification run after every P2-0N ticket).
12. **`CanonicalKnowledgeBundle`'s only change is the new optional `okfVersion?` field** — every
    P2-01 through P2-09 bundle fixture (in `bundle.test.ts`, `provenance.test.ts`, etc.) remains
    valid unchanged; none needed updating, confirmed by the full existing suite passing unmodified.
13. **Where mappings are required, they are already documented — this ADR aggregates, not
    re-derives.** Every Phase 1 API area's field-by-field mapping into the canonical model already
    exists in ADR 0005 (Architecture/`C4Node`/`C4Edge`), ADR 0006 (Domain/`Aggregate`), ADR 0007
    (Persona/Journey/`ExecutionFlow`), and ADR 0008 (Integration). `docs/okf/README.md` links each
    one directly under "Phase 1 compatibility" rather than re-authoring them, per the objective's
    "do not duplicate unnecessarily."

## Step 6 — Documentation: decision

14. **`docs/okf/README.md` is the new authoritative OKF contract** — the field-level reference
    Phase 3 connectors will target, mirroring how `docs/ontology/README.md` is the living reference
    for the ontology while this ADR records the decisions behind it. Includes a complete worked
    YAML example (not reproduced in full here to avoid maintaining two copies of the same
    artifact).

## Consequences

Every canonical knowledge item, regardless of which P2-03–P2-06 domain area produced it, now has a
single, proven-consistent, deterministic YAML serialization. A future repository/documentation/
ticket connector has a concrete file format to write; a future `okf-renderers` implementation has
a concrete, versioned input to read; a future graph store has a nodes+edges shape already proven
loadable (ADR 0003 decision 5) that now also has a canonical on-disk form.

## Alternatives considered

- **A wholly separate `OkfDocument` type, hand-listing every field instead of extending
  `CanonicalKnowledgeBundle`** — rejected: exactly the "second competing model" the objective
  forbids; any future P2-01–P2-09 field addition would need to be manually kept in sync across two
  type definitions instead of one.
- **Alphabetical `sortMapEntries`** (the `yaml` package's built-in `true` option) instead of a
  custom `FIELD_ORDER` comparator — rejected: simpler to implement, but reads worse (see decision
  5); the custom comparator is a small, one-time, fully-deterministic addition.
- **A hand-rolled YAML parser/serializer, zero new dependencies** — rejected: YAML grammar is
  large enough (block/flow styles, anchors/aliases, multi-line scalars, comments) that hand-rolling
  a real parser for a schema-definition ticket would be worse engineering than using a well-known,
  already-present library, and would not credibly satisfy "the schema must reject invalid
  structures" for actual malformed YAML _text_, only for already-parsed objects.
- **A separate `okfFormatVersion` distinct from `CANONICAL_SCHEMA_VERSION`** — rejected as
  premature (decision 2); revisit if the YAML envelope and the object/relationship model shapes
  ever need to evolve independently (see "Open questions").
- **File-system read/write helpers (`readOkfFile`/`writeOkfFile`)** — rejected as out of scope:
  the objective explicitly excludes repository ingestion and connector work; `okf.ts` operates only
  on in-memory strings/objects, leaving file I/O to whatever later ticket actually needs it.
