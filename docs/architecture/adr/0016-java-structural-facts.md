# ADR 0016: Java structural facts (P3-04)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Owners:** Platform maintainers

## Context

P3-03 (ADR 0015) answered "what should be parsed" without parsing anything. This ticket is where
actual Java parsing begins — the FRD's FR-DET-01 ("build the module, dependency, and call graph from
source using language-aware parsing (AST/LSP)") and FR-DET-08 ("every deterministic fact shall be
stored with file-and-line ... evidence"), scoped here to package/class/interface-level structure:
package, imports, and every type declaration with its modifiers, annotations, extends/implements,
fields, methods, and nested types. The call graph itself is P3-05's job (ADR 0017).

## Decision

1. **Java source is parsed with a real AST/CST library (`java-parser`, pinned `3.0.1`), not a
   hand-rolled regex scanner.** `java-parser` is the Chevrotain-based grammar behind `prettier-java`
   (MIT). Java's grammar — nested generics with `>>`, multi-line annotations, lambdas, text blocks,
   string escapes — is not regex-safe, and correctness matters most for exactly what this whole
   family of tickets needs: annotation attributes now, call sites in P3-05. This is the inverse
   framing of ADR 0014 decision 1 (trust the real implementation over reimplementing it) applied to a
   parser instead of a VCS. Confirmed empirically, not just assumed: every fact-producing test parses
   real Java text through the real `java-parser`, never a hand-built fake CST — the same "a fake
   would only prove the fake matches the code's assumptions" reasoning ADR 0014 already established
   for git.

2. **`java-parser`'s `parse()` throws a plain `Error` with a hand-formatted message
   (`"Sad sad panda, parsing errors detected in line: N, column: M!\n..."`) — there is no structured
   error type or non-throwing variant upstream.** `java-parser-adapter.ts` is the one call site,
   wrapping it in `try`/`catch` and turning it into `{ ok: true, cst } | { ok: false, reason, detail,
position? }` — the exact non-throwing convention `ArtifactReadResult` already established in
   `ingestion-connectors`, so one unparseable file cannot abort a whole extraction run. Recovering a
   structured line/column means regexing that exact, unversioned message text; a dedicated test
   pins the regex against the REAL thrown message on genuinely invalid input, so a future
   `java-parser` version bump that changes the wording fails the test suite instead of silently
   losing position data.

3. **Structural facts (`java-structure.ts`) are extracted by plain recursive-descent over the
   DECLARATION grammar, not by subclassing `BaseJavaCstVisitorWithDefaults`.** That subset —
   `classDeclaration`, `fieldDeclaration`, `methodDeclaration`, and roughly two dozen more — is small
   and fully enumerable by hand. Chevrotain's visitor API has a central foot-gun: overriding a
   visitor method silently disables DEFAULT AUTO-RECURSION for everything below it, so overriding
   `classDeclaration` without explicitly re-visiting `classBody` loses every field, method, and
   nested type inside it. Plain functions that call each other explicitly have no such implicit
   contract to break — every recursive call is visible in the code. A dedicated test asserts a
   nested class's own fields/methods ARE captured, guarding exactly this risk. (P3-05's call graph
   DOES use the real visitor API, for the opposite reason — see ADR 0017 decision 1.)

4. **Type/expression TEXT is never reconstructed from the grammar — it is sliced directly from the
   original source string via each CST node's own `location` (`cst-utils.ts`'s `sourceTextOf`).**
   `java-parser` configures Chevrotain with full location tracking, so every node (not just tokens)
   carries `{startLine, endLine, startOffset, endOffset}` directly, usable for BOTH evidence
   (FR-DET-08) and "what does this type/expression actually say" without hand-writing a stringifier
   for `unannType`'s dozen sub-rules. `resolveLiteral` (also `cst-utils.ts`) generalizes the same
   idea for annotation attribute values: a subtree resolves to a literal only when it reduces to
   EXACTLY ONE literal token, found by walking every token under the node rather than naming the
   specific chain of rules between `elementValue` and `literal` — this package does no
   constant-folding or symbol resolution, so a ternary, string concatenation, or constant reference
   is recorded as raw source text (`resolved: false`) instead of guessed at.

5. **`cst-utils.ts` works against a small LOCAL structural type (`AnyCstNode`/`AnyCstElement`), not
   `java-parser`'s own exported `CstElement` union.** That union has one exact interface per grammar
   rule (~350 of them), each with a literal `name` field — built for a rule-specific visitor, not
   generic dictionary-style traversal. `asNode`/`asToken` cast at the one seam where a `java-parser`
   value first enters this package's code, and every other helper (`childNode`, `childNodes`,
   `sourceTextOf`, ...) works against the local type from there, avoiding fighting TypeScript over an
   autogenerated union at every call site.

## Testing

`packages/extraction-engine/tests/` — 16 new tests across 3 files:

- **`java-parser-adapter.test.ts`** — the non-throwing wrapper, including the regex-based
  lex-error/parse-error position recovery pinned against the real thrown message (decision 2), and
  empty source handled as its own failure reason.
- **`java-structure.test.ts`** — package/imports, a type's modifiers/annotations/qualified name,
  fields, methods with parameters/annotations/return types, and — the dedicated recursion-risk guard
  (decision 3) — a nested class's own fields/methods.
- **`extract-java.test.ts`** — `extractJavaProject` grown to wire discovery through parsing through
  structural facts, including a parse failure proven not to abort the run and excluded from the
  structural-fact output.

## Consequences

Every later Java extraction ticket (P3-05 onward) builds on real, evidenced structural facts instead
of raw text — annotations, fields, and methods are now typed data a pure function can query, which is
exactly what lets P3-06/P3-07 (`java-http.ts`/`java-persistence.ts`) be simple, CST-free functions
over `JavaFileFacts`.

Cost: **a new external dependency this whole Java extraction family rests on** (`java-parser`, plus
its own `chevrotain`/`chevrotain-allstar`/`lodash` transitive deps) — the inverse tradeoff of ADR
0014 decision 1's "trust `git` over reimplementing it," applied to a parser instead of a VCS.

## Limitations

- **No classpath or symbol resolution** — a type name is text captured as written; resolving it
  against an actual project-wide index is P3-05's concern (ADR 0017), and resolving it against a real
  classpath is out of scope for this whole family.
- **The `java-parser` adapter's error-position recovery is coupled to an unversioned internal message
  string** (decision 2) — mitigated by a test that pins it against the real thrown text, not
  eliminated.
- **Records/enums get reduced structural fidelity** — record components and enum constant bodies are
  captured at a basic level (name/type only, no per-component annotations), proportionate since
  neither Spring controllers nor JPA entities in practice are declared as `record`/`enum` types.

## Alternatives considered

- **A hand-rolled regex/heuristic Java scanner** — rejected, see decision 1. Confirmed, not just
  assumed, by the amount of real grammar structure this ticket's own research surfaced (the unified
  `annotation` rule covering marker/single-element/normal forms as one shape, `typeIdentifier`'s
  exact production) that a regex approach would have silently gotten wrong rather than caught by a
  type error.
- **Using `java-parser`'s own exported `CstElement`/`CstNode` types throughout this package** —
  rejected, see decision 5. Fighting a 350-member exact union at every generic traversal call site
  would have made `cst-utils.ts` far more verbose for no correctness gain; the local structural type
  is exactly as safe where it matters (the CST really does have `.children`/`.location` on every
  node) and dramatically simpler to write against.
