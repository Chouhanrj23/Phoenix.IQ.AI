import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURE_OBJECT_KINDS,
  DEPLOYMENT_OBJECT_KINDS,
  DOMAIN_OBJECT_KINDS,
  INTEGRATION_OBJECT_KINDS,
  JOURNEY_OBJECT_KINDS,
  WORKITEM_OBJECT_KINDS,
  buildReviewDecision,
  parseAndValidateOkfYaml,
  serializeOkfYaml,
  type CanonicalKnowledgeBundle,
  type CanonicalKnowledgeObject,
} from '@phoenix-ai/knowledge-graph';

/** Every object kind the canonical model actually defines, read from the domain files themselves rather than re-typed here. */
const CANONICAL_OBJECT_KINDS: readonly string[] = [
  ...ARCHITECTURE_OBJECT_KINDS,
  ...DOMAIN_OBJECT_KINDS,
  ...JOURNEY_OBJECT_KINDS,
  ...INTEGRATION_OBJECT_KINDS,
  // P8: IaC extraction (FR-DET-04) and Jira work items (P6-04) now feed the
  // deployment and backlog artifacts; P5's inferred capabilities feed domains.
  ...DEPLOYMENT_OBJECT_KINDS,
  ...WORKITEM_OBJECT_KINDS,
  'business.capability',
];
import { CORRECTION_ATTRIBUTES, buildCorrectionNodeOperation } from '@phoenix-ai/review-loop';
import {
  affectedArtifacts,
  affectedByDecisions,
  artifactsForObjectKind,
  okfRegenerationState,
  regenerateOkfDocument,
  OKF_ARTIFACTS,
  OKF_ARTIFACT_IDS,
} from '../src/index.js';

/**
 * P7-05 -- OKF/documentation synchronisation after a human correction.
 *
 * The headline test walks the whole required chain in one go:
 *   extracted value -> human correction -> canonical model -> graph -> OKF output.
 */

const EXTRACTED_AT = '2026-09-01T00:00:00.000Z';
const DECIDED_AT = '2026-09-30T11:00:00.000Z';
const REGENERATED_AT = '2026-09-30T12:00:00.000Z';

function container(id: string, label: string, technology: string): CanonicalKnowledgeObject {
  return {
    identity: {
      id,
      systemId: 'aurora-commerce',
      createdAt: EXTRACTED_AT,
      updatedAt: EXTRACTED_AT,
      schemaVersion: '1.0.0',
    },
    category: 'entity',
    kind: 'architecture.container',
    label,
    attributes: { technology },
    metadata: {
      provenance: [
        {
          sourceId: `repo://aurora-commerce/services/${id}`,
          sourceType: 'source-code',
          derivedBy: 'extraction-engine',
          derivedAt: EXTRACTED_AT,
        },
      ],
      confidence: { level: 'low', score: 0.45, rationale: 'Two sources disagree.' },
    },
    evidence: [
      {
        id: `ev-${id}`,
        sourceId: `repo://aurora-commerce/services/${id}`,
        excerpt: 'const app = express();',
        locator: 'src/index.js:1-3',
      },
    ],
  };
}

/** A persona, so a correction to a Container can be shown NOT to touch the persona/journey artifact. */
function persona(): CanonicalKnowledgeObject {
  return {
    identity: {
      id: 'persona-returning-shopper',
      systemId: 'aurora-commerce',
      createdAt: EXTRACTED_AT,
      updatedAt: EXTRACTED_AT,
      schemaVersion: '1.0.0',
    },
    category: 'entity',
    kind: 'journey.persona',
    label: 'Returning Shopper',
    attributes: { role: 'Repeat customer' },
    metadata: {
      provenance: [
        {
          sourceId: 'docs/personas.md',
          sourceType: 'business-doc',
          derivedBy: 'inference-engine',
          derivedAt: EXTRACTED_AT,
        },
      ],
      confidence: { level: 'high', score: 0.9 },
    },
    evidence: [],
  };
}

function bundle(): CanonicalKnowledgeBundle {
  return {
    systemId: 'aurora-commerce',
    generatedAt: EXTRACTED_AT,
    objects: [
      container('ctr-payments', 'Payments Gateway Adapter', 'Node.js/Express'),
      container('ctr-inventory', 'Inventory Service', 'Go'),
      persona(),
    ],
    relationships: [],
  };
}

function correction(overrides: Record<string, unknown> = {}) {
  return buildReviewDecision({
    systemId: 'aurora-commerce',
    targetObjectId: 'ctr-payments',
    targetLabel: 'Payments Gateway Adapter',
    targetAttribute: 'technology',
    decision: 'corrected',
    previousValue: 'Node.js/Express',
    correctedValue: 'Java / Spring Boot',
    reviewerId: 'reviewer-a',
    rationale: 'Rewritten in 2025; the source-code reading is stale.',
    decidedAt: DECIDED_AT,
    ...overrides,
  });
}

describe('P7-05 the full chain: extracted → correction → canonical → graph → OKF', () => {
  it('carries a human correction all the way into a valid, re-parseable OKF document', () => {
    const decision = correction();

    // 1. EXTRACTED VALUE
    const before = bundle();
    expect(before.objects[0]?.attributes.technology).toBe('Node.js/Express');

    // 2. HUMAN CORRECTION -> 3. CANONICAL MODEL
    const result = regenerateOkfDocument(before, [decision], { at: REGENERATED_AT });
    expect(result.valid).toBe(true);
    const corrected = result.document.objects.find((o) => o.identity.id === 'ctr-payments');
    expect(corrected?.attributes.technology).toBe('Java / Spring Boot');

    // 4. GRAPH — the same corrected value reaches the node write, from the same decision.
    const graphProperties = buildCorrectionNodeOperation(decision, { at: REGENERATED_AT }).params
      .properties as Record<string, string>;
    expect(graphProperties.attr_technology).toBe(corrected?.attributes.technology);

    // 5. OKF / DOCUMENTATION OUTPUT — serialised, re-parsed, and still valid.
    const yaml = serializeOkfYaml(result.document);
    expect(yaml).toContain('Java / Spring Boot');
    expect(parseAndValidateOkfYaml(yaml).valid).toBe(true);
  });

  it('keeps the extracted value recoverable in the OKF output, not overwritten out of existence', () => {
    const result = regenerateOkfDocument(bundle(), [correction()], { at: REGENERATED_AT });
    const corrected = result.document.objects.find((o) => o.identity.id === 'ctr-payments');

    expect(corrected?.attributes[CORRECTION_ATTRIBUTES.supersededValue]).toBe('Node.js/Express');
    expect(serializeOkfYaml(result.document)).toContain('Node.js/Express');
  });

  it('preserves provenance and evidence references through regeneration', () => {
    const result = regenerateOkfDocument(bundle(), [correction()], { at: REGENERATED_AT });
    const corrected = result.document.objects.find((o) => o.identity.id === 'ctr-payments')!;

    // Original extraction provenance survives, human review is appended.
    expect(corrected.metadata.provenance.map((p) => p.derivedBy)).toEqual([
      'extraction-engine',
      'human-review',
    ]);
    // Evidence is untouched and still resolvable to its source and location.
    expect(corrected.evidence[0]?.sourceId).toBe('repo://aurora-commerce/services/ctr-payments');
    expect(corrected.evidence[0]?.locator).toBe('src/index.js:1-3');
  });

  it('preserves the review/attestation metadata the OKF model supports', () => {
    const result = regenerateOkfDocument(bundle(), [correction()], { at: REGENERATED_AT });
    const corrected = result.document.objects.find((o) => o.identity.id === 'ctr-payments')!;

    expect(corrected.lifecycle?.status).toBe('corrected');
    expect(corrected.attributes[CORRECTION_ATTRIBUTES.reviewedBy]).toBe('reviewer-a');
    expect(corrected.attributes[CORRECTION_ATTRIBUTES.reviewedAt]).toBe(DECIDED_AT);
    expect(corrected.attributes[CORRECTION_ATTRIBUTES.decisionId]).toBe(correction().identity.id);
    // Identity is not regenerated.
    expect(corrected.identity.id).toBe('ctr-payments');
    expect(corrected.identity.createdAt).toBe(EXTRACTED_AT);
  });

  it('does not fabricate a description or a relationship while regenerating', () => {
    const before = bundle();
    const result = regenerateOkfDocument(before, [correction()], { at: REGENERATED_AT });

    expect(result.document.relationships).toEqual(before.relationships);
    const corrected = result.document.objects.find((o) => o.identity.id === 'ctr-payments')!;
    // Only the corrected attribute plus the reserved review markers — no
    // invented `description`, no new business attribute.
    const added = Object.keys(corrected.attributes).filter(
      (key) => !(key in (before.objects[0]?.attributes ?? {})),
    );
    expect(added.every((key) => key.startsWith('human'))).toBe(true);
  });
});

describe('P7-05 requirement 10 — an unrelated object remains unchanged', () => {
  it('leaves every object no decision refers to byte-identical', () => {
    const before = bundle();
    const result = regenerateOkfDocument(before, [correction()], { at: REGENERATED_AT });

    const inventory = result.document.objects.find((o) => o.identity.id === 'ctr-inventory');
    const shopper = result.document.objects.find(
      (o) => o.identity.id === 'persona-returning-shopper',
    );

    expect(inventory).toEqual(before.objects[1]);
    expect(shopper).toEqual(before.objects[2]);
    expect(result.unchangedObjectIds).toEqual(
      expect.arrayContaining(['ctr-inventory', 'persona-returning-shopper']),
    );
    expect(result.unchangedObjectIds).not.toContain('ctr-payments');
  });

  it('does not regenerate artifacts an unrelated kind feeds', () => {
    const result = regenerateOkfDocument(bundle(), [correction()], { at: REGENERATED_AT });

    // A Container correction touches the C4 view...
    expect(result.regeneratedArtifacts).toContain('architecture-c4');
    // ...and nothing else: not personas/journeys, not the data model.
    expect(result.regeneratedArtifacts).not.toContain('personas-journeys');
    expect(result.regeneratedArtifacts).not.toContain('logical-data-model');
    expect(result.regeneratedArtifacts).toEqual(['architecture-c4']);
  });

  it('reports which artifacts a persona correction affects instead — different kind, different artifacts', () => {
    const personaCorrection = correction({
      targetObjectId: 'persona-returning-shopper',
      targetLabel: 'Returning Shopper',
      targetAttribute: 'role',
      previousValue: 'Repeat customer',
      correctedValue: 'Loyalty member',
    });

    const result = regenerateOkfDocument(bundle(), [personaCorrection], { at: REGENERATED_AT });
    expect(result.regeneratedArtifacts).toEqual(['personas-journeys']);
    expect(result.unchangedObjectIds).toEqual(
      expect.arrayContaining(['ctr-payments', 'ctr-inventory']),
    );
  });
});

describe('P7-05 requirement 8 — regeneration is explicit and its state is visible', () => {
  it('reports a document as stale when a decision landed after it was generated', () => {
    const state = okfRegenerationState(bundle(), [correction()]);

    expect(state.stale).toBe(true);
    expect(state.pendingDecisionIds).toEqual([correction().identity.id]);
    expect(state.staleArtifacts).toEqual(['architecture-c4']);
    expect(state.summary).toContain('Stale');
    expect(state.summary).toContain('architecture-c4');
  });

  it('reports a freshly regenerated document as up to date', () => {
    const regenerated = regenerateOkfDocument(bundle(), [correction()], {
      at: REGENERATED_AT,
    }).document;

    const state = okfRegenerationState(regenerated, [correction()]);
    expect(state.stale).toBe(false);
    expect(state.pendingDecisionIds).toEqual([]);
    expect(state.summary).toContain('Up to date');
  });

  it('does not treat a decision about an object the document never contained as making it stale', () => {
    const elsewhere = correction({ targetObjectId: 'ctr-not-in-this-bundle' });
    expect(okfRegenerationState(bundle(), [elsewhere]).stale).toBe(false);
  });

  it('names the affected objects and their kinds, not just a boolean', () => {
    const state = okfRegenerationState(bundle(), [correction()]);
    expect(state.affectedObjects).toEqual([
      { objectId: 'ctr-payments', kind: 'architecture.container', artifacts: ['architecture-c4'] },
    ]);
  });
});

describe('P7-05 — conflicts are surfaced, not silently rendered away', () => {
  it('leaves a stale correction unapplied and reports the conflict', () => {
    const stale = correction({ previousValue: 'Something nobody extracted' });
    const result = regenerateOkfDocument(bundle(), [stale], { at: REGENERATED_AT });

    expect(result.conflicts).toHaveLength(1);
    // The document still shows the extracted value — no invented resolution.
    const unchanged = result.document.objects.find((o) => o.identity.id === 'ctr-payments');
    expect(unchanged?.attributes.technology).toBe('Node.js/Express');
    expect(result.valid).toBe(true);
  });
});

describe('P7-05 artifact registry', () => {
  it('covers all eleven FRD output artifact types exactly once', () => {
    expect(OKF_ARTIFACTS).toHaveLength(11);
    expect(OKF_ARTIFACTS.map((a) => a.id).sort()).toEqual([...OKF_ARTIFACT_IDS].sort());
  });

  it('only ever names object kinds that really exist in the canonical vocabulary', () => {
    for (const artifact of OKF_ARTIFACTS) {
      for (const kind of artifact.objectKinds) {
        expect(CANONICAL_OBJECT_KINDS, `${artifact.id} -> ${kind}`).toContain(kind);
      }
    }
  });

  it('marks artifacts with no canonical backing as unmodelled rather than omitting them', () => {
    const unmodelled = OKF_ARTIFACTS.filter((a) => !a.modelled).map((a) => a.id);
    // P8: deployment and backlog became modelled (IaC extraction, Jira work items).
    expect(unmodelled).toEqual(['screens', 'non-functional-requirements']);
    for (const id of unmodelled) {
      expect(OKF_ARTIFACTS.find((a) => a.id === id)?.objectKinds).toEqual([]);
    }
  });

  it('returns nothing for an unknown kind rather than guessing', () => {
    expect(artifactsForObjectKind('not.a.real.kind')).toEqual([]);
    expect(artifactsForObjectKind('review.decision')).toEqual([]);
  });

  it('maps a domain entity to both the data model and the domains view', () => {
    expect(artifactsForObjectKind('domain.entity')).toEqual(
      expect.arrayContaining(['logical-data-model', 'domains']),
    );
  });

  it('affectedByDecisions ignores decisions for objects outside the bundle', () => {
    expect(affectedByDecisions(bundle(), [correction({ targetObjectId: 'nope' })])).toEqual([]);
    expect(affectedArtifacts(bundle(), [])).toEqual([]);
  });
});
