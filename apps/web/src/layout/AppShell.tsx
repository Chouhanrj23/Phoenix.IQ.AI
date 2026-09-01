import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../lib/utils.js';
import { GlobalSearch } from '../components/global-search.js';
import { getCompany, type CompanyId } from '../data/index.js';
import {
  LayoutDashboard,
  Share2,
  Waypoints,
  Map,
  Network,
  Boxes,
  Server,
  Plug,
  Gauge,
  Users,
  ListChecks,
  GitBranch,
  HelpCircle,
  History,
  ClipboardCheck,
  Bot,
  ArrowLeftRight,
} from 'lucide-react';

interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
}

const NAV_SECTIONS: Array<{ title: string | null; items: NavItem[] }> = [
  {
    title: null,
    items: [
      { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/graph', label: 'Knowledge Graph', icon: Share2 },
      { to: '/system-map', label: 'System Map', icon: Map },
      { to: '/correlation', label: 'Cross-Correlation', icon: Waypoints },
      { to: '/agents', label: 'Agent Pipeline', icon: Bot },
    ],
  },
  {
    title: 'Architecture & Design',
    items: [
      { to: '/architecture', label: 'Architecture', icon: Network },
      { to: '/domains', label: 'Domain Model', icon: Boxes },
      { to: '/deployment', label: 'Deployment', icon: Server },
      { to: '/integrations', label: 'Integrations', icon: Plug },
      { to: '/nfrs', label: 'NFRs', icon: Gauge },
    ],
  },
  {
    title: 'Product & Requirements',
    items: [
      { to: '/personas', label: 'Personas & Journeys', icon: Users },
      { to: '/backlog', label: 'Backlog', icon: ListChecks },
      { to: '/flows', label: 'Execution Flows', icon: GitBranch },
    ],
  },
  {
    title: 'Trust & Operations',
    items: [
      { to: '/gaps', label: 'Gap Analysis', icon: HelpCircle },
      { to: '/drift', label: 'Drift History', icon: History },
      { to: '/review', label: 'Review', icon: ClipboardCheck },
    ],
  },
];

export function AppShell({
  children,
  companyId,
}: {
  children: ReactNode;
  companyId?: CompanyId;
}): JSX.Element {
  const dataSource = import.meta.env.VITE_DATA_SOURCE ?? 'mock';
  const company = companyId ? getCompany(companyId) : null;

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background text-foreground">
      {/* KPMG masthead — the primary brand signal, spans the full width. */}
      <header className="flex h-14 shrink-0 items-center justify-between bg-[#00338D] px-5 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-8 shrink-0 items-center justify-center rounded bg-white px-2.5 text-xs font-extrabold tracking-tight text-[#00338D]">
            KPMG
          </span>
          <div className="hidden h-6 w-px bg-white/25 sm:block" />
          <div className="hidden sm:block">
            <div className="text-sm font-semibold leading-tight text-white">Phoenix.ai</div>
            <div className="text-[10px] text-blue-100">Reverse Engineering Platform</div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {company ? (
            <span className="hidden text-xs text-blue-100 md:inline">
              Engagement: <span className="font-semibold text-white">{company.name}</span>
            </span>
          ) : null}
          <span
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-medium',
              dataSource === 'api'
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-white/40 bg-white/15 text-white',
            )}
          >
            {dataSource === 'api' ? 'Live API mode' : 'Demo mode — fixture data'}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-3">
            <GlobalSearch />
          </div>
          <nav className="flex-1 space-y-4 p-3">
            {NAV_SECTIONS.map((section, i) => (
              <div key={section.title ?? `section-${i}`}>
                {section.title ? (
                  <div className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    {section.title}
                  </div>
                ) : null}
                <div className="space-y-1">
                  {section.items.map(({ to, label, icon: Icon, end }) => (
                    <NavLink
                      key={to}
                      to={to}
                      end={end ?? false}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-[#00338D] text-white shadow-sm'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                        )
                      }
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      {label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-slate-200 p-3">
            <NavLink
              to="/select"
              className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
              Switch company
            </NavLink>
          </div>
        </aside>
        <div className="flex flex-1 flex-col overflow-hidden">
          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-6xl px-8 py-8">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
