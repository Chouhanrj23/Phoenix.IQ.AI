/**
 * P6-09 -- POC: run the real git connector (P3-02) against Phoenix.ai-1's
 * own working repository AND the real Jira connector (P6-02) against a
 * representative Jira dataset (`fixtures/phoenix-backlog-jira.ts` -- no live
 * Jira instance or credentials are available in this environment; see that
 * file's header and `docs/architecture/adr/0032-p6-09-phoenix-jira-poc.md`
 * for why representative, not live, was the deliberate choice here), bridge
 * both into real canonical objects, and reconcile claims across them --
 * proving the WHOLE Phase 6 pipeline (P6-01/02/04/05/06/08) end to end
 * against something more than curated unit-test fixtures.
 *
 * This is a dev/demo utility, not part of any package's runtime API --
 * matching `extraction-engine/samples/analyze-phoenix-repo.ts` (P3-11)'s
 * exact precedent. Run it via
 * `pnpm --filter @phoenix-ai/reconciliation-engine poc:analyze-phoenix-and-jira`.
 *
 * THE ACTUAL CLAIM RECONCILED, per Phase 6 ticket: "is this ticket done?" --
 * asked of two independent sources. The Jira side answers from the fixture
 * dataset's `status` field. The git side answers a DIFFERENT, stricter
 * question: is this ticket's ADR file present in the repository's COMMITTED
 * tree (not merely on disk) -- the git connector reads `git ls-tree` at
 * HEAD, which by construction cannot see an uncommitted file (ADR 0014
 * decision 5). At the time this POC was first run, every P6-0X deliverable
 * in this session was still uncommitted working-tree state, so EVERY ticket
 * legitimately came back as a reconciliation CONFLICT: Jira says the work is
 * done; version control says it has not landed yet. That is not a bug in
 * this script -- it is exactly the kind of gap a reconciliation engine
 * exists to surface. Run it again after committing to see conflicts resolve
 * to agreement.
 */

import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  createGitRepositoryConnector,
  createJiraConnector,
  collectArtifacts,
  withConnectorSession,
  type ArtifactFilter,
  type SourceRepositoryDescriptor,
  type SourceTicketTrackerDescriptor,
} from '@phoenix-ai/ingestion-connectors';
import { bridgeJiraArtifacts } from '@phoenix-ai/extraction-engine';
import {
  parseAndValidateOkfYaml,
  serializeOkfYaml,
  toOkfDocument,
  validateCanonicalKnowledgeBundle,
  validateSourceReferences,
  type CanonicalKnowledgeBundle,
  type Source,
} from '@phoenix-ai/knowledge-graph';
import { claimFromObject, type Claim } from '../src/claim.js';
import { reconcileClaims } from '../src/reconcile.js';
import {
  PHOENIX_JIRA_BASE_URL,
  PHOENIX_JIRA_PROJECT_KEY,
  createPhoenixBacklogJiraFetch,
} from './fixtures/phoenix-backlog-jira.js';

const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url)).replace(/[/\\]$/, '');
const REPO_SOURCE_ID = 'repo://phoenix-ai-1';
const JIRA_SOURCE_ID = `ticket://phoenix-internal/${PHOENIX_JIRA_PROJECT_KEY}`;
const SYSTEM_ID = 'phoenix-ai-1';

function fileLocator(path: string): string {
  return `file://${path.replace(/\\/g, '/')}`;
}

const NOISE_EXCLUDES = [
  'node_modules',
  '.git',
  '.turbo',
  '.next',
  'dist',
  'coverage',
  '.pnpm-store',
];

function repoDescriptor(filter: ArtifactFilter = {}): SourceRepositoryDescriptor {
  return {
    id: REPO_SOURCE_ID,
    sourceType: 'technical-doc',
    label: 'phoenix-ai-1 (this repository) — ADR documents',
    locator: fileLocator(REPO_ROOT),
    repository: { kind: 'local-directory' },
    filter,
  };
}

function jiraDescriptor(): SourceTicketTrackerDescriptor {
  return {
    id: JIRA_SOURCE_ID,
    sourceType: 'ticket',
    label: `Jira: Phoenix.ai-1 Backlog (${PHOENIX_JIRA_PROJECT_KEY})`,
    locator: JIRA_SOURCE_ID,
    ticketTracker: {
      kind: 'jira',
      baseUrl: PHOENIX_JIRA_BASE_URL,
      projectKeys: [PHOENIX_JIRA_PROJECT_KEY],
    },
  };
}

/** Which Jira issue tracks which real Phase 6 ticket, and which ADR is that ticket's git-observable "done" signal. */
const TICKET_MAPPINGS: ReadonlyArray<{ jiraKey: string; ticketId: string; adrPath: string }> = [
  {
    jiraKey: 'PHX-2',
    ticketId: 'p6-01',
    adrPath: 'docs/architecture/adr/0026-p6-01-connector-framework-hardening.md',
  },
  {
    jiraKey: 'PHX-3',
    ticketId: 'p6-02',
    adrPath: 'docs/architecture/adr/0027-p6-02-jira-connector.md',
  },
  {
    jiraKey: 'PHX-4',
    ticketId: 'p6-04',
    adrPath: 'docs/architecture/adr/0028-p6-04-jira-okf-mapping.md',
  },
  {
    jiraKey: 'PHX-5',
    ticketId: 'p6-05',
    adrPath: 'docs/architecture/adr/0029-p6-05-source-reconciliation.md',
  },
  {
    jiraKey: 'PHX-6',
    ticketId: 'p6-06',
    adrPath: 'docs/architecture/adr/0030-p6-06-confidence-calculation.md',
  },
  {
    jiraKey: 'PHX-7',
    ticketId: 'p6-08',
    adrPath: 'docs/architecture/adr/0031-p6-08-evidence-aggregation.md',
  },
  {
    jiraKey: 'PHX-8',
    ticketId: 'p6-09',
    adrPath: 'docs/architecture/adr/0032-p6-09-phoenix-jira-poc.md',
  },
];

async function main(): Promise<void> {
  const lines: string[] = [];
  const log = (line: string): void => {
    lines.push(line);
    // eslint-disable-next-line no-console -- this IS the script's intended CLI output, not leftover debugging.
    console.log(line);
  };

  const generatedAt = new Date().toISOString();
  log(`# P6-09 POC — Phoenix repo + Jira analysis (generated ${generatedAt})\n`);

  // --- Source A: the real git connector against Phoenix.ai-1 itself -------------------------------
  log("## Source A — git (real, this repository's committed tree)\n");

  const gitConnector = createGitRepositoryConnector();
  const gitClaims: Claim[] = [];
  let headRevision: string | undefined;
  let trackedFileCount = 0;

  await withConnectorSession(
    gitConnector,
    repoDescriptor({ excludePaths: NOISE_EXCLUDES }),
    async (session) => {
      headRevision = session.revision;
      for await (const ref of session.list()) {
        void ref;
        trackedFileCount += 1;
      }

      for (const mapping of TICKET_MAPPINGS) {
        const result = await session.read({ path: mapping.adrPath });
        const committed = result.ok;
        gitClaims.push({
          subjectId: `phoenix-ticket-${mapping.ticketId}`,
          attribute: 'status',
          value: committed ? 'Done' : 'Not Started',
          claimCategory: 'intent',
          sourceId: REPO_SOURCE_ID,
          sourceType: 'technical-doc',
          derivedBy: 'reconciliation-engine-poc',
          derivedAt: generatedAt,
          evidence: committed
            ? [
                {
                  id: `ev-git-${mapping.ticketId}`,
                  sourceId: REPO_SOURCE_ID,
                  locator: `${REPO_SOURCE_ID}/${mapping.adrPath}`,
                  excerpt: `${mapping.adrPath} is present in the committed tree at ${headRevision ?? '(unknown revision)'}.`,
                  ...(headRevision === undefined ? {} : { sourceVersion: headRevision }),
                },
              ]
            : [
                {
                  id: `ev-git-${mapping.ticketId}`,
                  sourceId: REPO_SOURCE_ID,
                  locator: `${REPO_SOURCE_ID}/${mapping.adrPath}`,
                  excerpt: `${mapping.adrPath} is not present in the committed tree at ${headRevision ?? '(unknown revision)'} — working-tree-only, if it exists on disk at all.`,
                  ...(headRevision === undefined ? {} : { sourceVersion: headRevision }),
                },
              ],
        });
      }
    },
  );

  log(`Resolved revision: ${headRevision ?? '(unknown)'}`);
  log(`Total tracked files (after excluding ${NOISE_EXCLUDES.join(', ')}): ${trackedFileCount}`);
  log(`Per-ticket ADR commit status (real, read from git's committed tree):`);
  for (const mapping of TICKET_MAPPINGS) {
    const claim = gitClaims.find((c) => c.subjectId === `phoenix-ticket-${mapping.ticketId}`);
    log(`  ${mapping.ticketId.padEnd(8)} ${mapping.adrPath} → ${claim?.value ?? '(unknown)'}`);
  }

  // --- Source B: the real Jira connector against a representative dataset -------------------------
  log(
    '\n## Source B — Jira (real connector, representative dataset, see fixtures/phoenix-backlog-jira.ts)\n',
  );

  const jiraConnector = createJiraConnector({ fetchImpl: createPhoenixBacklogJiraFetch() });
  const jiraSession = await jiraConnector.open(jiraDescriptor());
  const jiraCollection = await collectArtifacts(jiraSession);
  await jiraSession.close();

  log(`Jira project resolved: ${JSON.stringify(jiraSession.sourceMetadata?.projects ?? [])}`);
  log(`Issues read: ${jiraCollection.artifacts.length}`);
  log(`Read failures: ${jiraCollection.failures.length}`);

  const bridgeResult = bridgeJiraArtifacts(jiraCollection.artifacts, {
    systemId: SYSTEM_ID,
    generatedAt,
  });
  log(`Bridged WorkItemObjects: ${bridgeResult.objects.length}`);
  log(`Bridged relationships (contains/relatesTo): ${bridgeResult.relationships.length}`);
  log(`Skipped (unrecognised content): ${bridgeResult.skipped.length}`);

  const jiraClaims: Claim[] = [];
  for (const mapping of TICKET_MAPPINGS) {
    const object = bridgeResult.objects.find((candidate) =>
      candidate.evidence.some((entry) => entry.locator?.endsWith(`/${mapping.jiraKey}`) ?? false),
    );
    if (object === undefined) continue;
    const claim = claimFromObject(object, 'status', 'intent', `phoenix-ticket-${mapping.ticketId}`);
    if (claim !== undefined) jiraClaims.push(claim);
  }
  log(`Per-ticket Jira status:`);
  for (const mapping of TICKET_MAPPINGS) {
    const claim = jiraClaims.find((c) => c.subjectId === `phoenix-ticket-${mapping.ticketId}`);
    log(
      `  ${mapping.ticketId.padEnd(8)} ${mapping.jiraKey} → ${String(claim?.value ?? '(unknown)')}`,
    );
  }

  // --- Reconciliation: compare both sources' claims, per ticket -----------------------------------
  log("\n## Reconciliation (P6-05/06/08) — comparing both sources' claims per ticket\n");

  const reconciliation = reconcileClaims([...gitClaims, ...jiraClaims], {
    systemId: SYSTEM_ID,
    generatedAt,
  });

  log(`Agreed (both sources say the same thing): ${reconciliation.agreed.length}`);
  for (const agreement of reconciliation.agreed) {
    log(
      `  ${agreement.subjectId} = "${String(agreement.value)}" — confidence ${agreement.confidence.level} (score ${agreement.confidence.score ?? 'n/a'}), ${agreement.evidence.length} evidence entries`,
    );
  }

  log(
    `\nConflicts (sources disagree — BOTH positions retained, never silently resolved): ${reconciliation.conflicts.length}`,
  );
  for (const conflict of reconciliation.conflicts) {
    log(`  ${conflict.attributes.subjectId} ("${conflict.label}")`);
    for (const position of conflict.attributes.positions) {
      const sourceIds = position.sources.map((s) => s.sourceId).join(', ');
      log(
        `    "${String(position.value)}" — claimed by [${sourceIds}], confidence ${position.confidence?.level ?? 'n/a'}, ${position.evidenceIds?.length ?? 0} evidence ref(s)`,
      );
    }
  }

  // --- Assemble everything into one real, validated, serializable OKF bundle ----------------------
  log('\n## Assembled OKF bundle\n');

  const repoSource: Source = {
    id: REPO_SOURCE_ID,
    type: 'technical-doc',
    label: 'phoenix-ai-1 (this repository) — ADR documents',
    locator: REPO_SOURCE_ID,
    ...(headRevision === undefined ? {} : { version: headRevision }),
  };
  const jiraSource: Source = {
    id: JIRA_SOURCE_ID,
    type: 'ticket',
    label: `Jira: Phoenix.ai-1 Backlog (${PHOENIX_JIRA_PROJECT_KEY})`,
    locator: JIRA_SOURCE_ID,
  };

  const bundle: CanonicalKnowledgeBundle = {
    systemId: SYSTEM_ID,
    generatedAt,
    objects: [...bridgeResult.objects, ...reconciliation.conflicts],
    relationships: bridgeResult.relationships,
    sources: [repoSource, jiraSource],
  };

  const bundleValidation = validateCanonicalKnowledgeBundle(bundle);
  log(
    `Bundle validates against the real validateCanonicalKnowledgeBundle: ${bundleValidation.valid}`,
  );
  if (!bundleValidation.valid) log(`  errors: ${bundleValidation.errors.join('; ')}`);

  const sourceRefValidation = validateSourceReferences(bundle);
  log(
    `Every provenance/evidence sourceId resolves against the sources registry: ${sourceRefValidation.valid}`,
  );
  if (!sourceRefValidation.valid) log(`  errors: ${sourceRefValidation.errors.join('; ')}`);

  const document = toOkfDocument(bundle);
  const yamlText = serializeOkfYaml(document);
  log(`OKF YAML document generated: ${yamlText.split('\n').length} lines`);
  const okfValidation = parseAndValidateOkfYaml(yamlText);
  log(`OKF YAML round-trips through the real parseAndValidateOkfYaml: ${okfValidation.valid}`);
  if (!okfValidation.valid) log(`  errors: ${okfValidation.errors.join('; ')}`);

  const reportPath = fileURLToPath(
    new URL('./phoenix-and-jira-analysis-report.md', import.meta.url),
  );
  writeFileSync(reportPath, lines.join('\n') + '\n', 'utf8');
  log(`\nReport written to ${reportPath}`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
