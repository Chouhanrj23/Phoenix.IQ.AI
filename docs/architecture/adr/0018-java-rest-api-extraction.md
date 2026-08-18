# ADR 0018: Java REST/API extraction (P3-06)

- **Status:** Accepted
- **Date:** 2026-08-18
- **Owners:** Platform maintainers

## Context

P3-04 (ADR 0016) gave every type its annotations as structured data. This ticket is the FRD's
FR-DET-03 ("extract API contracts (endpoints, methods, payloads) from framework annotations and
interface definitions"), applied to the stack the project's own Aurora Commerce fixture data already
names: Spring MVC. It is also the first ticket in this family to introduce a canonical-object bridge
— mapping a Spring controller directly into a real `@phoenix-ai/knowledge-graph` `ApiObject` — because
a REST endpoint's identity (an HTTP method plus a path) is exactly the annotation-decidable case ADR
0013 decision 1's boundary (a connector/extractor emits facts; deciding canonical shape is only safe
where no interpretation is needed) allows through without waiting for `inference-engine`.

## Decision

1. **`java-http.ts` is a pure function over `JavaFileFacts` — it never touches the CST.** Once P3-04
   captured every annotation and its attributes as structured data, "is this a `@RestController`" or
   "what path does `@GetMapping` declare" is a lookup, not a parse. This keeps the module narrow and
   single-purpose, and means a bug in HTTP extraction can never be a CST-traversal bug — the same
   shape P3-04/P3-05 already established for splitting CST-touching code from pure fact-consuming
   code.

2. **Path joining (`joinPaths`) is a small, independently-tested, deterministic normalizer — not
   string concatenation at each call site.** Class-level and method-level paths each may be absent,
   singular, or (via `@RequestMapping({"/a","/b"})`) an array; every combination must produce a
   normalized, de-duplicated path list (no double slashes, a bare class-level path alone still
   produces a route, no paths at all produces `"/"`). Isolating this in one function made it possible
   to test the normalization rules exhaustively without needing a parsed fixture for every case.

3. **Only explicitly annotated parameters (`@PathVariable`/`@RequestParam`/`@RequestBody`/
   `@RequestHeader`) produce route parameter facts.** Spring's IMPLICIT binding rules (an unannotated
   parameter that happens to look like a request body) are not inferred — that requires real Spring
   semantics (parameter type introspection against Spring's own binding resolution order) this
   deterministic pass does not have. An unannotated parameter is simply absent from
   `JavaRouteFact.parameters`, not guessed at.

4. **A controller bridges to `ApiObject` (this ticket's canonical-object bridge, the first in this
   family) with `confidenceDetail: { basis: 'observed' }`, never `'derived'`.** The mapping —
   `@RestController`/`@Controller` plus its routes — is a direct annotation read with no
   interpretation required, unlike grouping controllers into architectural Components or bounded
   contexts, which stays semantic inference's job (FR-SEM-01) and is NOT attempted here. `bridge-
shared.ts` holds the plumbing every bridge in this family needs (deterministic `sha256`-based ids,
   never random; evidence construction) so P3-07's entity bridge (ADR 0019) reuses it rather than
   duplicating it.

5. **`extractJavaProject` gains its `options` parameter (`systemId`/`sourceId`/`generatedAt`) in THIS
   ticket, not earlier.** P3-03 through P3-05 had nothing that needed a system/source identity to
   stamp onto output; introducing the parameter only once a bridge exists to consume it keeps the
   function's signature honest about what it actually uses at each stage of this family.
   `generatedAt` is resolved once at the top of `extractJavaProject` (defaulted only when the caller
   omits it) and threaded through the bridge rather than re-stamped per-object, which is what FR-DET-07
   byte-stability requires.

## Testing

`packages/extraction-engine/tests/` — 12 new tests across 2 files, plus `extract-java.test.ts` grown
by a new `describe` block:

- **`java-http.test.ts`** — `joinPaths`' normalization rules in isolation (decision 2: a class path
  alone, no paths at all producing `/`, de-duplication across multiple class/method paths), plus
  controller/route/parameter extraction ignoring a non-annotated class.
- **`bridge-http.test.ts`** — `deterministicId` stability, and `bridgeSpringController` validated with
  the REAL `validateApiObject` from `@phoenix-ai/knowledge-graph`.
- **`extract-java.test.ts`** — `extractJavaProject` grown to require `options` and wire controller
  extraction and bridging in, asserting both the raw route fact and the bridged `ApiObject`.

## Consequences

`packages/extraction-engine` now produces its first REAL, validated canonical objects — `ApiObject`s
ready to fold into a `CanonicalKnowledgeBundle` — not just intermediate facts. `bridge-shared.ts`
exists as reusable plumbing for P3-07's entity bridge.

Cost: **`extractJavaProject`'s signature changed** (a required second `options` parameter) — every
caller from this commit forward must supply a system/source identity, where before P3-06 none was
needed. Accepted because deferring the parameter's introduction to exactly the ticket that needs it
(rather than speculatively adding it in P3-03) keeps each stage's public API honest about what it
actually consumes.

## Limitations

- **No implicit Spring parameter binding** (decision 3) — only explicitly annotated parameters
  produce route parameter facts.
- **JAX-RS (`@Path`/`@GET`/...) is not read** — Spring MVC only, matching the project's own confirmed
  target stack (Aurora Commerce fixture data names "Java / Spring Boot").
- **No relationship bridging** — an `ApiObject` is emitted standalone; no edge connecting it to, say,
  an owning `ContainerObject` is synthesized (that grouping is semantic inference's job).

## Alternatives considered

- **Inferring implicit Spring parameter binding** — rejected, see decision 3. Requires modeling
  Spring's own resolution order (which is itself somewhat implementation-version-dependent), a
  materially larger and less deterministic undertaking than reading explicit annotations.
- **Bridging Controller "handles" Entity or Controller "belongs to" Container relationships already
  in this ticket** — rejected. Constructing either correctly requires resolving exactly the call/type
  graph P3-05 (ADR 0017) already documents as deliberately shallow, or component-boundary inference
  that is explicitly `inference-engine`'s job (FR-SEM-01).
- **Introducing `options`/`BridgeOptions` back in P3-03** — rejected, see decision 5. Nothing before
  this ticket consumes a system/source identity; adding it speculatively would have been dead
  parameter surface for three prior tickets.
