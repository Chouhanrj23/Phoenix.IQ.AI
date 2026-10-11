/**
 * P8 -- FR-ORC-01/03: the end-to-end pipeline as one defined stage sequence.
 *
 *   Source -> Ingestion -> Redaction -> Deterministic extraction
 *          -> Semantic inference (optional) -> Reconciliation (optional)
 *          -> Knowledge graph (validated bundle) -> Graph persistence
 *          -> OKF -> Graph version -> Drift changelog -> Gap plan
 *
 * (Human review, correction, and the updated graph/output that follow are
 * `review-cycle.ts`.)
 *
 * This module adds NO analysis of its own. Every stage is the existing,
 * independently-tested implementation (`@phoenix-ai/ingestion-connectors`,
 * `@phoenix-ai/redaction-hardening`, `@phoenix-ai/extraction-engine`,
 * `@phoenix-ai/inference-engine`, `@phoenix-ai/reconciliation-engine`,
 * `@phoenix-ai/knowledge-graph`, `@phoenix-ai/graph-persistence`); this is
 * only the sequence, the contract checks between stages, and the accounting
 * (`report.ts`) that makes any loss visible.
 *
 * Determinism (FR-ORC-03 / BR-13): the caller supplies `generatedAt`; no
 * stage reads the clock. Identical inputs therefore yield a byte-identical
 * bundle, OKF document, and graph write plan.
 *
 * Optional stages, stated rather than faked:
 *  - inference runs by default and can be switched off; it only ever ADDS
 *    inferred objects, each with a non-`observed` `confidenceDetail.basis` (`derived`), so inferred knowledge stays distinguishable from extracted facts (FR-SEM-05).
 *  - reconciliation needs claims from a second source. With a single source
 *    there is nothing to contradict, so the stage reports `skipped` instead
 *    of inventing agreement.
 *  - graph persistence needs a Neo4j driver. Without one the write plan is
 *    still built and checked for unmappable elements, and the stage reports
 *    that nothing was persisted.
 *  - commit history (change coupling, knowledge risk) needs a connector that
 *    can read it (git can); otherwise the ingestion stage notes its absence.
 *  - graph versioning always computes the content-addressed version; it is
 *    only STORED (and drift computed against the previous version) when a
 *    `versionStore` is supplied. A first run is a baseline, not "no drift".
 */

import {
  collectArtifacts,
  withConnectorSession,
  type ArtifactFilter,
  type RawArtifact,
  type SourceRepositoryConnector,
  type SourceRepositoryDescriptor,
} from '@phoenix-ai/ingestion-connectors';
import {
  assertRedactionGatePassed,
  redactArtifacts,
  redactText,
  type QuarantinedArtifact,
  type RedactionFinding,
  type RedactionVault,
} from '@phoenix-ai/redaction-hardening';
import {
  assessKnowledgeRisk,
  buildJavaCanonicalBundle,
  extractChangeCoupling,
  extractInfrastructure,
  extractJavaProject,
  type IacExtractionResult,
  type JavaExtractionResult,
  type JavaParseCache,
  type KnowledgeRiskFinding,
} from '@phoenix-ai/extraction-engine';
import type { CommitRecord } from '@phoenix-ai/ingestion-connectors';
import {
  createGraphVersion,
  describeChangelog,
  diffGraphVersions,
  type Changelog,
  type GraphVersion,
  type GraphVersionStore,
} from '@phoenix-ai/drift-detection';
import { planGaps, type GapReport } from '@phoenix-ai/gap-analysis';
import {
  buildActionGroundingRelationships,
  buildCapabilityRelationships,
  buildConceptGroundingRelationships,
  buildStateGroundingRelationships,
  extractTechnicalEvidence,
  extractVocabulary,
  inferBusinessCapabilities,
  inferBusinessConcepts,
  inferEntityStates,
  inferJourneys,
  mapJourneysToEntitiesAndStates,
  materializeBusinessCapabilities,
  materializeBusinessConcepts,
} from '@phoenix-ai/inference-engine';
import { reconcileClaims, type Claim } from '@phoenix-ai/reconciliation-engine';
import type { KnowledgeValue } from '@phoenix-ai/knowledge-graph';
import {
  parseAndValidateOkfYaml,
  serializeOkfYaml,
  toOkfDocument,
  validateCanonicalKnowledgeBundle,
  validateSourceReferences,
  type CanonicalKnowledgeBundle,
  type CanonicalKnowledgeObject,
  type CanonicalKnowledgeRelationship,
  type OkfDocument,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import {
  buildGraphWriteOperations,
  mapOkfBundleToGraph,
  type GraphWriteOperations,
} from '@phoenix-ai/graph-persistence';
import { persistAndVerify, type GraphTarget } from './graph.js';
import { PipelineStageError, type StageReport } from './report.js';

export interface PipelineOptions {
  readonly systemId: string;
  /** ISO-8601. Required: no stage reads the clock, which is what makes a run reproducible. */
  readonly generatedAt: string;
  readonly source: {
    readonly connector: SourceRepositoryConnector;
    readonly descriptor: SourceRepositoryDescriptor;
    readonly filter?: ArtifactFilter;
  };
  /** Semantic inference (P5). Default `true`. */
  readonly inference?: boolean;
  /**
   * Claims from OTHER sources to reconcile against (e.g. Jira, docs), with
   * their `Source` registry entries so provenance stays resolvable. Omit for
   * a single-source run: reconciliation is then reported as skipped.
   */
  readonly reconciliation?: {
    readonly claims: readonly Claim[];
    readonly sources: readonly Source[];
  };
  /** Neo4j target. Omit to build and check the write plan without persisting. */
  readonly graph?: GraphTarget;
  /** Read commit history for change coupling and knowledge risk (FR-ING-06, FR-DET-05/06). Default `true`. */
  readonly history?: boolean;
  /** FR-KG-05: where versions are kept. Omit to compute the version without storing it. */
  readonly versionStore?: GraphVersionStore;
  /** FR-DFT-01: reuse parses of unchanged files from earlier runs. */
  readonly parseCache?: JavaParseCache;
}

export interface PipelineRun {
  readonly bundle: CanonicalKnowledgeBundle;
  readonly document: OkfDocument;
  readonly okfYaml: string;
  readonly graphOperations: GraphWriteOperations;
  readonly redaction: {
    readonly findings: readonly RedactionFinding[];
    readonly quarantined: readonly QuarantinedArtifact[];
    /** Encrypted originals of everything redacted. Never part of any output. */
    readonly vault: RedactionVault;
  };
  /** The full extraction result, including facts that have no canonical kind yet (see the extraction stage's notes). */
  readonly extraction: JavaExtractionResult;
  /** FR-DET-04: deployment topology from Dockerfiles, compose files and Kubernetes manifests. */
  readonly infrastructure: IacExtractionResult;
  /** Commits read for history analysis, oldest first (empty when unavailable or disabled). */
  readonly history: readonly CommitRecord[];
  /** FR-DET-06: per-element ownership and staleness. */
  readonly knowledgeRisk: readonly KnowledgeRiskFinding[];
  /** FR-KG-05: this run's immutable, content-addressed graph version. */
  readonly version: GraphVersion;
  /** FR-DFT-02: what changed since the previous stored version (a baseline on a first run). */
  readonly changelog: Changelog;
  /** FR-GAP-01..03: coverage per artifact and the inputs that would close each gap. */
  readonly gaps: GapReport;
  /** The artifacts that passed the redaction gate -- the only content any stage saw. */
  readonly artifacts: readonly RawArtifact[];
  readonly stages: readonly StageReport[];
}

const APPLICATION_CONFIG_PATTERN = /(^|\/)application(-[^/.]+)?\.(properties|ya?ml)$/;

export async function runPipeline(options: PipelineOptions): Promise<PipelineRun> {
  const { systemId, generatedAt } = options;
  const stages: StageReport[] = [];
  const fail = (stage: StageReport['stage'], errors: readonly string[]): never => {
    throw new PipelineStageError(stage, errors, stages);
  };

  // --- 1. Ingestion -------------------------------------------------------------------------------
  const { descriptor, connector, filter } = options.source;
  const ingested = await withConnectorSession(connector, descriptor, async (session) => ({
    collection: await collectArtifacts(session, filter ?? descriptor.filter),
    source: session.source,
    revision: session.revision,
    history:
      options.history === false || session.commitHistory === undefined
        ? undefined
        : await session.commitHistory(),
  }));
  stages.push({
    stage: 'ingestion',
    status: 'completed',
    input: ingested.collection.artifacts.length + ingested.collection.failures.length,
    output: ingested.collection.artifacts.length,
    dropped: ingested.collection.failures.map((failure) => ({
      item: failure.path,
      reason: `${failure.reason}${failure.detail === undefined ? '' : `: ${failure.detail}`}`,
    })),
    notes: [
      `source ${ingested.source.id}${ingested.revision === undefined ? '' : ` at revision ${ingested.revision}`}`,
      ingested.history === undefined
        ? options.history === false
          ? 'commit history not read: disabled for this run'
          : 'commit history not read: this connector cannot provide it'
        : `${ingested.history.length} commit(s) of history read (authors pseudonymised)`,
    ],
  });

  // --- 2. Redaction gate (FR-SEC-01..04) ----------------------------------------------------------
  const redaction = redactArtifacts(ingested.collection.artifacts);
  stages.push({
    stage: 'redaction',
    status: 'completed',
    input: ingested.collection.artifacts.length,
    output: redaction.passed.length,
    dropped: redaction.quarantined.map((q) => ({
      item: q.path,
      reason: `quarantined (${q.reason}): ${q.detail}`,
    })),
    notes: [
      `${redaction.findings.length} value(s) redacted in place; originals held only in the encrypted, non-retaining vault`,
    ],
  });

  // --- 3. Deterministic extraction (FR-DET-*) -----------------------------------------------------
  // FR-SEC-04: refuse anything that did not come through the gate.
  assertRedactionGatePassed(redaction.passed);
  const bridgeOptions = {
    systemId,
    sourceId: descriptor.id,
    generatedAt,
    ...(ingested.revision === undefined ? {} : { sourceVersion: ingested.revision }),
  };
  const cache = options.parseCache;
  const statsBefore = cache === undefined ? undefined : { ...cache.stats };
  const extraction = extractJavaProject(redaction.passed, {
    ...bridgeOptions,
    ...(cache === undefined ? {} : { parseCache: cache }),
  });
  const infrastructure = extractInfrastructure(redaction.passed, bridgeOptions);
  const history = ingested.history ?? [];
  const observedObjects = [...extraction.objects, ...infrastructure.objects];
  const coupling = extractChangeCoupling(history, observedObjects, bridgeOptions);
  const knowledgeRisk = assessKnowledgeRisk(history, observedObjects, { generatedAt });
  const javaReport = extractionReport(redaction.passed, extraction);
  stages.push({
    ...javaReport,
    output:
      javaReport.output +
      infrastructure.objects.length +
      infrastructure.relationships.length +
      coupling.length,
    dropped: [
      ...javaReport.dropped,
      ...infrastructure.failures.map((f) => ({
        item: f.path,
        reason: `deployment descriptor not parsed: ${f.reason}`,
      })),
    ],
    notes: [
      ...javaReport.notes,
      `infrastructure: ${infrastructure.files.length} deployment descriptor(s) -> ${infrastructure.objects.length} object(s), ${infrastructure.relationships.length} relationship(s)`,
      `history: ${coupling.length} change-coupling relationship(s); ${knowledgeRisk.filter((r) => r.atRisk).length} element(s) at knowledge risk (single owner, stale)`,
      ...(cache === undefined || statsBefore === undefined
        ? []
        : [
            `parse cache: ${cache.stats.parsed - statsBefore.parsed} file(s) parsed, ${cache.stats.reused - statsBefore.reused} unchanged file(s) reused (FR-DFT-01)`,
          ]),
    ],
  });

  // --- 4. Semantic inference (optional) -----------------------------------------------------------
  const extractedObjects = extraction.objects;
  const inferred =
    options.inference === false ? undefined : runInference(extractedObjects, systemId, generatedAt);
  stages.push(
    inferred === undefined
      ? {
          stage: 'inference',
          status: 'skipped',
          input: extractedObjects.length,
          output: 0,
          dropped: [],
          notes: ['inference disabled for this run'],
        }
      : {
          stage: 'inference',
          status: 'completed',
          input: extractedObjects.length,
          output: inferred.objects.length + inferred.relationships.length,
          dropped: [],
          notes: [
            `${inferred.objects.length} inferred object(s), ${inferred.relationships.length} relationship(s); extracted objects are never modified`,
            `${inferred.resolvedToExisting} concept(s) resolved to an already-extracted object and deliberately not duplicated`,
          ],
        },
  );

  // --- 5. Reconciliation (optional) ---------------------------------------------------------------
  // P8: claims from another source are text that never went through the
  // artifact gate (a Jira ticket body, a wiki excerpt). They pass the same
  // control, into the same vault, before anything is reconciled from them.
  const claimRedaction =
    options.reconciliation === undefined
      ? undefined
      : redactClaims(options.reconciliation.claims, redaction.vault);
  const reconciliation =
    claimRedaction === undefined
      ? undefined
      : reconcileClaims(claimRedaction.claims, { systemId, generatedAt });
  stages.push(
    reconciliation === undefined
      ? {
          stage: 'reconciliation',
          status: 'skipped',
          input: 0,
          output: 0,
          dropped: [],
          notes: [
            'single-source run: no claims from another source to reconcile against, so extraction confidence stands as observed rather than inventing corroboration',
          ],
        }
      : {
          stage: 'reconciliation',
          status: 'completed',
          input: options.reconciliation?.claims.length ?? 0,
          output: reconciliation.agreed.length + reconciliation.conflicts.length,
          dropped: [],
          notes: [
            `${reconciliation.agreed.length} agreed group(s), ${reconciliation.conflicts.length} conflict(s) retained with every position (FR-REC-04)`,
            `${claimRedaction?.findings.length ?? 0} value(s) redacted from the supplied claims before reconciliation`,
          ],
        },
  );

  // --- 6. Knowledge graph: one validated canonical bundle -----------------------------------------
  const extractedBundle = buildJavaCanonicalBundle(extraction, {
    systemId,
    generatedAt,
    sources: [ingested.source],
  });
  const bundle: CanonicalKnowledgeBundle = {
    ...extractedBundle,
    objects: [
      ...extractedBundle.objects,
      ...infrastructure.objects,
      ...(inferred?.objects ?? []),
      ...(reconciliation?.conflicts ?? []),
    ],
    relationships: [
      ...extractedBundle.relationships,
      ...infrastructure.relationships,
      ...coupling,
      ...(inferred?.relationships ?? []),
    ],
    sources: [...(extractedBundle.sources ?? []), ...(options.reconciliation?.sources ?? [])],
  };
  const bundleErrors = [
    ...validateCanonicalKnowledgeBundle(bundle).errors,
    ...validateSourceReferences(bundle).errors,
  ];
  if (bundleErrors.length > 0) fail('knowledge-graph', bundleErrors);
  stages.push({
    stage: 'knowledge-graph',
    status: 'completed',
    input: bundle.objects.length + bundle.relationships.length,
    output: bundle.objects.length + bundle.relationships.length,
    dropped: [],
    notes: [
      `${bundle.objects.length} object(s), ${bundle.relationships.length} relationship(s), ${bundle.sources?.length ?? 0} registered source(s); bundle and source references validated`,
    ],
  });

  // --- 7. Graph persistence -----------------------------------------------------------------------
  const mapping = mapOkfBundleToGraph(bundle);
  if (mapping.issues.length > 0) {
    // An unmappable element would exist in the bundle and the OKF but never
    // in the graph -- exactly the silent loss this pipeline exists to stop.
    fail(
      'graph-persistence',
      mapping.issues.map(
        (i) => `${i.elementType} ${i.id ?? '(no id)'} (${i.kind ?? '?'}): ${i.reason}`,
      ),
    );
  }
  const graphOperations = buildGraphWriteOperations(mapping);
  stages.push(
    await graphStage('graph-persistence', bundle, graphOperations, options.graph, stages),
  );

  // --- 8. OKF -------------------------------------------------------------------------------------
  const { document, okfYaml } = renderOkf(bundle, stages, 'okf');
  stages.push({
    stage: 'okf',
    status: 'completed',
    input: bundle.objects.length,
    output: document.objects.length,
    dropped: [],
    notes: ['serialised to OKF YAML and re-parsed through the real validator without loss'],
  });

  // --- 9. Graph version (FR-KG-05) ----------------------------------------------------------------
  const store = options.versionStore;
  const parent = store === undefined ? undefined : await store.latest(systemId);
  const version = createGraphVersion(bundle, parent);
  if (store !== undefined) await store.save(version);
  stages.push({
    stage: 'graph-versioning',
    status: 'completed',
    input: bundle.objects.length + bundle.relationships.length,
    output: version.objectCount + version.relationshipCount,
    dropped: [],
    notes: [
      store === undefined
        ? `version ${version.id} computed; no version store configured, so it was not kept`
        : parent?.id === version.id
          ? `version ${version.id} is identical to the latest stored version; nothing new stored`
          : `version ${version.id} stored${parent === undefined ? ' (first version of this system)' : `, parent ${parent.id}`}`,
    ],
  });

  // --- 10. Drift (FR-DFT-02..04) ------------------------------------------------------------------
  const changelog = diffGraphVersions(parent, version);
  stages.push({
    stage: 'drift',
    status: parent === undefined ? 'skipped' : 'completed',
    input: version.objectCount + version.relationshipCount,
    output: changelog.changes.length,
    dropped: [],
    notes: [
      parent === undefined
        ? `no earlier version to compare against: this run is the baseline (${changelog.summary.added} element(s) recorded)`
        : describeChangelog(changelog),
    ],
  });

  // --- 11. Gap analysis (FR-GAP-01..03) -----------------------------------------------------------
  const gaps = planGaps(bundle, {
    ingestionFailures: ingested.collection.failures.map((f) => ({
      path: f.path,
      reason: f.reason,
    })),
    quarantined: redaction.quarantined.map((q) => ({ path: q.path, reason: q.reason })),
    parseFailures: [
      ...extraction.parseFailures.map((f) => ({ path: f.path, reason: f.reason })),
      ...infrastructure.failures.map((f) => ({ path: f.path, reason: f.reason })),
    ],
    knowledgeRisk,
  });
  const coverageCount = (level: string) => gaps.coverage.filter((c) => c.coverage === level).length;
  stages.push({
    stage: 'gap-analysis',
    status: 'completed',
    input: gaps.coverage.length,
    output: gaps.gaps.length,
    dropped: [],
    notes: [
      `coverage ${gaps.coverageScore}: ${coverageCount('covered')} covered, ${coverageCount('partial')} partial, ${coverageCount('uncovered')} uncovered artifact(s); ${gaps.gaps.length} gap(s) to raise with collaborators`,
    ],
  });

  return {
    bundle,
    document,
    okfYaml,
    graphOperations,
    redaction: {
      findings: [...redaction.findings, ...(claimRedaction?.findings ?? [])],
      quarantined: redaction.quarantined,
      vault: redaction.vault,
    },
    extraction,
    infrastructure,
    history,
    knowledgeRisk,
    version,
    changelog,
    gaps,
    artifacts: redaction.passed,
    stages,
  };
}

/**
 * Runs every text field of every claim -- the asserted value (recursively,
 * for structured values) and each evidence excerpt and locator -- through
 * the redaction gate's `redactText`. Each field gets its own location, so
 * tokens are deterministic and findings say exactly where a value was.
 */
function redactClaims(
  claims: readonly Claim[],
  vault: RedactionVault,
): { claims: Claim[]; findings: RedactionFinding[] } {
  const findings: RedactionFinding[] = [];
  const scrub = (text: string, sourceId: string, path: string): string => {
    const result = redactText(text, { sourceId, path }, vault);
    findings.push(...result.findings);
    return result.text;
  };
  const scrubValue = (value: KnowledgeValue, sourceId: string, path: string): KnowledgeValue => {
    if (typeof value === 'string') return scrub(value, sourceId, path);
    if (Array.isArray(value)) return value.map((v, i) => scrubValue(v, sourceId, `${path}/${i}`));
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value).map(([k, v]) => [k, scrubValue(v, sourceId, `${path}/${k}`)]),
      );
    }
    return value;
  };

  const redacted = claims.map((claim) => {
    const base = `claims/${claim.subjectId}/${claim.attribute}`;
    return {
      ...claim,
      value: scrubValue(claim.value, claim.sourceId, `${base}#value`),
      evidence: claim.evidence.map((entry, i) => ({
        ...entry,
        ...(entry.excerpt === undefined
          ? {}
          : { excerpt: scrub(entry.excerpt, entry.sourceId, `${base}#evidence/${i}/excerpt`) }),
        ...(entry.locator === undefined
          ? {}
          : { locator: scrub(entry.locator, entry.sourceId, `${base}#evidence/${i}/locator`) }),
      })),
    };
  });
  return { claims: redacted, findings };
}

function extractionReport(
  passed: readonly RawArtifact[],
  extraction: JavaExtractionResult,
): StageReport {
  const mainJava = new Set([
    ...extraction.layout.modules.flatMap((m) => m.mainSourceFiles),
    ...extraction.layout.unassignedJavaFiles,
  ]);
  const testJava = extraction.layout.modules.flatMap((m) => m.testSourceFiles).length;
  const config = passed.filter((a) => APPLICATION_CONFIG_PATTERN.test(a.path)).length;
  const notApplicable = passed.length - mainJava.size - testJava - config;

  return {
    stage: 'extraction',
    status: 'completed',
    input: mainJava.size + config,
    output: extraction.objects.length + extraction.relationships.length,
    dropped: extraction.parseFailures.map((f) => ({
      item: f.path,
      reason: `parse failure (${f.reason}): ${f.detail}`,
    })),
    notes: [
      `${mainJava.size} main Java file(s) and ${config} application config file(s) analysed; ${testJava} test source file(s) and ${notApplicable} other artifact(s) are outside Java extraction's scope`,
      `bridged to canonical: ${extraction.objects.length} object(s), ${extraction.relationships.length} relationship(s)`,
      // Kept in `PipelineRun.extraction`, but with no canonical kind to become
      // yet -- see `extract-java.ts`. Reported so the gap is visible.
      `extracted but not bridged (no canonical kind yet): ${extraction.calls.length} call(s), ${extraction.repositories.length} repository fact(s), ${extraction.config.length} config fact(s), ${extraction.configReferences.length} config reference(s)`,
    ],
  };
}

export interface InferenceOutput {
  readonly objects: CanonicalKnowledgeObject[];
  readonly relationships: CanonicalKnowledgeRelationship[];
  readonly resolvedToExisting: number;
}

/**
 * The P5 inference chain, composed exactly as its acceptance test
 * (`aurora-fintech-validation.test.ts`) composes it. Exported so it can be
 * run over an existing bundle's extracted objects (e.g. a committed OKF
 * sample) as well as inside `runPipeline`.
 */
export function runInference(
  objects: readonly CanonicalKnowledgeObject[],
  systemId: string,
  generatedAt: string,
): InferenceOutput {
  const terms = extractVocabulary(extractTechnicalEvidence(objects), generatedAt);
  const concepts = inferBusinessConcepts(terms, objects, generatedAt);
  const capabilities = inferBusinessCapabilities(concepts, generatedAt);
  const journeys = inferJourneys(objects, concepts, systemId, generatedAt);
  const idMap = new Map(concepts.map((c) => [c.id, c.existingObjectId ?? c.id]));
  const states = inferEntityStates(objects, concepts, idMap, systemId, generatedAt);
  const journeyMapping = mapJourneysToEntitiesAndStates(
    journeys.objects,
    states.objects,
    concepts,
    idMap,
  );
  const actionObjectsById = new Map(
    journeys.objects.filter((o) => o.kind === 'journey.action').map((o) => [o.identity.id, o]),
  );
  const stateObjectsById = new Map(states.objects.map((o) => [o.identity.id, o]));

  return {
    objects: [
      ...materializeBusinessConcepts(concepts, systemId, generatedAt),
      ...materializeBusinessCapabilities(capabilities, systemId, generatedAt),
      ...journeys.objects,
      ...states.objects,
    ],
    relationships: [
      ...buildCapabilityRelationships(capabilities),
      ...journeys.relationships,
      ...states.relationships,
      ...journeyMapping.relationships,
      ...buildConceptGroundingRelationships(concepts),
      ...buildActionGroundingRelationships(journeys.actionGroundingLinks, actionObjectsById),
      ...buildStateGroundingRelationships(states.stateGroundingLinks, stateObjectsById),
    ],
    resolvedToExisting: concepts.filter((c) => c.existingObjectId !== undefined).length,
  };
}

/** OKF stage shared with the review cycle: serialise, re-parse, and refuse any loss. */
export function renderOkf(
  bundle: CanonicalKnowledgeBundle,
  stages: readonly StageReport[],
  stage: 'okf' | 'okf-regeneration',
): { document: OkfDocument; okfYaml: string } {
  const document = toOkfDocument(bundle);
  const okfYaml = serializeOkfYaml(document);
  const reparsed = parseAndValidateOkfYaml(okfYaml);
  if (!reparsed.valid) throw new PipelineStageError(stage, reparsed.errors, stages);
  if (document.objects.length !== bundle.objects.length) {
    throw new PipelineStageError(
      stage,
      [
        `OKF document has ${document.objects.length} object(s); the bundle has ${bundle.objects.length}`,
      ],
      stages,
    );
  }
  return { document, okfYaml };
}

/** Graph stage shared with the review cycle. */
export async function graphStage(
  stage: 'graph-persistence' | 'graph-update',
  bundle: CanonicalKnowledgeBundle,
  operations: GraphWriteOperations,
  target: GraphTarget | undefined,
  stages: readonly StageReport[],
): Promise<StageReport> {
  const planned = operations.nodeOperations.length + operations.relationshipOperations.length;
  if (target === undefined) {
    return {
      stage,
      status: 'skipped',
      input: planned,
      output: 0,
      dropped: [],
      notes: [
        `no Neo4j target configured: ${operations.nodeOperations.length} node and ${operations.relationshipOperations.length} relationship write(s) planned and checked (every element mappable), nothing persisted`,
      ],
    };
  }
  const verification = await persistAndVerify(target, bundle, operations);
  if (verification.differences.length > 0) {
    throw new PipelineStageError(
      stage,
      verification.differences.map((d) => `${d.kind} ${d.id}: ${d.detail}`),
      stages,
    );
  }
  return {
    stage,
    status: 'completed',
    input: planned,
    output: planned,
    dropped: [],
    notes: [
      `persisted to Neo4j database "${target.database}" and read back: every bundle element present with matching label, attribute values, provenance, evidence and confidence`,
    ],
  };
}
