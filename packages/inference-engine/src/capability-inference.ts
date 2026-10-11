/**
 * P5-04 -- business capability inference.
 *
 * A capability is inferred by CLUSTERING business concepts (P5-03) whose
 * supporting technical objects share a common source MODULE, resolved with
 * a documented precedence (see `moduleKeyOf`/`moduleKeyFromLocator` below):
 *
 *  1. PRIMARY -- the `Provenance.sourceId` path segment a microservices-style
 *     build/service boundary already encodes (e.g. `repo://.../services/
 *     payments` -> `services/payments`).
 *  2. SECONDARY (fallback, only tried when NO provenance entry resolves a
 *     primary key) -- a real `Evidence.locator` FILE PATH's directory,
 *     trimmed of non-semantic source-root segments (`src`/`main`/`java`/...),
 *     e.g. `src/main/java/org/springframework/samples/petclinic/owner/
 *     OwnerController.java#L48-L179` -> `petclinic/owner`. This is the one
 *     real signal a FLAT/MONOLITH repository (a single `repo://x` sourceId
 *     with no service-boundary path at all -- e.g. Phase 3's own real
 *     `spring-petclinic` extraction) actually carries: a Java PACKAGE
 *     boundary, read directly from real evidence, never fabricated.
 *
 * Both signals are equally structural and domain-neutral (a file-system
 * directory grouping, not a business-specific rule); no constant fallback
 * (e.g. a literal `"default-module"`) is ever used -- a concept with no
 * resolvable module key via either signal is simply not clustered. This is
 * deliberately NOT "one capability per class/service": several concepts and
 * technical objects must co-locate under the same module before a
 * capability is inferred at all (see `MIN_CONCEPTS_PER_CAPABILITY`).
 *
 * Capability has no existing OKF kind -- `business.capability` is a new,
 * additive, open-vocabulary `kind` (P2-01/P2-02's `kind: string` design
 * exists exactly so this needs no schema-file change, the same mechanism
 * `bridge-relationships.ts` already used for `dependsOn`/`hasAssociation`
 * in Phase 4). `category: 'entity'` (a capability is a discrete, named
 * thing, not a process or an observation).
 */

import type { Confidence, Provenance } from '@phoenix-ai/shared';
import {
  CANONICAL_SCHEMA_VERSION,
  type CanonicalKnowledgeObject,
  type CanonicalKnowledgeRelationship,
  type ConfidenceDetail,
  type Evidence,
} from '@phoenix-ai/knowledge-graph';
import { deterministicId, deriveInferenceConfidence } from './inference-contract.js';
import type { BusinessConceptCandidate } from './concept-inference.js';
import { compareCodeUnits } from '@phoenix-ai/shared';

/** Below this many DISTINCT concepts, co-location is not enough evidence of a business-level capability (it's just one concept in one module) -- avoids "one capability per class". */
const MIN_CONCEPTS_PER_CAPABILITY = 2;

export interface BusinessCapabilityCandidate {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly moduleKey: string;
  readonly conceptIds: readonly string[];
  /**
   * P8 -- the canonical object each member concept IS in the bundle: its
   * `existingObjectId` when the concept was resolved to an already-extracted
   * object (and so deliberately never materialised), otherwise its own id.
   * Parallel to `conceptIds`. `comprises` edges target these -- targeting
   * `conceptIds` directly left a dangling edge for every resolved concept.
   */
  readonly memberObjectIds: readonly string[];
  readonly supportingTechnicalObjectIds: readonly string[];
  readonly evidence: readonly Evidence[];
  readonly provenance: readonly Provenance[];
  readonly confidence: Confidence;
  readonly confidenceDetail: ConfidenceDetail;
  readonly rationale: string;
}

/**
 * PRIMARY module-key signal: everything after the scheme, up to (and
 * including) the second path segment where present (e.g.
 * `repo://nimbus-financial/services/payments/x.ts` -> `services/payments`).
 * Purely structural: works identically for any repository layout, never
 * inspects what the segments are named. Returns `undefined` for a flat
 * `repo://x` sourceId with no further path segments (a monolith) -- callers
 * fall back to `moduleKeyFromLocator` in that case.
 */
function moduleKeyOf(sourceId: string): string | undefined {
  const withoutScheme = sourceId.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const segments = withoutScheme.split('/').filter((segment) => segment.length > 0);
  // segments[0] is the repository/root name itself -- not a module boundary.
  const moduleSegments = segments.slice(1, 3);
  return moduleSegments.length > 0 ? moduleSegments.join('/') : undefined;
}

/** Common source-root segments that carry no semantic module meaning by themselves (a Java/Kotlin/Maven-Gradle source-layout convention, not business-specific) -- stripped before taking the trailing directory segments as the module key. */
const NON_SEMANTIC_PATH_SEGMENTS = new Set([
  'src',
  'main',
  'test',
  'java',
  'kotlin',
  'resources',
  'lib',
  'app',
]);

/**
 * SECONDARY (fallback) module-key signal: derives a structural module key
 * from a real `Evidence.locator` FILE PATH, e.g.
 * `src/main/java/org/springframework/samples/petclinic/owner/
 * OwnerController.java#L48-L179` -> `petclinic/owner`. Strips any trailing
 * `#L...` line-range, drops the filename itself, filters out non-semantic
 * source-root segments, and keeps the last 2 remaining directory segments --
 * the same trailing-2-segments convention `moduleKeyOf` uses for a
 * `repo://` path, so both signals produce comparably-grained keys. Returns
 * `undefined` when the locator carries no directory information at all
 * (e.g. a bare filename) -- never a fabricated constant.
 */
function moduleKeyFromLocator(locator: string): string | undefined {
  const withoutLineRange = locator.replace(/#.*$/, '');
  const segments = withoutLineRange.split('/').filter((segment) => segment.length > 0);
  if (segments.length <= 1) return undefined;
  const directorySegments = segments.slice(0, -1); // drop the filename itself
  const meaningful = directorySegments.filter(
    (segment) => !NON_SEMANTIC_PATH_SEGMENTS.has(segment.toLowerCase()),
  );
  if (meaningful.length === 0) return undefined;
  return meaningful.slice(-2).join('/');
}

/**
 * Resolves the module key(s) for one concept using the documented
 * precedence: every provenance entry's `moduleKeyOf` first (primary); only
 * when NONE of them resolve does it fall back to `moduleKeyFromLocator`
 * over the concept's own evidence locators (secondary). Never mixes tiers
 * for the same concept, and never fabricates a constant when both are
 * exhausted.
 */
function primaryModuleKeys(concept: BusinessConceptCandidate): Set<string> {
  return new Set(
    concept.provenance
      .map((p) => moduleKeyOf(p.sourceId))
      .filter((key): key is string => key !== undefined),
  );
}

function secondaryModuleKeys(concept: BusinessConceptCandidate): Set<string> {
  return new Set(
    concept.evidence
      .map((e) => (e.locator === undefined ? undefined : moduleKeyFromLocator(e.locator)))
      .filter((key): key is string => key !== undefined),
  );
}

function resolveModuleKeys(
  concept: BusinessConceptCandidate,
  primaryDiscriminates: boolean,
): Set<string> {
  const primary = primaryModuleKeys(concept);
  if (primary.size > 0 && primaryDiscriminates) return primary;
  return secondaryModuleKeys(concept);
}

/**
 * P8 -- found by the evaluation harness's golden system (FR-EVA-02): a
 * `repo://<org>/<repo>` source id resolves the SAME primary key (the
 * repository's own name) for every concept, so a multi-module repository
 * collapsed into one capability although its evidence paths show distinct
 * modules. The primary signal is therefore used only when it actually
 * separates something -- or when the evidence cannot separate anything
 * either. When every concept shares one primary key but their evidence
 * locators resolve two or more modules, the locators decide. Every case the
 * primary signal was designed for (several service source ids; a single
 * module, where both signals agree there is one group) is unchanged.
 */
function primarySignalDiscriminates(concepts: readonly BusinessConceptCandidate[]): boolean {
  const primary = new Set<string>();
  const secondary = new Set<string>();
  for (const concept of concepts) {
    for (const key of primaryModuleKeys(concept)) primary.add(key);
    for (const key of secondaryModuleKeys(concept)) secondary.add(key);
  }
  return !(primary.size === 1 && secondary.size >= 2);
}

function titleCaseSegment(segment: string): string {
  return segment
    .split(/[-_]/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]!.toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Clusters business concepts by shared source module and infers one
 * capability candidate per cluster with at least `MIN_CONCEPTS_PER_CAPABILITY`
 * distinct concepts. Concepts with no resolvable module key (no provenance,
 * or a source id this function's structural rule can't segment) are not
 * clustered -- never guessed into an arbitrary capability.
 */
export function inferBusinessCapabilities(
  concepts: readonly BusinessConceptCandidate[],
  generatedAt: string,
): BusinessCapabilityCandidate[] {
  interface Cluster {
    readonly moduleKey: string;
    readonly concepts: BusinessConceptCandidate[];
    readonly technicalObjectIds: Set<string>;
    readonly evidence: Map<string, Evidence>;
    readonly provenance: Map<string, Provenance>;
  }

  const clusters = new Map<string, Cluster>();
  const primaryDiscriminates = primarySignalDiscriminates(concepts);

  for (const concept of concepts) {
    const moduleKeys = resolveModuleKeys(concept, primaryDiscriminates);
    for (const moduleKey of moduleKeys) {
      let cluster = clusters.get(moduleKey);
      if (cluster === undefined) {
        cluster = {
          moduleKey,
          concepts: [],
          technicalObjectIds: new Set(),
          evidence: new Map(),
          provenance: new Map(),
        };
        clusters.set(moduleKey, cluster);
      }
      cluster.concepts.push(concept);
      for (const id of concept.supportingTechnicalObjectIds) cluster.technicalObjectIds.add(id);
      for (const evidence of concept.evidence) cluster.evidence.set(evidence.id, evidence);
      for (const provenance of concept.provenance) {
        cluster.provenance.set(`${provenance.sourceId}::${provenance.sourceType}`, provenance);
      }
    }
  }

  const capabilities: BusinessCapabilityCandidate[] = [];
  for (const cluster of clusters.values()) {
    const distinctConcepts = [...new Map(cluster.concepts.map((c) => [c.id, c])).values()];
    if (distinctConcepts.length < MIN_CONCEPTS_PER_CAPABILITY) continue;

    const lastSegment = cluster.moduleKey.split('/').pop() ?? cluster.moduleKey;
    const name = `${titleCaseSegment(lastSegment)} Management`;
    const signalCount = distinctConcepts.length + cluster.technicalObjectIds.size;
    const { confidence, confidenceDetail } = deriveInferenceConfidence(
      signalCount,
      'capability-cluster-corroboration',
      generatedAt,
      {
        conceptCount: distinctConcepts.length,
        technicalObjectCount: cluster.technicalObjectIds.size,
      },
    );

    capabilities.push({
      id: deterministicId('capability', cluster.moduleKey.toLowerCase()),
      name,
      description: `A business capability inferred from ${distinctConcepts.length} business concept(s) (${distinctConcepts.map((c) => c.name).join(', ')}) co-located under source module "${cluster.moduleKey}".`,
      moduleKey: cluster.moduleKey,
      conceptIds: distinctConcepts.map((c) => c.id),
      memberObjectIds: distinctConcepts.map((c) => c.existingObjectId ?? c.id),
      supportingTechnicalObjectIds: [...cluster.technicalObjectIds].sort(),
      evidence: [...cluster.evidence.values()],
      provenance: [...cluster.provenance.values()],
      confidence,
      confidenceDetail,
      rationale: `${distinctConcepts.length} concepts and ${cluster.technicalObjectIds.size} technical objects share source module "${cluster.moduleKey}" -- clustered as one capability rather than one per concept.`,
    });
  }

  return capabilities.sort((a, b) => compareCodeUnits(a.name, b.name));
}

/** Materializes one new `business.capability` object per candidate (always new -- no existing OKF kind represents a capability). */
export function materializeBusinessCapabilities(
  candidates: readonly BusinessCapabilityCandidate[],
  systemId: string,
  generatedAt: string,
): CanonicalKnowledgeObject[] {
  return candidates.map((candidate) => ({
    identity: {
      id: candidate.id,
      systemId,
      createdAt: generatedAt,
      updatedAt: generatedAt,
      schemaVersion: CANONICAL_SCHEMA_VERSION,
    },
    category: 'entity',
    kind: 'business.capability',
    label: candidate.name,
    attributes: { description: candidate.description, moduleKey: candidate.moduleKey },
    metadata: { provenance: [...candidate.provenance], confidence: candidate.confidence },
    evidence: [...candidate.evidence],
    confidenceDetail: candidate.confidenceDetail,
  }));
}

/**
 * Builds `comprises` (Capability -> BusinessConcept, composition) and
 * `realizedBy` (Capability -> technical object, realization) relationships
 * -- both new, additive relationship kinds, the same open-`kind` mechanism
 * as the objects above.
 */
export function buildCapabilityRelationships(
  candidates: readonly BusinessCapabilityCandidate[],
): CanonicalKnowledgeRelationship[] {
  const relationships: CanonicalKnowledgeRelationship[] = [];

  for (const candidate of candidates) {
    candidate.conceptIds.forEach((conceptId, index) => {
      relationships.push({
        // The id stays keyed on the concept (stable across runs, FR-KG-04);
        // only the endpoint is resolved to the object that actually exists.
        id: deterministicId('relationship', 'comprises', candidate.id, conceptId),
        category: 'composition',
        kind: 'comprises',
        sourceObjectId: candidate.id,
        targetObjectId: candidate.memberObjectIds[index] ?? conceptId,
        metadata: {
          provenance: [...candidate.provenance],
          confidence: candidate.confidence,
        },
        confidenceDetail: candidate.confidenceDetail,
      });
    });
    for (const technicalObjectId of candidate.supportingTechnicalObjectIds) {
      relationships.push({
        id: deterministicId('relationship', 'realizedBy', candidate.id, technicalObjectId),
        category: 'realization',
        kind: 'realizedBy',
        sourceObjectId: candidate.id,
        targetObjectId: technicalObjectId,
        metadata: {
          provenance: [...candidate.provenance],
          confidence: candidate.confidence,
        },
        confidenceDetail: candidate.confidenceDetail,
      });
    }
  }

  return relationships;
}
