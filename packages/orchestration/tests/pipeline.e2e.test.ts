import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  parseAndValidateOkfYaml,
  parseOkfYaml,
  validateCanonicalKnowledgeBundle,
  validateSourceReferences,
  type CanonicalKnowledgeObject,
  type OkfDocument,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import { claimFromObject, type Claim } from '@phoenix-ai/reconciliation-engine';
import { okfRegenerationState } from '@phoenix-ai/okf-renderers';
import {
  createInMemoryReviewDecisionStore,
  CORRECTION_ATTRIBUTES,
  recordReviewDecision,
} from '@phoenix-ai/review-loop';
import {
  FORWARD_STAGES,
  REVIEW_STAGES,
  PipelineStageError,
  runPipeline,
  runReviewCycle,
  type PipelineRun,
  type ReviewCycleResult,
  type StageReport,
} from '../src/index.js';
import { createFixtureRepo, FIXTURE_SOURCE_ID, SECRETS, type FixtureRepo } from './fixture-repo.js';

// Several tests run a complete fresh pipeline (git, redaction, extraction,
// IaC, history, inference, versioning, gaps); under a full parallel test run
// that exceeds vitest's 5s default, as in the other end-to-end files.
vi.setConfig({ testTimeout: 30_000 });

/**
 * P8 -- the complete Phoenix chain, end to end, over a REAL git repository:
 *
 *   Source -> Ingestion -> Redaction -> Extraction -> Inference
 *   -> Reconciliation -> Knowledge graph -> Graph (write plan) -> OKF
 *   -> Human review -> Correction -> Updated canonical knowledge
 *   -> Updated graph -> Updated output
 *
 * Every stage is the real implementation. The repository is built with real
 * `git` and read by the real connector. Live Neo4j persistence is covered by
 * `pipeline.neo4j.test.ts`; here the graph stage is verified as a write
 * plan, which is exactly what is sent to Neo4j.
 */

const SYSTEM_ID = 'order-service';
const T0 = '2026-10-06T10:00:00.000Z';
const T1 = '2026-10-06T11:00:00.000Z';
const T2 = '2026-10-06T12:00:00.000Z';

let repo: FixtureRepo;
let run: PipelineRun;

beforeAll(async () => {
  repo = createFixtureRepo();
  run = await runPipeline({
    systemId: SYSTEM_ID,
    generatedAt: T0,
    source: { connector: repo.connector, descriptor: repo.descriptor },
  });
}, 60_000);

afterAll(() => repo?.dispose());

function stage(stages: readonly StageReport[], name: StageReport['stage']): StageReport {
  const found = stages.find((s) => s.stage === name);
  if (found === undefined) throw new Error(`stage ${name} missing`);
  return found;
}

function objectNamed(label: string, kind = 'domain.entity'): CanonicalKnowledgeObject {
  const found = run.bundle.objects.find((o) => o.label === label && o.kind === kind);
  if (found === undefined) throw new Error(`${kind} ${label} missing`);
  return found;
}

/** Every place a value could leak to: the bundle, the OKF text, the graph write plan, the raw extraction facts, and the reports. */
function everyOutput(target: { stages: readonly StageReport[] } & Partial<PipelineRun>): string {
  return JSON.stringify([
    target.bundle,
    target.okfYaml,
    target.graphOperations,
    target.extraction,
    target.stages,
  ]);
}

describe('stage sequence and accounting — nothing leaves the pipeline without a recorded reason', () => {
  it('runs every forward stage, in the defined order (FR-ORC-01)', () => {
    expect(run.stages.map((s) => s.stage)).toEqual(FORWARD_STAGES);
  });

  it('only optional stages may be skipped, and each says why', () => {
    for (const report of run.stages) {
      if (report.status === 'skipped') {
        // P8: drift is skipped on a system's first run -- it is the baseline.
        expect(['inference', 'reconciliation', 'graph-persistence', 'drift']).toContain(
          report.stage,
        );
        expect(report.notes.length).toBeGreaterThan(0);
      }
    }
  });

  it('conserves counts across ingestion and redaction: output + dropped = input', () => {
    const ingestion = stage(run.stages, 'ingestion');
    const redaction = stage(run.stages, 'redaction');
    expect(ingestion.output + ingestion.dropped.length).toBe(ingestion.input);
    expect(redaction.input).toBe(ingestion.output);
    expect(redaction.output + redaction.dropped.length).toBe(redaction.input);
  });

  it('every dropped item names the item and the reason', () => {
    for (const report of run.stages) {
      for (const dropped of report.dropped) {
        expect(dropped.item.length).toBeGreaterThan(0);
        expect(dropped.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it('the knowledge graph, graph plan and OKF all carry exactly the same elements', () => {
    const ids = run.bundle.objects.map((o) => o.identity.id).sort();
    expect(run.graphOperations.nodeOperations.map((op) => op.id).sort()).toEqual(ids);
    expect(run.document.objects.map((o) => o.identity.id).sort()).toEqual(ids);
    expect(run.graphOperations.relationshipOperations.map((op) => op.id).sort()).toEqual(
      run.bundle.relationships.map((r) => r.id).sort(),
    );
  });
});

describe('ingestion', () => {
  it('reads the real repository at its real revision and registers the source', () => {
    expect(stage(run.stages, 'ingestion').notes[0]).toContain(repo.head);
    expect(run.bundle.sources?.map((s) => s.id)).toEqual([FIXTURE_SOURCE_ID]);
  });
});

describe('redaction / security (FR-SEC-01..04)', () => {
  it('no secret or PII value appears in ANY output', () => {
    const outputs = everyOutput(run);
    for (const secret of Object.values(SECRETS)) expect(outputs).not.toContain(secret);
  });

  it('every removed value is held in the vault, recoverable only by explicit reveal', () => {
    const revealed = run.redaction.findings.map((f) => run.redaction.vault.reveal(f.token));
    expect(revealed).toEqual(
      expect.arrayContaining([
        SECRETS.datasourcePassword,
        SECRETS.urlPassword,
        SECRETS.paymentSecret,
        SECRETS.ownerEmail,
      ]),
    );
  });

  it('the redacted config still tells extraction WHICH settings exist', () => {
    const config = JSON.stringify(run.extraction.config);
    expect(config).toContain('spring.datasource.password');
    expect(config).toContain('[REDACTED:assigned-secret:');
  });

  it('quarantines the binary it cannot scan, and reports it', () => {
    expect(run.redaction.quarantined.map((q) => q.path)).toEqual(['docs/logo.png']);
    expect(stage(run.stages, 'redaction').dropped[0]?.item).toBe('docs/logo.png');
  });
});

describe('deterministic extraction (FR-DET-*)', () => {
  it('extracts the real entities and API, with file:line evidence at the real revision', () => {
    for (const object of [objectNamed('Order'), objectNamed('Customer')]) {
      expect(object.metadata.provenance[0]?.sourceId).toBe(FIXTURE_SOURCE_ID);
      expect(object.confidenceDetail?.basis).toBe('observed');
      const [evidence] = object.evidence;
      expect(evidence?.locator).toMatch(/\.java#L\d+(-L\d+)?$/);
      expect(evidence?.sourceVersion).toBe(repo.head);
    }
    expect(objectNamed('OrderController', 'integration.api').attributes.operations).toHaveLength(3);
  });

  it('reports — rather than silently drops — facts that have no canonical kind yet', () => {
    const notes = stage(run.stages, 'extraction').notes.join(' ');
    expect(notes).toContain('extracted but not bridged');
    expect(run.extraction.calls.length).toBeGreaterThan(0);
  });
});

describe('semantic inference (optional stage)', () => {
  it('marks every inferred object as non-observed and traces it to a real source', () => {
    const extractedIds = new Set(run.extraction.objects.map((o) => o.identity.id));
    const sourceIds = new Set(run.bundle.sources?.map((s) => s.id));
    const inferred = run.bundle.objects.filter((o) => !extractedIds.has(o.identity.id));
    expect(inferred.length).toBeGreaterThan(0);
    for (const object of inferred) {
      expect(object.confidenceDetail?.basis).not.toBe('observed');
      for (const entry of object.metadata.provenance) {
        expect(entry.derivedBy).toBe('inference-engine');
        expect(sourceIds.has(entry.sourceId)).toBe(true);
      }
    }
  });

  it('never modifies an extracted object', async () => {
    const withoutInference = await runPipeline({
      systemId: SYSTEM_ID,
      generatedAt: T0,
      inference: false,
      source: { connector: repo.connector, descriptor: repo.descriptor },
    });
    expect(stage(withoutInference.stages, 'inference').status).toBe('skipped');
    for (const object of withoutInference.bundle.objects) {
      expect(run.bundle.objects.find((o) => o.identity.id === object.identity.id)).toEqual(object);
    }
  });

  it('keeps inferred knowledge grounded: every groundedIn edge reaches the graph plan', () => {
    const grounded = run.bundle.relationships.filter((r) => r.kind === 'groundedIn');
    expect(grounded.length).toBeGreaterThan(0);
    const planned = new Set(run.graphOperations.relationshipOperations.map((op) => op.id));
    for (const edge of grounded) expect(planned.has(edge.id)).toBe(true);
  });
});

describe('knowledge graph, graph persistence plan, and OKF', () => {
  it('the bundle validates, including every provenance/evidence source reference', () => {
    expect(validateCanonicalKnowledgeBundle(run.bundle)).toEqual({ valid: true, errors: [] });
    expect(validateSourceReferences(run.bundle)).toEqual({ valid: true, errors: [] });
  });

  it('every node write carries its provenance, evidence and confidence', () => {
    for (const op of run.graphOperations.nodeOperations) {
      const properties = op.params.properties as Record<string, unknown>;
      expect(typeof properties.provenanceJson).toBe('string');
      expect(typeof properties.evidenceJson).toBe('string');
      expect(typeof properties.confidenceLevel).toBe('string');
    }
    expect(stage(run.stages, 'graph-persistence').status).toBe('skipped');
  });

  it('OKF round-trips losslessly through the real parser and validator', () => {
    expect(parseAndValidateOkfYaml(run.okfYaml).valid).toBe(true);
    expect((parseOkfYaml(run.okfYaml) as OkfDocument).objects).toEqual(run.document.objects);
  });
});

describe('reproducibility and stable identity (FR-ORC-03, FR-KG-04, BR-13)', () => {
  it('identical input yields byte-identical OKF, graph plan and redaction', async () => {
    const again = await runPipeline({
      systemId: SYSTEM_ID,
      generatedAt: T0,
      source: { connector: repo.connector, descriptor: repo.descriptor },
    });
    expect(again.okfYaml).toBe(run.okfYaml);
    expect(again.graphOperations).toEqual(run.graphOperations);
    expect(again.redaction.findings).toEqual(run.redaction.findings);
  });

  it('a later run of unchanged input keeps every element id', async () => {
    const later = await runPipeline({
      systemId: SYSTEM_ID,
      generatedAt: T2,
      source: { connector: repo.connector, descriptor: repo.descriptor },
    });
    expect(later.bundle.objects.map((o) => o.identity.id)).toEqual(
      run.bundle.objects.map((o) => o.identity.id),
    );
    expect(later.bundle.relationships.map((r) => r.id)).toEqual(
      run.bundle.relationships.map((r) => r.id),
    );
  });
});

describe('reconciliation with a second source (FR-REC-04/05)', () => {
  const DOCS_SOURCE: Source = {
    id: 'docs://example/data-dictionary',
    type: 'technical-doc',
    label: 'Order service data dictionary',
  };

  function claims(order: CanonicalKnowledgeObject): Claim[] {
    const fromCode = claimFromObject(order, 'description', 'structure', order.identity.id);
    if (fromCode === undefined) throw new Error('no code claim');
    return [
      fromCode,
      {
        subjectId: order.identity.id,
        attribute: 'description',
        value: 'Maps to table "purchase_orders".',
        claimCategory: 'structure',
        sourceId: DOCS_SOURCE.id,
        sourceType: 'technical-doc',
        derivedBy: 'data-dictionary-import',
        derivedAt: T0,
        evidence: [
          {
            id: 'ev-dictionary-orders',
            sourceId: DOCS_SOURCE.id,
            locator: `${DOCS_SOURCE.id}/tables#orders`,
            excerpt: 'Orders are stored in purchase_orders.',
          },
        ],
      },
    ];
  }

  it('retains BOTH positions as a conflict and carries it into the graph plan and OKF', async () => {
    const reconciled = await runPipeline({
      systemId: SYSTEM_ID,
      generatedAt: T0,
      source: { connector: repo.connector, descriptor: repo.descriptor },
      reconciliation: { claims: claims(objectNamed('Order')), sources: [DOCS_SOURCE] },
    });
    const conflict = reconciled.bundle.objects.find((o) => o.kind === 'reconciliation.conflict');
    expect(conflict).toBeDefined();
    const positions = (conflict?.attributes.positions ?? []) as Array<{ value: string }>;
    expect(positions.map((p) => p.value).sort()).toEqual([
      'Maps to table "orders".',
      'Maps to table "purchase_orders".',
    ]);
    expect(conflict?.evidence.map((e) => e.id)).toContain('ev-dictionary-orders');
    expect(
      reconciled.graphOperations.nodeOperations.find((op) => op.id === conflict?.identity.id)
        ?.label,
    ).toBe('Conflict');
    expect(reconciled.okfYaml).toContain('reconciliation.conflict');
    expect(stage(reconciled.stages, 'reconciliation').status).toBe('completed');
  });

  it('refuses — at the knowledge-graph stage — claims whose source is not registered', async () => {
    const attempt = runPipeline({
      systemId: SYSTEM_ID,
      generatedAt: T0,
      source: { connector: repo.connector, descriptor: repo.descriptor },
      reconciliation: { claims: claims(objectNamed('Order')), sources: [] },
    });
    await expect(attempt).rejects.toBeInstanceOf(PipelineStageError);
    await attempt.catch((error: PipelineStageError) => {
      expect(error.stage).toBe('knowledge-graph');
      expect(error.errors.join(' ')).toContain(DOCS_SOURCE.id);
      expect(error.completedStages.map((s) => s.stage)).toContain('reconciliation');
    });
  });
});

describe('human review -> correction -> updated knowledge, graph and output', () => {
  let cycle: ReviewCycleResult;
  let order: CanonicalKnowledgeObject;
  let customer: CanonicalKnowledgeObject;
  let decisionIds: { corrected: string; stale: string; unknown: string };

  beforeAll(async () => {
    order = objectNamed('Order');
    customer = objectNamed('Customer');
    const api = objectNamed('OrderController', 'integration.api');
    const store = createInMemoryReviewDecisionStore();
    const base = { systemId: SYSTEM_ID, reviewerId: 'architect-1' };

    const corrected = await recordReviewDecision(store, {
      ...base,
      targetObjectId: order.identity.id,
      targetLabel: 'Order',
      targetAttribute: 'description',
      decision: 'corrected',
      previousValue: String(order.attributes.description),
      correctedValue: 'Maps to table "sales_orders".',
      decidedAt: T1,
    });
    // Corrects a value the reviewer never actually saw -- must not be applied.
    // A different reviewer, so this conflict's human source is one no applied
    // correction registered -- it must still resolve in the updated output.
    const stale = await recordReviewDecision(store, {
      ...base,
      reviewerId: 'architect-2',
      targetObjectId: customer.identity.id,
      targetLabel: 'Customer',
      targetAttribute: 'description',
      decision: 'corrected',
      previousValue: 'Maps to table "clients".',
      correctedValue: 'Maps to table "accounts".',
      decidedAt: T1,
    });
    await recordReviewDecision(store, {
      ...base,
      targetObjectId: api.identity.id,
      targetLabel: 'OrderController',
      decision: 'confirmed',
      previousValue: 'OrderController',
      decidedAt: T1,
    });
    const unknown = await recordReviewDecision(store, {
      ...base,
      targetObjectId: 'ctr-not-in-this-bundle',
      targetLabel: 'Elsewhere',
      decision: 'confirmed',
      previousValue: 'x',
      decidedAt: T1,
    });
    decisionIds = {
      corrected: corrected.decision.identity.id,
      stale: stale.decision.identity.id,
      unknown: unknown.decision.identity.id,
    };

    cycle = await runReviewCycle(run, await store.listAll(), { at: T2 });
  });

  it('applies the correction to canonical knowledge, keeping identity and the superseded value', () => {
    const updated = cycle.bundle.objects.find((o) => o.identity.id === order.identity.id);
    expect(updated?.attributes.description).toBe('Maps to table "sales_orders".');
    expect(updated?.attributes[CORRECTION_ATTRIBUTES.supersededValue]).toBe(
      order.attributes.description,
    );
    expect(updated?.attributes[CORRECTION_ATTRIBUTES.decisionId]).toBe(decisionIds.corrected);
    expect(updated?.metadata.provenance.map((p) => p.derivedBy)).toContain('human-review');
    expect(updated?.metadata.provenance).toEqual(expect.arrayContaining(order.metadata.provenance));
    expect(updated?.evidence).toEqual(order.evidence);
  });

  it('retains a stale correction as a conflict in the updated output instead of applying or dropping it', () => {
    expect(cycle.bundle.objects.find((o) => o.identity.id === customer.identity.id)).toEqual(
      customer,
    );
    const conflict = cycle.bundle.objects.find(
      (o) =>
        o.kind === 'reconciliation.conflict' && o.attributes.subjectId === customer.identity.id,
    );
    expect(conflict).toBeDefined();
    const positions = (conflict?.attributes.positions ?? []) as Array<{ value: string }>;
    expect(positions.map((p) => p.value)).toContain('Maps to table "accounts".');
    const reparsed = parseOkfYaml(cycle.okfYaml) as OkfDocument;
    expect(reparsed.objects.some((o) => o.identity.id === conflict?.identity.id)).toBe(true);
    expect(validateSourceReferences(cycle.bundle)).toEqual({ valid: true, errors: [] });
    expect(cycle.graphOperations.nodeOperations.some((op) => op.id === conflict?.identity.id)).toBe(
      true,
    );
  });

  it('reports the decision whose target is not in this bundle, with a reason', () => {
    expect(cycle.decisionsWithoutTarget).toEqual([decisionIds.unknown]);
    expect(stage(cycle.stages, 'review-correction').dropped[0]?.item).toBe(decisionIds.unknown);
  });

  it('leaves every element the decisions did not touch byte-identical', () => {
    const touched = new Set([order.identity.id, customer.identity.id]);
    const api = objectNamed('OrderController', 'integration.api');
    touched.add(api.identity.id);
    for (const object of run.bundle.objects) {
      if (touched.has(object.identity.id)) continue;
      expect(cycle.bundle.objects.find((o) => o.identity.id === object.identity.id)).toEqual(
        object,
      );
    }
  });

  it('updates the graph plan with the corrected value on the SAME node id', () => {
    const op = cycle.graphOperations.nodeOperations.find((n) => n.id === order.identity.id);
    expect((op?.params.properties as Record<string, unknown>).attr_description).toBe(
      'Maps to table "sales_orders".',
    );
  });

  it('regenerates the output: valid, current, and showing the correction', () => {
    expect(parseAndValidateOkfYaml(cycle.okfYaml).valid).toBe(true);
    expect(cycle.okfYaml).toContain('sales_orders');
    expect(cycle.staleBefore).toBe(true);
    expect(cycle.staleAfter).toBe(false);
    expect(okfRegenerationState(run.document, []).stale).toBe(false);
    expect(cycle.regeneratedArtifacts).toContain('logical-data-model');
    expect(cycle.stages.map((s) => s.stage)).toEqual(REVIEW_STAGES);
  });

  it('carries no secret into the updated output either', () => {
    const outputs = everyOutput(cycle);
    for (const secret of Object.values(SECRETS)) expect(outputs).not.toContain(secret);
  });
});

describe('claims from another source pass the redaction gate too (P8 security)', () => {
  const TICKETS: Source = { id: 'ticket://acme-jira/ORD', type: 'ticket', label: 'Jira ORD' };
  const TICKET_SECRET = 'Tkt-Pa55w0rd-771';
  const TICKET_EMAIL = 'dba.oncall@example.com';

  it('removes secrets and PII from claim values and evidence before reconciliation', async () => {
    const order = objectNamed('Order');
    const ticketClaim: Claim = {
      subjectId: order.identity.id,
      attribute: 'description',
      value: `Maps to table "orders_v2" (ask ${TICKET_EMAIL}).`,
      claimCategory: 'structure',
      sourceId: TICKETS.id,
      sourceType: 'ticket',
      derivedBy: 'jira-import',
      derivedAt: T0,
      evidence: [
        {
          id: 'ev-ord-12',
          sourceId: TICKETS.id,
          locator: `${TICKETS.id}/ORD-12`,
          excerpt: `Migrated orders; db_password: "${TICKET_SECRET}" until rotation.`,
        },
      ],
    };
    const fromCode = claimFromObject(order, 'description', 'structure', order.identity.id);
    if (fromCode === undefined) throw new Error('no code claim');

    const reconciled = await runPipeline({
      systemId: SYSTEM_ID,
      generatedAt: T0,
      source: { connector: repo.connector, descriptor: repo.descriptor },
      reconciliation: { claims: [fromCode, ticketClaim], sources: [TICKETS] },
    });

    const outputs = everyOutput(reconciled);
    expect(outputs).not.toContain(TICKET_SECRET);
    expect(outputs).not.toContain(TICKET_EMAIL);
    // Still a real dispute -- the structure of the claim survives redaction.
    expect(reconciled.bundle.objects.some((o) => o.kind === 'reconciliation.conflict')).toBe(true);
    const revealed = reconciled.redaction.findings.map((f) =>
      reconciled.redaction.vault.reveal(f.token),
    );
    expect(revealed).toEqual(expect.arrayContaining([TICKET_SECRET, TICKET_EMAIL]));
    expect(stage(reconciled.stages, 'reconciliation').notes.join(' ')).toContain(
      '2 value(s) redacted from the supplied claims',
    );
  });
});
