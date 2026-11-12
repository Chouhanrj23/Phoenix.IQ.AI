import { useState, type ReactNode, type JSX } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
  ChevronDown,
  House,
  Layers3,
  FileText,
} from 'lucide-react';
import { currentDataSourceMode, dataModeBadge, displayedCompany } from '../lib/data-origin.js';

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
      { to: '/', label: 'Homepage', icon: House, end: true },
      { to: '/overview', label: 'Overview', icon: LayoutDashboard, end: true },
      { to: '/graph', label: 'Knowledge Graph', icon: Share2 },
      { to: '/system-map', label: 'System Map', icon: Map },
      { to: '/correlation', label: 'Cross-Correlation', icon: Waypoints },
      { to: '/agents', label: 'Agent Pipeline', icon: Bot },
    ],
  },
  {
    title: 'Workspace',
    items: [{ to: '/modules/module-1', label: 'Modules', icon: Layers3 }],
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
      { to: '/brd', label: 'Requirements (BRD)', icon: FileText },
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

/** Exact match for the home-style routes; other routes match on their first path segment, so /modules/* stays one group. */
function isNavItemActive(item: NavItem, pathname: string): boolean {
  if (item.end) return pathname === item.to;
  return pathname.split('/')[1] === item.to.split('/')[1];
}

function NavItemLink({ item }: { item: NavItem }): JSX.Element {
  const { to, label, icon: Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end ?? false}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors',
          isActive
            ? 'bg-[#00338D] text-white shadow-sm'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </NavLink>
  );
}

/**
 * A titled sidebar section as a dropdown. It opens by default when it holds the
 * current page; when closed, that page is still shown so the location stays visible.
 */
function NavGroup({ title, items }: { title: string; items: NavItem[] }): JSX.Element {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(true);
  const visible = open ? items : items.filter((item) => isNavItemActive(item, pathname));

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <span className="flex items-center gap-2">
          {title}
          <span className="rounded-full bg-slate-100 px-1.5 text-[10px] font-medium normal-case text-slate-500">
            {items.length}
          </span>
        </span>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-slate-400 transition-transform duration-200',
            open ? 'rotate-180' : '',
          )}
        />
      </button>
      {visible.length ? (
        <div className="mt-1 space-y-0.5 border-l border-slate-200 pl-2 ml-3">
          {visible.map((item) => (
            <NavItemLink key={item.to} item={item} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function AppShell({
  children,
  companyId,
}: {
  children: ReactNode;
  companyId?: CompanyId;
}): JSX.Element {
  // P8: the badge states exactly what is live, and the engagement shown is
  // the one whose data the pages actually display -- see lib/data-origin.ts.
  const mode = currentDataSourceMode();
  const badge = dataModeBadge(mode);
  const company = companyId ? getCompany(displayedCompany(companyId, mode)) : null;

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
            title={badge.title}
            className={cn(
              'rounded-full border px-2.5 py-1 text-[11px] font-medium',
              mode === 'api'
                ? 'border-white/30 bg-white/10 text-white'
                : 'border-white/40 bg-white/15 text-white',
            )}
          >
            {badge.label}
          </span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-64 shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-3">
            <GlobalSearch />
          </div>
          <nav className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
            {NAV_SECTIONS.map((section, i) =>
              section.title ? (
                <NavGroup key={section.title} title={section.title} items={section.items} />
              ) : (
                <div key={`section-${i}`} className="space-y-0.5 border-b border-slate-100 pb-2">
                  {section.items.map((item) => (
                    <NavItemLink key={item.to} item={item} />
                  ))}
                </div>
              ),
            )}
          </nav>
          <div className="border-t border-slate-200 p-2">
            <NavLink
              to="/select"
              className="flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
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
