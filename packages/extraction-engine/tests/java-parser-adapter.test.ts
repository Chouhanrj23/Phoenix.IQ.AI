import { describe, expect, it } from 'vitest';
import { parseJavaSource } from '../src/java-parser-adapter.js';

describe('parseJavaSource', () => {
  it('parses valid Java source without throwing', () => {
    const result = parseJavaSource('Foo.java', 'class Foo {}\n');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.path).toBe('Foo.java');
    expect(result.cst.name).toBe('compilationUnit');
  });

  it('reports empty source as its own failure reason rather than a confusing lexer error', () => {
    const result = parseJavaSource('Empty.java', '   \n\n');
    expect(result).toEqual({
      ok: false,
      path: 'Empty.java',
      reason: 'empty-source',
      detail: 'source is empty',
    });
  });

  it('does not throw on invalid syntax, and recovers a structured line/column from the real thrown message', () => {
    // This is the tripwire: java-parser's parse() throws a plain Error with a
    // hand-formatted message ("Sad sad panda, parsing errors detected in
    // line: N, column: M!\n..."). The adapter regexes that EXACT wording to
    // recover position. If a java-parser upgrade changes the wording, this
    // assertion -- run against the REAL thrown message, not a fixture -- is
    // what catches it, per the file's own documented fragility.
    const result = parseJavaSource('Broken.java', 'class Foo { public void bar( }\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('parse-error');
    expect(result.position).toBeDefined();
    expect(result.position?.line).toBeGreaterThan(0);
    expect(result.position?.column).toBeGreaterThan(0);
    expect(result.detail).toContain('Sad sad panda');
  });

  it('recovers a lex-error position for genuinely unlexable input', () => {
    const result = parseJavaSource('Unlexable.java', 'class Foo { String s = "unterminated; }\n');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('lex-error');
    expect(result.position).toBeDefined();
  });
});
