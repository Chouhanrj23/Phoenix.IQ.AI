/**
 * P3-03 -- shared, rule-agnostic helpers over `java-parser`'s CST.
 *
 * Every fact-producing module in this package that touches the CST directly
 * (`java-structure.ts`, `java-calls.ts`) goes through these rather than
 * re-implementing child-lookup or source-slicing. Deliberately NOT grammar-
 * rule-specific: `java-parser` has ~350 productions, and hand-writing a
 * stringifier for every type/expression shape (`unannType`,
 * `classOrInterfaceType`, `conditionalExpression`, ...) would mean tracking
 * that whole grammar. Instead, every node here carries its own
 * `location.{startOffset,endOffset}` (java-parser configures Chevrotain with
 * full location tracking), so "what does this subtree actually say" is
 * answered by slicing the ORIGINAL SOURCE STRING -- always byte-exact,
 * because it IS the source, not a reconstruction of it.
 *
 * `java-parser`'s own exported `CstElement` type is a ~350-member
 * discriminated union (one exact interface per grammar rule, each with a
 * literal `name` field) -- built for a rule-specific visitor, not for
 * generic dictionary-style traversal. Rather than fight that union at every
 * call site, this module works against a small LOCAL structural type
 * (`AnyCstNode`/`AnyCstToken`) that every real CST node/token satisfies, and
 * `asNode`/`asToken` cast into it at the one seam where a `java-parser`
 * value first enters this package's own code.
 */

import type { CstNode as JavaParserCstNode, IToken as JavaParserIToken } from 'java-parser';
import type { FactProvenance } from './fact-provenance.js';

export interface CstNodeLocationLike {
  startOffset: number;
  endOffset: number;
  startLine: number;
  endLine: number;
}

export interface AnyCstToken {
  image: string;
  tokenType: { name: string };
}

export interface AnyCstNode {
  name: string;
  location: CstNodeLocationLike;
  children: Record<string, AnyCstElement[] | undefined>;
}

export type AnyCstElement = AnyCstNode | AnyCstToken;

/** The one cast boundary between `java-parser`'s exact generated types and this package's own generic traversal. */
export function asNode(node: JavaParserCstNode): AnyCstNode {
  return node as unknown as AnyCstNode;
}

export function asToken(token: JavaParserIToken): AnyCstToken {
  return token as unknown as AnyCstToken;
}

export function isCstNode(element: AnyCstElement): element is AnyCstNode {
  return 'children' in element;
}

export function isToken(element: AnyCstElement): element is AnyCstToken {
  return !('children' in element);
}

export type ChildBag = Record<string, AnyCstElement[] | undefined>;

/** The first (and, for every rule this package cares about, only) node under a MANY/OPTION-optional child slot. */
export function childNode(children: ChildBag, name: string): AnyCstNode | undefined {
  const found = children[name]?.[0];
  return found !== undefined && isCstNode(found) ? found : undefined;
}

export function childNodes(children: ChildBag, name: string): AnyCstNode[] {
  return (children[name] ?? []).filter(isCstNode);
}

export function childTokens(children: ChildBag, name: string): AnyCstToken[] {
  return (children[name] ?? []).filter(isToken);
}

export function childToken(children: ChildBag, name: string): AnyCstToken | undefined {
  return childTokens(children, name)[0];
}

/** Exact source text a CST node spans -- the general-purpose "render this subtree" primitive this module exists for. */
export function sourceTextOf(node: AnyCstNode, sourceText: string): string {
  return sourceText.slice(node.location.startOffset, node.location.endOffset + 1);
}

/**
 * Every token nested anywhere under `node`, in document order. Used to
 * detect "this subtree is exactly one literal token" (an annotation
 * attribute that's a plain string/number/boolean, not an expression) without
 * naming every intermediate rule between `elementValue` and `literal`.
 */
export function collectTokens(node: AnyCstNode): AnyCstToken[] {
  const tokens: AnyCstToken[] = [];
  const visit = (element: AnyCstElement): void => {
    if (isToken(element)) {
      tokens.push(element);
      return;
    }
    for (const group of Object.values(element.children)) {
      for (const child of group ?? []) visit(child);
    }
  };
  visit(node);
  return tokens;
}

export interface SourceSpan {
  path: string;
  startLine: number;
  endLine?: number;
  /**
   * Which source/revision this fact was extracted from, and when -- stamped
   * once, after every extraction pass runs, by `extractJavaProject`'s P3-10
   * enrichment (`fact-provenance.ts`), never by `spanOf`/the structural
   * facts modules themselves. Absent on a `SourceSpan` built directly via a
   * module's own tests (e.g. `extractJavaStructure` called outside
   * `extractJavaProject`), which is a deliberate, harmless default -- see
   * `docs/architecture/adr/0022-java-fact-provenance.md`.
   */
  provenance?: FactProvenance;
}

export function spanOf(path: string, node: AnyCstNode): SourceSpan {
  const { startLine, endLine } = node.location;
  return endLine === startLine ? { path, startLine } : { path, startLine, endLine };
}

const STRING_LITERAL_TOKENS = new Set(['StringLiteral', 'TextBlock']);
const BOOLEAN_LITERAL_TOKENS: Record<string, boolean> = { True: true, False: false };
const NUMERIC_LITERAL_TOKENS = new Set([
  'DecimalLiteral',
  'HexLiteral',
  'OctalLiteral',
  'BinaryLiteral',
  'FloatLiteral',
  'DoubleLiteral',
]);

export type LiteralValue = string | number | boolean;

/** Strips the surrounding quotes/text-block fences and resolves the handful of escapes annotation attributes actually use. */
function unquoteString(raw: string): string {
  const body = raw.startsWith('"""') ? raw.slice(3, -3).replace(/^\r?\n/, '') : raw.slice(1, -1);
  return body.replace(/\\(.)/g, (_match, escaped: string) => {
    switch (escaped) {
      case 'n':
        return '\n';
      case 't':
        return '\t';
      case 'r':
        return '\r';
      case '"':
        return '"';
      case '\\':
        return '\\';
      default:
        return escaped;
    }
  });
}

/**
 * Resolves a subtree to a literal value ONLY when it is exactly one literal
 * token (a plain `"x"`, `42`, `true`, ...) -- anything else (a constant
 * reference, a ternary, string concatenation, a nested annotation) is left
 * unresolved, per this package's documented "no constant-folding, no symbol
 * resolution" boundary.
 */
export function resolveLiteral(node: AnyCstNode): LiteralValue | undefined {
  const tokens = collectTokens(node);
  if (tokens.length !== 1) return undefined;
  const token = tokens[0];
  if (token === undefined) return undefined;
  const type = token.tokenType.name;
  if (STRING_LITERAL_TOKENS.has(type)) return unquoteString(token.image);
  if (type in BOOLEAN_LITERAL_TOKENS) return BOOLEAN_LITERAL_TOKENS[type];
  if (NUMERIC_LITERAL_TOKENS.has(type)) {
    const parsed = Number(token.image.replace(/[_lLfFdD]/g, ''));
    return Number.isNaN(parsed) ? undefined : parsed;
  }
  return undefined;
}
