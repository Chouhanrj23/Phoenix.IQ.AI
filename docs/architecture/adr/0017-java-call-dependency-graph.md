# ADR 0017: Java call graph and type-dependency graph (P3-05)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Owners:** Platform maintainers

## Context

P3-04 (ADR 0016) gave every type its own structural facts — fields, methods, extends/implements, all
as plain strings. This ticket finishes the FRD's FR-DET-01 ("build the module, dependency, and call
graph from source"): a type-dependency graph across those already-extracted type references, and a
call graph across actual method invocations, which P3-04 deliberately did not attempt (declarations
are enumerable by hand; statements/expressions are not — see ADR 0016 decision 3).

## Decision

1. **The call graph uses a real `BaseJavaCstVisitorWithDefaults` subclass, overriding only
   `primary`.** Unlike declarations, a call site can be nested arbitrarily deep inside statements and
   expressions (blocks, `if`/`for`/`while`/`try`, lambda bodies, ...), and that grammar is not
   boundedly enumerable by hand the way P3-04's declaration grammar was. The visitor's default
   auto-recursion is exactly what makes finding every `primary` node tractable; the override
   explicitly re-`visit`s its own prefix/suffix children (`foo(bar())`'s argument `bar()` must still
   be found) rather than relying on the disabled default — the same foot-gun ADR 0016 decision 3
   documented, deliberately taken on here because the alternative (hand-writing the entire
   statement/expression grammar) is strictly more code and more risk.

2. **There is no single `methodInvocation` CST node — a call is reconstructed from
   `primary`/`primaryPrefix`/`primarySuffix`/`methodInvocationSuffix`.** A correction found only by
   reading the real grammar, not assuming it: `fqnOrRefType` itself greedily consumes as much of a
   dotted chain as its own lookahead allows, so `CheckoutSupport.audit(x)` is consumed ENTIRELY
   inside `primaryPrefix` with no separate `Dot Identifier` suffix at all — the prefix can seed
   multiple chain segments, not just one. Discovered empirically: an early implementation that seeded
   only a single prefix segment silently mis-resolved every multi-segment static-style call until a
   test caught it.

3. **Call-target resolution is deliberately shallow: resolved only for a bare/implicit-`this` call, a
   literal `this.method()`, or `Type.method()` where `Type` matches a known project-local type via
   imports or same-package visibility.** This package has no classpath and no symbol table.
   `paymentClient.charge(x)` through an instance field is `unresolved: true` — knowing
   `paymentClient`'s declared type requires type inference this deterministic pass does not do, and
   is not silently guessed at. Every call is still recorded, resolved or not; nothing is dropped.

4. **The type-dependency graph is derived purely from already-computed `JavaFileFacts`, with no
   second CST pass.** `extends`/`implements`/field/parameter/return/throws type text is already
   captured as plain strings by `java-structure.ts` (P3-04); resolving those strings against a
   project-wide qualified-name index (built once, from every file's already-extracted types) needs no
   further CST access. Generic type ARGUMENTS are not separately resolved here
   (`List<CheckoutItem>` records a dependency on `List`, not `CheckoutItem`) — a documented, narrow
   limitation; P3-07's persistence extraction unwraps a JPA association's generic argument itself, for
   that one specific, narrower need.

## Testing

`packages/extraction-engine/tests/java-calls.test.ts` — 3 tests, plus `extract-java.test.ts` grown by
one new `describe` block:

- Bare/`this`-qualified calls resolving to the enclosing type, `Type.method()` resolving to a known
  local type, and an instance-field-qualified call left DELIBERATELY unresolved (decision 3).
- Type dependencies derived from structure facts alone.
- `extract-java.test.ts`: `extractJavaProject` grown to wire the call graph and type-dependency graph
  through a two-class fixture (a controller calling its own private method, with a field of a
  project-local entity type), asserting both a resolved call and a resolved field-type dependency.

## Consequences

`packages/extraction-engine`'s output now includes real dependency data — which type references which,
and which method calls which — for `inference-engine`/`orchestration` to consume later (P3-06 onward
will bridge only the annotation-decidable subset of extraction's OTHER facts into canonical objects;
this graph itself stays a fact, per ADR 0013 decision 1's boundary one layer up).

Cost: as decision 3 makes explicit, this is not a "real" call graph in the sense a build tool with a
classpath could produce — it is a best-effort graph over what is staticly visible from source alone.

## Limitations

- **No classpath or symbol resolution**, inherited from ADR 0016 and made concrete here: an
  instance-field-qualified call, a method inherited from a superclass outside this source set, and a
  third-party library call are all `unresolved: true`.
- **Generic type ARGUMENTS are not resolved in the general type-dependency graph** (decision 4) —
  only P3-07's narrower JPA-association unwrapping recovers them, for that one case.

## Alternatives considered

- **A full statement/expression recursive-descent walker for the call graph, matching P3-04's
  declaration-grammar style** — rejected, see decision 1. Declarations are a small, enumerable
  grammar subset; statements/expressions are not, and reimplementing Chevrotain's own default
  auto-recursion by hand would be strictly more code and more risk than using the visitor API
  correctly.
- **Deep type inference for call/qualifier resolution** (tracking local variable declared types) —
  rejected, see decision 3. Materially larger scope, and the FRD's own module split places semantic
  interpretation in `inference-engine`, not here.
