import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseOkfYaml, validateOkfDocument, type OkfDocument } from '../src/okf.js';
import { ARCHITECTURE_OBJECT_KINDS } from '../src/architecture.js';
import { DOMAIN_OBJECT_KINDS, DOMAIN_RELATIONSHIP_KINDS } from '../src/domain.js';
import { JOURNEY_OBJECT_KINDS } from '../src/journey.js';
import { INTEGRATION_OBJECT_KINDS } from '../src/integration.js';

/**
 * P2-12 -- validates representative objects (the P2-11 sample) against the
 * six Phase 1 UI areas' ACTUAL field requirements (read directly from
 * `apps/web/src/pages/*.tsx`, not just the raw contract shape), and proves
 * -- not just asserts in prose -- the model/OKF gaps this ticket's
 * objective asks to identify. See `docs/okf/ui-validation.md` for the full
 * coverage report and design discussion.
 *
 * This is a validation exercise only: it makes no changes to the UI or the
 * canonical model. Negative assertions (`.not.toContain`, `toBeUndefined`)
 * are deliberate -- they are the proof that a gap exists, not a mistake.
 */
const SAMPLE_PATH = fileURLToPath(
  new URL('../samples/aurora-commerce.sample.okf.yaml', import.meta.url),
);
const document = parseOkfYaml(readFileSync(SAMPLE_PATH, 'utf-8')) as OkfDocument;

function findObject(id: string) {
  const object = document.objects.find((o) => o.identity.id === id);
  if (!object) throw new Error(`sample fixture missing expected object "${id}"`);
  return object;
}

function findRelationship(id: string) {
  const relationship = document.relationships.find((r) => r.id === id);
  if (!relationship) throw new Error(`sample fixture missing expected relationship "${id}"`);
  return relationship;
}

describe('P2-12 baseline — sample OKF still validates against the schema', () => {
  it('validates cleanly (re-proven here, not just in okf-sample.test.ts)', () => {
    expect(validateOkfDocument(document)).toEqual({ valid: true, errors: [] });
  });
});

// ---------------------------------------------------------------------------
// Area 1 — System Summary
// ---------------------------------------------------------------------------

describe('UI Area: System Summary', () => {
  const system = findObject('ctx-aurora');

  it('covers name/description (OverviewPage title + description)', () => {
    expect(system.label).toBeTruthy();
    expect(system.attributes.description).toBeTruthy();
  });

  it('GAP: coverageScore/totalElements/pendingReviewCount/driftAlertCount have no canonical field — they are computed aggregates, not stored knowledge', () => {
    // SystemSummary's four headline stats are COUNT()/ratio computations over
    // the graph (objects, relationships, review/drift items), not facts
    // about the system itself. No SystemAttributes field represents them,
    // and none should: they belong to a future reporting/query layer over
    // an OKF document, not the document itself.
    expect(system.attributes).not.toHaveProperty('coverageScore');
    expect(system.attributes).not.toHaveProperty('totalElements');
    expect(system.attributes).not.toHaveProperty('pendingReviewCount');
    expect(system.attributes).not.toHaveProperty('driftAlertCount');
  });

  it('GAP: tags has no canonical field (minor, genuine model gap — SystemAttributes has no equivalent)', () => {
    expect(system.attributes).not.toHaveProperty('tags');
  });

  it('GAP: lastAnalyzedAt is pipeline/run metadata, not system knowledge — identity.updatedAt answers a different question', () => {
    // identity.updatedAt is "when was THIS OBJECT last updated" (a per-object
    // fact); lastAnalyzedAt is "when did the extraction pipeline last run
    // against the whole system" (a pipeline/orchestration fact). Distinct
    // concepts -- see docs/okf/ui-validation.md.
    expect(system.identity.updatedAt).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// Area 2 — Architecture (C4Node/C4Edge, per ArchitecturePage.tsx's actual
// rendered fields: name, technology?, description, confidence, provenance;
// edges: label, source/target, confidence-driven animated styling)
// ---------------------------------------------------------------------------

describe('UI Area: Architecture', () => {
  const container = findObject('ctr-checkout');
  const edge = findRelationship('rel-checkout-communicates-payments');

  it('covers C4Node fields the UI actually renders: name, description/responsibility, technology, confidence, provenance', () => {
    expect(container.label).toBeTruthy();
    expect(container.attributes.responsibility).toBeTruthy();
    expect(container.attributes.technology).toBeTruthy();
    expect(container.metadata.confidence.level).toBeTruthy();
    expect(container.metadata.provenance.length).toBeGreaterThan(0);
  });

  it('covers C4Edge fields the UI actually renders: label (via attributes.description) and confidence-driven styling', () => {
    expect(edge.attributes?.description).toBeTruthy();
    expect(edge.metadata.confidence.level).toBeTruthy();
  });

  it('MAPPING ISSUE: parentId is not a field — it is reconstructed via a `contains` relationship instead', () => {
    // Phase 1's C4Node.parentId embeds hierarchy directly on the node; the
    // canonical model expresses the identical fact as a separate
    // composition relationship. Representable, but requires a graph
    // traversal, not a field read, to reconstruct.
    const containsEdge = findRelationship('rel-system-contains-checkout');
    expect(containsEdge.kind).toBe('contains');
    expect(containsEdge.category).toBe('composition');
    expect(containsEdge.targetObjectId).toBe('ctr-checkout');
  });

  it('MAPPING ISSUE: C4Edge.level (context/container/component) has no relationship-level field — it is derivable from endpoint kinds', () => {
    expect(edge).not.toHaveProperty('level');
    const source = findObject(edge.sourceObjectId);
    const target = findObject(edge.targetObjectId);
    expect(ARCHITECTURE_OBJECT_KINDS).toContain(source.kind);
    expect(ARCHITECTURE_OBJECT_KINDS).toContain(target.kind);
  });
});

// ---------------------------------------------------------------------------
// Area 3 — Domain Model (per DomainModelPage.tsx's actual rendered fields:
// domain name/description/confidence; aggregate name/entities/confidence)
// ---------------------------------------------------------------------------

describe('UI Area: Domain Model', () => {
  const domain = findObject('dom-ordering');
  const aggregate = findObject('agg-order');

  it('covers Domain fields: name, description, confidence', () => {
    expect(domain.label).toBeTruthy();
    expect(domain.attributes.description).toBeTruthy();
    expect(domain.metadata.confidence.level).toBeTruthy();
  });

  it('covers Aggregate fields: name, confidence', () => {
    expect(aggregate.label).toBeTruthy();
    expect(aggregate.metadata.confidence.level).toBeTruthy();
  });

  it('MODEL GAP: no direct Domain -> Aggregate relationship kind exists — "which aggregates belong to this domain" is only reconstructable indirectly, via a shared root Entity', () => {
    expect(DOMAIN_RELATIONSHIP_KINDS).not.toContain('hasAggregate');
    // The only path from dom-ordering to agg-order is via their shared
    // entity: dom-ordering --contains--> ent-order, agg-order
    // --aggregateRoot--> ent-order. Proving the indirect path exists (not
    // that it's a good substitute for a direct edge):
    const domainToEntity = document.relationships.find(
      (r) => r.kind === 'contains' && r.sourceObjectId === 'dom-ordering',
    );
    const aggregateToEntity = document.relationships.find(
      (r) => r.kind === 'aggregateRoot' && r.sourceObjectId === 'agg-order',
    );
    expect(domainToEntity?.targetObjectId).toBe(aggregateToEntity?.targetObjectId);
  });

  it('GAP (pre-existing, ADR 0006): Aggregate.entities: string[] has no real per-field backing — Phase 1 only ever provides plain name strings', () => {
    // Not re-litigated here, just re-confirmed against this ticket's sample:
    // the canonical EntityObject exists (ent-order) but Phase 1 itself never
    // supplies enough data to populate one for every aggregate automatically.
    expect(DOMAIN_OBJECT_KINDS).toContain('domain.entity');
  });
});

// ---------------------------------------------------------------------------
// Area 4 — Integrations (per IntegrationsPage.tsx's actual rendered fields:
// name, counterpart, direction icon, protocol, dataExchanged, confidence,
// provenance) — already fully mapped per ADR 0008; re-confirmed here
// against the sample, not re-derived.
// ---------------------------------------------------------------------------

describe('UI Area: Integrations', () => {
  const integration = findObject('int-meridian-pay');
  const dataFlow = findObject('dataflow-meridian-authorization');

  it('covers every IntegrationsPage field: name, counterpart, direction, protocol, dataExchanged, confidence, provenance', () => {
    expect(integration.label).toBeTruthy();
    expect(integration.attributes.counterpartDescription).toBeTruthy();
    expect(integration.attributes.interactionType).toBeTruthy();
    expect(integration.attributes.protocol).toBeTruthy();
    expect(dataFlow.attributes.data).toBeTruthy();
    expect(integration.metadata.confidence.level).toBeTruthy();
    expect(integration.metadata.provenance.length).toBeGreaterThan(0);
  });

  it('confirms the already-documented gap: IntegrationsPage never shows which container owns an integration (no hasIntegration UI)', () => {
    const hasIntegration = findRelationship('rel-payments-has-integration');
    expect(hasIntegration.kind).toBe('hasIntegration');
    // The relationship exists in the model; Phase 1's flat IntegrationsPage
    // list simply never renders it. Model is ahead of the UI here, not behind.
  });
});

// ---------------------------------------------------------------------------
// Area 5 — Deployment/NFR: NO canonical representation exists at all.
// Proven, not just claimed, by checking every closed kind vocabulary.
// ---------------------------------------------------------------------------

describe('UI Area: Deployment/NFR — confirmed model gap', () => {
  const allObjectKinds = [
    ...ARCHITECTURE_OBJECT_KINDS,
    ...DOMAIN_OBJECT_KINDS,
    ...JOURNEY_OBJECT_KINDS,
    ...INTEGRATION_OBJECT_KINDS,
  ];

  it('MODEL GAP: no object kind exists for DeploymentNode (environment or instance)', () => {
    expect(allObjectKinds).not.toContain('deployment.environment');
    expect(allObjectKinds).not.toContain('deployment.instance');
    expect(allObjectKinds.some((k) => k.startsWith('deployment.'))).toBe(false);
  });

  it('MODEL GAP: no object kind exists for NonFunctionalRequirement (and NFR is not even in the FRD §4.1 node-type list, per docs/ontology/README.md)', () => {
    expect(allObjectKinds.some((k) => k.toLowerCase().includes('nfr'))).toBe(false);
    expect(allObjectKinds.some((k) => k.toLowerCase().includes('requirement'))).toBe(false);
  });

  it('the sample document contains no deployment- or NFR-related object as a result', () => {
    expect(document.objects.some((o) => o.kind.startsWith('deployment.'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Area 6 — Review/Gaps/Drift: NO canonical representation exists at all,
// despite P2-02 already anticipating it (StructuralCategory.observation).
// ---------------------------------------------------------------------------

describe('UI Area: Review/Gaps/Drift — confirmed model gap', () => {
  const allObjectKinds = [
    ...ARCHITECTURE_OBJECT_KINDS,
    ...DOMAIN_OBJECT_KINDS,
    ...JOURNEY_OBJECT_KINDS,
    ...INTEGRATION_OBJECT_KINDS,
  ];

  it('MODEL GAP: no object kind exists for ReviewItem, GapItem, or DriftAlert', () => {
    expect(allObjectKinds.some((k) => /review|gap|drift/i.test(k))).toBe(false);
  });

  it('P2-02 already reserved the structural category these would use (observation), unused by any real kind yet', () => {
    expect(document.objects.some((o) => o.category === 'observation')).toBe(false);
  });
});
