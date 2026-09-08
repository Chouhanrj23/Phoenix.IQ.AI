/**
 * P6-06 -- confidence calculation, FR-REC-02 (FRD §3.6): "Confidence shall
 * be derived structurally from source agreement, source-type weight, and
 * cross-signal corroboration -- not from model self-report."
 *
 * Extracted into its own dedicated, directly-testable, exported module and
 * GENERALIZED beyond P6-05's original private `confidenceFor` helper, which
 * only ever ran on the all-agree case: it had no notion of "source
 * agreement" as a matter of DEGREE, because it was only ever called once a
 * whole subject/attribute group had already been confirmed unanimous. That
 * left every `ConflictObject` position with no confidence of its own at
 * all -- exactly backwards, since a disputed position is precisely where
 * "how much do the sources agree" should matter most. `computeConfidence`
 * fixes that: it takes explicit supporting-vs-contradicting source counts,
 * so it produces the SAME result P6-05 already shipped and tested when
 * there is no contradiction (`contradictingSources` omitted or `0`), and a
 * new, genuinely differentiated result when there is one -- see
 * `reconcile.ts`'s `buildConflictObject`, which now calls this for every
 * retained position, not just the agreed case.
 */

import type { ConfidenceLevel } from '@phoenix-ai/shared';
import type { KnowledgeValue } from '@phoenix-ai/knowledge-graph';

/**
 * `score` is declared required here, unlike `@phoenix-ai/shared`'s
 * `Confidence.score?: number` -- `computeConfidence` always calculates one,
 * so callers get a definite `number`, not `number | undefined`. Still
 * assignable wherever a `Confidence` (optional `score`) is expected -- a
 * required field is always assignable into an optional one. Carries its own
 * `[key: string]: KnowledgeValue` index signature so a caller can also
 * assign it directly into `ConflictPosition.confidence`
 * (`@phoenix-ai/knowledge-graph`'s `ConflictPositionConfidence`), which --
 * being nested inside a `KnowledgeValue`-indexed attribute bag -- requires
 * its source type to declare one too.
 */
export interface ComputedConfidence {
  [key: string]: KnowledgeValue;
  level: ConfidenceLevel;
  score: number;
}

export interface ConfidenceInputs {
  /** The strongest `authorityOf` score (1-3) among the sources supporting this value. */
  supportingAuthority: 1 | 2 | 3;
  /** How many INDEPENDENT sources (distinct `sourceId`s) support this value. At least 1. */
  supportingSources: number;
  /**
   * How many independent sources assert a DIFFERENT value for the same
   * subject/attribute. Defaults to 0 -- the plain agreement case, with no
   * live dispute at all.
   */
  contradictingSources?: number;
}

/**
 * Derives a `Confidence` purely from the three FR-REC-02 inputs -- never a
 * model call, never a self-reported number. The whole function IS the
 * specification; read it top to bottom rather than trusting a summary.
 *
 * **Uncontested** (`contradictingSources` 0): the original three-tier rule
 * P6-05 shipped, unchanged --
 *  - `high`   an authoritative source (authority 3), corroborated by at
 *             least one other independent source.
 *  - `medium` an authoritative source alone, OR a moderately-authoritative
 *             source (authority 2) corroborated by another.
 *  - `low`    everything else.
 *
 * **Contested** (`contradictingSources` > 0): the base tier above is then
 * capped, because a position with a live, unresolved contradiction should
 * never read as settled fact:
 *  - `high` is always capped to `medium` -- disputed is disputed, however
 *    authoritative the supporting side is.
 *  - `medium` is further capped to `low` only when this position is
 *    OUTNUMBERED (`contradictingSources > supportingSources`), not merely
 *    contradicted -- a genuine tie or a clear majority keeps its `medium`,
 *    so the stronger side of a dispute is still visibly stronger than the
 *    weaker one, rather than both collapsing to the same floor.
 *
 * `score` (0-1) is a plain, transparent function of the same inputs: a base
 * proportional to authority, a small corroboration bonus (capped at 0.15),
 * and -- only when contested -- a penalty proportional to how much of the
 * total evidence contradicts this position.
 */
export function computeConfidence(inputs: ConfidenceInputs): ComputedConfidence {
  const { supportingAuthority, supportingSources, contradictingSources = 0 } = inputs;
  if (supportingSources < 1) {
    throw new Error('computeConfidence requires at least one supporting source');
  }

  const corroborated = supportingSources >= 2;
  let level: ConfidenceLevel =
    supportingAuthority === 3 && corroborated
      ? 'high'
      : supportingAuthority === 3 || (supportingAuthority === 2 && corroborated)
        ? 'medium'
        : 'low';

  const contested = contradictingSources > 0;
  if (contested) {
    if (level === 'high') level = 'medium';
    if (level === 'medium' && contradictingSources > supportingSources) level = 'low';
  }

  const base = supportingAuthority / 3;
  const corroborationBonus = Math.min(0.15, Math.max(0, supportingSources - 1) * 0.05);
  const total = supportingSources + contradictingSources;
  const agreementRatio = contested ? supportingSources / total : 1;
  const disagreementPenalty = contested ? (1 - agreementRatio) * 0.5 : 0;
  const score =
    Math.round(Math.max(0, Math.min(1, base + corroborationBonus - disagreementPenalty)) * 100) /
    100;

  return { level, score };
}
