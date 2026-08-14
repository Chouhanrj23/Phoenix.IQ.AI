// Phase 1 contract types (System Summary, Architecture, Domain Model,
// Integrations, Deployment/NFR, Review/Gaps/Drift) are defined once in
// @phoenix-ai/shared. Imported (for use below) and re-exported (so every
// existing import of `../data/types.js` / `./types.js` keeps working
// unchanged) from the same statement.
import type {
  Confidence,
  GraphElementMetadata,
  SystemSummary,
  C4Level,
  C4Node,
  C4Edge,
  Aggregate,
  Domain,
  IntegrationDirection,
  Integration,
  DeploymentNodeKind,
  DeploymentNode,
  NfrCategory,
  NonFunctionalRequirement,
  ConflictingValue,
  ReviewItem,
  GapSeverity,
  GapItem,
  DriftAlert,
  DriftRun,
} from '@phoenix-ai/shared';

export type {
  GraphElementMetadata,
  SystemSummary,
  C4Level,
  C4Node,
  C4Edge,
  Aggregate,
  Domain,
  IntegrationDirection,
  Integration,
  DeploymentNodeKind,
  DeploymentNode,
  NfrCategory,
  NonFunctionalRequirement,
  ConflictingValue,
  ReviewItem,
  GapSeverity,
  GapItem,
  DriftAlert,
  DriftRun,
};

export interface FlowStep {
  id: string;
  name: string;
  description: string;
  readsEntities: string[];
  writesEntities: string[];
  metadata: GraphElementMetadata;
}

export interface ExecutionFlow {
  id: string;
  name: string;
  description: string;
  triggerScreen: string;
  steps: FlowStep[];
  metadata: GraphElementMetadata;
}

// ---------------------------------------------------------------------------
// Personas & Journeys (OKF output: personas, journeys)
// ---------------------------------------------------------------------------

export interface Persona {
  id: string;
  name: string;
  role: string;
  goals: string[];
  painPoints: string[];
  metadata: GraphElementMetadata;
}

export interface Journey {
  id: string;
  name: string;
  personaId: string;
  description: string;
  /** Flow IDs this journey is realised by — the FRD's flow-to-journey relationship (output #11). */
  flowIds: string[];
  metadata: GraphElementMetadata;
}

// ---------------------------------------------------------------------------
// Epics / Features / Stories (OKF output: epics/features/stories)
// ---------------------------------------------------------------------------

export interface AcceptanceCriterion {
  id: string;
  description: string;
}

export interface Story {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: AcceptanceCriterion[];
  metadata: GraphElementMetadata;
}

export interface Feature {
  id: string;
  name: string;
  description: string;
  stories: Story[];
  metadata: GraphElementMetadata;
}

export interface Epic {
  id: string;
  name: string;
  description: string;
  features: Feature[];
  metadata: GraphElementMetadata;
}

// ---------------------------------------------------------------------------
// Full knowledge graph (for the graph explorer view)
// ---------------------------------------------------------------------------

/** A single key/value fact about a node (e.g. "Technology: Node.js"). */
export interface GraphNodeAttribute {
  label: string;
  value: string;
}

/** A named list of child facts (e.g. "Goals", "Acceptance criteria", "Steps"). */
export interface GraphNodeSection {
  label: string;
  items: string[];
}

export type GraphCrossRefKind = 'review' | 'gap' | 'drift' | 'nfr' | 'integration' | 'deployment';

/**
 * A pointer from a graph node to something on another page that touches the
 * same element — an open review item, a gap, a drift alert, an NFR, and so on.
 * This is what makes the explorer feel like one graph rather than 14 pages.
 */
export interface GraphCrossRef {
  id: string;
  kind: GraphCrossRefKind;
  label: string;
  detail: string;
  route: string;
}

/**
 * Everything the explorer shows when a node is clicked. Derived from the same
 * fixtures the rest of the app reads, so a node's dossier can never disagree
 * with the page that renders the same element.
 */
export interface GraphNodeDetail {
  /** One-paragraph description of what this element is. */
  summary: string;
  /** Kind-specific facts, rendered as a definition grid. */
  attributes: GraphNodeAttribute[];
  /** Nested detail — steps, entities, goals, acceptance criteria, etc. */
  sections: GraphNodeSection[];
  /** Provenance + confidence, exactly as carried by the underlying element. */
  metadata: GraphElementMetadata;
  /** Where this element is rendered as a document view. */
  route: string;
  routeLabel: string;
  /** Open questions and related items on other pages. */
  crossRefs: GraphCrossRef[];
}

export interface GraphNode {
  id: string;
  label: string;
  kind: string;
  confidenceLevel: Confidence['level'];
  /** Optional so an API-backed provider can serve a slim graph and lazy-load detail. */
  detail?: GraphNodeDetail;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface OkfDataProvider {
  getSystemSummary(): Promise<SystemSummary>;
  getArchitecture(level: C4Level): Promise<{ nodes: C4Node[]; edges: C4Edge[] }>;
  getDomains(): Promise<Domain[]>;
  getExecutionFlows(): Promise<ExecutionFlow[]>;
  getReviewItems(): Promise<ReviewItem[]>;
  getDriftAlerts(): Promise<DriftAlert[]>;
  getPersonas(): Promise<Persona[]>;
  getJourneys(): Promise<Journey[]>;
  getEpics(): Promise<Epic[]>;
  getDeploymentTopology(): Promise<DeploymentNode[]>;
  getNonFunctionalRequirements(): Promise<NonFunctionalRequirement[]>;
  getIntegrations(): Promise<Integration[]>;
  getGapItems(): Promise<GapItem[]>;
  getDriftHistory(): Promise<DriftRun[]>;
  getFullGraph(): Promise<{ nodes: GraphNode[]; edges: GraphEdge[] }>;
}
