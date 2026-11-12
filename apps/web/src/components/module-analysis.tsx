import { useState, type JSX } from 'react';
import { NavLink } from 'react-router-dom';
import { ChevronDown, ChevronRight, Sparkles } from 'lucide-react';
import { getActiveCompany } from '../data/index.js';
import { getReport } from '../reverse-engineering/index.js';
import { Badge } from './ui/badge.js';

const COVERAGE = {
  full: { label: 'Fully implemented', variant: 'success' },
  partial: { label: 'Partially implemented', variant: 'warning' },
  none: { label: 'Not implemented — gap', variant: 'danger' },
} as const;
const STATUS = { implemented: 'success', partial: 'warning', gap: 'danger' } as const;

/**
 * The reverse-engineering run's findings for one module of the workspace:
 * capabilities, epics/features/stories, activities and reports. Renders
 * nothing for engagements that have no generated report.
 */
export function ModuleAnalysis({ moduleId }: { moduleId: string }): JSX.Element | null {
  const report = getReport(getActiveCompany());
  const [openEpic, setOpenEpic] = useState<string | null>(null);
  if (!report) return null;
  const mod = report.modules.find((m) => m.id === moduleId);
  if (!mod) return null;

  const capabilities = report.capabilities.filter((c) => c.moduleId === moduleId);
  const epics = report.epics.filter((e) => e.moduleId === moduleId);
  const activities = report.activities.filter((a) => a.moduleId === moduleId);
  const reports = report.reports.filter((r) => r.moduleId === moduleId);
  const flows = report.executionFlows.filter((f) => f.moduleId === moduleId);
  const stories = epics.reduce(
    (n, e) => n + e.features.reduce((k, f) => k + f.stories.length, 0),
    0,
  );

  return (
    <section className="mb-6 rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50/80 to-white p-4 shadow-sm">
      <div className="mb-3 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#00338D]" />
          <h2 className="text-base font-semibold">{mod.name}</h2>
          <Badge variant={COVERAGE[mod.coverage].variant}>{COVERAGE[mod.coverage].label}</Badge>
        </div>
        <NavLink
          to="/brd"
          className="shrink-0 rounded-md bg-[#00338D] px-3 py-2 text-xs font-medium text-white hover:bg-[#002a73]"
        >
          Open full BRD
        </NavLink>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[
          ['Capabilities', capabilities.length],
          ['Epics', epics.length],
          ['User stories', stories],
          ['Activities', activities.length],
          ['Reports', reports.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-blue-100 bg-white px-3 py-2">
            <div className="text-lg font-semibold tabular-nums text-[#00338D]">{value}</div>
            <div className="text-xs text-slate-500">{label}</div>
          </div>
        ))}
      </div>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Capabilities
      </h3>
      <div className="mb-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {capabilities.map((c) => (
          <div
            key={c.id}
            title={c.description}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
          >
            <strong className="truncate">{c.name}</strong>
            <Badge variant={STATUS[c.status]}>{c.status}</Badge>
          </div>
        ))}
      </div>

      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        Epics & user stories
      </h3>
      <div className="mb-4 space-y-2">
        {epics.map((e) => {
          const open = openEpic === e.id;
          const count = e.features.reduce((k, f) => k + f.stories.length, 0);
          return (
            <div key={e.id} className="rounded-md border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => setOpenEpic(open ? null : e.id)}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                aria-expanded={open}
              >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <strong className="flex-1">{e.name}</strong>
                <span className="text-xs text-slate-500">{count} stories</span>
              </button>
              {open ? (
                <div className="space-y-3 border-t border-slate-100 px-3 py-3 text-sm">
                  {e.features.map((f) => (
                    <div key={f.id}>
                      <div className="mb-1 font-semibold">{f.name}</div>
                      <ul className="space-y-1.5">
                        {f.stories.map((s) => (
                          <li key={s.id} className="flex items-start justify-between gap-2">
                            <span>
                              As a <strong>{s.asA}</strong>, I want <strong>{s.iWant}</strong>
                            </span>
                            <Badge variant={s.priority === 'must' ? 'default' : 'secondary'}>
                              {s.priority}
                            </Badge>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Activities
          </h3>
          <ul className="space-y-1 text-sm">
            {activities.map((a) => (
              <li key={a.id}>
                <strong>{a.name}</strong>
                {a.endpoint ? (
                  <code className="ml-1 text-xs text-violet-700">{a.endpoint}</code>
                ) : null}
              </li>
            ))}
            {!activities.length ? (
              <li className="text-slate-500">None in the system today.</li>
            ) : null}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Execution flows
          </h3>
          <ul className="space-y-1 text-sm">
            {flows.map((f) => (
              <li key={f.id}>
                <strong>{f.name}</strong>
              </li>
            ))}
            {!flows.length ? <li className="text-slate-500">None in the system today.</li> : null}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reports
          </h3>
          <ul className="space-y-1 text-sm">
            {reports.map((r) => (
              <li key={r.id}>
                <strong>{r.name}</strong>{' '}
                <Badge variant={r.implemented ? 'success' : 'danger'}>
                  {r.implemented ? 'exists' : 'required'}
                </Badge>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
