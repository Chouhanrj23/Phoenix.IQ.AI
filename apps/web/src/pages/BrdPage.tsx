import { useMemo, useState, type JSX, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Download, FileSearch, Sparkles } from 'lucide-react';
import { getActiveCompany } from '../data/index.js';
import { getReport, storyCount } from '../reverse-engineering/index.js';
import type { ReverseEngineeringReport } from '../reverse-engineering/types.js';
import type { GraphElementMetadata } from '../data/types.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { ConfidenceBadge } from '../components/confidence-badge.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js';

// The BRD written by the same run, offered as downloads: the formatted PDF
// (bundled as a static asset URL) and the Markdown source.
const brdFiles = import.meta.glob<string>('../reverse-engineering/reports/*.brd.md', {
  query: '?raw',
  import: 'default',
});
const brdPdfs = import.meta.glob<string>('../reverse-engineering/reports/*.brd.pdf', {
  query: '?url',
  import: 'default',
  eager: true,
});

const TRACE = {
  confirmed: { label: 'Confirmed', variant: 'success' },
  partial: { label: 'Partially met', variant: 'warning' },
  'not-implemented': { label: 'Not implemented', variant: 'danger' },
  contradicted: { label: 'Contradicted', variant: 'danger' },
} as const;

const SECTIONS = [
  { id: 'summary', label: 'Overview' },
  { id: 'trace', label: 'Initial BRD traceability' },
  { id: 'domains', label: '1 · Business domains' },
  { id: 'model', label: '2 · Domain model' },
  { id: 'activities', label: '3 · Actions & activities' },
  { id: 'flows', label: '4 · Execution flows' },
  { id: 'personas', label: '5 · Personas & journeys' },
  { id: 'reports', label: '6 · Reports' },
  { id: 'backlog', label: '7 · Capabilities, epics & stories' },
] as const;

const COVERAGE_VARIANT = { full: 'success', partial: 'warning', none: 'danger' } as const;
const STATUS_VARIANT = { implemented: 'success', partial: 'warning', gap: 'danger' } as const;

function Evidence({ metadata }: { metadata: GraphElementMetadata }): JSX.Element {
  const refs = metadata.provenance
    .map((p) => p.sourceId.replace(/^repo:\/\/[^/]+\/?/, ''))
    .filter(Boolean)
    .slice(0, 3);
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      <ConfidenceBadge level={metadata.confidence.level} score={metadata.confidence.score} />
      {refs.map((ref) => (
        <code
          key={ref}
          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
        >
          {ref}
        </code>
      ))}
    </div>
  );
}

function List({ items, empty = '—' }: { items: string[]; empty?: string }): JSX.Element {
  if (!items.length) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-4">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }): JSX.Element {
  if (!rows.length) return <p className="text-sm text-muted-foreground">None for this module.</p>;
  return (
    <div className="overflow-x-auto rounded-md border border-border">
      <table className="w-full text-left text-sm">
        <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-t border-border align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }): JSX.Element {
  return (
    <div className="rounded-md border border-border bg-card px-3 py-2">
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export function BrdPage(): JSX.Element {
  const report = getReport(getActiveCompany());
  if (!report) {
    return (
      <Card className="mx-auto mt-10 max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileSearch className="h-4 w-4" /> No BRD generated yet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Upload your inputs on the <strong>Modules</strong> page (a half-complete BRD,
            screenshots of the website, logs, data models, telemetry…), then press{' '}
            <strong>Generate BRD</strong>. The enriched BRD and its PDF appear here when the run
            finishes. Until then this engagement shows demo data.
          </p>
          <NavLink to="/modules/module-1" className="text-[#00338D] underline">
            Go to Modules
          </NavLink>
        </CardContent>
      </Card>
    );
  }
  return <BrdView report={report} />;
}

function BrdView({ report: r }: { report: ReverseEngineeringReport }): JSX.Element {
  const [moduleId, setModuleId] = useState<string>('all');
  const inModule = (id: string) => moduleId === 'all' || id === moduleId;
  const modName = (id: string) => r.modules.find((m) => m.id === id)?.name ?? id;
  const entName = (id: string) => r.entities.find((e) => e.id === id)?.name ?? id;
  const actName = (id: string) => r.activities.find((a) => a.id === id)?.name ?? id;
  const svcName = (id?: string) =>
    id ? (r.containerNodes.find((c) => c.id === id)?.name ?? id) : '';

  const view = useMemo(() => {
    const domains = r.domains.filter((d) => moduleId === 'all' || d.moduleIds.includes(moduleId));
    const domainIds = new Set(domains.map((d) => d.id));
    return {
      domains,
      entities: r.entities.filter((e) => domainIds.has(e.domainId)),
      activities: r.activities.filter((a) => inModule(a.moduleId)),
      flows: r.executionFlows.filter((f) => inModule(f.moduleId)),
      personas: r.personas.filter((p) => moduleId === 'all' || p.moduleIds.includes(moduleId)),
      journeys: r.journeys.filter((j) => inModule(j.moduleId)),
      reports: r.reports.filter((x) => inModule(x.moduleId)),
      capabilities: r.capabilities.filter((c) => inModule(c.moduleId)),
      epics: r.epics.filter((e) => inModule(e.moduleId)),
      rules: r.brd.businessRules.filter((b) => inModule(b.moduleId)),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r, moduleId]);
  const entityIds = new Set(view.entities.map((e) => e.id));

  const pdfUrl = Object.entries(brdPdfs).find(([path]) => path.endsWith(`/${r.id}.brd.pdf`))?.[1];

  async function downloadBrd(): Promise<void> {
    const loader = Object.entries(brdFiles).find(([path]) => path.endsWith(`/${r.id}.brd.md`))?.[1];
    if (!loader) return;
    const text = await loader();
    const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${r.id}-BRD.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#00338D]">
            Reverse-engineered business requirements
          </p>
          <h1 className="text-2xl font-semibold tracking-tight">{r.systemSummary.name}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {r.systemSummary.description}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
            <Badge variant="secondary">
              <Sparkles className="mr-1 h-3 w-3" />
              {r.run.mode === 'llm' ? `${r.run.model}` : 'Curated input'}
            </Badge>
            <Badge variant="outline">
              <a
                href={r.run.sourceRepo}
                target="_blank"
                rel="noreferrer"
                className="hover:underline"
              >
                {r.run.sourceRepo.replace('https://github.com/', '')} @{' '}
                {r.run.sourceCommit.slice(0, 7)}
              </a>
            </Badge>
            <Badge variant="outline">
              {r.run.evidence.files} files · {r.run.evidence.screenshots.length} screenshots ·{' '}
              {r.run.evidence.logEvents} log events · {r.run.evidence.telemetrySignals} telemetry
              signals
            </Badge>
            <Badge variant="outline">Generated {new Date(r.run.finishedAt).toLocaleString()}</Badge>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          {pdfUrl ? (
            <a
              href={pdfUrl}
              download={`${r.id}-BRD.pdf`}
              className="inline-flex items-center rounded-md bg-[#00338D] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#002a73]"
            >
              <Download className="mr-2 h-4 w-4" /> Download BRD (PDF)
            </a>
          ) : null}
          {Object.keys(brdFiles).some((p) => p.endsWith(`/${r.id}.brd.md`)) ? (
            <Button variant="outline" onClick={() => void downloadBrd()}>
              Markdown
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        <Stat label="Business domains" value={view.domains.length} />
        <Stat label="Entities" value={view.entities.length} />
        <Stat label="Activities" value={view.activities.length} />
        <Stat label="Execution flows" value={view.flows.length} />
        <Stat
          label="Personas / journeys"
          value={`${view.personas.length} / ${view.journeys.length}`}
        />
        <Stat label="Reports" value={view.reports.length} />
        <Stat label="Capabilities" value={view.capabilities.length} />
        <Stat
          label="User stories"
          value={moduleId === 'all' ? storyCount(r) : storyCount({ ...r, epics: view.epics })}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Module
        </span>
        <button
          type="button"
          onClick={() => setModuleId('all')}
          className={`rounded-full border px-3 py-1 text-xs ${moduleId === 'all' ? 'border-[#00338D] bg-[#00338D] text-white' : 'border-border bg-card'}`}
        >
          All modules
        </button>
        {r.modules.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setModuleId(m.id)}
            title={m.summary}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs ${moduleId === m.id ? 'border-[#00338D] bg-[#00338D] text-white' : 'border-border bg-card'}`}
          >
            {m.name}
            <span
              className={`h-2 w-2 rounded-full ${m.coverage === 'full' ? 'bg-emerald-500' : m.coverage === 'partial' ? 'bg-amber-500' : 'bg-rose-500'}`}
            />
          </button>
        ))}
      </div>

      <Tabs defaultValue="summary">
        <TabsList className="flex h-auto flex-wrap justify-start">
          {SECTIONS.map((s) => (
            <TabsTrigger key={s.id} value={s.id}>
              {s.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ------------------------------------------------ Overview */}
        <TabsContent value="summary" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Executive summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed">
              {r.brd.executiveSummary.split(/\n+/).map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              <p className="text-muted-foreground">{r.brd.businessContext}</p>
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Objectives</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <List items={r.brd.objectives} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>In scope</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <List items={r.brd.scopeIn} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Out of scope / not in the system</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <List items={r.brd.scopeOut} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Module coverage</CardTitle>
            </CardHeader>
            <CardContent>
              <Table
                head={['Module', 'Coverage', 'Summary', 'Activities', 'Capabilities', 'Stories']}
                rows={r.modules.map((m) => [
                  <strong key="n">{m.name}</strong>,
                  <Badge key="c" variant={COVERAGE_VARIANT[m.coverage]}>
                    {m.coverage}
                  </Badge>,
                  m.summary,
                  r.activities.filter((a) => a.moduleId === m.id).length,
                  r.capabilities.filter((c) => c.moduleId === m.id).length,
                  storyCount({ ...r, epics: r.epics.filter((e) => e.moduleId === m.id) }),
                ])}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Business rules</CardTitle>
            </CardHeader>
            <CardContent>
              <Table
                head={['ID', 'Rule', 'Module', 'Source']}
                rows={view.rules.map((b) => [
                  <code key="i">{b.id}</code>,
                  b.rule,
                  modName(b.moduleId),
                  <span key="e" className="text-xs text-muted-foreground">
                    {b.evidence.slice(0, 2).join(', ') || 'inferred'}
                  </span>,
                ])}
              />
            </CardContent>
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Stakeholders</CardTitle>
              </CardHeader>
              <CardContent>
                <Table
                  head={['Role', 'Interest']}
                  rows={r.brd.stakeholders.map((s) => [s.role, s.interest])}
                />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Risks</CardTitle>
              </CardHeader>
              <CardContent>
                <Table
                  head={['Risk', 'Impact', 'Mitigation']}
                  rows={r.brd.risks.map((x) => [
                    x.risk,
                    <Badge
                      key="i"
                      variant={
                        x.impact === 'high'
                          ? 'danger'
                          : x.impact === 'medium'
                            ? 'warning'
                            : 'secondary'
                      }
                    >
                      {x.impact}
                    </Badge>,
                    x.mitigation,
                  ])}
                />
              </CardContent>
            </Card>
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Assumptions</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <List items={r.brd.assumptions} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Constraints</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <List items={r.brd.constraints} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Open questions</CardTitle>
              </CardHeader>
              <CardContent className="text-sm">
                <List items={r.brd.openQuestions} />
              </CardContent>
            </Card>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Glossary</CardTitle>
            </CardHeader>
            <CardContent>
              <Table
                head={['Term', 'Definition']}
                rows={r.brd.glossary.map((g) => [<strong key="t">{g.term}</strong>, g.definition])}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* ------------------------------------------------ initial BRD traceability */}
        <TabsContent value="trace" className="space-y-4 pt-4">
          {r.inputBrd ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Initial BRD: {r.inputBrd.title}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    The simple BRD supplied at the start (<code>{r.inputBrd.source}</code>). Each
                    requirement was checked against the system&apos;s code, data model, screens,
                    logs and telemetry; the full BRD above is the enriched result.
                  </p>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {(Object.keys(TRACE) as (keyof typeof TRACE)[]).map((s) => (
                    <Stat
                      key={s}
                      label={TRACE[s].label}
                      value={
                        r.traceability.filter((t) => t.status === s && inModule(t.moduleId)).length
                      }
                    />
                  ))}
                </CardContent>
              </Card>
              <Table
                head={['ID', 'Initial requirement', 'Module', 'Status', 'Finding', 'Evidence']}
                rows={r.traceability
                  .filter((t) => inModule(t.moduleId))
                  .map((t) => [
                    <strong key="i">{t.id}</strong>,
                    t.requirement,
                    modName(t.moduleId),
                    <Badge key="s" variant={TRACE[t.status].variant}>
                      {TRACE[t.status].label}
                    </Badge>,
                    <div key="f">
                      {t.finding}
                      {t.relatedIds.length ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Related: {t.relatedIds.join(', ')}
                        </div>
                      ) : null}
                    </div>,
                    <span key="e" className="text-xs text-muted-foreground">
                      {t.evidence.slice(0, 2).join(', ') || '—'}
                    </span>,
                  ])}
              />
              <details className="rounded-md border border-border bg-card p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  Show the initial BRD as supplied
                </summary>
                <pre className="mt-2 whitespace-pre-wrap font-sans text-muted-foreground">
                  {r.inputBrd.text}
                </pre>
              </details>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              No initial BRD was supplied for this run. Put one at{' '}
              <code>inputs/{r.id}/initial-brd.md</code> (or pass <code>--brd &lt;file&gt;</code>)
              and re-run <code>pnpm reverse-engineer</code>.
            </p>
          )}
        </TabsContent>

        {/* ------------------------------------------------ 1 domains */}
        <TabsContent value="domains" className="grid gap-4 pt-4 lg:grid-cols-2">
          {view.domains.map((d) => (
            <Card key={d.id}>
              <CardHeader>
                <CardTitle>{d.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{d.description}</p>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex flex-wrap gap-1">
                  {d.moduleIds.map((m) => (
                    <Badge key={m} variant="outline">
                      {modName(m)}
                    </Badge>
                  ))}
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Responsibilities
                  </div>
                  <List items={d.responsibilities} />
                </div>
                <div>
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Aggregates
                  </div>
                  <List items={d.aggregates.map((a) => `${a.name}: ${a.entities.join(', ')}`)} />
                </div>
                <div className="text-xs text-muted-foreground">
                  Owned by: {d.owningServices.map(svcName).join(', ') || '—'}
                </div>
                <Evidence metadata={d.metadata} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ------------------------------------------------ 2 domain model */}
        <TabsContent value="model" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle>Relationships</CardTitle>
            </CardHeader>
            <CardContent>
              <Table
                head={['From', 'Relationship', 'To', 'Cardinality']}
                rows={r.relationships
                  .filter((x) => entityIds.has(x.fromEntityId) || entityIds.has(x.toEntityId))
                  .map((x) => [
                    entName(x.fromEntityId),
                    x.label,
                    entName(x.toEntityId),
                    <code key="c">{x.cardinality}</code>,
                  ])}
              />
            </CardContent>
          </Card>
          <div className="grid gap-4 xl:grid-cols-2">
            {view.entities.map((e) => (
              <Card key={e.id}>
                <CardHeader>
                  <CardTitle>{e.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">{e.description}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.domains.find((d) => d.id === e.domainId)?.name} · {e.storage}
                  </p>
                </CardHeader>
                <CardContent>
                  <Table
                    head={['Attribute', 'Type', 'Key', 'Meaning']}
                    rows={e.attributes.map((a) => [
                      <code key="n">{a.name}</code>,
                      <span key="t" className="text-xs">
                        {a.type}
                      </span>,
                      a.key ? (
                        <Badge key="k" variant="secondary">
                          {a.key}
                        </Badge>
                      ) : (
                        ''
                      ),
                      a.description,
                    ])}
                  />
                  <Evidence metadata={e.metadata} />
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* ------------------------------------------------ 3 activities */}
        <TabsContent value="activities" className="pt-4">
          <Table
            head={[
              'Activity',
              'Module',
              'Actor & trigger',
              'Inputs → outputs',
              'Business rules',
              'Endpoint',
            ]}
            rows={view.activities.map((a) => [
              <div key="a" className="min-w-56">
                <strong>{a.name}</strong>
                <p className="text-muted-foreground">{a.description}</p>
                <Evidence metadata={a.metadata} />
              </div>,
              modName(a.moduleId),
              <div key="t">
                <div>{a.actor}</div>
                <div className="text-xs text-muted-foreground">{a.trigger}</div>
              </div>,
              <div key="io" className="text-xs">
                <div>{a.inputs.join(', ') || '—'}</div>
                <div className="text-muted-foreground">→ {a.outputs.join(', ') || '—'}</div>
              </div>,
              <div key="r" className="text-xs">
                <List items={a.businessRules} />
              </div>,
              a.endpoint ? (
                <code key="e" className="text-xs">
                  {a.endpoint}
                </code>
              ) : (
                '—'
              ),
            ])}
          />
        </TabsContent>

        {/* ------------------------------------------------ 4 flows */}
        <TabsContent value="flows" className="space-y-4 pt-4">
          {view.flows.map((f) => (
            <Card key={f.id}>
              <CardHeader>
                <CardTitle>{f.name}</CardTitle>
                <p className="text-sm text-muted-foreground">{f.description}</p>
                <p className="text-xs text-muted-foreground">
                  {modName(f.moduleId)} · actor: {f.actor} · starts at: {f.triggerScreen}
                </p>
              </CardHeader>
              <CardContent>
                <ol className="space-y-2">
                  {f.steps.map((s, i) => (
                    <li key={s.id} className="flex gap-3 text-sm">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#00338D] text-xs font-semibold text-white">
                        {i + 1}
                      </span>
                      <div>
                        <strong>{s.name}</strong>
                        {s.service ? (
                          <span className="ml-2 text-xs text-violet-700">{svcName(s.service)}</span>
                        ) : null}
                        <p className="text-muted-foreground">{s.description}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.readsEntities.length ? `Reads ${s.readsEntities.join(', ')}. ` : ''}
                          {s.writesEntities.length ? `Writes ${s.writesEntities.join(', ')}.` : ''}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
                <Evidence metadata={f.metadata} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ------------------------------------------------ 5 personas */}
        <TabsContent value="personas" className="space-y-4 pt-4">
          {view.personas.map((p) => (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle>
                  {p.name} <span className="font-normal text-muted-foreground">— {p.role}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Goals
                    </div>
                    <List items={p.goals} />
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Pain points
                    </div>
                    <List items={p.painPoints} />
                  </div>
                </div>
                {view.journeys
                  .filter((j) => j.personaId === p.id)
                  .map((j) => (
                    <div key={j.id} className="rounded-md border border-border p-3">
                      <div className="font-semibold">Journey: {j.name}</div>
                      <p className="mb-2 text-muted-foreground">{j.description}</p>
                      <div className="flex flex-wrap items-stretch gap-2">
                        {j.stages.map((s, i) => (
                          <div
                            key={i}
                            className="min-w-40 flex-1 rounded-md bg-muted/60 p-2 text-xs"
                          >
                            <div className="font-semibold uppercase tracking-wide text-[#00338D]">
                              {s.stage}
                            </div>
                            <div>{s.action}</div>
                            <div className="text-muted-foreground">via {s.touchpoint}</div>
                            {s.painPoint ? (
                              <div className="mt-1 text-rose-700">⚠ {s.painPoint}</div>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                <Evidence metadata={p.metadata} />
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ------------------------------------------------ 6 reports */}
        <TabsContent value="reports" className="pt-4">
          <Table
            head={['Report', 'Module', 'Status', 'Audience', 'Key fields', 'Frequency']}
            rows={view.reports.map((x) => [
              <div key="n" className="min-w-56">
                <strong>{x.name}</strong>
                <p className="text-muted-foreground">{x.purpose}</p>
                <Evidence metadata={x.metadata} />
              </div>,
              modName(x.moduleId),
              <Badge key="s" variant={x.implemented ? 'success' : 'danger'}>
                {x.implemented ? 'Exists today' : 'Required — not built'}
              </Badge>,
              x.audience.join(', '),
              <span key="f" className="text-xs">
                {x.fields.join(', ')}
              </span>,
              x.frequency,
            ])}
          />
        </TabsContent>

        {/* ------------------------------------------------ 7 backlog */}
        <TabsContent value="backlog" className="space-y-6 pt-4">
          {r.modules
            .filter((m) => inModule(m.id))
            .map((m) => (
              <section key={m.id} className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-semibold">{m.name}</h2>
                  <Badge variant={COVERAGE_VARIANT[m.coverage]}>{m.coverage}</Badge>
                  <span className="text-sm text-muted-foreground">{m.summary}</span>
                </div>
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {view.capabilities
                    .filter((c) => c.moduleId === m.id)
                    .map((c) => (
                      <div
                        key={c.id}
                        className="rounded-md border border-border bg-card p-3 text-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <strong>{c.name}</strong>
                          <Badge variant={STATUS_VARIANT[c.status]}>{c.status}</Badge>
                        </div>
                        <p className="text-muted-foreground">{c.description}</p>
                        {c.activityIds.length ? (
                          <p className="mt-1 text-xs text-muted-foreground">
                            Realised by: {c.activityIds.map(actName).join(', ')}
                          </p>
                        ) : null}
                      </div>
                    ))}
                </div>
                {view.epics
                  .filter((e) => e.moduleId === m.id)
                  .map((e) => (
                    <Card key={e.id}>
                      <CardHeader>
                        <CardTitle>Epic · {e.name}</CardTitle>
                        <p className="text-sm text-muted-foreground">{e.description}</p>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {e.features.map((f) => (
                          <div key={f.id}>
                            <div className="mb-2 text-sm font-semibold">Feature · {f.name}</div>
                            <div className="grid gap-2 lg:grid-cols-2">
                              {f.stories.map((s) => (
                                <div
                                  key={s.id}
                                  className="rounded-md border border-border p-3 text-sm"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">
                                      <code className="mr-1 text-xs text-muted-foreground">
                                        {s.id}
                                      </code>
                                      {s.title}
                                    </span>
                                    <Badge
                                      variant={s.priority === 'must' ? 'default' : 'secondary'}
                                    >
                                      {s.priority}
                                    </Badge>
                                  </div>
                                  <p className="mt-1">
                                    As a <strong>{s.asA}</strong>, I want <strong>{s.iWant}</strong>
                                    , so that <strong>{s.soThat}</strong>.
                                  </p>
                                  <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                                    {s.acceptanceCriteria.map((ac) => (
                                      <li key={ac.id}>☐ {ac.description}</li>
                                    ))}
                                  </ul>
                                  <Evidence metadata={s.metadata} />
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  ))}
              </section>
            ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
