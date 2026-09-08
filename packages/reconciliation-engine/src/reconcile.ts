/**
 * P6-05 -- the reconciliation algorithm itself: FR-REC-01/04/05 (FRD §3.6).
 * Groups `Claim`s by the real-world thing and attribute they describe, and
 * for each group either:
 *
 *  - **agrees** -- every claim asserts the same value: derive a structural
 *    confidence via a small private `confidenceFor` helper (FR-REC-02), or
 *  - **conflicts** -- claims disagree: build a real
 *    `@phoenix-ai/knowledge-graph` `ConflictObject` that RETAINS every
 *    distinct position and every source behind it (FR-REC-04: "shall not
 *    silently resolve it"), ranked for review (FR-REC-05).
 *
 * No claim comparison logic lives in `@phoenix-ai/knowledge-graph`'s
 * `reconciliation.ts` -- that file is the model only, exactly like every
 * other domain file; this is the algorithm layer on top of it, the same
 * split P6-04 established between `workitem.ts` (model) and
 * `jira-bridge.ts` (algorithm). See
 * `docs/architecture/adr/0029-p6-05-source-reconciliation.md`.
 */

import {
  CANONICAL_SCHEMA_VERSION,
  type ConflictObject,
  type ConflictPosition,
  type KnowledgeValue,
} from '@phoenix-ai/knowledge-graph';
import type { Confidence, ConfidenceLevel } from '@phoenix-ai/shared';
import { authorityOf, type Claim, type ClaimCategory } from './claim.js';
import { deterministicId } from './determinism.js';

export interface ReconciliationOptions {
  systemId: string;
  /** ISO-8601 -- stamped as `ConflictObject.identity.createdAt`/`updatedAt` and `Provenance.derivedAt`. */
  generatedAt: string;
}

/** One subject/attribute where every claim agreed on the same value. */
export interface ReconciledClaim {
  subjectId: string;
  attribute: string;
  claimCategory: ClaimCategory;
  value: KnowledgeValue;
  /** Derived structurally from source-type authority + corroboration -- see `confidenceFor`. Never a model self-report (FR-REC-02). */
  confidence: Confidence;
  /** Every claim that agreed, for traceability. */
  claims: readonly Claim[];
}

export interface ReconciliationResult {
  /** Subject/attribute groups where every source agreed. */
  agreed: ReconciledClaim[];
  /**
   * One `ConflictObject` per subject/attribute group where sources
   * disagreed, ranked most-in-need-of-review first (FR-REC-05, see
   * `rankConflicts`). Each is already a valid `CanonicalKnowledgeObject`
   * (`category: 'observation'`) -- no separate OKF-wrap step is needed,
   * unlike `jira-bridge.ts`/`okf-mapping.ts`: concatenate this array
   * directly into a bundle's `objects`.
   */
  conflicts: ConflictObject[];
}

/**
 * Derives a `Confidence` purely from the strongest supporting source
 * authority and how many independent sources corroborate it -- never a
 * model self-report (FR-REC-02). Only ever runs on the all-agree case:
 *  - `high`   an authoritative source (authority 3), corroborated by at
 *             least one other independent source.
 *  - `medium` an authoritative source alone, OR a moderately-authoritative
 *             source (authority 2) corroborated by another.
 *  - `low`    everything else.
 */
function confidenceFor(maxAuthority: 1 | 2 | 3, corroboration: number): Confidence {
  const corroborated = corroboration >= 2;
  const level: ConfidenceLevel =
    maxAuthority === 3 && corroborated
      ? 'high'
      : maxAuthority === 3 || (maxAuthority === 2 && corroborated)
        ? 'medium'
        : 'low';

  const base = maxAuthority / 3;
  const corroborationBonus = Math.min(0.15, Math.max(0, corroboration - 1) * 0.05);
  const score = Math.round(Math.max(0, Math.min(1, base + corroborationBonus)) * 100) / 100;

  return { level, score };
}

/** Deterministic structural equality for a `KnowledgeValue`, independent of object-key order. */
function canonicalize(value: KnowledgeValue): KnowledgeValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, KnowledgeValue> = {};
    for (const [key, entry] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
      sorted[key] = canonicalize(entry);
    }
    return sorted;
  }
  return value;
}

function canonicalKey(value: KnowledgeValue): string {
  return JSON.stringify(canonicalize(value));
}

function groupKey(claim: Claim): string {
  return `${claim.subjectId} ${claim.attribute} ${claim.claimCategory}`;
}

function buildConflictObject(
  groupClaims: readonly Claim[],
  byValue: ReadonlyMap<string, Claim[]>,
  options: ReconciliationOptions,
): ConflictObject {
  const [first] = groupClaims;
  if (first === undefined) {
    throw new Error('buildConflictObject requires at least one claim');
  }
  const { subjectId, attribute, claimCategory } = first;

  const positions: ConflictPosition[] = [...byValue.values()]
    .map((claimsForValue): ConflictPosition => {
      const [representative] = claimsForValue;
      if (representative === undefined) {
        throw new Error('unreachable: a grouped position has no claims');
      }

      return {
        value: representative.value,
        sources: claimsForValue.map((claim) => ({
          sourceId: claim.sourceId,
          sourceType: claim.sourceType,
          authority: authorityOf(claim.claimCategory, claim.sourceType),
        })),
      };
    })
    .sort((a, b) => {
      const aMax = Math.max(...a.sources.map((source) => source.authority));
      const bMax = Math.max(...b.sources.map((source) => source.authority));
      if (bMax !== aMax) return bMax - aMax;
      return canonicalKey(a.value).localeCompare(canonicalKey(b.value));
    });

  const seenSourceIds = new Set<string>();
  const provenance = groupClaims
    .filter((claim) => {
      if (seenSourceIds.has(claim.sourceId)) return false;
      seenSourceIds.add(claim.sourceId);
      return true;
    })
    .map((claim) => ({
      sourceId: claim.sourceId,
      sourceType: claim.sourceType,
      derivedBy: claim.derivedBy,
      derivedAt: claim.derivedAt,
    }));

  return {
    identity: {
      id: deterministicId('conflict', options.systemId, subjectId, attribute, claimCategory),
      systemId: options.systemId,
      createdAt: options.generatedAt,
      updatedAt: options.generatedAt,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'observation',
    kind: 'reconciliation.conflict',
    label: `Conflicting claims for "${attribute}" of ${subjectId}`,
    attributes: { subjectId, attribute, claimCategory, positions },
    metadata: {
      provenance,
      // High confidence THAT a conflict exists (that is a directly observed
      // fact once two distinct values are seen) -- not a claim about WHICH
      // position is correct, which this object deliberately never asserts.
      confidence: { level: 'high' },
    },
    evidence: groupClaims.flatMap((claim) => claim.evidence),
    confidenceDetail: { basis: 'observed' },
  };
}

/**
 * FR-REC-05: "Conflicts shall be exposed in outputs and prioritised for
 * review." Ranks by how many distinct positions are in dispute (more
 * positions = more disagreement to resolve), then by how many sources are
 * involved in total, then a deterministic id tiebreak.
 */
export function rankConflicts(conflicts: readonly ConflictObject[]): ConflictObject[] {
  return [...conflicts].sort((a, b) => {
    const positionDiff = b.attributes.positions.length - a.attributes.positions.length;
    if (positionDiff !== 0) return positionDiff;

    const sourceCount = (object: ConflictObject): number =>
      object.attributes.positions.reduce((total, position) => total + position.sources.length, 0);
    const sourceDiff = sourceCount(b) - sourceCount(a);
    if (sourceDiff !== 0) return sourceDiff;

    return a.identity.id.localeCompare(b.identity.id);
  });
}

/**
 * Reconciles a set of claims: groups them by (subjectId, attribute,
 * claimCategory), and resolves each group into either an agreed
 * `ReconciledClaim` or a retained-both-positions `ConflictObject`.
 */
export function reconcileClaims(
  claims: readonly Claim[],
  options: ReconciliationOptions,
): ReconciliationResult {
  const groups = new Map<string, Claim[]>();
  for (const claim of claims) {
    const key = groupKey(claim);
    const existing = groups.get(key);
    if (existing === undefined) groups.set(key, [claim]);
    else existing.push(claim);
  }

  const agreed: ReconciledClaim[] = [];
  const conflicts: ConflictObject[] = [];

  for (const groupClaims of groups.values()) {
    const byValue = new Map<string, Claim[]>();
    for (const claim of groupClaims) {
      const key = canonicalKey(claim.value);
      const existing = byValue.get(key);
      if (existing === undefined) byValue.set(key, [claim]);
      else existing.push(claim);
    }

    if (byValue.size === 1) {
      const [representative] = groupClaims;
      if (representative === undefined) continue;
      const corroboration = new Set(groupClaims.map((claim) => claim.sourceId)).size;
      const maxAuthority = groupClaims.reduce<1 | 2 | 3>((max, claim) => {
        const authority = authorityOf(claim.claimCategory, claim.sourceType);
        return authority > max ? authority : max;
      }, 1);

      agreed.push({
        subjectId: representative.subjectId,
        attribute: representative.attribute,
        claimCategory: representative.claimCategory,
        value: representative.value,
        confidence: confidenceFor(maxAuthority, corroboration),
        claims: groupClaims,
      });
      continue;
    }

    conflicts.push(buildConflictObject(groupClaims, byValue, options));
  }

  return { agreed, conflicts: rankConflicts(conflicts) };
}
