/**
 * @phoenix-ai/gap-analysis
 * Module: Gap Analysis Planner (FRD §3.10)
 *
 * P8 -- FR-GAP-01: measure, per OKF output artifact, how much of it the
 * analysed sources actually support (covered / partial / uncovered).
 * FR-GAP-02: for every gap, name the specific input that would close it.
 * FR-GAP-03: phrase gaps as requests to collaborators, not audit findings.
 *
 * Every gap comes from a FACT of the run -- an artifact the renderers could
 * not fill, a file the redaction gate quarantined, a file the parser could
 * not read, a conflict between sources, knowledge held by a single author --
 * never from a guess about what "should" exist. A run with nothing missing
 * reports no gaps.
 */

import type { CanonicalKnowledgeBundle } from '@phoenix-ai/knowledge-graph';
import {
  renderAllArtifacts,
  type OkfArtifactId,
  type RenderedArtifact,
} from '@phoenix-ai/okf-renderers';
import { compareCodeUnits, type GapItem, type GapSeverity } from '@phoenix-ai/shared';

export type CoverageLevel = 'covered' | 'partial' | 'uncovered';

export interface ArtifactCoverage {
  readonly artifactId: OkfArtifactId;
  readonly label: string;
  readonly coverage: CoverageLevel;
  readonly elementCount: number;
  /** Share of the artifact's elements that are inferred rather than observed (0..1). */
  readonly inferredShare: number;
  readonly reason: string;
}

/** What the run itself reported losing or doubting. All optional: absent means "none". */
export interface RunFacts {
  readonly ingestionFailures?: readonly { readonly path: string; readonly reason: string }[];
  readonly quarantined?: readonly { readonly path: string; readonly reason: string }[];
  readonly parseFailures?: readonly { readonly path: string; readonly reason: string }[];
  readonly knowledgeRisk?: readonly {
    readonly label: string;
    readonly owner: string;
    readonly atRisk: boolean;
  }[];
}

export interface GapReport {
  readonly systemId: string;
  readonly generatedAt: string;
  readonly coverage: readonly ArtifactCoverage[];
  /** Covered artifacts / all artifacts (partial counts half). */
  readonly coverageScore: number;
  readonly gaps: readonly GapItem[];
}

/** How much each artifact matters to someone rebuilding or running the system. */
const ARTIFACT_SEVERITY: Readonly<Record<OkfArtifactId, GapSeverity>> = {
  'logical-data-model': 'high',
  'integrations-dataflows': 'high',
  'architecture-c4': 'high',
  deployment: 'medium',
  domains: 'medium',
  'execution-flows': 'medium',
  'personas-journeys': 'low',
  backlog: 'low',
  'flow-to-journey': 'low',
  screens: 'low',
  'non-functional-requirements': 'low',
};

/** Above this share of inferred elements an artifact is only partially supported. */
const INFERRED_PARTIAL_THRESHOLD = 0.5;

export function assessCoverage(artifact: RenderedArtifact): ArtifactCoverage {
  const derived = artifact.elements.filter((e) => e.basis === 'derived').length;
  const inferredShare = artifact.elements.length === 0 ? 0 : derived / artifact.elements.length;
  const base = {
    artifactId: artifact.id,
    label: artifact.label,
    elementCount: artifact.elements.length,
    inferredShare: Math.round(inferredShare * 1000) / 1000,
  };
  if (artifact.status !== 'rendered') {
    return {
      ...base,
      coverage: 'uncovered',
      reason:
        artifact.status === 'unavailable'
          ? 'Phoenix has no extractor for this artifact’s inputs yet.'
          : 'The analysed sources contained nothing for this artifact.',
    };
  }
  if (artifact.missingInputs.length > 0) {
    return { ...base, coverage: 'partial', reason: 'Some of this artifact’s inputs were missing.' };
  }
  if (inferredShare > INFERRED_PARTIAL_THRESHOLD) {
    return {
      ...base,
      coverage: 'partial',
      reason: `Most of its content (${Math.round(inferredShare * 100)}%) is inferred and has not been confirmed.`,
    };
  }
  return { ...base, coverage: 'covered', reason: 'Supported by observed source evidence.' };
}

function pathList(items: readonly { path: string }[]): string[] {
  return [...new Set(items.map((i) => i.path))].sort(compareCodeUnits);
}

export function planGaps(
  bundle: CanonicalKnowledgeBundle,
  facts: RunFacts = {},
  artifacts: readonly RenderedArtifact[] = renderAllArtifacts(bundle),
): GapReport {
  const coverage = artifacts.map(assessCoverage);
  const gaps: GapItem[] = [];

  if (!bundle.objects.some((o) => o.confidenceDetail?.basis !== 'derived')) {
    gaps.push({
      id: 'gap-no-observed-knowledge',
      area: 'Sources',
      description:
        'Nothing in the analysed sources could be extracted, so every artifact below is empty. This usually means the repository is not one Phoenix can read yet, or the wrong path was registered.',
      missingInputs: ['a source repository with application code Phoenix supports (Java / Spring)'],
      severity: 'blocking',
      suggestedAction:
        'Could you check the registered source (URL, branch and path filter) and share the repository that holds the application code?',
    });
  }

  for (const entry of coverage) {
    if (entry.coverage === 'covered') continue;
    const artifact = artifacts.find((a) => a.id === entry.artifactId)!;
    const needs = artifact.missingInputs;
    const uncovered = entry.coverage === 'uncovered';
    gaps.push({
      id: `gap-artifact-${entry.artifactId}`,
      area: entry.label,
      description: uncovered
        ? `We could not produce the ${entry.label.toLowerCase()} view. ${entry.reason}`
        : `The ${entry.label.toLowerCase()} view is only partly supported. ${entry.reason}`,
      missingInputs:
        needs.length > 0
          ? [...needs]
          : ['confirmation of the inferred elements by someone who knows the system'],
      // A partial view is one step less urgent than a missing one.
      severity: uncovered
        ? ARTIFACT_SEVERITY[entry.artifactId]
        : lower(ARTIFACT_SEVERITY[entry.artifactId]),
      suggestedAction:
        needs.length > 0
          ? `If you have ${needs.join(' or ')}, sharing it would let us fill this in.`
          : 'Could someone who knows the system review the inferred elements in this view and confirm, correct or reject them?',
    });
  }

  const parseFailures = pathList(facts.parseFailures ?? []);
  if (parseFailures.length > 0) {
    gaps.push({
      id: 'gap-unparsed-source',
      area: 'Source code',
      description: `${parseFailures.length} source file(s) could not be parsed, so nothing they contain is in the knowledge graph.`,
      missingInputs: parseFailures,
      severity: 'high',
      suggestedAction:
        'Could you tell us whether these files use a language level or generated code we should expect? A version that compiles on its own would let us include them.',
    });
  }

  const quarantined = pathList(facts.quarantined ?? []);
  if (quarantined.length > 0) {
    gaps.push({
      id: 'gap-quarantined-files',
      area: 'Sources',
      description: `${quarantined.length} file(s) were held back by the redaction gate because their content could not be checked for secrets or personal data.`,
      missingInputs: quarantined,
      severity: 'medium',
      suggestedAction:
        'If any of these carry design information (diagrams, specifications), a text or exported version would let us read them safely.',
    });
  }

  const unreadable = pathList(facts.ingestionFailures ?? []);
  if (unreadable.length > 0) {
    gaps.push({
      id: 'gap-unreadable-files',
      area: 'Sources',
      description: `${unreadable.length} file(s) in the repository could not be read.`,
      missingInputs: unreadable,
      severity: 'medium',
      suggestedAction:
        'Could you check whether these files are expected to be readable (size limits, encodings, broken links)?',
    });
  }

  const conflicts = bundle.objects
    .filter((o) => o.kind === 'reconciliation.conflict')
    .map((o) => o.label)
    .sort(compareCodeUnits);
  if (conflicts.length > 0) {
    gaps.push({
      id: 'gap-source-conflicts',
      area: 'Reconciliation',
      description: `${conflicts.length} point(s) where the sources disagree. Every position is kept; none has been picked for you.`,
      missingInputs: conflicts,
      severity: 'high',
      suggestedAction:
        'Could the owners of these areas tell us which statement is current? Each conflict can be resolved in the review queue.',
    });
  }

  const atRisk = (facts.knowledgeRisk ?? []).filter((r) => r.atRisk);
  if (atRisk.length > 0) {
    const owners = [...new Set(atRisk.map((r) => r.owner))].sort(compareCodeUnits);
    gaps.push({
      id: 'gap-single-owner-knowledge',
      area: 'Knowledge risk',
      description: `${atRisk.length} element(s) have only ever been changed by one person and have not changed recently — knowledge about them may live with ${owners.length} individual(s).`,
      missingInputs: atRisk.map((r) => r.label).sort(compareCodeUnits),
      severity: 'medium',
      suggestedAction:
        'A short walkthrough with the people who know these areas, captured as review notes, would make this knowledge shared.',
    });
  }

  gaps.sort(
    (a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || compareCodeUnits(a.id, b.id),
  );
  const score =
    coverage.reduce(
      (sum, c) => sum + (c.coverage === 'covered' ? 1 : c.coverage === 'partial' ? 0.5 : 0),
      0,
    ) / Math.max(coverage.length, 1);
  return {
    systemId: bundle.systemId,
    generatedAt: bundle.generatedAt,
    coverage,
    coverageScore: Math.round(score * 1000) / 1000,
    gaps,
  };
}

const SEVERITY_RANK: Readonly<Record<GapSeverity, number>> = {
  blocking: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function lower(severity: GapSeverity): GapSeverity {
  return severity === 'blocking' ? 'high' : severity === 'high' ? 'medium' : 'low';
}
