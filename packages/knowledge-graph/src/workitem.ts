/**
 * P6-04 -- the Work Item model: the fifth domain-specific `kind` vocabulary,
 * alongside P2-03's Architecture, P2-04's Domain/Entity, P2-05's
 * Persona/Journey/State, and P2-06's Integration/API models. Represents a
 * ticket-tracker issue (Jira today; any future tracker connector reuses this
 * without a schema change) as a domain-neutral canonical object, the same
 * way `architecture.ts` represents a repository's structure.
 *
 * This file defines the MODEL only, exactly as P2-03 did: no Jira client, no
 * HTTP, no fact-to-canonical mapping. `packages/extraction-engine`'s
 * `jira-bridge.ts` is what turns a real `RawArtifact` (from
 * `packages/ingestion-connectors`' Jira connector, P6-02) into a
 * `WorkItemObject`; see `docs/architecture/adr/0028-p6-04-jira-okf-mapping.md`.
 *
 * ONE object kind, `workitem.issue`, deliberately covers every tracker issue
 * type (Epic, Story, Task, Bug, Sub-task, or any custom type a project
 * configures) rather than one `kind` per type. A tracker's issue-type
 * taxonomy is project-configurable, not a fixed enum any connector can
 * observe once and trust forever -- the exact reasoning `RepositoryCoordinates
 * .revision`/`ArtifactContentHash.algorithm` are free text for (ADR 0009
 * decision 3). `attributes.issueType` carries the tracker's own type string
 * verbatim, so nothing observable is lost; a future ticket can specialize
 * `workitem.issue` by that attribute without any data migration, once real
 * cross-tracker data exists to justify a closed vocabulary. See ADR 0028
 * "Alternatives considered" for why the FRD's Epic/Feature/Story/
 * AcceptanceCriterion node types (`docs/ontology/README.md`) are not
 * formalized as separate kinds here.
 */

import type { CanonicalKnowledgeObject } from './canonical-object.js';
import type { CanonicalKnowledgeRelationship } from './relationships.js';
import type { KnowledgeValue } from './identity.js';
import {
  isNonEmptyString,
  isPlainObject,
  validateCanonicalKnowledgeObject,
  validateCanonicalKnowledgeRelationship,
  type ValidationResult,
} from './validation.js';

// ---------------------------------------------------------------------------
// Object kinds
// ---------------------------------------------------------------------------

export const WORKITEM_OBJECT_KINDS = ['workitem.issue'] as const;
export type WorkItemObjectKind = (typeof WORKITEM_OBJECT_KINDS)[number];

// ---------------------------------------------------------------------------
// Typed attribute bag
// ---------------------------------------------------------------------------

export interface WorkItemAttributes {
  [key: string]: KnowledgeValue;
  /** The tracker's own issue-type name, e.g. "Epic"/"Story"/"Bug"/"Task"/"Sub-task" -- free text, see the file header. */
  issueType: string;
  /** The tracker-reported workflow status AT CAPTURE TIME, e.g. "In Progress" -- a snapshot, not a history. See ADR 0028 "Limitations". */
  status: string;
  /** Free-text labels/tags the tracker records. Empty array, not omitted, when the issue has none. */
  labels: string[];
  priority?: string;
  /** Plain-text description (already rendered from any rich-text source format upstream, e.g. ADF). */
  description?: string;
  /**
   * When the tracker reports this issue was created/last updated -- DISTINCT
   * from `identity.createdAt`/`identity.updatedAt`, which answer "when did
   * PHOENIX first capture / last re-capture this object", not "when did the
   * real-world issue change". Conflating the two would misrepresent a
   * five-year-old ticket re-scanned today as having just been created.
   */
  reportedCreatedAt?: string;
  reportedUpdatedAt?: string;
}

// ---------------------------------------------------------------------------
// Typed object
// ---------------------------------------------------------------------------

export interface WorkItemObject extends CanonicalKnowledgeObject<WorkItemAttributes> {
  category: 'entity';
  kind: 'workitem.issue';
}

// ---------------------------------------------------------------------------
// Relationship kinds
// ---------------------------------------------------------------------------

/**
 * Both kinds are REUSED from `domain.ts`, not newly minted -- `kind` strings
 * are scoped by which two object kinds they connect, not globally
 * namespaced (already true of `contains`, shared by `architecture.ts`,
 * `domain.ts`, and `journey.ts`).
 *
 * - `contains` -- a parent/child issue link (a Sub-task's parent, or an
 *   Epic-managed child in a team-managed project -- the tracker's own
 *   `fields.parent`, whichever of the two it is; see ADR 0028 decision 3 for
 *   why this connector cannot reliably tell them apart, and why it does not
 *   need to). Category `composition`, per `ontology.ts`'s directionality
 *   convention: `sourceObjectId` is the PARENT, `targetObjectId` the CHILD.
 * - `relatesTo` -- any tracker issue-link (blocks, is blocked by, relates
 *   to, duplicates, clones, or a project's own custom link type). Category
 *   `association`: a loose reference, no ownership implied. The tracker's
 *   own link-type name and direction are preserved verbatim in
 *   `attributes.linkType`/`attributes.direction` rather than encoded into
 *   `kind` -- a project can define its own link types, the same
 *   configurability argument as `WorkItemAttributes.issueType`.
 */
export const WORKITEM_RELATIONSHIP_KINDS = ['contains', 'relatesTo'] as const;
export type WorkItemRelationshipKind = (typeof WORKITEM_RELATIONSHIP_KINDS)[number];

const WORKITEM_RELATIONSHIP_CATEGORY: Record<
  WorkItemRelationshipKind,
  'composition' | 'association'
> = {
  contains: 'composition',
  relatesTo: 'association',
};

export interface WorkItemRelationship extends CanonicalKnowledgeRelationship {
  kind: WorkItemRelationshipKind;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** Validates a Work Item object: identity + category "entity" + kind "workitem.issue" + required attributes. */
export function validateWorkItemObject(candidate: unknown): ValidationResult {
  const base = validateCanonicalKnowledgeObject(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    if (candidate.category !== 'entity') {
      errors.push('category must be "entity" for a work item object');
    }
    if (candidate.kind !== 'workitem.issue') {
      errors.push('kind must be "workitem.issue"');
    }
    if (isPlainObject(candidate.attributes)) {
      if (!isNonEmptyString(candidate.attributes.issueType)) {
        errors.push('attributes.issueType is required');
      }
      if (!isNonEmptyString(candidate.attributes.status)) {
        errors.push('attributes.status is required');
      }
      if (!Array.isArray(candidate.attributes.labels)) {
        errors.push('attributes.labels must be an array (may be empty)');
      } else if (!candidate.attributes.labels.every((label) => typeof label === 'string')) {
        errors.push('attributes.labels entries must all be strings');
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Validates a Work Item relationship: kind is `contains`/`relatesTo` and category matches. */
export function validateWorkItemRelationship(candidate: unknown): ValidationResult {
  const base = validateCanonicalKnowledgeRelationship(candidate);
  const errors = [...base.errors];

  if (isPlainObject(candidate)) {
    const kind = candidate.kind;
    if (
      typeof kind !== 'string' ||
      !WORKITEM_RELATIONSHIP_KINDS.includes(kind as WorkItemRelationshipKind)
    ) {
      errors.push(`kind must be one of: ${WORKITEM_RELATIONSHIP_KINDS.join(', ')}`);
    } else {
      const expectedCategory = WORKITEM_RELATIONSHIP_CATEGORY[kind as WorkItemRelationshipKind];
      if (candidate.category !== expectedCategory) {
        errors.push(`category must be "${expectedCategory}" for relationship kind "${kind}"`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
