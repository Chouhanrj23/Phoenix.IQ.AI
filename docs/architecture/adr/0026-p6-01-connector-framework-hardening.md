# ADR 0026: Connector framework hardening — preparing for multiple source layouts (P6-01)

- **Status:** Accepted
- **Date:** 2026-09-08
- **Owners:** Platform maintainers

## Context

Phase 3 (ADR 0013, ADR 0014) built the connector contract and its first real connector: one
generic `SourceConnector<TDescriptor>` interface, one source-specific descriptor narrowing
(`SourceRepositoryDescriptor`), and `createGitRepositoryConnector` as the only implementation that
touches a real source. Both ADRs deliberately deferred the rest of the package's own stated remit —
`packages/ingestion-connectors/README.md` has said "repos, wikis, ticketing, log stores, gateways"
since the original scaffold — and both left specific, named gaps for later:

- ADR 0013 "Limitations": "`selectConnector` is first-match, not best-match, and deliberately not a
  registry — with no scoring concept in the contract, 'best' would be undefined. Precedence rules
  belong to `packages/orchestration`." That was correct with exactly one connector in existence. It
  stops being correct once several connectors are registered side by side across several source
  kinds, at which point two configuration mistakes — a duplicate connector `id`, and a descriptor
  two connectors both mistakenly claim — become possible and, worse, silent: `selectConnector`
  resolves either case by array order with no signal that anything unusual happened.
- ADR 0013 decision 6: "A connector declaring `revisionPinning: false` must REJECT a descriptor
  that pins a revision ... otherwise the provenance it produces would name a revision the artifacts
  did not come from." This has been documented since P3-01. No connector in the package has ever
  declared that flag `false` — `createInMemoryRepositoryConnector` (P3-01) and
  `createGitRepositoryConnector` (P3-02) both hardcode `revisionPinning: true` — so the rejection
  branch this decision requires has never been implemented, and therefore never tested, anywhere.
  A documented rule with no implementation and no test is not a rule; it is a comment a future
  connector author has no way to discover they violated.
- ADR 0013 decision 2 promised the generic interface would hold "without this interface changing"
  for a source that is not a repository, but nothing has ever exercised that promise: the only
  narrowing that exists is `SourceRepositoryDescriptor`, and every field the generic bridges
  (`descriptorToSource`, `buildArtifactLocator`) touch has so far only ever been shaped like a
  repository.

P6-01 is the first Phase 6 ticket: "harden the multi-source connector abstraction; prepare the
connector framework for multiple source layouts." Read against the gaps above, that is a mandate to
close specific, named, previously-deferred weaknesses in the existing contract — not to build a new
real connector (a wiki/ticketing/log-store client is real I/O work of P3-02's shape, and is out of
scope here) and not to build `packages/orchestration`'s run-sequencing logic (still explicitly out
of scope per ADR 0013).

## Decision

1. **A `ConnectorRegistry`, added to `packages/ingestion-connectors` rather than
   `packages/orchestration`.** `registry.ts`'s `createConnectorRegistry(connectors)` validates the
   connector set at construction (`validateSourceConnector` on each entry, the same runtime check
   ADR 0013 defined for one connector, now applied to all of them) and rejects a duplicate `id` with
   `ConnectorRegistrationError` — a real risk once `Provenance.derivedBy` and any registry keyed by
   `id` has more than one connector to distinguish. `resolve(descriptor)` returns the one supporting
   connector, throws `NoMatchingConnectorError` when none does, and throws
   `AmbiguousConnectorError` (naming every matching connector id) when more than one does, instead
   of resolving ambiguity by registration order the way `selectConnector` does. This is deliberately
   placed in `ingestion-connectors`, not `orchestration`: both failure modes it catches are about
   the connector SET itself (is it internally consistent?), not about sequencing a pipeline run
   (retry order, fallback across a degraded source), which remains `orchestration`'s job on top of
   whatever this resolves. `selectConnector` is untouched and still exported — a caller with at most
   one plausible connector per descriptor has no need for the extra ceremony, and no existing caller
   changes behaviour.

2. **A second source-specific narrowing, `SourceDocumentSpaceDescriptor`, proves the generic
   contract generalizes.** `descriptor.ts` gains `DocumentSpaceCoordinates`
   (`kind`/`spaceId`/`pathPrefix`/`revision`) and `SourceDocumentSpaceDescriptor`, modelled after
   `RepositoryCoordinates` but deliberately different where a document space genuinely is: no
   filesystem tree (`spaceId` names a wiki space, not a checkout), and — critically —
   `pathPrefix`/`revision` are optional in a way `RepositoryCoordinates.subpaths`/`revision` also
   are, but backed by a source that, unlike git, usually cannot honour `revision` at all. No change
   to `SourceConnector`, `ConnectorSession`, `ArtifactRef`, or `RawArtifact` was needed to support
   it — the proof the interface holds is that none was.

3. **`createInMemoryDocumentSpaceConnector` is the first connector to declare
   `revisionPinning: false` and enforce it.** `document-space-connector.ts` defaults
   `capabilities.revisionPinning` to `false` (a wiki/CMS backend usually has no immutable revision;
   editing a page mutates it in place) and its `open()` throws when
   `descriptor.documentSpace.revision` is set anyway — the first real implementation of ADR 0013
   decision 6's rejection rule. `revisionPinning: true` remains selectable (`options.revisionPinning`)
   for the backends that genuinely support a snapshot (e.g. a static-site export pinned to a build
   id), at which point the connector behaves like `createInMemoryRepositoryConnector` with respect
   to revision resolution — proving both branches of the capability, not just the one every prior
   connector happened to need. It also declares `binaryContent: false`, the first connector to do so
   (every page here is read as `utf-8`), so `validateSourceConnector`'s boolean check and a
   registry's aggregate view of declared capabilities are exercised against a real `false` rather
   than only ever seeing `true`.

4. **`descriptorToSource`'s declared-revision lookup is generalized, not duplicated.** It read
   `repository.revision` directly; extended in place (`declaredRevisionOf`, `descriptor.ts`) to also
   check `documentSpace.revision`, rather than adding a second special case at the call site. This
   is a real fix, not a speculative one: before it, a document-space descriptor that declared a
   revision but was opened by a connector that did not resolve one itself (impossible today, since
   the only document-space connector rejects that combination — but true in general for any future
   connector with `revisionPinning: true` that trusts the descriptor's declared value) would have
   silently produced a `Source` with no `version`, exactly the "provenance is honest by omission"
   failure ADR 0013 already cared about for repositories.

5. **`ArtifactFilter`/`matchesArtifactFilter`/`ArtifactRef`/`RawArtifact` are unchanged.** The whole
   point of decision 5 (filter semantics are centrally defined and source-kind-agnostic) is that a
   second, structurally unrelated source (pages instead of files, no filesystem hierarchy) still
   filters, hashes, and reports partial failure through the exact same shared code —
   `document-space-connector.ts` calls `matchesArtifactFilter` and `matchesPathPattern` unmodified,
   the same way `git-connector.ts` and `reference-connector.ts` do.

## Testing

`packages/ingestion-connectors/tests/` — 208 tests across 9 files, 30 new/updated over the 178 ADR
0014 baseline (all pre-existing tests pass unmodified):

- **`registry.test.ts` (new, 8)** — construction rejects a duplicate id and a structurally invalid
  connector; `get` looks up by id; `resolve` picks the one matching connector, throws
  `NoMatchingConnectorError` when none matches, and throws `AmbiguousConnectorError` — asserting it
  names every matching connector id — when two connectors both claim the same descriptor.
- **`document-space-connector.test.ts` (new, 12)** — capability shape and the `revisionPinning:
false` default; the rejection this ticket's whole capability-honesty argument rests on
  (`documentSpace.revision` set against `revisionPinning: false` throws, naming the flag); the
  accepting counterpart (`revisionPinning: true` resolves and records the pinned revision);
  `pathPrefix` filtering composed with the descriptor filter; reading, `not-found`, `too-large`; and
  the source/evidence seam via `validateSourceReferences`.
- **`descriptor.test.ts` (+8)** — `validateSourceDocumentSpaceDescriptor` mirroring the existing
  `validateSourceRepositoryDescriptor` coverage (minimal/fully-populated acceptance, missing
  `documentSpace`, unknown `kind`, missing `spaceId`, empty `pathPrefix`, generic-field errors
  alongside narrowing-specific ones), plus the `descriptorToSource` case that would have silently
  dropped a `documentSpace.revision` before decision 4's generalization.
- **`index.test.ts` (+2)** — the public entry point re-exports the new narrowing and the registry.

## Consequences

A caller assembling several connectors — the repository connector plus, going forward, whatever
implements document spaces, tickets, or log stores for real — now gets a registration-time error for
a duplicate id and a resolution-time error for genuine ambiguity, instead of a silently-wrong
connector chosen by array order. A future connector author for a source with no immutable revision
concept (a live wiki, a ticket system, most gateways) has a working, tested precedent to model
`revisionPinning: false` on, rather than only documentation describing a rule no code enforces. The
generic contract's claim to generalize past a repository is now backed by a second implementation,
not only by decision 2's prose.

The corresponding cost: `packages/ingestion-connectors` now exports three additional public error
classes (`ConnectorRegistrationError`, `NoMatchingConnectorError`, `AmbiguousConnectorError`) and one
additional descriptor narrowing that any consumer doing an exhaustive switch over descriptor shapes
must now account for. Both are intentional surface growth in exactly the direction the package's own
README already committed to.

## Limitations

- **`createInMemoryDocumentSpaceConnector` is a reference implementation, not a real wiki/CMS
  client** — same status `createInMemoryRepositoryConnector` had before `createGitRepositoryConnector`
  (P3-02) followed it. No network access, no real backend (Confluence, a static-site generator, a
  flat-file wiki) implemented. That remains a future ticket of P3-02's shape.
- **`ConnectorRegistry.resolve` throws on ambiguity rather than offering a precedence override.**
  Deliberate: ADR 0013 already rejected "best-match" as underspecified, and a registry that silently
  picked a winner among ambiguous connectors would reintroduce the exact problem this ticket closes.
  A caller that genuinely needs layered/fallback connectors for the same descriptor shape (a
  cache-in-front-of-a-slow-source pattern) composes that itself as a single `SourceConnector`
  wrapping both, rather than registering two connectors that both `supports()` the same descriptor.
- **No connectors for ticket systems, log stores, or gateways, and no HTTP client anywhere in the
  package.** Still true, per ADR 0013/0014. `SourceType` already has `ticket`/`log` values with
  nothing producing them.
- **`archive` remains unserved** by the repository connector, unchanged from ADR 0014.
- **No credential resolution for a document-space connector.** `SourceDocumentSpaceDescriptor`
  inherits `SourceDescriptor.credential` and its validation (a reference, never a secret — ADR 0013
  decision 8), but no document-space connector resolves one, mirroring the git connector's stance
  from ADR 0014 decision 4 until a real backend exists to authenticate against.

## Alternatives considered

- **Put `ConnectorRegistry` in `packages/orchestration`, as ADR 0013's limitation originally
  suggested** — rejected for now: `orchestration` is still an unimplemented scaffold ("implementation
  pending... see the FRD before implementing"), and the two failure modes this registry catches
  (duplicate id, ambiguous `supports()`) are properties of the connector set itself, checkable with
  no pipeline-sequencing concept at all. `orchestration` can depend on this registry later for
  run-level precedence without this package depending on `orchestration` in the meantime, which
  would be the wrong direction (ADR 0013 decision 10's existing dependency flow is
  `ingestion-connectors` → `knowledge-graph`, never the reverse of any downstream package).
- **`resolve()` falls back to first-match on ambiguity, only warning** — rejected: a `console.warn`
  is exactly the kind of signal a real ingestion run would not surface anywhere a human sees it,
  reproducing ADR 0013's own first-match behaviour under a name that implies it was fixed.
- **Model a document space as a degenerate `SourceRepositoryDescriptor`** (e.g. `repository.kind:
'wiki'`) instead of a new narrowing — rejected: `RepositoryCoordinates` is filesystem-shaped
  (`branch`, `subpaths` as repository-relative paths) in a way a page-addressed space is not, and
  forcing it through that shape would have proven nothing about the generic contract's ability to
  take on a _new_ narrowing, which is the actual thing P6-01 needs demonstrated.
  `SOURCE_REPOSITORY_KINDS` also stays a closed, git/filesystem-specific vocabulary rather than
  growing an unrelated fourth member.
- **Default `createInMemoryDocumentSpaceConnector` to `revisionPinning: true`, matching the existing
  reference connector** — rejected: that would perpetuate the exact gap this ticket exists to close
  (every connector so far has only ever exercised the `true` branch of that capability).
