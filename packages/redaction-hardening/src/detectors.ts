/**
 * P8 -- FR-SEC-01: the secret/PII detectors the redaction gate runs.
 *
 * HONEST SCOPE: these are deterministic, pattern-based detectors for the
 * credential and PII shapes that actually appear in source repositories and
 * ticket text. They are not a guarantee that no secret survives -- a secret
 * with no recognisable shape and no telling key name (`x = "hunter2"`) is
 * not detected. What the gate DOES guarantee is the converse: whatever is
 * detected never leaves the gate, and an artifact the gate cannot scan at
 * all never passes it (see `gate.ts`).
 *
 * Every detector reports the exact span to remove (`start`/`end`), which is
 * the secret VALUE only -- never the key name around it -- so a redacted
 * `spring.datasource.password=...` still tells extraction which setting
 * exists, just not its value.
 */

export const SECRET_KINDS = [
  'private-key',
  'aws-access-key-id',
  'github-token',
  'slack-token',
  'jwt',
  'url-credential',
  'assigned-secret',
  'email-address',
] as const;
export type SecretKind = (typeof SECRET_KINDS)[number];

/** One detected value: the half-open span `[start, end)` of `content` to remove. */
export interface Detection {
  readonly kind: SecretKind;
  readonly start: number;
  readonly end: number;
}

interface PatternDetector {
  readonly kind: SecretKind;
  readonly pattern: RegExp;
  /** Which capture group is the value to remove; 0 = the whole match. */
  readonly group?: number;
}

/*
 * P8 security hardening -- every pattern below runs in time LINEAR in the
 * content length: each repetition that can meet a near-miss is bounded
 * (`{0,64}`, `{1,256}`, ...), so a failed attempt at one position costs a
 * constant amount of work. Before this, unbounded repetitions retried at
 * every `.` of a dotted run made the gate quadratic or worse -- a 40 KB file
 * of `a.a.a.…` did not finish scanning in five minutes, so one crafted or
 * minified file stalled the whole pipeline instead of being scanned or
 * quarantined. The bounds sit far above any real key name, user name,
 * e-mail part or secret length.
 *
 * Every pattern carries the `d` flag: a value's span comes from the
 * engine's own group indices, never from searching the match text for it.
 */
const PATTERN_DETECTORS: readonly PatternDetector[] = [
  {
    kind: 'private-key',
    pattern:
      /-----BEGIN [A-Z0-9 ]{0,32}PRIVATE KEY-----[\s\S]{0,16384}?-----END [A-Z0-9 ]{0,32}PRIVATE KEY-----/dg,
  },
  { kind: 'aws-access-key-id', pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/dg },
  { kind: 'github-token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/dg },
  { kind: 'slack-token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,255}\b/dg },
  {
    kind: 'jwt',
    pattern: /\beyJ[A-Za-z0-9_-]{10,4096}\.[A-Za-z0-9_-]{10,4096}\.[A-Za-z0-9_-]{10,4096}\b/dg,
  },
  // `scheme://user:PASSWORD@host` -- only the password is removed.
  {
    kind: 'url-credential',
    pattern: /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s:/@'"]{1,256}:([^\s@'"/]{1,256})@/dgi,
    group: 1,
  },
  {
    kind: 'email-address',
    pattern:
      /\b[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9-]{1,63}(?:\.[A-Za-z0-9-]{1,63}){0,8}\.[A-Za-z]{2,24}\b/dg,
  },
];

/** Key names whose assigned value is treated as a secret. */
const SECRET_KEY = String.raw`[A-Za-z0-9_.-]{0,64}(?:password|passwd|pwd|secret|api[_-]?key|access[_-]?key|auth[_-]?token|access[_-]?token|client[_-]?secret|private[_-]?key|credentials?)`;

/** `key = "value"` / `"key": 'value'` -- a QUOTED literal, in any file type. */
const QUOTED_ASSIGNMENT = new RegExp(
  String.raw`(?:^|[^A-Za-z0-9_])["']?${SECRET_KEY}["']?[ \t]{0,16}[:=][ \t]{0,16}(["'])((?:(?!\1)[^\r\n\\]|\\.){0,4096})\1`,
  'dgim',
);

/** `key=value` / `key: value` to end of line -- UNQUOTED, only in config files, where it is a value (in code it is an expression). Ends at a `#` comment or the line end; trailing blanks are trimmed by `groupSpan`. */
const UNQUOTED_ASSIGNMENT = new RegExp(
  String.raw`^[ \t]{0,64}["']?${SECRET_KEY}["']?[ \t]{0,16}[:=][ \t]{0,16}([^\s"'#][^\r\n#]{0,4096})`,
  'dgim',
);

const CONFIG_FILE = /\.(?:properties|ya?ml|env|ini|conf|cfg|toml)$|(?:^|\/)\.env(?:\.[^/]*)?$/i;

/**
 * A value that names WHERE a secret comes from rather than being one:
 * `${DB_PASSWORD}`, `<your-key>`, `%(secret)s`, `{{ token }}`, or empty.
 * Redacting these would destroy configuration structure extraction needs
 * while protecting nothing.
 */
function isReference(value: string): boolean {
  const trimmed = value.trim();
  return (
    trimmed.length === 0 ||
    /^\$\{[^}]*\}$/.test(trimmed) ||
    /^\$[A-Z_][A-Z0-9_]*$/.test(trimmed) ||
    /^<[^>]*>$/.test(trimmed) ||
    /^\{\{[^}]*\}\}$/.test(trimmed) ||
    /^%\([^)]*\)s$/.test(trimmed)
  );
}

function groupSpan(
  match: RegExpExecArray,
  group: number,
): { start: number; end: number } | undefined {
  // P8: the engine's own group indices (`d` flag). This used to search the
  // match text for the value (`lastIndexOf`), so `password=abc # abc`
  // redacted the copy in the COMMENT and left the real secret in place.
  const indices = match.indices?.[group];
  if (indices === undefined) return undefined;
  const [start] = indices;
  let [, end] = indices;
  const text = match.input;
  while (end > start && (text[end - 1] === ' ' || text[end - 1] === '\t')) end--;
  return end > start ? { start, end } : undefined;
}

/**
 * Runs every detector over `content` and returns non-overlapping detections
 * in content order. When two detections overlap, the one that starts first
 * wins (ties: the longer), so a private key block containing something
 * email-shaped is removed once, as a private key.
 */
export function detectSecrets(content: string, path: string): Detection[] {
  const found: Detection[] = [];

  for (const detector of PATTERN_DETECTORS) {
    for (const match of content.matchAll(detector.pattern)) {
      if (detector.group === undefined) {
        found.push({ kind: detector.kind, start: match.index, end: match.index + match[0].length });
        continue;
      }
      const span = groupSpan(match as RegExpExecArray, detector.group);
      if (span !== undefined) found.push({ kind: detector.kind, ...span });
    }
  }

  for (const match of content.matchAll(QUOTED_ASSIGNMENT)) {
    const value = match[2] ?? '';
    if (isReference(value)) continue;
    const span = groupSpan(match as RegExpExecArray, 2);
    if (span !== undefined) found.push({ kind: 'assigned-secret', ...span });
  }

  if (CONFIG_FILE.test(path)) {
    for (const match of content.matchAll(UNQUOTED_ASSIGNMENT)) {
      const value = match[1] ?? '';
      if (isReference(value)) continue;
      const span = groupSpan(match as RegExpExecArray, 1);
      if (span !== undefined) found.push({ kind: 'assigned-secret', ...span });
    }
  }

  // At one start position a specific credential detector beats the generic
  // e-mail shape: `scheme://user:PASS@host` must lose exactly `PASS`, not
  // `PASS@host` (which the e-mail pattern also matches, and is longer).
  const rank = (d: Detection): number => (d.kind === 'email-address' ? 1 : 0);
  found.sort((a, b) => a.start - b.start || rank(a) - rank(b) || b.end - a.end);
  const kept: Detection[] = [];
  for (const detection of found) {
    const previous = kept[kept.length - 1];
    if (previous !== undefined && detection.start < previous.end) continue;
    kept.push(detection);
  }
  return kept;
}
