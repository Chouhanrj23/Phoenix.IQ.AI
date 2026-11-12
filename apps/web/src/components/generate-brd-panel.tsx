import { useEffect, useRef, useState, type JSX } from 'react';
import { NavLink } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, FileText, Loader2, Play } from 'lucide-react';
import { Button } from './ui/button.js';
import {
  getRunStatus,
  setRepoUrl,
  startGeneration,
  type InputsListing,
  type RunStatus,
} from '../lib/re-inputs.js';

const KIND_LABEL: Record<string, string> = {
  brd: 'BRD',
  code: 'Source code',
  screenshots: 'Screenshots',
  logs: 'Logs',
  'technical-documents': 'Technical documents',
  tickets: 'Tickets',
  'data-models': 'Data models',
  database: 'Database',
  email: 'Email notifications',
  telemetrics: 'Telemetrics',
};

interface Props {
  project: string;
  projectName: string;
  listing: InputsListing | null;
  onListing: (listing: InputsListing) => void;
}

/**
 * The manual "upload, then generate" step: the user uploads a half-complete BRD,
 * screenshots, logs and other evidence on the module cards below, then starts
 * the pipeline here. Nothing is extracted until they press Generate.
 */
export function GenerateBrdPanel({ project, projectName, listing, onListing }: Props): JSX.Element {
  const [status, setStatus] = useState<RunStatus>({ state: 'idle' });
  const [repo, setRepo] = useState('');
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => setRepo(listing?.repoUrl ?? ''), [listing?.repoUrl]);

  const isRunning = status.state === 'running';
  useEffect(() => {
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const s = await getRunStatus(project);
        if (cancelled) return;
        setStatus(s);
        if (s.state === 'running') timer.current = window.setTimeout(() => void poll(), 2000);
      } catch {
        // Endpoints only exist on the dev server; stay idle without them.
      }
    }
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
    // Re-runs when a run starts, so polling resumes.
  }, [project, isRunning]);

  const files = listing?.files ?? [];
  const byKind = files.reduce<Record<string, number>>(
    (acc, f) => ({ ...acc, [f.kind]: (acc[f.kind] ?? 0) + 1 }),
    {},
  );
  const hasBrd = Boolean(byKind.brd);
  const running = status.state === 'running';
  const pct = status.totalSteps ? Math.round(((status.step ?? 0) / status.totalSteps) * 100) : 0;

  async function generate(): Promise<void> {
    setError('');
    try {
      if ((listing?.repoUrl ?? '') !== repo.trim())
        onListing(await setRepoUrl(project, repo.trim()));
      await startGeneration(project);
      setStatus({ state: 'running', step: 0, totalSteps: 10, stepLabel: 'Starting', log: [] });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <section className="mb-6 rounded-lg border border-[#00338D]/30 bg-white p-4 shadow-sm">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-start">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#00338D]">
            Generate BRD · {projectName}
          </p>
          <h2 className="mt-1 text-base font-semibold">Generate the enriched BRD</h2>
          <p className="mt-1 text-sm text-slate-600">Nothing starts until you press Generate.</p>
        </div>
        <div className="group relative shrink-0">
          <Button
            onClick={() => void generate()}
            disabled={running || (!files.length && !repo.trim())}
          >
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {running ? 'Generating…' : status.state === 'done' ? 'Generate again' : 'Generate BRD'}
          </Button>
          {!hasBrd ? (
            <span
              role="tooltip"
              className="pointer-events-none absolute right-0 top-full z-20 mt-2 hidden w-64 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 shadow-md group-hover:block"
            >
              No BRD uploaded yet. The run will use the other evidence alone. Upload your BRD on the
              BRD card (.md, .txt, .docx or .html) to have it checked and enriched.
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {Object.keys(KIND_LABEL)
          .filter((kind) => byKind[kind])
          .map((kind) => (
            <span
              key={kind}
              className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-xs text-[#00338D]"
            >
              {KIND_LABEL[kind]} · {byKind[kind]}
            </span>
          ))}
      </div>

      <label className="mt-3 block text-xs font-medium text-slate-600">
        Git repository link (optional)
        <input
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          placeholder="https://github.com/org/repo.git"
          disabled={running}
          className="mt-1 w-full rounded-md border border-slate-200 px-3 py-1.5 text-sm"
        />
      </label>

      {error ? <p className="mt-2 text-sm text-rose-700">{error}</p> : null}

      {status.state !== 'idle' ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="mb-2 flex items-center gap-2 text-sm">
            {running ? <Loader2 className="h-4 w-4 animate-spin text-[#00338D]" /> : null}
            {status.state === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
            {status.state === 'failed' || status.state === 'interrupted' ? (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            ) : null}
            <strong>
              {running
                ? `Step ${status.step} of ${status.totalSteps}: ${status.stepLabel}`
                : status.state === 'done'
                  ? `BRD generated ${status.finishedAt ? new Date(status.finishedAt).toLocaleString() : ''}`
                  : status.state === 'interrupted'
                    ? 'The last run was interrupted (the app was restarted). Generate again.'
                    : `Generation failed: ${status.error ?? 'unknown error'}`}
            </strong>
          </div>
          {running ? (
            <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-[#00338D] transition-all"
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
          {status.state === 'done' && status.result ? (
            <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
              {Object.entries(status.result.counts).map(([k, v]) => (
                <span key={k} className="rounded bg-white px-2 py-0.5 text-slate-600">
                  <strong>{v}</strong> {k}
                </span>
              ))}
              {status.result.traced ? (
                <span className="rounded bg-white px-2 py-0.5 text-slate-600">
                  <strong>{status.result.traced}</strong> BRD requirements traced
                </span>
              ) : null}
              <NavLink
                to="/brd"
                className="ml-auto inline-flex items-center gap-1 rounded-md bg-[#00338D] px-3 py-1.5 font-medium text-white"
              >
                <FileText className="h-3.5 w-3.5" /> Open BRD
                {status.result.pdf ? ' & download PDF' : ''}
              </NavLink>
            </div>
          ) : null}
          {status.result?.skipped.length ? (
            <ul className="mb-2 text-xs text-amber-800">
              {status.result.skipped.map((s) => (
                <li key={s.path}>
                  Not used: {s.path}: {s.reason}
                </li>
              ))}
            </ul>
          ) : null}
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded bg-white p-2 text-[11px] text-slate-600">
            {(status.log ?? []).slice(-12).join('\n')}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
