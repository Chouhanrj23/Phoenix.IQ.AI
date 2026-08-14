/**
 * API/data contracts for the Phase 1 functional areas (System Summary,
 * Architecture, Domain Model, Integrations, Deployment/NFR, Review/Gaps/Drift).
 *
 * These are the response shapes `@phoenix-ai/api` serves and `@phoenix-ai/web`
 * consumes (via `OkfDataProvider`, see apps/web/src/data/types.ts) — kept here
 * so both apps type-check against the same definitions instead of drifting.
 */

import type { GraphElementMetadata } from './provenance.js';

// ---------------------------------------------------------------------------
// System summary
// ---------------------------------------------------------------------------

export interface SystemSummary {
  id: string;
  name: string;
  description: string;
  tags: string[];
  lastAnalyzedAt: string;
  coverageScore: number; // 0-1
  totalElements: number;
  pendingReviewCount: number;
  driftAlertCount: number;
}

// ---------------------------------------------------------------------------
// Architecture (C4)
// ---------------------------------------------------------------------------

export type C4Level = 'context' | 'container' | 'component';

export interface C4Node {
  id: string;
  level: C4Level;
  parentId?: string;
  name: string;
  description: string;
  technology?: string;
  metadata: GraphElementMetadata;
}

export interface C4Edge {
  id: string;
  source: string;
  target: string;
  label: string;
  level: C4Level;
  metadata: GraphElementMetadata;
}

// ---------------------------------------------------------------------------
// Domain model
// ---------------------------------------------------------------------------

export interface Aggregate {
  id: string;
  name: string;
  entities: string[];
  metadata: GraphElementMetadata;
}

export interface Domain {
  id: string;
  name: string;
  description: string;
  aggregates: Aggregate[];
  metadata: GraphElementMetadata;
}

// ---------------------------------------------------------------------------
// Integrations & data flows
// ---------------------------------------------------------------------------

export type IntegrationDirection = 'outbound' | 'inbound' | 'bidirectional';

export interface Integration {
  id: string;
  name: string;
  counterpart: string;
  direction: IntegrationDirection;
  protocol: string;
  dataExchanged: string;
  metadata: GraphElementMetadata;
}

// ---------------------------------------------------------------------------
// Deployment topology
// ---------------------------------------------------------------------------

export type DeploymentNodeKind = 'environment' | 'instance';

export interface DeploymentNode {
  id: string;
  kind: DeploymentNodeKind;
  name: string;
  /** Present when kind === 'instance': which environment id it belongs to. */
  environmentId?: string;
  /** Present when kind === 'instance': which C4 container this instance runs. */
  containerId?: string;
  runtime?: string;
  scale?: string;
  metadata: GraphElementMetadata;
}

// ---------------------------------------------------------------------------
// Non-functional requirements
// ---------------------------------------------------------------------------

export type NfrCategory =
  'performance' | 'availability' | 'security' | 'compliance' | 'scalability';

export interface NonFunctionalRequirement {
  id: string;
  category: NfrCategory;
  requirement: string;
  target: string;
  appliesTo: string[];
  metadata: GraphElementMetadata;
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export interface ConflictingValue {
  sourceId: string;
  sourceLabel: string;
  value: string;
}

export interface ReviewItem {
  id: string;
  elementType: string;
  elementName: string;
  currentValue: string;
  metadata: GraphElementMetadata;
  conflict?: ConflictingValue[];
  status: 'pending' | 'confirmed' | 'corrected';
}

// ---------------------------------------------------------------------------
// Gap analysis
// ---------------------------------------------------------------------------

export type GapSeverity = 'blocking' | 'high' | 'medium' | 'low';

export interface GapItem {
  id: string;
  area: string;
  description: string;
  missingInputs: string[];
  severity: GapSeverity;
  suggestedAction: string;
}

// ---------------------------------------------------------------------------
// Drift alerts & history
// ---------------------------------------------------------------------------

export interface DriftAlert {
  id: string;
  elementName: string;
  changeType: 'added' | 'removed' | 'modified';
  description: string;
  detectedAt: string;
}

export interface DriftRun {
  id: string;
  runDate: string;
  summary: string;
  changes: DriftAlert[];
}
