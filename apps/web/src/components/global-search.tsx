import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, X } from 'lucide-react';
import { dataProvider } from '../data/index.js';
import { buildSearchIndex, type SearchEntry } from '../lib/search-index.js';
import { cn } from '../lib/utils.js';

const MAX_RESULTS = 8;

export function GlobalSearch(): JSX.Element {
  const navigate = useNavigate();
  const [index, setIndex] = useState<SearchEntry[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    buildSearchIndex(dataProvider)
      .then((entries) => {
        if (!cancelled) setIndex(entries);
      })
      .catch(() => {
        // Search is non-critical chrome, not a Phase 1 data page — if the
        // backend is unreachable or slow, degrade to "no results" instead
        // of an unhandled rejection. `index` already starts at [], so this
        // is a no-op beyond preventing the console/page error.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return index.filter((entry) => entry.label.toLowerCase().includes(q)).slice(0, MAX_RESULTS);
  }, [index, query]);

  function goTo(entry: SearchEntry): void {
    navigate(entry.route);
    setQuery('');
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5">
        <Search className="h-3.5 w-3.5 shrink-0 text-slate-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && results[0]) goTo(results[0]);
          }}
          placeholder="Search…"
          className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
        />
        {query ? (
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setOpen(false);
            }}
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5 text-slate-400" />
          </button>
        ) : null}
      </div>

      {open && query.trim() ? (
        <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400">No matches for "{query}".</div>
          ) : (
            results.map((entry) => (
              <button
                key={`${entry.kind}-${entry.id}`}
                type="button"
                onClick={() => goTo(entry)}
                className={cn(
                  'flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50',
                )}
              >
                <span>{entry.label}</span>
                <span className="text-xs text-slate-400">{entry.kind}</span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
