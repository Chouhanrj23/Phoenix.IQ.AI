/**
 * P3-03 -- the one call site wrapping `java-parser`'s `parse()`.
 *
 * `parse()` THROWS a plain `Error` on both lex and parse failure, with the
 * position baked into a hand-formatted message string
 * (`"Sad sad panda, lexing errors detected in line: N, column: M!\n..."`) --
 * there is no structured error type upstream, and no non-throwing variant.
 * This adapter turns that into the non-throwing `{ ok: true } | { ok: false }`
 * shape every other partial-failure surface in this pipeline already uses
 * (`ArtifactReadResult` in `@phoenix-ai/ingestion-connectors`), so one
 * unparseable file cannot abort a whole extraction run.
 *
 * Recovering a structured line/column from the message is inherently coupled
 * to java-parser's exact (unversioned, internal) wording -- `parseJavaSource`
 * regexes the two known shapes and falls back to no position if neither
 * matches, so a future wording change degrades gracefully instead of
 * crashing. `java-parser-adapter.test.ts` pins the regex against the REAL
 * thrown message from the REAL parser, so a `java-parser` version bump that
 * changes the wording fails the test suite instead of silently losing
 * position data.
 */

import { parse } from 'java-parser';
import type { CstNode } from 'java-parser';

export interface JavaParsePosition {
  line: number;
  column: number;
}

export interface JavaParseSuccess {
  ok: true;
  path: string;
  cst: CstNode;
}

export type JavaParseFailureReason = 'lex-error' | 'parse-error' | 'empty-source';

export interface JavaParseFailure {
  ok: false;
  path: string;
  reason: JavaParseFailureReason;
  detail: string;
  position?: JavaParsePosition;
}

export type JavaParseResult = JavaParseSuccess | JavaParseFailure;

const LEX_ERROR_PATTERN = /lexing errors detected in line: (\d+), column: (\d+)/;
const PARSE_ERROR_PATTERN = /parsing errors detected in line: (\d+), column: (\d+)/;

function positionFromMessage(message: string, pattern: RegExp): JavaParsePosition | undefined {
  const match = pattern.exec(message);
  if (match === null) return undefined;
  const [, line, column] = match;
  if (line === undefined || column === undefined) return undefined;
  return { line: Number.parseInt(line, 10), column: Number.parseInt(column, 10) };
}

/** Parses one Java compilation unit's source text. Never throws. */
export function parseJavaSource(path: string, content: string): JavaParseResult {
  if (content.trim().length === 0) {
    return { ok: false, path, reason: 'empty-source', detail: 'source is empty' };
  }

  try {
    const cst = parse(content);
    return { ok: true, path, cst };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    const lexPosition = positionFromMessage(message, LEX_ERROR_PATTERN);
    if (lexPosition !== undefined) {
      return { ok: false, path, reason: 'lex-error', detail: message, position: lexPosition };
    }

    const parsePosition = positionFromMessage(message, PARSE_ERROR_PATTERN);
    if (parsePosition !== undefined) {
      return { ok: false, path, reason: 'parse-error', detail: message, position: parsePosition };
    }

    return { ok: false, path, reason: 'parse-error', detail: message };
  }
}
