import type { NonFunctionalRequirement, Provenance } from '@phoenix-ai/shared';
import type { CorrelationBundle } from './correlation.js';

/**
 * PC-06 — Connected Sources summary.
 *
 * The previous "Connected Sources" representation (`AgentPipelinePage.tsx`
 * Stage 01's log line, "Connected 6 sources: Git (ClaimsCore, 340k LOC),
 * Confluence (212 pages), Jira (1,847 tickets)...") was a hand-typed
 * narrative sentence with NO real data behind it at all -- no fixture, no
 * type, no provider method, company-agnostic (identical regardless of
 * whether Aurora or fintech was selected). None of those specific numbers
 * were real.
 *
 * This module reuses `@phoenix-ai/shared`'s own `Provenance` type -- the
 * real "source metadata" the ticket asks to reuse: EVERY object across the
 * whole app (personas, journeys, flow steps, domains/aggregates,
 * capabilities, architecture containers/edges, deployment nodes,
 * integrations, non-functional requirements) already carries a real
 * `metadata.provenance[]` citing exactly where it came from (`repo://...`,
 * `ticket://JIRA-...`,
 * `data-model://...`, `wiki://...`, `docs/...`, `infra://...`,
 * `logs://...`, `integration-spec://...`). Rather than inventing a
 * "GitLab"/"Confluence"/"Jira" connector fixture from nothing -- which the
 * app has no real backing for (confirmed: no Confluence/Jira/GitLab
 * connector exists anywhere in `packages/ingestion-connectors` either) --
 * this aggregates the REAL provenance already embedded in the currently
 * loaded company's real data, deduplicated so e.g. `repo://aurora-commerce`
 * and `repo://aurora-commerce/services/checkout` count as the SAME one
 * repository, never two.
 */

/** One real, distinct source within a group — e.g. the specific repository root, or the specific Jira ticket — so a client can drill into "which one," not just see a count. */
export interface ConnectedSourceItem {
  readonly key: string;
  readonly sourceType: string;
  readonly derivedBy: string;
  /** How many real provenance entries across the loaded data cite this exact source. */
  readonly referenceCount: number;
}

export interface ConnectedSourceGroup {
  readonly id: string;
  readonly label: string;
  readonly count: number;
  readonly quantityLabel: string;
  /** The real, individual sources behind this group's count — PC-08: clicking a group must show real detail, never a dead click. Sorted by reference count, descending. */
  readonly items: readonly ConnectedSourceItem[];
}

interface SourceClassification {
  readonly groupId: string;
  readonly groupLabel: string;
  readonly quantitySingular: string;
  readonly quantityPlural: string;
  /** What makes two provenance entries "the same" source for counting purposes -- e.g. two paths inside the same repo collapse to one Repository. */
  readonly distinctKey: string;
}

/**
 * Classifies a real `Provenance.sourceId` into a human-facing source group.
 * Every rule here reads the ACTUAL sourceId string already present in the
 * data (e.g. the literal substring "JIRA" in `ticket://JIRA-4821`) -- it
 * never asserts a specific product/vendor name (no "GitLab", no
 * "Confluence") that the underlying data doesn't itself claim.
 */
function classify(sourceId: string): SourceClassification {
  if (sourceId.startsWith('repo://')) {
    const withoutScheme = sourceId.slice('repo://'.length);
    const root = withoutScheme.split('/')[0] ?? withoutScheme;
    return {
      groupId: 'repo',
      groupLabel: 'Git Repositories',
      quantitySingular: 'Repository',
      quantityPlural: 'Repositories',
      distinctKey: root,
    };
  }
  if (sourceId.startsWith('ticket://')) {
    return {
      groupId: 'ticket',
      groupLabel: 'Jira',
      quantitySingular: 'Issue',
      quantityPlural: 'Issues',
      distinctKey: sourceId,
    };
  }
  if (sourceId.startsWith('wiki://')) {
    return {
      groupId: 'wiki',
      groupLabel: 'Wiki',
      quantitySingular: 'Page',
      quantityPlural: 'Pages',
      distinctKey: sourceId,
    };
  }
  if (sourceId.startsWith('data-model://')) {
    return {
      groupId: 'data-model',
      groupLabel: 'Data Models',
      quantitySingular: 'Schema',
      quantityPlural: 'Schemas',
      distinctKey: sourceId,
    };
  }
  if (sourceId.startsWith('integration-spec://')) {
    return {
      groupId: 'integration-spec',
      groupLabel: 'Integration Specs',
      quantitySingular: 'Spec',
      quantityPlural: 'Specs',
      distinctKey: sourceId,
    };
  }
  if (sourceId.startsWith('infra://')) {
    return {
      groupId: 'infra',
      groupLabel: 'Infrastructure',
      quantitySingular: 'Definition',
      quantityPlural: 'Definitions',
      distinctKey: sourceId,
    };
  }
  if (sourceId.startsWith('logs://')) {
    return {
      groupId: 'logs',
      groupLabel: 'Logs',
      quantitySingular: 'Log Source',
      quantityPlural: 'Log Sources',
      distinctKey: sourceId,
    };
  }
  if (sourceId.startsWith('docs/') || sourceId.endsWith('.pdf') || sourceId.endsWith('.md')) {
    return {
      groupId: 'docs',
      groupLabel: 'Documentation',
      quantitySingular: 'Document',
      quantityPlural: 'Documents',
      distinctKey: sourceId,
    };
  }
  return {
    groupId: 'other',
    groupLabel: 'Other Sources',
    quantitySingular: 'Source',
    quantityPlural: 'Sources',
    distinctKey: sourceId,
  };
}

/**
 * PC-04's `CorrelationBundle` plus Non-Functional Requirements -- the one
 * additional real, provenance-bearing category this summary also reads
 * (confirmed by inspection: Aurora's real NFR fixtures cite a real ticket
 * and a real load-test doc that no other bundle category references).
 */
export interface ConnectedSourcesBundle extends CorrelationBundle {
  readonly nonFunctionalRequirements: readonly NonFunctionalRequirement[];
}

function collectProvenance(bundle: ConnectedSourcesBundle): Provenance[] {
  const all: Provenance[] = [];
  for (const p of bundle.personas) all.push(...p.metadata.provenance);
  for (const j of bundle.journeys) all.push(...j.metadata.provenance);
  for (const f of bundle.flows) {
    all.push(...f.metadata.provenance);
    for (const step of f.steps) all.push(...step.metadata.provenance);
  }
  for (const d of bundle.domains) {
    all.push(...d.metadata.provenance);
    for (const a of d.aggregates) all.push(...a.metadata.provenance);
  }
  for (const c of bundle.capabilities) all.push(...c.metadata.provenance);
  for (const container of bundle.containers) all.push(...container.metadata.provenance);
  for (const node of bundle.deploymentNodes) all.push(...node.metadata.provenance);
  for (const integration of bundle.integrations) all.push(...integration.metadata.provenance);
  for (const nfr of bundle.nonFunctionalRequirements) all.push(...nfr.metadata.provenance);
  return all;
}

/**
 * Aggregates real provenance already present in the currently loaded
 * bundle into a compact "Connected Sources" summary, one group per real
 * source kind actually referenced -- a group with zero real references is
 * never included (never a fabricated "0 Repositories" placeholder).
 * Sorted by count, descending, so the most-used sources lead.
 */
export function computeConnectedSources(bundle: ConnectedSourcesBundle): ConnectedSourceGroup[] {
  const provenance = collectProvenance(bundle);

  interface GroupAccumulator {
    label: string;
    quantitySingular: string;
    quantityPlural: string;
    itemsByKey: Map<string, { sourceType: string; derivedBy: string; referenceCount: number }>;
  }
  const byGroup = new Map<string, GroupAccumulator>();

  for (const p of provenance) {
    const classification = classify(p.sourceId);
    let group = byGroup.get(classification.groupId);
    if (!group) {
      group = {
        label: classification.groupLabel,
        quantitySingular: classification.quantitySingular,
        quantityPlural: classification.quantityPlural,
        itemsByKey: new Map(),
      };
      byGroup.set(classification.groupId, group);
    }
    const existingItem = group.itemsByKey.get(classification.distinctKey);
    if (existingItem) {
      existingItem.referenceCount += 1;
    } else {
      group.itemsByKey.set(classification.distinctKey, {
        sourceType: p.sourceType,
        derivedBy: p.derivedBy,
        referenceCount: 1,
      });
    }
  }

  const groups: ConnectedSourceGroup[] = [...byGroup.entries()].map(([id, entry]) => {
    const items: ConnectedSourceItem[] = [...entry.itemsByKey.entries()]
      .map(([key, detail]) => ({ key, ...detail }))
      .sort((a, b) => b.referenceCount - a.referenceCount || a.key.localeCompare(b.key));
    return {
      id,
      label: entry.label,
      count: items.length,
      quantityLabel: items.length === 1 ? entry.quantitySingular : entry.quantityPlural,
      items,
    };
  });

  return groups.sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
