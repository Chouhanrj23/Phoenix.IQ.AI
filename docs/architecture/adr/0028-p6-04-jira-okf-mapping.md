# ADR 0028: OKF mapping for Jira-derived facts (P6-04)

- **Status:** Accepted
- **Date:** 2026-09-08
- **Owners:** Platform maintainers

## Context

P6-02 (ADR 0027) connected Phoenix to Jira and produces real `RawArtifact`s — one per issue, content a
normalized JSON summary, plus raw facts (`issueType`/`status`/`labels`/`issueLinks`/`parentKey`/…) on
`attributes` — but explicitly stopped there: ADR 0013 decision 1 draws the line at raw artifacts for
every connector, and ADR 0027's own Consequences section names the gap it leaves open verbatim: "ready
for a future `extraction-engine` ticket to turn into canonical `domain`/`workflow`-shaped objects and
relationships."

P6-04 is that ticket: "OKF Mapping — represent Jira-derived facts in the common model." Two things were
true before this ticket and are no longer true after it:

- **No canonical model concept existed for a tracker issue.** `packages/knowledge-graph` had four
  domain-specific `kind` vocabularies (P2-03 Architecture, P2-04 Domain/Entity, P2-05 Persona/Journey/
  State, P2-06 Integration/API) and none of them fit: `SourceType: 'ticket'` (Phase 1, `@phoenix-ai/
shared`) was only ever a _provenance_ tag, never a _canonical object kind_. `docs/ontology/README.md`
  (the FRD reference) already lists `Epic`/`Feature`/`Story`/`AcceptanceCriterion` among its
  not-yet-formalized node types, and `ontology.ts`'s own directionality doc comment even uses "Story
  realizes Feature" as its worked example for `RelationshipCategory: 'realization'` — the model
  anticipated this gap without filling it.
- **No mapping step existed from a Jira `RawArtifact` to anything canonical.** Unlike Java (where
  P3-03 through P3-08 built a whole structural-fact layer before P3-09's bridges ran over it), the
  Jira connector's `read()` already normalizes each issue into exactly the fields a bridge needs — so
  this ticket is both the "extraction" and "OKF mapping" step Java needed two phases for.

## Decision

1. **A fifth domain-specific `kind` vocabulary, `packages/knowledge-graph/src/workitem.ts`, added the
   same way P2-03 through P2-06 were: typed attributes, a typed object, relationship kinds, and
   validators layered on the unchanged P2-01/P2-02 envelope.** `WorkItemObject` (`kind:
'workitem.issue'`, `category: 'entity'`) is the ONLY object kind this ticket adds — deliberately
   one, not one per Jira issue type (`workitem.epic`/`workitem.story`/…). See decision 4 for why.

2. **`packages/extraction-engine/src/jira-bridge.ts`'s `bridgeJiraArtifacts` is the deterministic
   facts-to-canonical-objects mapping**, following `bridge-http.ts`/`bridge-relationships.ts`'s exact
   discipline (ADR 0018 decision 4, ADR 0023): only what is directly, mechanically decidable from what
   the connector already observed is bridged — nothing invented, nothing inferred. One `WorkItemObject`
   per artifact; `contains`/`relatesTo` relationships between two objects ALREADY bridged in the same
   batch (an issue link to a key outside the batch — a different project, a filtered-out issue —
   produces no dangling relationship, the same "no relationship without two real endpoints" rule
   `bridge-relationships.ts` established). `deterministicId` (`bridge-shared.ts`) is reused unmodified;
   `evidenceFor` is NOT, because it is shaped around a Java `SourceSpan` (file + line range) a Jira
   issue does not have. `@phoenix-ai/ingestion-connectors`' own `artifactToEvidence` — built for
   exactly this seam — is used instead, since a `RawArtifact` already carries everything `Evidence`
   needs.

3. **`identity.createdAt`/`identity.updatedAt` are ALWAYS `options.generatedAt`, matching
   `bridge-http.ts`'s exact precedent — never Jira's own `created`/`updated` timestamps.**
   `KnowledgeObjectIdentity`'s own doc comment is explicit that these answer "when did PHOENIX capture
   this object," not "when did the real-world thing change" — conflating the two would misrepresent a
   five-year-old ticket re-scanned today as freshly created. Jira's real dates are preserved instead as
   `WorkItemAttributes.reportedCreatedAt`/`reportedUpdatedAt`, a distinctly-named pair so the two
   questions stay separately answerable rather than one silently overwriting the other.

4. **`attributes.issueType` stays free text; no closed `Epic`/`Story`/`Bug`/… vocabulary is
   introduced, and the FRD's `Epic`/`Feature`/`Story`/`AcceptanceCriterion` node types are deliberately
   NOT formalized as separate kinds here**, despite `ontology.ts`'s own doc comment anticipating
   exactly that shape. Three reasons, not one: (a) a tracker's issue-type taxonomy is
   project-configurable — the P6-02 connector observes `issuetype.name` as a string precisely because
   nothing guarantees two Jira instances name their epic-level type the same thing, the identical
   argument that already made `RepositoryCoordinates.revision`/`ArtifactContentHash.algorithm` free
   text (ADR 0009 decision 3); (b) `AcceptanceCriterion` is not a separate Jira entity at all in the
   common case — it is prose inside a Story's description, so there is nothing for a bridge to point
   at without inventing structure the source does not have; (c) collapsing to one `workitem.issue`
   kind loses nothing observable, since `attributes.issueType` carries the real string verbatim — a
   future ticket can specialize by that attribute with zero data migration once real cross-tracker
   data justifies a closed vocabulary. `contains` (parent → child, reused from `domain.ts`) already
   reconstructs the Epic → Story → Sub-task hierarchy Feature-belongs-to-Epic would have expressed
   structurally, just without a type-level guarantee that the parent IS an Epic — resolvable by reading
   `parentObject.attributes.issueType` when it matters.

5. **`contains`/`relatesTo` are REUSED from `domain.ts`, not newly minted**, continuing the precedent
   `contains` already set across `architecture.ts`/`domain.ts`/`journey.ts`: a relationship `kind` is
   scoped by which two object kinds it connects, not globally namespaced. `parentKey` (Jira's
   `fields.parent` — used for BOTH a Sub-task's parent AND a team-managed project's epic-child link,
   indistinguishably in what P6-02's connector captured) becomes `contains`, source = parent, target =
   child, per `ontology.ts`'s directionality convention. Every `issueLinks` entry (blocks, is blocked
   by, duplicates, relates to, or a project's own custom link type) becomes `relatesTo`
   (`category: 'association'`) with the tracker's real link-type name and direction preserved verbatim
   in `attributes.linkType`/`attributes.direction` — the same "generic kind, specific detail in
   attributes" pattern `bridge-relationships.ts` already used for `dependsOn`/`hasAssociation`.
   Deliberately NOT deduplicated: when both endpoints of a link are in the same batch, Jira's own
   `outward`/`inward` pair produces two independent relationship rows (e.g. Story --blocks--> Bug and
   Bug --is blocked by--> Story) — both are real, separately-observed facts from each issue's own
   artifact, not two views of one fact to be collapsed.

6. **`jira-okf-mapping.ts` wraps an already-bridged result exactly the way `okf-mapping.ts` (P3-09)
   does for Java** — `buildJiraCanonicalBundle`/`mapJiraToOkfDocument`/`serializeJiraToOkfYaml`, no new
   mapping logic, `sources` omitted entirely (not `[]`) when not given, reusing P2-10's
   `toOkfDocument`/`serializeOkfYaml` completely unmodified.

7. **A malformed or unrecognisable artifact is reported as a SKIP, not silently dropped or thrown.**
   `bridgeJiraArtifacts` returns `{ objects, relationships, skipped }` — `skipped` is the same coverage-
   gap discipline `ArtifactCollection.failures` established in ADR 0013 decision 7: a partially-mapped
   batch must not be mistaken for a completely-mapped one. `parseJiraIssueContent` never throws; it
   returns `undefined` for content that is not valid JSON or is missing a field this bridge requires,
   which becomes exactly one `JiraBridgeSkip` entry rather than aborting the whole batch.

## Testing

- **`packages/knowledge-graph/tests/workitem.test.ts` (16 tests)** — `validateWorkItemObject`/
  `validateWorkItemRelationship` mirroring `architecture.test.ts`'s coverage style (valid cases, each
  required-field rejection, category/kind mismatches, the base canonical-object checks still running),
  plus an end-to-end Epic/Story/Bug bundle validating as a whole via `validateCanonicalKnowledgeBundle`.
- **`packages/extraction-engine/tests/jira-bridge.test.ts` (14 tests)** — grounded in the same
  Aurora/AUR fixture world P6-02's own tests used: object shape and attribute mapping (including the
  `identity` vs. `attributes.reportedCreatedAt`/`reportedUpdatedAt` distinction, decision 3);
  deterministic ids; `contains` from `parentKey`; `relatesTo` from `issueLinks`, including the
  independent outward/inward pair (decision 5) and a target outside the batch producing NO dangling
  relationship; deterministic (sorted) relationship ordering; every relationship resolving against a
  real `Source` via `validateSourceReferences`; and three malformed-input cases proving one bad
  artifact does not abort the batch.
- **`packages/extraction-engine/tests/jira-okf-mapping.test.ts` (4 tests)** — mirrors
  `okf-mapping.test.ts` exactly: bundle wrapping (including `sources` omission), a valid `OkfDocument`,
  and YAML that round-trips through the real `parseAndValidateOkfYaml`.

All 280 `knowledge-graph` tests and all 95 `extraction-engine` tests pass (34 new: 16 + 14 + 4);
`tsc -b --noEmit` and `eslint` are clean in both packages.

## Consequences

A Jira project can now be ingested end to end — connector (P6-02) → bridge → OKF — into a real,
validated, YAML-serializable knowledge bundle sitting alongside a repository's own bundle in the same
`systemId`, with every tracker issue-link and parent/child relationship represented as a real graph
edge. `inference-engine` (a future ticket) has real `workitem.issue` objects and `contains`/`relatesTo`
edges to reason over — e.g. correlating a Story's `attributes.issueType`/`status` against the
technical `domain.entity-state` a code change actually produced, closing a traceability gap
`ADR 0027`'s own Limitations section anticipated ("ready for a future extraction-engine ticket").

The corresponding cost: `packages/knowledge-graph` gains a fifth domain file and `packages/
extraction-engine` gains a dependency-shape precedent (bridging directly from another package's
connector output, `RawArtifact`, rather than from an internal structural-fact stage) that a future
non-Java, non-repository bridge (a document-space connector's eventual real implementation, P6-01) can
follow.

## Limitations

- **A Jira issue's `status` is a snapshot, not a history.** `attributes.status` is whatever the tracker
  reported at capture time; no changelog is read (ADR 0027's own Limitations already named this gap at
  the connector level — it is unchanged here). Modeling status TRANSITIONS as a workflow — the FRD's
  `process` category, or `domain.entity-state`'s `hasState`/`transitionsTo` — is deliberately deferred
  to `inference-engine`, and even there only over evidence that observes multiple points in time, which
  a single-snapshot Jira read does not provide.
- **Comments and attachments are not bridged** — P6-02 never reads them, so there is nothing here to
  map.
- **The Epic/Feature/Story/AcceptanceCriterion FRD vocabulary remains unformalized as distinct
  `kind`s** (decision 4) — `attributes.issueType` is the substrate a future specialization would read,
  not a replacement for one.
- **A relationship whose target lies outside the bridged batch is silently omitted, not deferred or
  retried.** A caller that bridges one project at a time and later adds a second will not get
  retroactive cross-project relationships for links that were unresolvable in an earlier run; that
  requires a persistent object-id registry across runs, which does not exist yet (the same limitation
  `bridge-relationships.ts` already has for Java's own cross-file dependencies).
- **No UI rendering was added.** `apps/web`'s `GraphExplorerPage.tsx` `KIND_ORDER` list (referenced in
  the Phase 4 CHANGELOG entries) is unaware of `workitem.issue`; this ticket is model + mapping only,
  matching P3-09's own scope boundary.

## Alternatives considered

- **Formalize `Epic`/`Feature`/`Story`/`AcceptanceCriterion` as separate object kinds now, following
  `ontology.ts`'s own worked example literally** — rejected, see decision 4. Attractive on paper, but
  not supported by what the connector layer can reliably observe: issue-type names are
  project-configurable, and `AcceptanceCriterion` is not a distinct Jira entity to bridge from at all.
- **Route a Jira issue's `status` through `inference-engine`'s existing `state-inference.ts`** —
  rejected: that module's `STATUS_VERBS` table infers a state from a REST _operation verb_ on an
  `ApiObject`, an entirely different evidence shape (a code-level signal, ordered by a fixed
  lifecycle-stage table) from a tracker's own directly-reported, single-snapshot status string. Routing
  Jira's status through it would conflate a directly OBSERVED fact with something that module exists
  to INFER.
- **One `kind` per Jira link type** (`blocks`, `duplicates`, `relatesTo`, …) instead of one generic
  `relatesTo` — rejected, see decision 5: link types are as project-configurable as issue types, and
  `bridge-relationships.ts` already established the "generic kind + `attributes` detail" pattern for
  exactly this situation (`dependsOn`/`hasAssociation`).
- **Deduplicate a mirrored outward/inward issue-link pair into one relationship** — rejected, see
  decision 5: each half is independently observed from its own issue's artifact, and Phoenix's
  determinism guarantee (FR-DET-07) is about reproducing the SAME output from the SAME input, not about
  collapsing two genuinely distinct facts into one.
- **Reuse `bridge-shared.ts`'s `evidenceFor` for Jira, wrapping issue data in a fake `SourceSpan`** —
  rejected: a fabricated line range would be a lie about what was actually observed, and
  `artifactToEvidence` already exists specifically so a connector's own output bridges without
  reinventing evidence construction.
