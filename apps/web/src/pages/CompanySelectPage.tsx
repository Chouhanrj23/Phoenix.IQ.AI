import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Banknote,
  Boxes,
  CheckCircle2,
  Layers,
  Plug,
  ShoppingCart,
} from 'lucide-react';
import { COMPANIES, type CompanyId, type CompanyOption } from '../data/index.js';
import { cn } from '../lib/utils.js';

import type { JSX } from 'react';
import { companySelection, currentDataSourceMode } from '../lib/data-origin.js';

const ICONS: Record<CompanyId, typeof ShoppingCart> = {
  aurora: ShoppingCart,
  fintech: Banknote,
};

const ACCENT_CLASSES: Record<
  CompanyOption['accent'],
  { topBar: string; iconWrap: string; badge: string; button: string }
> = {
  blue: {
    topBar: 'bg-[#00338D]',
    iconWrap: 'bg-[#00338D] text-white',
    badge: 'border-blue-200 bg-blue-50 text-[#00338D]',
    button: 'bg-[#00338D] hover:bg-[#00338D]/90',
  },
  cobalt: {
    topBar: 'bg-[#0091DA]',
    iconWrap: 'bg-[#0091DA] text-white',
    badge: 'border-sky-200 bg-sky-50 text-[#0091DA]',
    button: 'bg-[#0091DA] hover:bg-[#0091DA]/90',
  },
};

interface CompanySelectPageProps {
  selectedCompany: CompanyId | null;
  onSelect: (companyId: CompanyId) => void;
}

export function CompanySelectPage({
  selectedCompany,
  onSelect,
}: CompanySelectPageProps): JSX.Element {
  const navigate = useNavigate();
  const selection = companySelection(currentDataSourceMode());

  function handlePick(id: CompanyId): void {
    onSelect(id);
    navigate('/');
  }

  return (
    <div className="flex min-h-screen w-full flex-col bg-white text-foreground">
      {/* KPMG masthead — matches the in-app shell so branding is consistent
          before and after a company is selected. */}
      <header className="flex h-14 shrink-0 items-center justify-between bg-[#00338D] px-6 text-white sm:px-10">
        <div className="flex items-center gap-3">
          <span className="flex h-8 items-center justify-center rounded bg-white px-2.5 text-xs font-extrabold tracking-tight text-[#00338D]">
            KPMG
          </span>
          <div className="hidden h-6 w-px bg-white/25 sm:block" />
          <div className="hidden sm:block">
            <div className="text-sm font-semibold leading-tight text-white">Phoenix.ai</div>
            <div className="text-[10px] text-blue-100">Reverse Engineering Platform</div>
          </div>
        </div>
        <span className="rounded-full border border-white/40 bg-white/15 px-2.5 py-1 text-[11px] font-medium">
          Demo Environment
        </span>
      </header>

      {/* Hero band */}
      <div className="border-b border-slate-100 bg-gradient-to-b from-blue-50/70 to-white px-6 py-14 sm:px-10">
        <div className="mx-auto max-w-2xl text-center">
          <div className="mx-auto mb-4 h-0.5 w-10 rounded-full bg-[#00338D]" />
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[#00338D]">
            Select an engagement
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Which company do you want to reverse engineer?
          </h1>
          <p className="mx-auto mt-3 max-w-lg text-sm leading-relaxed text-slate-500">
            Phoenix.ai reconstructs architecture, domain models, execution flows, and product
            backlog directly from a codebase — with confidence scoring and provenance on every
            element. Select a sample engagement below to explore the output.
          </p>
        </div>
      </div>

      <main className="flex flex-1 flex-col items-center px-6 py-14 sm:px-10">
        <div className="grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
          {COMPANIES.map((company) => {
            const Icon = ICONS[company.id];
            const accent = ACCENT_CLASSES[company.accent];
            const isSelected = company.id === selectedCompany;
            // P8: in API mode only the system the API serves can be chosen --
            // any other would relabel the app over that system's data.
            const availability = selection.find((entry) => entry.id === company.id);
            const selectable = availability?.selectable ?? true;
            return (
              <button
                key={company.id}
                type="button"
                disabled={!selectable}
                title={availability?.note}
                onClick={() => handlePick(company.id)}
                className={cn(
                  'group relative flex h-full flex-col items-start overflow-hidden rounded-lg border border-slate-200 bg-white pt-8 text-left shadow-sm transition-all duration-200',
                  selectable
                    ? 'hover:-translate-y-0.5 hover:shadow-lg'
                    : 'cursor-not-allowed opacity-60',
                )}
              >
                <span className={cn('absolute inset-x-0 top-0 h-1.5', accent.topBar)} />

                <div className="w-full px-7">
                  <div className="mb-5 flex w-full items-start justify-between">
                    <span
                      className={cn(
                        'flex h-12 w-12 items-center justify-center rounded-md shadow-sm',
                        accent.iconWrap,
                      )}
                    >
                      <Icon className="h-6 w-6" />
                    </span>
                    {isSelected ? (
                      <span className="flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-[#00338D]">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Currently selected
                      </span>
                    ) : null}
                  </div>

                  <h2 className="mb-1.5 text-xl font-semibold tracking-tight text-slate-900">
                    {company.name}
                  </h2>
                  <span
                    className={cn(
                      'mb-3 inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                      accent.badge,
                    )}
                  >
                    {company.industry}
                  </span>
                  <p className="mb-3 text-sm font-medium text-slate-700">{company.tagline}</p>
                  <p className="mb-6 text-sm leading-relaxed text-slate-500">
                    {company.description}
                  </p>

                  <div className="flex w-full items-center gap-4 border-t border-slate-100 pt-4 text-xs font-medium text-slate-400">
                    <span className="flex items-center gap-1.5">
                      <Layers className="h-3.5 w-3.5" /> {company.stats.elements} elements
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Boxes className="h-3.5 w-3.5" /> {company.stats.domains} domains
                    </span>
                    <span className="flex items-center gap-1.5">
                      <Plug className="h-3.5 w-3.5" /> {company.stats.integrations} integrations
                    </span>
                  </div>
                </div>

                <span
                  className={cn(
                    'mt-6 flex w-full items-center justify-center gap-1.5 px-4 py-3 text-sm font-semibold text-white transition-colors',
                    accent.button,
                  )}
                >
                  {!selectable
                    ? (availability?.note ?? 'Not available')
                    : isSelected
                      ? 'Continue with this engagement'
                      : `Reverse engineer ${company.shortName}`}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-10 text-xs text-slate-400">
          You can switch engagements anytime from the sidebar.
        </p>
      </main>
    </div>
  );
}
