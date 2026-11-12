// Renders the reverse-engineered BRD as Markdown (GitHub renders the mermaid
// diagrams). Structure follows the seven requested areas, wrapped in the
// standard BRD front and back matter.
import type { ReverseEngineeringReport } from '../../apps/web/src/reverse-engineering/types.ts';

type Meta = { confidence: { level: string; score?: number }; provenance: { sourceId: string }[] };

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ');
const badge = (m: Meta) =>
  `${m.confidence.level}${m.confidence.score !== undefined ? ` (${Math.round(m.confidence.score * 100)}%)` : ''}`;
const cite = (m: Meta, repo: string) =>
  m.provenance
    .map((p) => p.sourceId.replace(`repo://${repo}/`, ''))
    .filter((s) => !s.startsWith('repo://'))
    .slice(0, 3)
    .map((s) => `\`${s}\``)
    .join(', ') || '_inferred_';
const bullets = (items: string[]) =>
  items.length ? items.map((i) => `- ${i}`).join('\n') : '_None identified._';
const table = (head: string[], rows: string[][]) =>
  rows.length
    ? [
        `| ${head.join(' | ')} |`,
        `| ${head.map(() => '---').join(' | ')} |`,
        ...rows.map((r) => `| ${r.map(esc).join(' | ')} |`),
      ].join('\n')
    : '_None identified._';
/** Multi-line expert text as a Markdown block quote. */
const quote = (s: string) =>
  s
    .trim()
    .split(/\n+/)
    .map((line) => `> ${line}`)
    .join('\n');
const INTENT_LABEL: Record<string, string> = {
  confirm: 'Confirm',
  explain: 'Explain',
  'edge-cases': 'Edge cases',
  'fill-gap': 'Fill a gap',
  resolve: 'Resolve',
};
const mermaidId = (s: string) => s.replace(/[^A-Za-z0-9_]/g, '_');
const mermaidText = (s: string) => s.replace(/["`]/g, "'").replace(/[:;#{}<>]/g, ' ');

// ------------------------------------------------- diagrams (shared with brd-html)

/** Mermaid ER diagram of the domain model (diagram source, no fences). */
export function mermaidEr(r: ReverseEngineeringReport): string {
  const entName = (id: string) => r.entities.find((e) => e.id === id)?.name ?? id;
  const er = ['erDiagram'];
  for (const e of r.entities) {
    er.push(`  ${mermaidId(e.name)} {`);
    for (const a of e.attributes.slice(0, 14)) {
      const key = a.key ? ` ${a.key === 'unique' ? 'UK' : a.key.toUpperCase()}` : '';
      er.push(`    ${mermaidId(a.type.split(/[\s(]/)[0] || 'string')} ${mermaidId(a.name)}${key}`);
    }
    er.push('  }');
  }
  const card: Record<string, string> = {
    '1:1': '||--||',
    '1:N': '||--o{',
    'N:1': '}o--||',
    'N:M': '}o--o{',
  };
  for (const rel of r.relationships) {
    er.push(
      `  ${mermaidId(entName(rel.fromEntityId))} ${card[rel.cardinality]} ${mermaidId(entName(rel.toEntityId))} : "${mermaidText(rel.label)}"`,
    );
  }
  return er.join('\n');
}

/** Mermaid sequence diagram of one execution flow. */
export function mermaidSequence(
  r: ReverseEngineeringReport,
  f: ReverseEngineeringReport['executionFlows'][number],
): string {
  const svcName = (id?: string) =>
    id ? (r.containerNodes.find((c) => c.id === id)?.name ?? id) : '';
  const parts = [...new Set([f.actor, ...f.steps.map((s) => svcName(s.service) || 'System')])];
  const seq = [
    'sequenceDiagram',
    ...parts.map((p) => `  participant ${mermaidId(p)} as ${mermaidText(p)}`),
  ];
  let prev = f.actor;
  for (const s of f.steps) {
    const to = svcName(s.service) || 'System';
    seq.push(`  ${mermaidId(prev)}->>${mermaidId(to)}: ${mermaidText(s.name)}`);
    prev = to;
  }
  return seq.join('\n');
}

/** Mermaid flowchart of the containers and how they call each other. */
export function mermaidContainers(r: ReverseEngineeringReport): string {
  const c4 = ['flowchart LR'];
  for (const n of r.containerNodes) {
    c4.push(
      `  ${mermaidId(n.id)}["${mermaidText(n.name)}${n.technology ? `<br/><small>${mermaidText(n.technology)}</small>` : ''}"]`,
    );
  }
  for (const e of r.containerEdges)
    c4.push(`  ${mermaidId(e.source)} -->|"${mermaidText(e.label)}"| ${mermaidId(e.target)}`);
  return c4.join('\n');
}

export const TRACE_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  partial: 'Partially met',
  'not-implemented': 'Not implemented',
  contradicted: 'Contradicted',
};

export function renderBrd(r: ReverseEngineeringReport): string {
  const repo = r.id;
  const modName = (id: string) => r.modules.find((m) => m.id === id)?.name ?? id;
  const domName = (id: string) => r.domains.find((d) => d.id === id)?.name ?? id;
  const entName = (id: string) => r.entities.find((e) => e.id === id)?.name ?? id;
  const actName = (id: string) => r.activities.find((a) => a.id === id)?.name ?? id;
  const svcName = (id?: string) =>
    id ? (r.containerNodes.find((c) => c.id === id)?.name ?? id) : '';
  const stories = r.epics.flatMap((e) => e.features.flatMap((f) => f.stories));
  const review = r.expertReview;
  const out: string[] = [];
  const h = (s: string) => out.push(s, '');

  h(`# Business Requirements Document — ${r.systemSummary.name}`);
  h(
    `> Reverse-engineered by Phoenix.ai from the system's own artifacts. Every requirement below is traced to the file and line it was read from; elements marked **inferred** were reasoned by the model and need confirmation.`,
  );
  h(
    table(
      ['Item', 'Value'],
      [
        ['Source', `${r.run.sourceRepo} @ \`${r.run.sourceCommit.slice(0, 12)}\``],
        [
          'Generated',
          `${new Date(r.run.finishedAt).toUTCString()} (${r.run.mode === 'llm' ? `${r.run.provider}, ${r.run.model}` : 'curated input'})`,
        ],
        [
          'Evidence read',
          `${r.run.evidence.files} files, ${r.run.evidence.screenshots.length} screenshots, ${r.run.evidence.logEvents} log events, ${r.run.evidence.telemetrySignals} telemetry signals`,
        ],
        [
          'Extracted',
          `${r.domains.length} domains · ${r.entities.length} entities · ${r.activities.length} activities · ${r.executionFlows.length} flows · ${r.personas.length} personas · ${r.journeys.length} journeys · ${r.reports.length} reports · ${r.capabilities.length} capabilities · ${r.epics.length} epics · ${stories.length} user stories`,
        ],
        ...(review?.revisions.length
          ? [
              [
                'Expert review',
                `${review.inputs.length} expert answers · ${review.resolvedQuestions.length} open questions resolved · last updated ${new Date(review.revisions[review.revisions.length - 1]!.at).toUTCString()}`,
              ],
            ]
          : []),
        [
          'Confidence legend',
          'high ≥ 80% · medium ≥ 60% · low < 60% · inferred = no direct evidence',
        ],
      ],
    ),
  );

  h('## Contents');
  h(
    [
      '1. [Executive summary](#1-executive-summary)',
      '2. [Business context, objectives & scope](#2-business-context-objectives--scope)',
      '3. [Module coverage](#3-module-coverage)',
      '4. [Business domains](#4-business-domains)',
      '5. [Domain model](#5-domain-model)',
      '6. [Actions & activities](#6-actions--activities)',
      '7. [Execution & business flows](#7-execution--business-flows)',
      '8. [Personas & user journeys](#8-personas--user-journeys)',
      '9. [Reports](#9-reports)',
      '10. [Capabilities, epics & user stories](#10-capabilities-epics--user-stories)',
      '11. [Business rules](#11-business-rules)',
      '12. [Architecture, integrations & NFRs](#12-architecture-integrations--nfrs)',
      '13. [Gaps, risks, assumptions & open questions](#13-gaps-risks-assumptions--open-questions)',
      ...(review
        ? ['14. [Expert review](#14-expert-review)', '15. [Glossary](#15-glossary)']
        : ['14. [Glossary](#14-glossary)']),
    ].join('\n'),
  );

  h('## 1. Executive summary');
  h(r.brd.executiveSummary);

  h('## 2. Business context, objectives & scope');
  h(r.brd.businessContext);
  h('**Objectives**');
  h(bullets(r.brd.objectives));
  h('**In scope**');
  h(bullets(r.brd.scopeIn));
  h('**Out of scope / not present in the system**');
  h(bullets(r.brd.scopeOut));
  h('**Stakeholders**');
  h(
    table(
      ['Stakeholder', 'Interest'],
      r.brd.stakeholders.map((s) => [s.role, s.interest]),
    ),
  );
  if (r.inputBrd) {
    h(`### Traceability to the initial BRD`);
    h(
      `Each requirement in the initial BRD (\`${r.inputBrd.source}\`, "${r.inputBrd.title}") checked against the evidence.`,
    );
    h(
      table(
        ['ID', 'Initial requirement', 'Module', 'Status', 'Finding', 'Evidence'],
        r.traceability.map((t) => [
          t.id,
          t.requirement,
          modName(t.moduleId),
          TRACE_LABEL[t.status] ?? t.status,
          t.finding,
          t.evidence
            .slice(0, 2)
            .map((e) => `\`${e}\``)
            .join(', ') || '—',
        ]),
      ),
    );
  }

  h('## 3. Module coverage');
  h(
    table(
      ['Module', 'Coverage', 'Summary', 'Activities', 'Capabilities', 'Stories'],
      r.modules.map((m) => [
        m.name,
        m.coverage,
        m.summary,
        String(r.activities.filter((a) => a.moduleId === m.id).length),
        String(r.capabilities.filter((c) => c.moduleId === m.id).length),
        String(
          r.epics
            .filter((e) => e.moduleId === m.id)
            .reduce((n, e) => n + e.features.reduce((k, f) => k + f.stories.length, 0), 0),
        ),
      ]),
    ),
  );

  h('## 4. Business domains');
  h(
    table(
      ['Domain', 'Description', 'Modules', 'Owning services', 'Confidence'],
      r.domains.map((d) => [
        d.name,
        d.description,
        d.moduleIds.map(modName).join(', '),
        d.owningServices.map(svcName).join(', '),
        badge(d.metadata),
      ]),
    ),
  );
  for (const d of r.domains) {
    h(`### ${d.name}`);
    h(d.description);
    h('**Responsibilities**');
    h(bullets(d.responsibilities));
    h(
      `**Aggregates:** ${d.aggregates.map((a) => `${a.name} (${a.entities.join(', ')})`).join('; ') || '—'}`,
    );
  }

  h('## 5. Domain model');
  h('```mermaid\n' + mermaidEr(r) + '\n```');
  for (const e of r.entities) {
    h(
      `### ${e.name}  \n_${domName(e.domainId)} · ${e.storage} · confidence ${badge(e.metadata)} · source ${cite(e.metadata, repo)}_`,
    );
    h(e.description);
    h(
      table(
        ['Attribute', 'Type', 'Key', 'Required', 'Meaning'],
        e.attributes.map((a) => [
          a.name,
          a.type,
          a.key ?? '',
          a.required === undefined ? '' : a.required ? 'yes' : 'no',
          a.description,
        ]),
      ),
    );
  }
  h('**Relationships**');
  h(
    table(
      ['From', 'Relationship', 'To', 'Cardinality'],
      r.relationships.map((x) => [
        entName(x.fromEntityId),
        x.label,
        entName(x.toEntityId),
        x.cardinality,
      ]),
    ),
  );

  h('## 6. Actions & activities');
  for (const m of r.modules) {
    const acts = r.activities.filter((a) => a.moduleId === m.id);
    if (!acts.length) continue;
    h(`### ${m.name}`);
    h(
      table(
        [
          'Activity',
          'Actor',
          'Trigger',
          'Inputs → Outputs',
          'Business rules',
          'Endpoint',
          'Source',
        ],
        acts.map((a) => [
          `**${a.name}** — ${a.description}`,
          a.actor,
          a.trigger,
          `${a.inputs.join(', ') || '—'} → ${a.outputs.join(', ') || '—'}`,
          a.businessRules.join('; ') || '—',
          a.endpoint ? `\`${a.endpoint}\`` : '—',
          cite(a.metadata, repo),
        ]),
      ),
    );
  }

  h('## 7. Execution & business flows');
  for (const f of r.executionFlows) {
    h(
      `### ${f.name}  \n_${modName(f.moduleId)} · actor: ${f.actor} · starts at: ${f.triggerScreen} · confidence ${badge(f.metadata)}_`,
    );
    h(f.description);
    h(
      f.steps
        .map(
          (s, i) =>
            `${i + 1}. **${s.name}**${s.service ? ` _(${svcName(s.service)})_` : ''} — ${s.description}` +
            (s.readsEntities.length ? ` Reads: ${s.readsEntities.join(', ')}.` : '') +
            (s.writesEntities.length ? ` Writes: ${s.writesEntities.join(', ')}.` : ''),
        )
        .join('\n'),
    );
    h('```mermaid\n' + mermaidSequence(r, f) + '\n```');
  }

  h('## 8. Personas & user journeys');
  for (const p of r.personas) {
    h(`### ${p.name} — ${p.role}`);
    h(`**Goals**\n${bullets(p.goals)}\n\n**Pain points**\n${bullets(p.painPoints)}`);
    for (const j of r.journeys.filter((x) => x.personaId === p.id)) {
      h(
        `#### Journey: ${j.name}  \n_${modName(j.moduleId)} · realised by: ${j.flowIds.map((id) => r.executionFlows.find((f) => f.id === id)?.name ?? id).join(', ') || '—'}_`,
      );
      h(j.description);
      h(
        table(
          ['Stage', 'Action', 'Touchpoint', 'Pain point'],
          j.stages.map((s) => [s.stage, s.action, s.touchpoint, s.painPoint ?? '']),
        ),
      );
    }
  }

  h('## 9. Reports');
  h(
    table(
      ['Report', 'Module', 'Status', 'Purpose', 'Audience', 'Key fields', 'Frequency', 'Source'],
      r.reports.map((x) => [
        x.name,
        modName(x.moduleId),
        x.implemented ? 'Exists today' : 'Required — not built',
        x.purpose,
        x.audience.join(', '),
        x.fields.join(', '),
        x.frequency,
        cite(x.metadata, repo),
      ]),
    ),
  );

  h('## 10. Capabilities, epics & user stories');
  for (const m of r.modules) {
    h(`### ${m.name}  \n_Coverage: ${m.coverage}. ${m.summary}_`);
    h('**Capabilities**');
    h(
      table(
        ['Capability', 'Status', 'Description', 'Realised by'],
        r.capabilities
          .filter((c) => c.moduleId === m.id)
          .map((c) => [
            c.name,
            c.status,
            c.description,
            c.activityIds.map(actName).join(', ') || '—',
          ]),
      ),
    );
    for (const e of r.epics.filter((x) => x.moduleId === m.id)) {
      h(`#### Epic: ${e.name}`);
      h(e.description);
      for (const f of e.features) {
        h(`##### Feature: ${f.name}`);
        if (f.description) h(f.description);
        for (const s of f.stories) {
          h(
            `- **${s.id} · ${s.title}** _(${s.priority}, ${badge(s.metadata)})_  \n  As a **${s.asA}**, I want **${s.iWant}**, so that **${s.soThat}**.\n` +
              s.acceptanceCriteria.map((ac) => `  - [ ] ${ac.description}`).join('\n'),
          );
        }
      }
    }
  }

  h('## 11. Business rules');
  h(
    table(
      ['ID', 'Rule', 'Module', 'Source'],
      r.brd.businessRules.map((b) => [
        b.id,
        b.rule,
        modName(b.moduleId),
        b.evidence
          .slice(0, 2)
          .map((x) => `\`${x}\``)
          .join(', ') || '_inferred_',
      ]),
    ),
  );

  h('## 12. Architecture, integrations & NFRs');
  h('```mermaid\n' + mermaidContainers(r) + '\n```');
  h('**Integrations**');
  h(
    table(
      ['Integration', 'Counterpart', 'Direction', 'Protocol', 'Data exchanged'],
      r.integrations.map((i) => [i.name, i.counterpart, i.direction, i.protocol, i.dataExchanged]),
    ),
  );
  h('**Non-functional requirements**');
  h(
    table(
      ['Category', 'Requirement', 'Target', 'Confidence'],
      r.nonFunctionalRequirements.map((n) => [
        n.category,
        n.requirement,
        n.target,
        badge(n.metadata),
      ]),
    ),
  );

  h('## 13. Gaps, risks, assumptions & open questions');
  h(
    table(
      ['Severity', 'Area', 'Gap', 'Missing input', 'Suggested action'],
      r.gapItems.map((g) => [
        g.severity,
        g.area,
        g.description,
        g.missingInputs.join(', '),
        g.suggestedAction,
      ]),
    ),
  );
  h('**Risks**');
  h(
    table(
      ['Risk', 'Impact', 'Mitigation'],
      r.brd.risks.map((x) => [x.risk, x.impact, x.mitigation]),
    ),
  );
  h('**Assumptions**');
  h(bullets(r.brd.assumptions));
  h('**Constraints**');
  h(bullets(r.brd.constraints));
  h('**Open questions**');
  h(bullets(r.brd.openQuestions));
  if (review?.resolvedQuestions.length) {
    h('**Resolved questions** (answered by domain experts — see section 14)');
    h(
      table(
        ['Question', 'Resolution', 'Answered by'],
        review.resolvedQuestions.map((q) => [q.question, q.resolution, q.answeredBy ?? '—']),
      ),
    );
  }

  if (review) {
    h('## 14. Expert review');
    h(
      "Answers from domain experts to the questions generated from this BRD. Each entry shows what the BRD said, the expert's answer and, where a model was available, the answer restated as requirement text. Expert input takes precedence over reverse-engineered content where they differ.",
    );
    h('**Version history**');
    h(
      table(
        ['Date', 'Change'],
        review.revisions.map((v) => [new Date(v.at).toUTCString(), v.summary]),
      ),
    );
    for (const m of r.modules) {
      const inputs = review.inputs.filter((i) => i.moduleId === m.id);
      if (!inputs.length) continue;
      h(`### ${m.name}`);
      for (const i of inputs) {
        h(`**${INTENT_LABEL[i.intent] ?? i.intent} · ${i.level}** — ${i.question}`);
        h(`_What the BRD said:_ ${i.brdContext}`);
        h(`_Expert answer${i.answeredBy ? ` (${i.answeredBy})` : ''}:_`);
        h(quote(i.answer));
        if (i.statement !== i.answer) {
          h('_As requirement text:_');
          h(quote(i.statement));
        }
        h(`_About:_ ${i.sourceIds.map((id) => `\`${id}\``).join(', ')}`);
      }
    }
  }

  h(`## ${review ? 15 : 14}. Glossary`);
  h(
    table(
      ['Term', 'Definition'],
      r.brd.glossary.map((g) => [g.term, g.definition]),
    ),
  );

  if (r.run.warnings.length) {
    h('## Appendix — assembly warnings');
    h(bullets(r.run.warnings));
  }
  return out.join('\n');
}
