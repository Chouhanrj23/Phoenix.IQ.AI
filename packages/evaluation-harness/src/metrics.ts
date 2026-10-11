/**
 * P8 -- FR-EVA-01/02: score a run against a golden system.
 *
 * A golden system is hand-authored ground truth for a known repository:
 * the elements and typed relationships a correct analysis must find, the
 * groupings (clusters) it should form, and concrete facts (API operations,
 * physical tables). It is written from the repository, never copied from
 * Phoenix's own output -- otherwise the scores would only measure that
 * Phoenix agrees with itself.
 *
 * Only OBSERVED (extracted) elements are scored for precision/recall: the
 * golden states facts about code, and inferred knowledge is judged by human
 * review, not by a fixture. Elements of kinds the golden does not cover are
 * outside the evaluation and neither help nor hurt the score.
 */

import type {
  CanonicalKnowledgeBundle,
  CanonicalKnowledgeObject,
} from '@phoenix-ai/knowledge-graph';
import { compareCodeUnits } from '@phoenix-ai/shared';

export interface GoldenNode {
  readonly kind: string;
  readonly label: string;
}

export interface GoldenEdge {
  readonly kind: string;
  /** Labels of the endpoints (unique within the golden). */
  readonly source: string;
  readonly target: string;
}

export interface GoldenSystem {
  readonly systemId: string;
  readonly description: string;
  /** The repository's files, path -> content. */
  readonly files: Readonly<Record<string, string>>;
  readonly nodes: readonly GoldenNode[];
  readonly edges: readonly GoldenEdge[];
  /** Expected groupings of node labels, e.g. one per module / capability. */
  readonly clusters: readonly (readonly string[])[];
  /** `"METHOD /path"` for every HTTP operation. */
  readonly apiOperations: readonly string[];
  /** Entity label -> physical table name. */
  readonly tables: Readonly<Record<string, string>>;
}

export interface PrecisionRecall {
  readonly expected: number;
  readonly predicted: number;
  readonly matched: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
  /** In the golden, not found. */
  readonly missing: readonly string[];
  /** Found, not in the golden. */
  readonly unexpected: readonly string[];
}

export interface EvaluationScores {
  readonly systemId: string;
  readonly nodes: PrecisionRecall;
  readonly edges: PrecisionRecall;
  readonly apiOperations: PrecisionRecall;
  readonly tables: PrecisionRecall;
  /** Pairwise co-membership F1 of the predicted vs. golden clusters. */
  readonly clustering: PrecisionRecall;
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function precisionRecall(
  expected: Iterable<string>,
  predicted: Iterable<string>,
): PrecisionRecall {
  const e = new Set(expected);
  const p = new Set(predicted);
  const matched = [...p].filter((x) => e.has(x)).length;
  // An empty prediction against an empty golden is perfect, not undefined.
  const precision = p.size === 0 ? (e.size === 0 ? 1 : 0) : matched / p.size;
  const recall = e.size === 0 ? 1 : matched / e.size;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return {
    expected: e.size,
    predicted: p.size,
    matched,
    precision: round(precision),
    recall: round(recall),
    f1: round(f1),
    missing: [...e].filter((x) => !p.has(x)).sort(compareCodeUnits),
    unexpected: [...p].filter((x) => !e.has(x)).sort(compareCodeUnits),
  };
}

function observed(object: CanonicalKnowledgeObject): boolean {
  return object.confidenceDetail?.basis !== 'derived';
}

const nodeKey = (kind: string, label: string) => `${kind}|${label}`;
const edgeKey = (kind: string, source: string, target: string) => `${kind}|${source}|${target}`;

/** Unordered pairs of members that share a cluster. */
function coMembership(
  clusters: readonly (readonly string[])[],
  universe: ReadonlySet<string>,
): Set<string> {
  const pairs = new Set<string>();
  for (const cluster of clusters) {
    const members = [...new Set(cluster)].filter((m) => universe.has(m)).sort(compareCodeUnits);
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) pairs.add(`${members[i]}~${members[j]}`);
    }
  }
  return pairs;
}

/**
 * Predicted clusters: each inferred business capability with the elements it
 * comprises or is realised by -- Phoenix's own grouping of the system.
 */
export function predictedClusters(bundle: CanonicalKnowledgeBundle): string[][] {
  const labels = new Map(bundle.objects.map((o) => [o.identity.id, o.label]));
  return bundle.objects
    .filter((o) => o.kind === 'business.capability')
    .map((capability) =>
      bundle.relationships
        .filter(
          (r) =>
            r.sourceObjectId === capability.identity.id &&
            (r.kind === 'comprises' || r.kind === 'realizedBy'),
        )
        .map((r) => labels.get(r.targetObjectId))
        .filter((l): l is string => l !== undefined),
    );
}

export function scoreAgainstGolden(
  bundle: CanonicalKnowledgeBundle,
  golden: GoldenSystem,
): EvaluationScores {
  const kinds = new Set(golden.nodes.map((n) => n.kind));
  const inScope = bundle.objects.filter((o) => observed(o) && kinds.has(o.kind));
  const scopeIds = new Map(inScope.map((o) => [o.identity.id, o.label]));

  const edgeKinds = new Set(golden.edges.map((e) => e.kind));
  const predictedEdges = bundle.relationships
    .filter(
      (r) =>
        edgeKinds.has(r.kind) &&
        scopeIds.has(r.sourceObjectId) &&
        scopeIds.has(r.targetObjectId) &&
        r.confidenceDetail?.basis !== 'derived',
    )
    .map((r) => edgeKey(r.kind, scopeIds.get(r.sourceObjectId)!, scopeIds.get(r.targetObjectId)!));

  const operations = inScope
    .filter((o) => o.kind === 'integration.api')
    .flatMap((o) => (Array.isArray(o.attributes.operations) ? o.attributes.operations : []))
    .map((op) => (op as { name?: unknown }).name)
    .filter((name): name is string => typeof name === 'string');

  const tables = inScope.flatMap((o) => {
    const match = /^Maps to table "([^"]+)"/.exec(
      typeof o.attributes.description === 'string' ? o.attributes.description : '',
    );
    return match === null ? [] : [`${o.label}->${match[1]}`];
  });

  const universe = new Set(golden.clusters.flat());
  return {
    systemId: golden.systemId,
    nodes: precisionRecall(
      golden.nodes.map((n) => nodeKey(n.kind, n.label)),
      inScope.map((o) => nodeKey(o.kind, o.label)),
    ),
    edges: precisionRecall(
      golden.edges.map((e) => edgeKey(e.kind, e.source, e.target)),
      predictedEdges,
    ),
    apiOperations: precisionRecall(golden.apiOperations, operations),
    tables: precisionRecall(
      Object.entries(golden.tables).map(([entity, table]) => `${entity}->${table}`),
      tables,
    ),
    clustering: precisionRecall(
      coMembership(golden.clusters, universe),
      coMembership(predictedClusters(bundle), universe),
    ),
  };
}
