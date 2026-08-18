# ADR 0019: Java database interaction extraction (P3-07)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Owners:** Platform maintainers

## Context

This ticket is the FRD's FR-DET-02 ("extract the logical data model (entities, attributes,
relationships) from migrations and/or ORM definitions"), served by its ORM half — matching the
project's own confirmed target stack (Spring Data JPA/Hibernate). It follows the same shape P3-06
(ADR 0018) established: a pure function over P3-04's structural facts, plus a canonical-object bridge
reusing `bridge-shared.ts`'s plumbing rather than duplicating it.

## Decision

1. **`java-persistence.ts` is a pure function over `JavaFileFacts` — it never touches the CST**, for
   the same reason ADR 0018 decision 1 gave for `java-http.ts`: once annotations are structured data,
   "is this an `@Entity`" or "what does `@Column` name" is a lookup.

2. **A JPA entity bridges to `EntityObject` with `confidenceDetail: { basis: 'observed' }`, reusing
   `bridge-shared.ts` from P3-06 rather than duplicating its deterministic-id/evidence plumbing.**
   The mapping — `@Entity`/`@Table`/`@Id`/`@Column` read directly into `EntityAttributes.fields` — is
   exactly as annotation-decidable as a controller's routes were in P3-06, and the SAME shared bridge
   plumbing (`deterministicId`, `evidenceFor`, `simpleNameOf`) is reused unchanged, proving it was
   correctly factored out as family-wide rather than HTTP-specific in ADR 0018.

3. **Spring Data repositories are detected structurally (an interface extending a `*Repository`
   type), and their generic type arguments are recovered with a SMALL TARGETED REGEX over the
   already-extracted `extendsTypes` string — not a second CST pass, and not a general generics
   parser.** `java-structure.ts` (P3-04) does not model generic type arguments as structured data
   (`extendsTypes` is plain source text, e.g. `"JpaRepository<CheckoutItem, Long>"`); recovering
   `CheckoutItem`/`Long` from that one bounded, well-known shape (`SomeRepository<X, Y>`) with a
   regex is the narrowest possible place to do it, rather than either reaching back into the CST
   (defeating the pure-function design of decision 1) or generalizing `java-structure.ts` for a need
   only this one ticket has.

4. **Repositories are NOT bridged to a canonical object.** A `JavaRepositoryFact` (its declared query
   methods, `@Query` text) is a real fact this package extracts, but no `@phoenix-ai/knowledge-graph`
   kind exists for "a repository interface" distinct from the entity it manages — bridging it would
   mean either inventing a new `kind` unasked for by this ticket, or conflating it with the entity
   object it manages, which would lose information (a repository is not the same thing as its
   entity). It stays a fact in `JavaExtractionResult.repositories`.

## Testing

`packages/extraction-engine/tests/` — 5 new tests across 2 files, plus `extract-java.test.ts` grown
by a new `describe` block:

- **`java-persistence.test.ts`** — an entity's table/id/columns/associations (including a
  `@OneToMany` association's generic collection type unwrapped, e.g. `List<CheckoutLine>` ->
  `CheckoutLine`), a repository's type arguments and declared query methods (including `@Query`
  text), and a plain class correctly NOT treated as an entity.
- **`bridge-persistence.test.ts`** — `bridgeJpaEntity` validated with the REAL `validateEntityObject`,
  and its id stability across two calls.
- **`extract-java.test.ts`** — `extractJavaProject` grown to wire persistence extraction and bridging
  in alongside HTTP, asserting the entity/repository facts AND that `objects` now contains both an
  `EntityObject` and an `ApiObject` together.

## Consequences

`packages/extraction-engine` can now produce a real, validated `EntityObject` for every JPA entity —
proving `bridge-shared.ts`'s plumbing generalizes across bridge kinds, not just the one it was
introduced for.

## Limitations

- **Raw SQL migrations (Flyway/Liquibase) and MyBatis mappers are not read** — ORM annotations only,
  matching the project's confirmed target stack; FR-DET-02's "migrations" half remains unserved.
- **No JPQL parsing** — a repository's `@Query` annotation text is captured verbatim, not parsed into
  structured query facts.
- **Repositories do not bridge to a canonical object** (decision 4).
- **Generic type argument recovery is narrowly scoped to the `SomeRepository<X, Y>` shape** (decision 3) — it does not generalize to arbitrary generic types elsewhere in the codebase (that remains
  P3-05's documented type-dependency-graph limitation).

## Alternatives considered

- **A second CST pass specifically for repository generic type arguments** — rejected, see decision 3. Would have reintroduced CST access into what is otherwise a clean, pure-function module, for a
  narrow need a regex over already-extracted text serves just as well.
- **Bridging a repository to some `integration.*` or `domain.*` kind** — rejected, see decision 4. No
  existing canonical kind fits "a repository interface" without either inventing new vocabulary this
  ticket was not asked to invent, or conflating it with its managed entity.
- **Duplicating `bridge-shared.ts`'s helpers into a persistence-specific copy** — rejected, see
  decision 2. The whole point of factoring `bridge-shared.ts` out in P3-06 was reuse across bridge
  kinds; duplicating it here would have defeated that.
