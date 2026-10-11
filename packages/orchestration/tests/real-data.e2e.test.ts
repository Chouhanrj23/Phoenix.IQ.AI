import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  parseAndValidateOkfYaml,
  parseOkfYaml,
  validateCanonicalKnowledgeBundle,
  validateSourceReferences,
  type CanonicalKnowledgeBundle,
  type OkfDocument,
} from '@phoenix-ai/knowledge-graph';
import { createGitRepositoryConnector } from '@phoenix-ai/ingestion-connectors';
import { buildGraphWriteOperations, mapOkfBundleToGraph } from '@phoenix-ai/graph-persistence';
import { createInMemoryReviewDecisionStore, recordReviewDecision } from '@phoenix-ai/review-loop';
import { runInference, runPipeline, runReviewCycle, type PipelineRun } from '../src/index.js';

/**
 * P8 -- the pipeline over REAL data that ships with this repository.
 *
 *  1. `spring-petclinic.okf.yaml` -- P3-11's real extraction of the upstream
 *     spring-projects/spring-petclinic repository (committed output; cloning
 *     it here would need the network). It drives every stage downstream of
 *     extraction: inference, the knowledge graph, the graph plan, OKF, and a
 *     full review cycle.
 *  2. This repository itself, read by the real git connector from its
 *     committed tree -- hundreds of real files, including real binaries --
 *     through ingestion and the redaction gate.
 */

const PETCLINIC_YAML = fileURLToPath(
  new URL('../../extraction-engine/samples/spring-petclinic.okf.yaml', import.meta.url),
);
const AT = '2026-10-06T10:00:00.000Z';
const LATER = '2026-10-06T11:00:00.000Z';

describe('real spring-petclinic extraction output through every downstream stage', () => {
  let extracted: CanonicalKnowledgeBundle;
  let bundle: CanonicalKnowledgeBundle;

  beforeAll(() => {
    const yaml = readFileSync(PETCLINIC_YAML, 'utf8');
    expect(parseAndValidateOkfYaml(yaml).valid).toBe(true);
    extracted = parseOkfYaml(yaml) as OkfDocument;

    const inferred = runInference(extracted.objects, extracted.systemId, AT);
    bundle = {
      ...extracted,
      objects: [...extracted.objects, ...inferred.objects],
      relationships: [...extracted.relationships, ...inferred.relationships],
    };
  });

  it('inference over real extracted facts yields a bundle that validates against the REAL source registry', () => {
    expect(bundle.objects.length).toBeGreaterThan(extracted.objects.length);
    expect(validateCanonicalKnowledgeBundle(bundle)).toEqual({ valid: true, errors: [] });
    expect(validateSourceReferences(bundle)).toEqual({ valid: true, errors: [] });
  });

  it('every real and inferred element maps to the graph — none unmappable', () => {
    const mapping = mapOkfBundleToGraph(bundle);
    expect(mapping.issues).toEqual([]);
    const operations = buildGraphWriteOperations(mapping);
    expect(operations.nodeOperations).toHaveLength(bundle.objects.length);
    expect(operations.relationshipOperations).toHaveLength(bundle.relationships.length);
  });

  it('a human correction to a real entity flows to the updated knowledge, graph plan and OKF', async () => {
    const owner = bundle.objects.find((o) => o.kind === 'domain.entity' && o.label === 'Owner');
    expect(owner?.attributes.description).toBe('Maps to table "owners".');

    const store = createInMemoryReviewDecisionStore();
    await recordReviewDecision(store, {
      systemId: bundle.systemId,
      targetObjectId: owner?.identity.id ?? '',
      targetLabel: 'Owner',
      targetAttribute: 'description',
      decision: 'corrected',
      previousValue: 'Maps to table "owners".',
      correctedValue: 'Maps to table "owners"; archived owners move to "owners_history".',
      reviewerId: 'petclinic-maintainer',
      decidedAt: AT,
    });

    const document = { ...bundle, okfVersion: '2026-08-p2-02' } as OkfDocument;
    const cycle = await runReviewCycle({ bundle, document }, await store.listAll(), {
      at: LATER,
    });

    const updated = cycle.bundle.objects.find((o) => o.identity.id === owner?.identity.id);
    expect(updated?.attributes.description).toContain('owners_history');
    expect(cycle.okfYaml).toContain('owners_history');
    expect(parseAndValidateOkfYaml(cycle.okfYaml).valid).toBe(true);
    expect(cycle.staleAfter).toBe(false);
    const op = cycle.graphOperations.nodeOperations.find((n) => n.id === owner?.identity.id);
    expect((op?.params.properties as Record<string, unknown>).attr_description).toContain(
      'owners_history',
    );
    // Every other real object is untouched.
    for (const object of bundle.objects) {
      if (object.identity.id === owner?.identity.id) continue;
      expect(cycle.bundle.objects.find((o) => o.identity.id === object.identity.id)).toEqual(
        object,
      );
    }
  });
});

describe("this repository's committed tree through ingestion and the redaction gate", () => {
  let run: PipelineRun;
  const repoRoot = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[/\\]$/, '');

  beforeAll(async () => {
    run = await runPipeline({
      systemId: 'phoenix-ai',
      generatedAt: AT,
      source: {
        connector: createGitRepositoryConnector(),
        descriptor: {
          id: 'repo://phoenix-ai',
          sourceType: 'source-code',
          label: 'phoenix-ai (this repository)',
          locator: `file://${encodeURI(repoRoot.replace(/\\/g, '/'))}`,
          repository: { kind: 'local-directory' },
          filter: { excludePaths: ['node_modules', '.git', '.turbo', 'dist', 'coverage'] },
        },
      },
    });
  }, 180_000);

  it('accounts for every real file: read, redacted, or quarantined with a reason', () => {
    const [ingestion, redaction] = run.stages;
    expect(ingestion?.output).toBeGreaterThan(100);
    expect(redaction?.input).toBe(ingestion?.output);
    expect((redaction?.output ?? 0) + (redaction?.dropped.length ?? 0)).toBe(redaction?.input);
  });

  it('quarantines the real binaries (screenshots) instead of passing unscanned content', () => {
    expect(run.redaction.quarantined.some((q) => q.path.endsWith('.png'))).toBe(true);
    for (const q of run.redaction.quarantined) {
      expect(['binary-content-not-scannable', 'content-not-text', 'scan-error']).toContain(
        q.reason,
      );
    }
  });

  it('finds and removes real PII-shaped values (e.g. test email addresses), recording only locations', () => {
    expect(run.redaction.findings.length).toBeGreaterThan(0);
    for (const finding of run.redaction.findings) {
      expect(finding.line).toBeGreaterThan(0);
      expect(run.redaction.vault.has(finding.token)).toBe(true);
    }
  });

  it("states that this TypeScript repository is outside Java extraction's scope rather than inventing facts", () => {
    expect(run.extraction.objects).toEqual([]);
    expect(run.stages.find((s) => s.stage === 'extraction')?.notes[0]).toMatch(
      /0 main Java file\(s\).*outside Java extraction's scope/,
    );
    // P8 (FR-DET-04): the repository's real docker-compose.yml IS deployment
    // knowledge, so the bundle holds exactly that -- and nothing else.
    expect(run.infrastructure.files).toContain('docker-compose.yml');
    expect(run.infrastructure.objects.length).toBeGreaterThan(0);
    expect(run.bundle.objects).toEqual(run.infrastructure.objects);
    for (const object of run.bundle.objects) expect(object.kind).toMatch(/^deployment\./);
    expect(parseAndValidateOkfYaml(run.okfYaml).valid).toBe(true);
  });
});
