/**
 * P8 -- the redaction gate: FR-SEC-01/02/04 (FRD §3.2), between ingestion
 * and every downstream stage.
 *
 *  - FR-SEC-01: every artifact's content is scanned (`detectors.ts`).
 *  - FR-SEC-02: each detected value is replaced IN PLACE by a stable
 *    reference token. Line structure is preserved -- a multi-line value (a
 *    private key block) is replaced by the token followed by the same number
 *    of line breaks -- so every downstream file:line reference (FR-DET-08)
 *    still points at the right line.
 *  - FR-SEC-03: the removed value goes only into the encrypted vault.
 *  - FR-SEC-04: an artifact that cannot be scanned is QUARANTINED, never
 *    passed through; every passed artifact carries a gate stamp, and
 *    `assertRedactionGatePassed` lets any later stage refuse unstamped input.
 *
 * Tokens are content-free and deterministic: derived from the artifact's
 * source, path, the detection's ordinal and kind -- never from the value
 * itself (hashing a short password would make it brute-forceable). The same
 * input therefore yields byte-identical redacted output (FR-DET-07/BR-13).
 */

import { createHash } from 'node:crypto';
import type { RawArtifact } from '@phoenix-ai/ingestion-connectors';
import { detectSecrets, type SecretKind } from './detectors.js';
import { createRedactionVault, type RedactionVault } from './vault.js';

/** `attributes` key stamped onto every artifact that passed the gate. */
export const REDACTION_GATE_ATTRIBUTE = 'redactionGate';
export const REDACTION_GATE_VERSION = 'phoenix-redaction/1';

export type QuarantineReason =
  /** Binary (base64) content: there is no text to scan, so it cannot be shown to be clean. */
  | 'binary-content-not-scannable'
  /** Text containing NUL characters -- binary content mislabelled as text. */
  | 'content-not-text'
  /** The scanner itself failed on this artifact. */
  | 'scan-error';

export interface QuarantinedArtifact {
  readonly sourceId: string;
  readonly path: string;
  readonly locator: string;
  readonly reason: QuarantineReason;
  readonly detail: string;
}

export interface RedactionGateResult {
  /** Artifacts that passed, with detected values replaced. Safe for every downstream stage. */
  readonly passed: RawArtifact[];
  /** Artifacts halted at the gate -- reported, never passed downstream. */
  readonly quarantined: QuarantinedArtifact[];
  /** Where values were removed -- locations only, no secret material. */
  readonly findings: readonly RedactionFinding[];
  readonly vault: RedactionVault;
}

export interface RedactionFinding {
  readonly token: string;
  readonly kind: SecretKind;
  readonly sourceId: string;
  readonly path: string;
  readonly line: number;
}

/** Raised when a stage receives an artifact that did not pass the gate (FR-SEC-04). */
export class RedactionGateBypassError extends Error {
  readonly paths: readonly string[];
  constructor(paths: readonly string[]) {
    super(
      `${paths.length} artifact(s) reached a downstream stage without passing the redaction gate: ${paths.join(', ')}`,
    );
    this.name = 'RedactionGateBypassError';
    this.paths = paths;
  }
}

function tokenFor(
  artifact: { sourceId: string; path: string },
  ordinal: number,
  kind: SecretKind,
): string {
  const digest = createHash('sha256')
    .update([artifact.sourceId, artifact.path, String(ordinal), kind].join('\u0000'), 'utf8')
    .digest('hex')
    .slice(0, 12);
  return `[REDACTED:${kind}:${digest}]`;
}

/** Line feeds in `content[from, to)`. */
function countLineFeeds(content: string, from: number, to: number): number {
  let count = 0;
  for (let i = from; i < to; i++) if (content.charCodeAt(i) === 10) count++;
  return count;
}

function quarantine(
  artifact: RawArtifact,
  reason: QuarantineReason,
  detail: string,
): QuarantinedArtifact {
  return {
    sourceId: artifact.sourceId,
    path: artifact.path,
    locator: artifact.locator,
    reason,
    detail,
  };
}

/**
 * Runs the gate over a batch of artifacts. Pure apart from the vault it
 * fills (pass one in to accumulate across batches; a fresh one is created
 * otherwise).
 */
export function redactArtifacts(
  artifacts: readonly RawArtifact[],
  options: { vault?: RedactionVault } = {},
): RedactionGateResult {
  const vault = options.vault ?? createRedactionVault();
  const passed: RawArtifact[] = [];
  const quarantined: QuarantinedArtifact[] = [];
  const findings: RedactionFinding[] = [];

  for (const artifact of artifacts) {
    if (artifact.contentEncoding !== 'utf-8') {
      quarantined.push(
        quarantine(
          artifact,
          'binary-content-not-scannable',
          `content is ${artifact.contentEncoding}-encoded; the gate scans text only, so it cannot show this artifact is free of secrets`,
        ),
      );
      continue;
    }
    if (artifact.content.includes('\u0000')) {
      quarantined.push(quarantine(artifact, 'content-not-text', 'content contains NUL characters'));
      continue;
    }

    let result: { text: string; findings: RedactionFinding[] };
    try {
      result = redactText(artifact.content, artifact, vault);
    } catch (error) {
      quarantined.push(
        quarantine(artifact, 'scan-error', error instanceof Error ? error.message : String(error)),
      );
      continue;
    }
    findings.push(...result.findings);
    const detections = result.findings;
    const redacted = result.text;

    passed.push({
      ...artifact,
      content: redacted,
      // `contentHash` deliberately still describes the ORIGINAL content: it is
      // the record of what was read (FR-ING-03). The stamp below says the
      // carried content is the gate's redacted rendering of it.
      attributes: {
        ...(artifact.attributes ?? {}),
        [REDACTION_GATE_ATTRIBUTE]: {
          version: REDACTION_GATE_VERSION,
          redactedValues: detections.length,
          kinds: [...new Set(detections.map((d) => d.kind))].sort(),
        },
      },
    });
  }

  return { passed, quarantined, findings, vault };
}

/**
 * The gate's per-text step: detect, replace each value in place with its
 * stable token, and seal the original in `vault`. `location` names where the
 * text came from; it seeds the tokens and is what findings report.
 *
 * Exported (P8) so text that reaches the pipeline WITHOUT being an artifact
 * -- claims another source supplies for reconciliation -- passes through
 * exactly the same control instead of around it.
 */
export function redactText(
  text: string,
  location: { sourceId: string; path: string },
  vault: RedactionVault,
): { text: string; findings: RedactionFinding[] } {
  const findings: RedactionFinding[] = [];
  let redacted = '';
  let cursor = 0;
  // P8: line numbers are counted incrementally. Detections arrive in content
  // order, so each one only scans the text since the previous one. Counting
  // from the start for every detection made a file with many findings
  // quadratic: 20,000 e-mail addresses in a 680 KB file took ~11 s.
  let line = 1;
  let lineScannedTo = 0;
  detectSecrets(text, location.path).forEach((detection, ordinal) => {
    const value = text.slice(detection.start, detection.end);
    const token = tokenFor(location, ordinal, detection.kind);
    line += countLineFeeds(text, lineScannedTo, detection.start);
    lineScannedTo = detection.start;
    vault.put({ token, sourceId: location.sourceId, path: location.path, line }, value);
    findings.push({
      token,
      kind: detection.kind,
      sourceId: location.sourceId,
      path: location.path,
      line,
    });
    const lineBreaks = value.match(/\r\n|\n|\r/g) ?? [];
    redacted += text.slice(cursor, detection.start) + token + lineBreaks.join('');
    cursor = detection.end;
  });
  return { text: redacted + text.slice(cursor), findings };
}

/** Whether an artifact carries the gate's stamp. */
export function hasPassedRedactionGate(artifact: RawArtifact): boolean {
  const stamp = artifact.attributes?.[REDACTION_GATE_ATTRIBUTE];
  return (
    typeof stamp === 'object' &&
    stamp !== null &&
    !Array.isArray(stamp) &&
    (stamp as Record<string, unknown>).version === REDACTION_GATE_VERSION
  );
}

/** FR-SEC-04 enforcement point: throws unless EVERY artifact passed the gate. */
export function assertRedactionGatePassed(artifacts: readonly RawArtifact[]): void {
  const unstamped = artifacts.filter((a) => !hasPassedRedactionGate(a)).map((a) => a.path);
  if (unstamped.length > 0) throw new RedactionGateBypassError(unstamped);
}
