// Output contract of the reverse-engineering run (scripts/reverse-engineer).
//
// The script writes one JSON file per analysed system that conforms to
// `ReverseEngineeringReport`; the web app reads it as an engagement dataset.
// Everything that already has an OKF type (domains, flows, personas, epics,
// C4, integrations, ...) reuses that type and only adds fields, so the
// existing pages render the generated data unchanged.
//
// This file is type-only on purpose: the script imports it with Node's type
// stripping, which erases it at runtime.
import type {
  BusinessCapability,
  C4Edge,
  C4Node,
  DeploymentNode,
  Domain,
  DriftAlert,
  DriftRun,
  Epic,
  ExecutionFlow,
  Feature,
  FlowStep,
  GapItem,
  GraphElementMetadata,
  Integration,
  Journey,
  NonFunctionalRequirement,
  Persona,
  ReviewItem,
  Story,
  SystemSummary,
} from '../data/types.js';

/** The six modules of the Modules workspace. Ids match its routes. */
export interface ReModule {
  id: string;
  name: string;
  /** How much of this module the analysed system actually implements. */
  coverage: 'full' | 'partial' | 'none';
  summary: string;
}

export interface ReBusinessDomain extends Domain {
  moduleIds: string[];
  responsibilities: string[];
  /** Services/containers that own this domain's data and behaviour. */
  owningServices: string[];
}

export interface ReEntityAttribute {
  name: string;
  type: string;
  description: string;
  key?: 'pk' | 'fk' | 'unique';
  required?: boolean;
}

export interface ReEntity {
  id: string;
  name: string;
  domainId: string;
  description: string;
  /** Where the entity lives, e.g. "PostgreSQL accounts-db.users". */
  storage: string;
  attributes: ReEntityAttribute[];
  metadata: GraphElementMetadata;
}

export interface ReRelationship {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  cardinality: '1:1' | '1:N' | 'N:1' | 'N:M';
  label: string;
  metadata: GraphElementMetadata;
}

export interface ReActivity {
  id: string;
  name: string;
  moduleId: string;
  domainId: string;
  actor: string;
  trigger: string;
  description: string;
  inputs: string[];
  outputs: string[];
  businessRules: string[];
  /** e.g. "POST /transactions" */
  endpoint?: string;
  service?: string;
  metadata: GraphElementMetadata;
}

export interface ReReport {
  id: string;
  name: string;
  moduleId: string;
  purpose: string;
  audience: string[];
  fields: string[];
  sourceEntityIds: string[];
  frequency: string;
  /** false = recommended by the analysis but not present in the system today. */
  implemented: boolean;
  metadata: GraphElementMetadata;
}

export interface ReFlowStep extends FlowStep {
  service?: string;
  activityId?: string;
}

export interface ReFlow extends ExecutionFlow {
  moduleId: string;
  actor: string;
  steps: ReFlowStep[];
}

export interface ReJourneyStage {
  stage: string;
  action: string;
  touchpoint: string;
  painPoint?: string;
}

export interface RePersona extends Persona {
  moduleIds: string[];
}

export interface ReJourney extends Journey {
  moduleId: string;
  stages: ReJourneyStage[];
}

export interface ReCapability extends BusinessCapability {
  moduleId: string;
  /** `gap` = the module needs it but the system does not implement it. */
  status: 'implemented' | 'partial' | 'gap';
  activityIds: string[];
}

export interface ReStory extends Story {
  asA: string;
  iWant: string;
  soThat: string;
  priority: 'must' | 'should' | 'could';
}

export interface ReFeature extends Feature {
  stories: ReStory[];
}

export interface ReEpic extends Epic {
  moduleId: string;
  capabilityIds: string[];
  features: ReFeature[];
}

export interface ReBusinessRule {
  id: string;
  rule: string;
  moduleId: string;
  evidence: string[];
}

export interface ReBrdNarrative {
  executiveSummary: string;
  businessContext: string;
  objectives: string[];
  scopeIn: string[];
  scopeOut: string[];
  stakeholders: { role: string; interest: string }[];
  businessRules: ReBusinessRule[];
  assumptions: string[];
  constraints: string[];
  risks: { risk: string; impact: 'high' | 'medium' | 'low'; mitigation: string }[];
  openQuestions: string[];
  glossary: { term: string; definition: string }[];
}

/** The simple BRD the business supplied at the start, which the run enriches. */
export interface ReInputBrd {
  /** File it was read from, e.g. "inputs/bank-of-anthos/initial-brd.md". */
  source: string;
  title: string;
  /** Full text, as supplied. */
  text: string;
}

export type ReTraceStatus = 'confirmed' | 'partial' | 'not-implemented' | 'contradicted';

/** One requirement from the input BRD, checked against the evidence. */
export interface ReTraceItem {
  id: string;
  /** The requirement as stated in the input BRD. */
  requirement: string;
  moduleId: string;
  status: ReTraceStatus;
  /** What the evidence shows. */
  finding: string;
  evidence: string[];
  /** Ids of activities, capabilities, rules, reports... that realise or relate to it. */
  relatedIds: string[];
}

export interface ReRunInfo {
  /** `llm` = generated by a model; `curated` = hand-authored fallback input. */
  mode: 'llm' | 'curated';
  provider: string;
  model: string;
  startedAt: string;
  finishedAt: string;
  sourceRepo: string;
  sourceCommit: string;
  evidence: {
    files: number;
    screenshots: string[];
    logEvents: number;
    telemetrySignals: number;
    characters: number;
  };
  /** `model` is the model that produced the stage (a resumed run can mix models). */
  stages: { name: string; status: 'generated' | 'cached'; seconds: number; model: string }[];
  warnings: string[];
}

export interface ReverseEngineeringReport {
  id: string;
  run: ReRunInfo;
  systemSummary: SystemSummary;
  modules: ReModule[];
  brd: ReBrdNarrative;
  /** Present when the run was given an initial BRD to enrich. */
  inputBrd?: ReInputBrd;
  /** Each input requirement checked against the evidence (empty without an input BRD). */
  traceability: ReTraceItem[];
  // 1) Business domains  2) Domain model
  domains: ReBusinessDomain[];
  entities: ReEntity[];
  relationships: ReRelationship[];
  // 3) Actions / activities
  activities: ReActivity[];
  // 4) Execution / business flows
  executionFlows: ReFlow[];
  // 5) Personas & user journeys
  personas: RePersona[];
  journeys: ReJourney[];
  // 6) Reports
  reports: ReReport[];
  // 7) Capabilities, epics & user stories
  capabilities: ReCapability[];
  epics: ReEpic[];
  // Architecture & operations (the existing OKF pages)
  contextNodes: C4Node[];
  contextEdges: C4Edge[];
  containerNodes: C4Node[];
  containerEdges: C4Edge[];
  integrations: Integration[];
  deploymentNodes: DeploymentNode[];
  nonFunctionalRequirements: NonFunctionalRequirement[];
  gapItems: GapItem[];
  reviewItems: ReviewItem[];
  driftAlerts: DriftAlert[];
  driftHistory: DriftRun[];
  /** Domain experts' answers to the module questions, merged in after the run. */
  expertReview?: ReExpertReview;
}

/** One expert answer, recorded against the BRD elements the question was about. */
export interface ReExpertInput {
  questionId: string;
  moduleId: string;
  level: string;
  intent: string;
  question: string;
  /** What the BRD said when the question was asked. */
  brdContext: string;
  /** The expert's own words. */
  answer: string;
  /** The answer restated as BRD requirement text by the model, or the answer itself without one. */
  statement: string;
  answeredBy: string | null;
  answeredAt: string;
  sourceIds: string[];
}

/** A BRD open question an expert has answered. */
export interface ReResolvedQuestion {
  question: string;
  resolution: string;
  answeredBy: string | null;
  questionId: string;
}

export interface ReRevision {
  at: string;
  summary: string;
}

export interface ReExpertReview {
  inputs: ReExpertInput[];
  resolvedQuestions: ReResolvedQuestion[];
  revisions: ReRevision[];
}

/** Capability/epic re-export kept for consumers that only need the base types. */
export type { BusinessCapability, Epic };
