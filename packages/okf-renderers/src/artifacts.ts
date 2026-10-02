/**
 * P7-05 -- the OKF output artifact registry: which of the FRD's eleven output
 * artifact types each canonical object `kind` feeds.
 *
 * This is what makes "regenerate only what a correction actually affects"
 * possible (FRD §3.7, "OKF Renderers"). Correcting a Container's technology
 * touches the architecture view; it does not touch the persona/journey view,
 * and nothing here will claim it does.
 *
 * HONESTY ABOUT COVERAGE: several FRD artifact types have NO canonical object
 * kind feeding them yet -- screens, non-functional requirements, the product
 * backlog, deployment diagrams, and the flow-to-journey relationship view are
 * all real FRD outputs, but no `kind` in the Phase 2 vocabulary
 * (`OBJECT_KIND_TO_LABEL`, `@phoenix-ai/graph-persistence`) produces them.
 * They are registered with an EMPTY `objectKinds` list and
 * `modelled: false` rather than omitted, so the gap is visible in the
 * registry instead of being silently absent -- and so `affectedArtifacts`
 * can never report them as affected by a correction, which would be a
 * fabricated claim.
 */

/** The eleven OKF output artifact types the BRD/FRD define. */
export const OKF_ARTIFACT_IDS = [
  'logical-data-model',
  'domains',
  'personas-journeys',
  'screens',
  'execution-flows',
  'architecture-c4',
  'deployment',
  'non-functional-requirements',
  'backlog',
  'integrations-dataflows',
  'flow-to-journey',
] as const;

export type OkfArtifactId = (typeof OKF_ARTIFACT_IDS)[number];

export interface OkfArtifactDefinition {
  readonly id: OkfArtifactId;
  readonly label: string;
  /**
   * Canonical object `kind`s that feed this artifact. Empty when no kind in
   * the current vocabulary produces it -- see the file header.
   */
  readonly objectKinds: readonly string[];
  /** False when no canonical object kind feeds this artifact yet. */
  readonly modelled: boolean;
}

function definition(
  id: OkfArtifactId,
  label: string,
  objectKinds: readonly string[],
): OkfArtifactDefinition {
  return { id, label, objectKinds, modelled: objectKinds.length > 0 };
}

/**
 * Every kind listed below is a REAL member of the Phase 2 canonical
 * vocabulary -- cross-checked against `KNOWN_OBJECT_KINDS`
 * (`@phoenix-ai/graph-persistence`) by `tests/artifacts.test.ts`, so this
 * registry cannot drift into naming a kind that does not exist.
 */
export const OKF_ARTIFACTS: readonly OkfArtifactDefinition[] = [
  definition('logical-data-model', 'Logical data model', [
    'domain.entity',
    'domain.aggregate',
    'domain.entity-state',
  ]),
  definition('domains', 'Domains & bounded contexts', [
    'domain.domain',
    'domain.aggregate',
    'domain.entity',
  ]),
  definition('personas-journeys', 'Personas & journeys', ['journey.persona', 'journey.journey']),
  // No `screen` kind exists in the canonical vocabulary.
  definition('screens', 'Screens', []),
  definition('execution-flows', 'Execution flows', ['journey.flow', 'journey.action']),
  definition('architecture-c4', 'C4 architecture', [
    'architecture.system',
    'architecture.container',
    'architecture.component',
  ]),
  // Deployment topology is served from Phase 1 contracts, not from a
  // canonical object kind — nothing in the vocabulary produces it.
  definition('deployment', 'Deployment topology', []),
  definition('non-functional-requirements', 'Non-functional requirements', []),
  definition('backlog', 'Epics, features & stories', []),
  definition('integrations-dataflows', 'Integrations & data flows', [
    'integration.integration',
    'integration.dataflow',
    'integration.api',
    'integration.interface',
  ]),
  // Realised as relationships between existing kinds rather than by a kind
  // of its own, so a correction to either endpoint affects this view.
  definition('flow-to-journey', 'Flow-to-journey relationships', [
    'journey.flow',
    'journey.journey',
  ]),
];

const BY_KIND = new Map<string, OkfArtifactId[]>();
for (const artifact of OKF_ARTIFACTS) {
  for (const kind of artifact.objectKinds) {
    BY_KIND.set(kind, [...(BY_KIND.get(kind) ?? []), artifact.id]);
  }
}

/**
 * Which artifacts a given object `kind` feeds. An unknown or unmodelled kind
 * yields an empty list -- never a guess.
 */
export function artifactsForObjectKind(kind: string): readonly OkfArtifactId[] {
  return BY_KIND.get(kind) ?? [];
}

/** Look up one artifact definition. */
export function okfArtifact(id: OkfArtifactId): OkfArtifactDefinition {
  const found = OKF_ARTIFACTS.find((a) => a.id === id);
  if (found === undefined) throw new Error(`unknown OKF artifact "${id}"`);
  return found;
}
