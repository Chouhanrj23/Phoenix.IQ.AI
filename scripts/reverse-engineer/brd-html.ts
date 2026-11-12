// Renders the enriched BRD as a print-ready HTML document, which pdf.ts prints
// to PDF. Layout: cover, document control, contents, numbered sections with
// requirement ids (IN-, FR-, BR-, NFR-), traceability to the initial BRD,
// diagrams (Mermaid), and an evidence index.
import type { ReverseEngineeringReport } from '../../apps/web/src/reverse-engineering/types.ts';
import { TRACE_LABEL, mermaidContainers, mermaidEr, mermaidSequence } from './brd-markdown.ts';

type Meta = { confidence: { level: string; score?: number }; provenance: { sourceId: string }[] };

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@10.9.1/dist/mermaid.min.js';

const esc = (s: unknown) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

function conf(m: Meta): string {
  const pct = m.confidence.score !== undefined ? ` ${Math.round(m.confidence.score * 100)}%` : '';
  return `<span class="conf conf-${esc(m.confidence.level)}">${esc(m.confidence.level)}${pct}</span>`;
}

function sources(m: Meta, repo: string): string {
  const refs = m.provenance
    .map((p) => p.sourceId.replace(`repo://${repo}/`, ''))
    .filter((s) => !s.startsWith('repo://'))
    .slice(0, 3);
  return refs.length ? refs.map((r) => `<code>${esc(r)}</code>`).join('<br>') : '<em>inferred</em>';
}

function list(items: string[]): string {
  return items.length
    ? `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>`
    : '<p class="none">None identified.</p>';
}

function table(head: string[], rows: string[][], cls = ''): string {
  if (!rows.length) return '<p class="none">None identified.</p>';
  return `<table class="${cls}"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

/** Expert text keeps its line breaks. */
const paras = (s: string) => esc(s.trim()).replace(/\n+/g, '<br>');

const INTENT_LABEL: Record<string, string> = {
  confirm: 'Confirm',
  explain: 'Explain',
  'edge-cases': 'Edge cases',
  'fill-gap': 'Fill a gap',
  resolve: 'Resolve',
};

const diagram = (src: string, caption: string) =>
  `<figure class="diagram"><pre class="mermaid">${esc(src)}</pre><figcaption>${esc(caption)}</figcaption></figure>`;

export function renderBrdHtml(r: ReverseEngineeringReport): string {
  const repo = r.id;
  const modName = (id: string) => r.modules.find((m) => m.id === id)?.name ?? id;
  const domName = (id: string) => r.domains.find((d) => d.id === id)?.name ?? id;
  const entName = (id: string) => r.entities.find((e) => e.id === id)?.name ?? id;
  const actName = (id: string) => r.activities.find((a) => a.id === id)?.name ?? id;
  const svcName = (id?: string) =>
    id ? (r.containerNodes.find((c) => c.id === id)?.name ?? id) : '';
  const stories = r.epics.flatMap((e) => e.features.flatMap((f) => f.stories));
  const generated = new Date(r.run.finishedAt);
  const dateStr = generated.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
  const version = r.inputBrd ? '2.0' : '1.0';
  const review = r.expertReview;
  // Each expert review adds a minor version on top of the generated one.
  const currentVersion = review?.revisions.length
    ? `${version.split('.')[0]}.${review.revisions.length}`
    : version;

  // Section numbering is computed so the contents list always matches the body.
  const sections: { id: string; title: string; html: string }[] = [];
  const add = (id: string, title: string, html: string) => sections.push({ id, title, html });

  // ---------------------------------------------------------------- 1
  add(
    'summary',
    'Executive summary',
    r.brd.executiveSummary
      .split(/\n+/)
      .map((p) => `<p>${esc(p)}</p>`)
      .join('') +
      `<div class="kpis">${[
        ['Business domains', r.domains.length],
        ['Entities', r.entities.length],
        ['Activities', r.activities.length],
        ['Execution flows', r.executionFlows.length],
        ['Personas', r.personas.length],
        ['Reports', r.reports.length],
        ['Capabilities', r.capabilities.length],
        ['User stories', stories.length],
      ]
        .map(([l, v]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`)
        .join('')}</div>`,
  );

  // ---------------------------------------------------------------- 2
  add(
    'context',
    'Business context, objectives & scope',
    `<p>${esc(r.brd.businessContext)}</p>
     <h3>Business objectives</h3>${table(
       ['ID', 'Objective'],
       r.brd.objectives.map((o, i) => [`OBJ-${String(i + 1).padStart(2, '0')}`, esc(o)]),
     )}
     <div class="cols"><div><h3>In scope</h3>${list(r.brd.scopeIn)}</div><div><h3>Out of scope / not present</h3>${list(r.brd.scopeOut)}</div></div>
     <h3>Stakeholders</h3>${table(
       ['Stakeholder', 'Interest'],
       r.brd.stakeholders.map((s) => [esc(s.role), esc(s.interest)]),
     )}`,
  );

  // ---------------------------------------------------------------- traceability
  if (r.inputBrd) {
    const count = (s: string) => r.traceability.filter((t) => t.status === s).length;
    add(
      'traceability',
      'Traceability to the initial BRD',
      `<p>This document enriches the initial BRD <b>"${esc(r.inputBrd.title)}"</b> (<code>${esc(r.inputBrd.source)}</code>).
       Each of its requirements was checked against the system's code, data model, screens, logs and telemetry.</p>
       <div class="kpis">${[
         ['Confirmed', count('confirmed'), 'ok'],
         ['Partially met', count('partial'), 'warn'],
         ['Not implemented', count('not-implemented'), 'bad'],
         ['Contradicted', count('contradicted'), 'bad'],
       ]
         .map(([l, v, c]) => `<div class="kpi kpi-${c}"><b>${v}</b><span>${l}</span></div>`)
         .join('')}</div>
       ${table(
         ['ID', 'Initial requirement', 'Module', 'Status', 'Finding', 'Evidence'],
         r.traceability.map((t) => [
           `<b>${esc(t.id)}</b>`,
           esc(t.requirement),
           esc(modName(t.moduleId)),
           `<span class="status st-${esc(t.status)}">${esc(TRACE_LABEL[t.status] ?? t.status)}</span>`,
           esc(t.finding) +
             (t.relatedIds.length
               ? `<div class="rel">Related: ${t.relatedIds.map(esc).join(', ')}</div>`
               : ''),
           t.evidence
             .slice(0, 2)
             .map((e) => `<code>${esc(e)}</code>`)
             .join('<br>') || '—',
         ]),
         'dense',
       )}`,
    );
  }

  // ---------------------------------------------------------------- modules
  add(
    'modules',
    'Module coverage',
    table(
      ['Module', 'Coverage', 'Summary', 'Activities', 'Capabilities', 'Stories'],
      r.modules.map((m) => [
        `<b>${esc(m.name)}</b>`,
        `<span class="status cov-${m.coverage}">${esc(m.coverage)}</span>`,
        esc(m.summary),
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

  // ---------------------------------------------------------------- (1) domains
  add(
    'domains',
    'Business domains',
    table(
      ['Domain', 'Description', 'Modules', 'Owning services', 'Confidence'],
      r.domains.map((d) => [
        `<b>${esc(d.name)}</b>`,
        esc(d.description),
        esc(d.moduleIds.map(modName).join(', ')),
        esc(d.owningServices.map(svcName).join(', ')),
        conf(d.metadata),
      ]),
    ) +
      r.domains
        .map(
          (d) => `<div class="card"><h3>${esc(d.name)}</h3><p>${esc(d.description)}</p>
          <h4>Responsibilities</h4>${list(d.responsibilities)}
          <h4>Aggregates</h4>${list(d.aggregates.map((a) => `${a.name}: ${a.entities.join(', ')}`))}</div>`,
        )
        .join(''),
  );

  // ---------------------------------------------------------------- (2) domain model
  add(
    'model',
    'Domain model',
    diagram(mermaidEr(r), 'Entity-relationship diagram') +
      `<h3>Relationships</h3>${table(
        ['From', 'Relationship', 'To', 'Cardinality'],
        r.relationships.map((x) => [
          esc(entName(x.fromEntityId)),
          esc(x.label),
          esc(entName(x.toEntityId)),
          `<code>${esc(x.cardinality)}</code>`,
        ]),
      )}` +
      r.entities
        .map(
          (e) => `<div class="card"><h3>${esc(e.name)}</h3>
          <p class="meta">${esc(domName(e.domainId))} · ${esc(e.storage)} · ${conf(e.metadata)}</p><p>${esc(e.description)}</p>
          ${table(
            ['Attribute', 'Type', 'Key', 'Req.', 'Meaning'],
            e.attributes.map((a) => [
              `<code>${esc(a.name)}</code>`,
              esc(a.type),
              esc(a.key ?? ''),
              a.required === undefined ? '' : a.required ? 'Y' : 'N',
              esc(a.description),
            ]),
            'dense',
          )}<p class="src">Source: ${sources(e.metadata, repo)}</p></div>`,
        )
        .join(''),
  );

  // ---------------------------------------------------------------- (3) activities = functional requirements
  let fr = 0;
  add(
    'activities',
    'Actions & activities (functional requirements)',
    `<p>Each activity is stated as a functional requirement (FR) of the system.</p>` +
      r.modules
        .map((m) => {
          const acts = r.activities.filter((a) => a.moduleId === m.id);
          if (!acts.length) return '';
          return `<h3>${esc(m.name)}</h3>${table(
            [
              'ID',
              'Requirement',
              'Actor / trigger',
              'Inputs → outputs',
              'Business rules',
              'Source',
            ],
            acts.map((a) => [
              `<b>FR-${String(++fr).padStart(3, '0')}</b>`,
              `<b>${esc(a.name)}</b><br>${esc(a.description)}${a.endpoint ? `<br><code>${esc(a.endpoint)}</code>` : ''}`,
              `${esc(a.actor)}<br><span class="muted">${esc(a.trigger)}</span>`,
              `${esc(a.inputs.join(', ') || '—')}<br>→ ${esc(a.outputs.join(', ') || '—')}`,
              list(a.businessRules),
              `${sources(a.metadata, repo)}<br>${conf(a.metadata)}`,
            ]),
            'dense',
          )}`;
        })
        .join(''),
  );

  // ---------------------------------------------------------------- (4) flows
  add(
    'flows',
    'Execution & business flows',
    r.executionFlows
      .map(
        (f) => `<div class="card"><h3>${esc(f.name)}</h3>
        <p class="meta">${esc(modName(f.moduleId))} · actor: ${esc(f.actor)} · starts at: ${esc(f.triggerScreen)} · ${conf(f.metadata)}</p>
        <p>${esc(f.description)}</p>
        <ol class="steps">${f.steps
          .map(
            (
              s,
            ) => `<li><b>${esc(s.name)}</b>${s.service ? ` <span class="svc">${esc(svcName(s.service))}</span>` : ''} — ${esc(s.description)}
            ${s.readsEntities.length ? `<span class="muted"> Reads: ${esc(s.readsEntities.join(', '))}.</span>` : ''}
            ${s.writesEntities.length ? `<span class="muted"> Writes: ${esc(s.writesEntities.join(', '))}.</span>` : ''}</li>`,
          )
          .join('')}</ol>
        ${diagram(mermaidSequence(r, f), `Sequence: ${f.name}`)}</div>`,
      )
      .join(''),
  );

  // ---------------------------------------------------------------- (5) personas & journeys
  add(
    'personas',
    'Personas & user journeys',
    r.personas
      .map(
        (
          p,
        ) => `<div class="card"><h3>${esc(p.name)} <span class="muted">— ${esc(p.role)}</span></h3>
        <div class="cols"><div><h4>Goals</h4>${list(p.goals)}</div><div><h4>Pain points</h4>${list(p.painPoints)}</div></div>
        ${r.journeys
          .filter((j) => j.personaId === p.id)
          .map(
            (j) => `<h4>Journey: ${esc(j.name)}</h4><p>${esc(j.description)}</p>
            <div class="journey">${j.stages
              .map(
                (s) =>
                  `<div class="stage"><b>${esc(s.stage)}</b><span>${esc(s.action)}</span><em>via ${esc(s.touchpoint)}</em>${
                    s.painPoint ? `<i>⚠ ${esc(s.painPoint)}</i>` : ''
                  }</div>`,
              )
              .join('')}</div>`,
          )
          .join('')}</div>`,
      )
      .join(''),
  );

  // ---------------------------------------------------------------- (6) reports
  add(
    'reports',
    'Reports',
    table(
      ['Report', 'Module', 'Status', 'Audience', 'Key fields', 'Frequency'],
      r.reports.map((x) => [
        `<b>${esc(x.name)}</b><br>${esc(x.purpose)}`,
        esc(modName(x.moduleId)),
        `<span class="status ${x.implemented ? 'st-confirmed' : 'st-not-implemented'}">${x.implemented ? 'Exists today' : 'Required — not built'}</span>`,
        esc(x.audience.join(', ')),
        esc(x.fields.join(', ')),
        esc(x.frequency),
      ]),
      'dense',
    ),
  );

  // ---------------------------------------------------------------- (7) capabilities, epics, stories
  add(
    'backlog',
    'Capabilities, epics & user stories',
    r.modules
      .map((m) => {
        const caps = r.capabilities.filter((c) => c.moduleId === m.id);
        const epics = r.epics.filter((e) => e.moduleId === m.id);
        return `<h3>${esc(m.name)} <span class="status cov-${m.coverage}">${esc(m.coverage)}</span></h3>
        ${table(
          ['Capability', 'Status', 'Description', 'Realised by'],
          caps.map((c) => [
            `<b>${esc(c.name)}</b>`,
            `<span class="status cap-${c.status}">${esc(c.status)}</span>`,
            esc(c.description),
            esc(c.activityIds.map(actName).join(', ') || '—'),
          ]),
        )}
        ${epics
          .map(
            (
              e,
            ) => `<div class="card epic"><h4>Epic · ${esc(e.name)}</h4><p>${esc(e.description)}</p>
            ${e.features
              .map(
                (f) =>
                  `<h5>Feature · ${esc(f.name)}</h5>${f.stories
                    .map(
                      (
                        s,
                      ) => `<div class="story"><div class="story-head"><b>${esc(s.id.toUpperCase())}</b> ${esc(s.title)}
                    <span class="prio prio-${s.priority}">${esc(s.priority)}</span></div>
                    <p>As a <b>${esc(s.asA)}</b>, I want <b>${esc(s.iWant)}</b>, so that <b>${esc(s.soThat)}</b>.</p>
                    <ul class="ac">${s.acceptanceCriteria.map((ac) => `<li>${esc(ac.description)}</li>`).join('')}</ul></div>`,
                    )
                    .join('')}`,
              )
              .join('')}</div>`,
          )
          .join('')}`;
      })
      .join(''),
  );

  // ---------------------------------------------------------------- rules
  add(
    'rules',
    'Business rules',
    table(
      ['ID', 'Rule', 'Module', 'Source'],
      r.brd.businessRules.map((b) => [
        `<b>${esc(b.id.toUpperCase())}</b>`,
        esc(b.rule),
        esc(modName(b.moduleId)),
        b.evidence
          .slice(0, 2)
          .map((e) => `<code>${esc(e)}</code>`)
          .join('<br>') || '<em>inferred</em>',
      ]),
      'dense',
    ),
  );

  // ---------------------------------------------------------------- architecture & NFRs
  add(
    'architecture',
    'Architecture, integrations & non-functional requirements',
    diagram(mermaidContainers(r), 'Containers and their interactions') +
      `<h3>Integrations</h3>${table(
        ['Integration', 'Counterpart', 'Direction', 'Protocol', 'Data exchanged'],
        r.integrations.map((i) => [
          `<b>${esc(i.name)}</b>`,
          esc(i.counterpart),
          esc(i.direction),
          esc(i.protocol),
          esc(i.dataExchanged),
        ]),
        'dense',
      )}
      <h3>Deployment</h3>${table(
        ['Unit', 'Runtime', 'Scale'],
        r.deploymentNodes
          .filter((d) => d.kind === 'instance')
          .map((d) => [esc(d.name), esc(d.runtime ?? ''), esc(d.scale ?? '')]),
        'dense',
      )}
      <h3>Non-functional requirements</h3>${table(
        ['ID', 'Category', 'Requirement', 'Target', 'Confidence'],
        r.nonFunctionalRequirements.map((n, i) => [
          `<b>NFR-${String(i + 1).padStart(2, '0')}</b>`,
          esc(n.category),
          esc(n.requirement),
          esc(n.target),
          conf(n.metadata),
        ]),
        'dense',
      )}`,
  );

  // ---------------------------------------------------------------- gaps & risks
  add(
    'gaps',
    'Gaps, risks, assumptions & open questions',
    `<h3>Gap analysis</h3>${table(
      ['Severity', 'Area', 'Gap', 'Missing input', 'Suggested action'],
      r.gapItems.map((g) => [
        `<span class="status sev-${g.severity}">${esc(g.severity)}</span>`,
        `<b>${esc(g.area)}</b>`,
        esc(g.description),
        esc(g.missingInputs.join(', ')),
        esc(g.suggestedAction),
      ]),
      'dense',
    )}
    <h3>Risks</h3>${table(
      ['Risk', 'Impact', 'Mitigation'],
      r.brd.risks.map((x) => [
        esc(x.risk),
        `<span class="status sev-${x.impact}">${esc(x.impact)}</span>`,
        esc(x.mitigation),
      ]),
    )}
    <div class="cols"><div><h3>Assumptions</h3>${list(r.brd.assumptions)}</div><div><h3>Constraints</h3>${list(r.brd.constraints)}</div></div>
    <h3>Open questions</h3>${list(r.brd.openQuestions)}${
      review?.resolvedQuestions.length
        ? `<h3>Resolved questions</h3><p>Answered by domain experts; see Expert review.</p>${table(
            ['Question', 'Resolution', 'Answered by'],
            review.resolvedQuestions.map((q) => [
              esc(q.question),
              paras(q.resolution),
              esc(q.answeredBy ?? '—'),
            ]),
          )}`
        : ''
    }`,
  );

  if (review) {
    add(
      'expert-review',
      'Expert review',
      `<p>Answers from domain experts to the questions generated from this BRD. Each entry shows what the BRD said, the expert's answer and, where a model was available, the answer restated as requirement text. Expert input takes precedence over reverse-engineered content where they differ.</p>
      ${r.modules
        .map((m) => {
          const inputs = review.inputs.filter((i) => i.moduleId === m.id);
          if (!inputs.length) return '';
          return `<h3>${esc(m.name)}</h3>${table(
            ['Question', 'What the BRD said', 'Expert input'],
            inputs.map((i) => [
              `<b>${esc(INTENT_LABEL[i.intent] ?? i.intent)}</b> · ${esc(i.level)}<br>${esc(i.question)}`,
              esc(i.brdContext),
              `${paras(i.statement)}${
                i.statement !== i.answer
                  ? `<br><br><em>Expert's words:</em> ${paras(i.answer)}`
                  : ''
              }<br><em>${esc(i.answeredBy ?? 'Expert')} · ${esc(new Date(i.answeredAt).toLocaleDateString('en-GB'))}</em>`,
            ]),
            'dense',
          )}`;
        })
        .join('')}`,
    );
  }

  add(
    'glossary',
    'Glossary',
    table(
      ['Term', 'Definition'],
      r.brd.glossary.map((g) => [`<b>${esc(g.term)}</b>`, esc(g.definition)]),
    ),
  );

  // ---------------------------------------------------------------- appendix
  const cited = new Map<string, number>();
  const all: Meta[] = [
    ...r.domains,
    ...r.entities,
    ...r.activities,
    ...r.executionFlows,
    ...r.personas,
    ...r.reports,
    ...r.capabilities,
    ...r.containerNodes,
    ...r.integrations,
    ...r.nonFunctionalRequirements,
  ].map((x) => x.metadata);
  for (const m of all) {
    for (const p of m.provenance) {
      const s = p.sourceId.replace(`repo://${repo}/`, '').replace(/:\d+$/, '');
      if (!s.startsWith('repo://')) cited.set(s, (cited.get(s) ?? 0) + 1);
    }
  }
  add(
    'evidence',
    'Appendix — evidence & method',
    `<p>Analysed <b>${esc(r.run.sourceRepo)}</b> at commit <code>${esc(r.run.sourceCommit.slice(0, 12))}</code>:
     ${r.run.evidence.files} files, ${r.run.evidence.screenshots.length} screenshots, ${r.run.evidence.logEvents} log events and
     ${r.run.evidence.telemetrySignals} telemetry signals. Stages and the model that produced each:</p>
     ${table(
       ['Stage', 'Produced by'],
       r.run.stages.map((s) => [esc(s.name), esc(s.model)]),
     )}
     <h3>Most-cited source artifacts</h3>
     ${table(
       ['Artifact', 'Elements citing it'],
       [...cited.entries()]
         .sort((a, b) => b[1] - a[1])
         .slice(0, 25)
         .map(([s, n]) => [`<code>${esc(s)}</code>`, String(n)]),
       'dense',
     )}
     <p class="muted">Confidence: high ≥ 80% · medium ≥ 60% · low &lt; 60% · inferred = reasoned without direct evidence and to be confirmed in review.</p>`,
  );

  const body = sections
    .map(
      (s, i) =>
        `<section id="${s.id}"><h2><span class="num">${i + 1}</span>${esc(s.title)}</h2>${s.html}</section>`,
    )
    .join('\n');
  const toc = sections
    .map(
      (s, i) => `<li><a href="#${s.id}"><span class="num">${i + 1}</span>${esc(s.title)}</a></li>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>BRD — ${esc(r.systemSummary.name)}</title>
<style>
  @page { size: A4; margin: 18mm 15mm 18mm 15mm;
    @bottom-left { content: "Business Requirements Document — ${esc(r.systemSummary.name)}"; font: 8pt 'Segoe UI', Arial, sans-serif; color: #6b7280; }
    @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 8pt 'Segoe UI', Arial, sans-serif; color: #6b7280; } }
  @page :first { margin: 0; @bottom-left { content: none } @bottom-right { content: none } }
  :root { --brand: #00338D; --ink: #111827; --muted: #6b7280; --line: #d1d5db; --soft: #f3f6fb; }
  * { box-sizing: border-box; }
  body { font: 9.5pt/1.5 'Segoe UI', Arial, sans-serif; color: var(--ink); margin: 0; background: #fff; }
  h2 { font-size: 16pt; color: var(--brand); border-bottom: 2px solid var(--brand); padding-bottom: 4px; margin: 0 0 10px; break-after: avoid; }
  h2 .num, .toc .num { display: inline-block; min-width: 26px; color: #fff; background: var(--brand); border-radius: 4px; text-align: center; margin-right: 8px; font-size: 11pt; padding: 1px 4px; }
  h3 { font-size: 12pt; color: var(--brand); margin: 16px 0 6px; break-after: avoid; }
  h4 { font-size: 10.5pt; margin: 10px 0 4px; break-after: avoid; }
  h5 { font-size: 9.5pt; margin: 10px 0 4px; color: #374151; break-after: avoid; }
  p { margin: 4px 0 8px; } ul, ol { margin: 4px 0 8px; padding-left: 18px; }
  section { break-before: page; }
  code { font: 8pt Consolas, monospace; background: #eef2f7; padding: 0 3px; border-radius: 3px; word-break: break-all; }
  table { width: 100%; border-collapse: collapse; margin: 6px 0 12px; font-size: 8.8pt; }
  table.dense { font-size: 8pt; }
  th { background: var(--brand); color: #fff; text-align: left; padding: 5px 6px; font-weight: 600; }
  td { border-bottom: 1px solid var(--line); padding: 5px 6px; vertical-align: top; }
  tr { break-inside: avoid; } tbody tr:nth-child(even) td { background: #fafbfd; }
  td ul { margin: 0; padding-left: 14px; }
  .muted, .meta { color: var(--muted); } .meta { font-size: 8.5pt; } .src { font-size: 8pt; color: var(--muted); }
  .none { color: var(--muted); font-style: italic; }
  .card { border: 1px solid var(--line); border-left: 4px solid var(--brand); border-radius: 4px; padding: 8px 12px; margin: 10px 0; break-inside: avoid; }
  .card.epic { break-inside: auto; }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin: 10px 0 14px; }
  .kpi { background: var(--soft); border-radius: 6px; padding: 8px 10px; } .kpi b { display: block; font-size: 16pt; color: var(--brand); } .kpi span { font-size: 8pt; color: var(--muted); }
  .kpi-ok b { color: #047857; } .kpi-warn b { color: #b45309; } .kpi-bad b { color: #b91c1c; }
  .conf, .status, .prio { display: inline-block; border-radius: 10px; padding: 0 7px; font-size: 7.5pt; font-weight: 600; white-space: nowrap; }
  .conf-high, .st-confirmed, .cov-full, .cap-implemented { background: #d1fae5; color: #065f46; }
  .conf-medium, .st-partial, .cov-partial, .cap-partial, .sev-medium { background: #fef3c7; color: #92400e; }
  .conf-low, .st-not-implemented, .st-contradicted, .cov-none, .cap-gap, .sev-high, .sev-blocking { background: #fee2e2; color: #991b1b; }
  .conf-inferred { background: #ede9fe; color: #5b21b6; } .sev-low { background: #e5e7eb; color: #374151; }
  .prio-must { background: var(--brand); color: #fff; } .prio-should { background: #dbeafe; color: #1e40af; } .prio-could { background: #e5e7eb; color: #374151; }
  .rel { font-size: 7.5pt; color: var(--muted); margin-top: 2px; }
  .svc { font-size: 8pt; color: #6d28d9; }
  .steps li { margin-bottom: 3px; }
  .story { border: 1px solid #e5e7eb; border-radius: 4px; padding: 6px 9px; margin: 6px 0; break-inside: avoid; }
  .story-head { display: flex; gap: 6px; align-items: baseline; } .story-head .prio { margin-left: auto; }
  .story p { margin: 3px 0; } .ac { list-style: none; padding-left: 0; margin: 2px 0 0; font-size: 8.3pt; color: #374151; } .ac li::before { content: '☐ '; }
  .journey { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 8px; }
  .stage { flex: 1 1 120px; background: var(--soft); border-radius: 4px; padding: 6px 8px; font-size: 8.3pt; break-inside: avoid; }
  .stage b { display: block; color: var(--brand); text-transform: uppercase; font-size: 7.5pt; letter-spacing: .04em; }
  .stage span, .stage em, .stage i { display: block; } .stage em { color: var(--muted); } .stage i { color: #b91c1c; font-style: normal; }
  .diagram { margin: 10px 0 14px; text-align: center; break-inside: avoid; }
  .diagram pre.mermaid { background: none; font-size: 8pt; text-align: left; white-space: pre-wrap; }
  .diagram svg { max-width: 100%; height: auto; max-height: 230mm; }
  figcaption { font-size: 8pt; color: var(--muted); margin-top: 4px; }
  /* cover */
  .cover { height: 297mm; display: flex; flex-direction: column; background: linear-gradient(160deg, #00338D 0%, #0a4bbd 55%, #1e66e0 100%); color: #fff; padding: 38mm 22mm 20mm; }
  .cover .eyebrow { letter-spacing: .25em; text-transform: uppercase; font-size: 9pt; opacity: .8; }
  .cover h1 { font-size: 30pt; line-height: 1.15; margin: 10mm 0 4mm; } .cover .sub { font-size: 13pt; opacity: .9; max-width: 150mm; }
  .cover .facts { margin-top: auto; display: grid; grid-template-columns: 1fr 1fr; gap: 6mm 12mm; font-size: 9.5pt; }
  .cover .facts b { display: block; font-size: 7.5pt; letter-spacing: .12em; text-transform: uppercase; opacity: .7; font-weight: 600; }
  .front { break-before: page; }
  .toc { list-style: none; padding: 0; } .toc li { padding: 5px 0; border-bottom: 1px dotted var(--line); } .toc a { color: var(--ink); text-decoration: none; }
  .sign td { height: 24px; }
</style></head>
<body>
<div class="cover">
  <div class="eyebrow">Business Requirements Document</div>
  <h1>${esc(r.systemSummary.name)}</h1>
  <div class="sub">${esc(r.systemSummary.description)}</div>
  <div class="facts">
    <div><b>Version</b>${currentVersion} — ${r.inputBrd ? 'enriched from the initial BRD' : 'reverse-engineered'}${review ? ', with expert review' : ''}</div>
    <div><b>Date</b>${esc(dateStr)}</div>
    <div><b>Prepared by</b>Phoenix.ai reverse-engineering pipeline</div>
    <div><b>Status</b>Draft for review</div>
    <div><b>Source system</b>${esc(r.run.sourceRepo.replace('https://github.com/', ''))} @ ${esc(r.run.sourceCommit.slice(0, 7))}</div>
    <div><b>Evidence</b>${r.run.evidence.files} files · ${r.run.evidence.logEvents} log events · ${r.run.evidence.telemetrySignals} telemetry signals</div>
  </div>
</div>

<div class="front">
  <h2>Document control</h2>
  ${table(
    ['Item', 'Detail'],
    [
      ['Document', 'Business Requirements Document (BRD)'],
      ['System', esc(r.systemSummary.name)],
      ['Version', currentVersion],
      [
        'Status',
        review
          ? `Draft — updated with ${review.inputs.length} expert answers`
          : 'Draft — pending business review',
      ],
      [
        'Initial BRD',
        r.inputBrd
          ? `${esc(r.inputBrd.title)} (<code>${esc(r.inputBrd.source)}</code>)`
          : 'None supplied — generated from evidence only',
      ],
      ['Generated by', `Phoenix.ai · ${esc(r.run.model)}`],
      ['Generated on', esc(generated.toUTCString())],
    ],
  )}
  <h3>Version history</h3>
  ${table(
    ['Version', 'Date', 'Description'],
    [
      ...(r.inputBrd
        ? [['1.0', '—', `Initial BRD supplied by the business: "${esc(r.inputBrd.title)}"`]]
        : []),
      [
        version,
        esc(dateStr),
        r.inputBrd
          ? 'Enriched with evidence from code, data model, screens, logs and telemetry; requirements traced'
          : 'Reverse-engineered from code, data model, screens, logs and telemetry',
      ],
      ...(review?.revisions ?? []).map((v, i) => [
        `${version.split('.')[0]}.${i + 1}`,
        esc(
          new Date(v.at).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'long',
            year: 'numeric',
          }),
        ),
        esc(v.summary),
      ]),
    ],
  )}
  <h3>Approvals</h3>
  ${table(
    ['Role', 'Name', 'Signature', 'Date'],
    [
      ['Business owner', '', '', ''],
      ['Product owner', '', '', ''],
      ['Solution architect', '', '', ''],
    ],
    'sign',
  )}
  <h3>Contents</h3>
  <ol class="toc">${toc}</ol>
</div>

${body}

<script src="${MERMAID_CDN}"></script>
<script>
  if (window.mermaid) {
    mermaid.initialize({ startOnLoad: false, theme: 'neutral', securityLevel: 'loose', er: { useMaxWidth: true }, sequence: { useMaxWidth: true }, flowchart: { useMaxWidth: true } });
    mermaid.run({ querySelector: 'pre.mermaid' });
  }
</script>
</body></html>`;
}
