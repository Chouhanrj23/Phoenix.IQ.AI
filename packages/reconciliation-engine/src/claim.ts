/**
 * P6-05 -- a Claim: one source's assertion about one attribute of one
 * real-world subject, the atomic unit this package compares. The FRD's own
 * pipeline description (§2.1) calls this shape out directly: "Extraction
 * agents... emit structured claims only."
 *
 * Deliberately NOT tied to any one connector or bridge -- FR-REC-01
 * ("weight sources by type") and the module's whole remit ("merges signals
 * ACROSS SOURCES", FRD §3.6) only make sense generically. `claimFromObject`
 * extracts one from ANY already-bridged `CanonicalKnowledgeObject` -- a Jira
 * `WorkItemObject` (`@phoenix-ai/extraction-engine`'s `jira-bridge.ts`), a
 * Java-bridged `EntityObject`/`ApiObject`, or anything future -- reusing its
 * own provenance/evidence rather than re-deriving them.
 *
 * Correlating WHICH claims from different sources describe "the same
 * real-world thing" (`subjectId`) is deliberately the CALLER's job, not this
 * package's: cross-source entity resolution is a distinct, much harder
 * problem this ticket does not attempt to solve. See
 * `docs/architecture/adr/0029-p6-05-source-reconciliation.md` decision 1.
 */

import type { SourceType } from '@phoenix-ai/shared';
import type {
  CanonicalKnowledgeObject,
  Evidence,
  KnowledgeValue,
} from '@phoenix-ai/knowledge-graph';

/**
 * FR-REC-01's four claim categories. Source-type authority
 * (`SOURCE_TYPE_AUTHORITY` below) depends on BOTH the source and what KIND
 * of claim is being made: code is authoritative for structure, but not
 * necessarily for intent -- the same source can be strong evidence for one
 * category and weak evidence for another.
 */
export const CLAIM_CATEGORIES = ['structure', 'behaviour', 'deployment', 'intent'] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

/** One source's assertion about one attribute of one subject. */
export interface Claim {
  /** Caller-supplied correlation key identifying the real-world thing this claim is about -- see the file header. */
  subjectId: string;
  /** Which attribute of that subject is being claimed, e.g. "status". */
  attribute: string;
  value: KnowledgeValue;
  claimCategory: ClaimCategory;
  /** `Provenance.sourceId`/`Source.id` -- the same join key the rest of the pipeline uses. */
  sourceId: string;
  sourceType: SourceType;
  derivedBy: string;
  /** ISO-8601 -- when the claim was derived (distinct from `Evidence.capturedAt`, which is per-excerpt). */
  derivedAt: string;
  /** Concrete supporting material, carried through unmodified from wherever this claim came from. */
  evidence: Evidence[];
}

/**
 * FR-REC-01's source-type authority table: for each claim category, how
 * authoritative each `SourceType` is. A deliberately coarse 1 (weak/
 * incidental) to 3 (authoritative) scale -- not invented decimal weights,
 * which would read as false precision the FRD never specified. Every
 * `SourceType` is scored for every category (`Record<SourceType, 1|2|3>`,
 * compiler-enforced completeness) so a claim never falls through with no
 * defined authority.
 *
 * One disclosed gap: no `SourceType` value maps cleanly to "config/IaC",
 * which FR-REC-01 names as authoritative for `deployment` claims.
 * `technical-doc` is used as the closest available proxy there -- see
 * ADR 0029 "Limitations".
 */
export const SOURCE_TYPE_AUTHORITY: Record<ClaimCategory, Record<SourceType, 1 | 2 | 3>> = {
  structure: {
    'source-code': 3,
    'data-model': 3,
    test: 2,
    'technical-doc': 2,
    'business-doc': 1,
    ticket: 1,
    log: 1,
    recording: 1,
    other: 1,
  },
  behaviour: {
    log: 3,
    recording: 3,
    test: 2,
    'source-code': 2,
    'technical-doc': 1,
    'business-doc': 1,
    ticket: 1,
    'data-model': 1,
    other: 1,
  },
  deployment: {
    // "config/IaC" has no dedicated SourceType yet -- technical-doc is the
    // closest available proxy. See the doc comment above.
    'technical-doc': 3,
    'data-model': 2,
    'source-code': 2,
    'business-doc': 1,
    ticket: 1,
    log: 1,
    test: 1,
    recording: 1,
    other: 1,
  },
  intent: {
    ticket: 3,
    'business-doc': 3,
    'technical-doc': 2,
    'source-code': 1,
    'data-model': 1,
    log: 1,
    test: 1,
    recording: 1,
    other: 1,
  },
};

/** Looks up a source's authority for a claim category -- FR-REC-01. */
export function authorityOf(claimCategory: ClaimCategory, sourceType: SourceType): 1 | 2 | 3 {
  return SOURCE_TYPE_AUTHORITY[claimCategory][sourceType];
}

/**
 * Extracts one `Claim` from an already-bridged canonical object's own
 * attribute, provenance, and evidence. Returns `undefined` -- never throws
 * -- when the object has no such attribute or (structurally impossible for
 * a valid object, but not assumed here) no provenance entry to derive
 * `sourceId`/`sourceType`/`derivedBy`/`derivedAt` from.
 *
 * Uses the object's FIRST provenance entry. An object bridged by exactly one
 * source (true of every bridge in this codebase today -- `bridgeSpringController`,
 * `bridgeJiraArtifacts`, ...) has exactly one, so this is not a narrowing in
 * practice; an object that later carries multiple provenance entries would
 * need its own explicit claim per contributing source, which is the
 * caller's call to make, not this function's to guess.
 */
export function claimFromObject(
  object: CanonicalKnowledgeObject,
  attribute: string,
  claimCategory: ClaimCategory,
  subjectId: string,
): Claim | undefined {
  const value = object.attributes[attribute];
  if (value === undefined) return undefined;

  const provenance = object.metadata.provenance[0];
  if (provenance === undefined) return undefined;

  return {
    subjectId,
    attribute,
    value,
    claimCategory,
    sourceId: provenance.sourceId,
    sourceType: provenance.sourceType,
    derivedBy: provenance.derivedBy,
    derivedAt: provenance.derivedAt,
    evidence: object.evidence,
  };
}
