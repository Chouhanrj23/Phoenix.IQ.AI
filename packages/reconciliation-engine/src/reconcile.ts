/**
 * P6-05 -- the reconciliation algorithm itself: FR-REC-01/04/05 (FRD §3.6).
 * Groups `Claim`s by the real-world thing and attribute they describe, and
 * for each group either:
 *
 *  - **agrees** -- every claim asserts the same value: derive a structural
 *    confidence via `confidence-scoring.ts`'s `computeConfidence`
 *    (FR-REC-02), or
 *  - **conflicts** -- claims disagree: build a real
 *    `@phoenix-ai/knowledge-graph` `ConflictObject` that RETAINS every
 *    distinct position and every source behind it (FR-REC-04: "shall not
 *    silently resolve it"), each position carrying its OWN computed
 *    confidence (P6-06) and its OWN aggregated evidence (P6-08 --
 *    `evidence-aggregation.ts`'s `evidenceForClaims`), ranked for review
 *    (FR-REC-05).
 *
 * No claim comparison logic lives in `@phoenix-ai/knowledge-graph`'s
 * `reconciliation.ts` -- that file is the model only, exactly like every
 * other domain file; this is the algorithm layer on top of it, the same
 * split P6-04 established between `workitem.ts` (model) and
 * `jira-bridge.ts` (algorithm). See
 * `docs/architecture/adr/0029-p6-05-source-reconciliation.md`,
 * `docs/architecture/adr/0030-p6-06-confidence-calculation.md`, and
 * `docs/architecture/adr/0031-p6-08-evidence-aggregation.md`.
 */

import {
  CANONICAL_SCHEMA_VERSION,
  type ConflictObject,
  type ConflictPosition,
  type Evidence,
  type KnowledgeValue,
} from '@phoenix-ai/knowledge-graph';
import type { Confidence } from '@phoenix-ai/shared';
import { authorityOf, type Claim, type ClaimCategory } from './claim.js';
import { computeConfidence } from './confidence-scoring.js';
import { deterministicId } from './determinism.js';
import { evidenceForClaims } from './evidence-aggregation.js';
import { compareCodeUnits } from '@phoenix-ai/shared';

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
  /** Derived structurally from source-type authority + corroboration -- see `confidence-scoring.ts`'s `computeConfidence`. Never a model self-report (FR-REC-02). */
  confidence: Confidence;
  /** Every piece of supporting evidence across every agreeing claim, deduplicated by `Evidence.id` (P6-08 -- see `evidence-aggregation.ts`). */
  evidence: Evidence[];
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

/** Deterministic structural equality for a `KnowledgeValue`, independent of object-key order. */
function canonicalize(value: KnowledgeValue): KnowledgeValue {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    const sorted: Record<string, KnowledgeValue> = {};
    for (const [key, entry] of Object.entries(value).sort(([a], [b]) => compareCodeUnits(a, b))) {
      sorted[key] = canonicalize(entry);
    }
    return sorted;
  }
  return value;
}

function canonicalKey(value: KnowledgeValue): string {
  return JSON.stringify(canonicalize(value));
}

/**
 * The (subjectId, attribute, claimCategory) grouping key.
 *
 * JSON-encoded rather than space-joined: subject ids and attribute names are
 * free text and may themselves contain spaces, so a space-joined key let two
 * DIFFERENT groups collide -- subject "a b" / attribute "c" and subject "a" /
 * attribute "b c" were merged into one group and reported as a conflict
 * between unrelated facts (P8 hardening). Internal only: no id is derived
 * from this string.
 */
function groupKey(claim: Claim): string {
  return JSON.stringify([claim.subjectId, claim.attribute, claim.claimCategory]);
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

  // P6-08: the object's OWN evidence is the deduplicated union of every
  // claim in the group; each position's `evidenceIds` (built below) is
  // always a subset of these ids, since both are derived from the same
  // `evidenceForClaims` dedup logic over overlapping claim sets.
  const groupEvidence = evidenceForClaims(groupClaims);

  const positions: ConflictPosition[] = [...byValue.values()]
    .map((claimsForValue): ConflictPosition => {
      const [representative] = claimsForValue;
      if (representative === undefined) {
        throw new Error('unreachable: a grouped position has no claims');
      }

      // P6-06: this position's OWN confidence, weighed against every OTHER
      // position's sources as the contradicting evidence -- not just "a
      // conflict exists" (that lives on the object's own metadata.confidence,
      // see below), but "how well-supported is THIS specific value."
      const supportingSourceIds = new Set(claimsForValue.map((claim) => claim.sourceId));
      const supportingAuthority = claimsForValue.reduce<1 | 2 | 3>((max, claim) => {
        const authority = authorityOf(claim.claimCategory, claim.sourceType, claim.authority);
        return authority > max ? authority : max;
      }, 1);
      const contradictingSourceIds = new Set(
        groupClaims
          .filter((claim) => !supportingSourceIds.has(claim.sourceId))
          .map((claim) => claim.sourceId),
      );

      return {
        value: representative.value,
        sources: claimsForValue.map((claim) => ({
          sourceId: claim.sourceId,
          sourceType: claim.sourceType,
          authority: authorityOf(claim.claimCategory, claim.sourceType, claim.authority),
        })),
        confidence: computeConfidence({
          supportingAuthority,
          supportingSources: supportingSourceIds.size,
          contradictingSources: contradictingSourceIds.size,
        }),
        evidenceIds: evidenceForClaims(claimsForValue).map((entry) => entry.id),
      };
    })
    .sort((a, b) => {
      const aMax = Math.max(...a.sources.map((source) => source.authority));
      const bMax = Math.max(...b.sources.map((source) => source.authority));
      if (bMax !== aMax) return bMax - aMax;
      return compareCodeUnits(canonicalKey(a.value), canonicalKey(b.value));
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
    evidence: groupEvidence,
    confidenceDetail: { basis: 'observed' },
  };
}

/**
 * Two DIFFERENT subject/attribute groups produced the same conflict id.
 *
 * `deterministicId` joins its parts with a space, and that separator is part
 * of every conflict id already persisted -- changing it would change stable
 * ids (FR-KG-04), so it is left alone. Instead, the one case where the join
 * is ambiguous (free-text subject ids or attributes containing spaces that
 * happen to re-join identically) is detected here and refused loudly: two
 * distinct conflicts sharing one id would MERGE into a single graph node and
 * silently lose one dispute.
 */
export class ConflictIdCollisionError extends Error {
  readonly conflictId: string;
  constructor(
    conflictId: string,
    first: ConflictObject['attributes'],
    second: ConflictObject['attributes'],
  ) {
    super(
      `conflict id "${conflictId}" was produced by two different claim groups ` +
        `(${JSON.stringify([first.subjectId, first.attribute, first.claimCategory])} and ` +
        `${JSON.stringify([second.subjectId, second.attribute, second.claimCategory])}); ` +
        'refusing to merge two distinct disputes into one object',
    );
    this.name = 'ConflictIdCollisionError';
    this.conflictId = conflictId;
  }
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

    return compareCodeUnits(a.identity.id, b.identity.id);
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
  const conflictIds = new Map<string, ConflictObject['attributes']>();

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
        const authority = authorityOf(claim.claimCategory, claim.sourceType, claim.authority);
        return authority > max ? authority : max;
      }, 1);

      agreed.push({
        subjectId: representative.subjectId,
        attribute: representative.attribute,
        claimCategory: representative.claimCategory,
        value: representative.value,
        confidence: computeConfidence({
          supportingAuthority: maxAuthority,
          supportingSources: corroboration,
        }),
        evidence: evidenceForClaims(groupClaims),
        claims: groupClaims,
      });
      continue;
    }

    const conflict = buildConflictObject(groupClaims, byValue, options);
    const clash = conflictIds.get(conflict.identity.id);
    if (clash !== undefined) {
      throw new ConflictIdCollisionError(conflict.identity.id, clash, conflict.attributes);
    }
    conflictIds.set(conflict.identity.id, conflict.attributes);
    conflicts.push(conflict);
  }

  return { agreed, conflicts: rankConflicts(conflicts) };
}
