import { useEffect, useState, type JSX } from 'react';
import { NavLink } from 'react-router-dom';
import { CheckCircle2, Download, FileBarChart, Lock, Network } from 'lucide-react';
import { Button } from './ui/button.js';
import {
  isModuleQuizComplete,
  loadAllQuizStates,
  quizStateFor,
  loadFinalReport,
  saveFinalReport,
  type FinalReportState,
} from '../lib/module-quiz.js';
import { saveModuleKnowledgeGraphUpdate } from '../lib/module-knowledge-graph.js';
import { PROJECT_FOR_ENGAGEMENT } from '../lib/re-inputs.js';
import { getActiveCompany, getCompany } from '../data/index.js';
import { getProjectQuiz } from '../reverse-engineering/quizzes.js';

const brdSources = import.meta.glob<string>('../reverse-engineering/reports/*.brd.md', {
  query: '?raw',
  import: 'default',
});

type BrdKind = 'functional' | 'business';

/** Which numbered sections of the generated BRD go into each final BRD. */
const FINAL_BRDS: Record<BrdKind, { title: string; description: string; sections: number[] }> = {
  functional: {
    title: 'Functional BRD',
    description: 'How the system works: modules, domain model, actions, flows and capabilities.',
    sections: [3, 5, 6, 7, 10, 12],
  },
  business: {
    title: 'Business BRD',
    description:
      'Why it exists and who uses it: context, domains, personas, rules and open questions.',
    sections: [1, 2, 4, 8, 9, 11, 13, 14, 15],
  },
};

/** Splits the BRD into its numbered `## N. Title` sections, keeping the heading and body. */
function brdSections(markdown: string): { number: number; title: string; text: string }[] {
  return markdown
    .replace(/\r\n/g, '\n')
    .split(/^(?=## \d+\. )/m)
    .flatMap((part) => {
      const match = part.match(/^## (\d+)\. (.+)$/m);
      return match
        ? [{ number: Number(match[1]), title: (match[2] ?? '').trim(), text: part }]
        : [];
    });
}

interface FinalReportProps {
  modules: { id: string; name: string }[];
  /** Changes whenever any module's quiz progress changes, so the section re-reads storage. */
  refreshKey: unknown;
}

export function FinalReport({ modules, refreshKey }: FinalReportProps): JSX.Element {
  const [report, setReport] = useState<FinalReportState | null>(() => loadFinalReport());
  const [brdMarkdown, setBrdMarkdown] = useState<string>('');
  void refreshKey;
  const engagement = getActiveCompany();
  const project = PROJECT_FOR_ENGAGEMENT[engagement];
  // Only progress on the current version of each module's questions counts.
  const version = getProjectQuiz(project)?.sourceHash;
  const saved = loadAllQuizStates();
  const quizzes = Object.fromEntries(
    modules.map((module) => [module.id, quizStateFor(saved[module.id], version)]),
  );
  const completedCount = modules.filter((module) =>
    isModuleQuizComplete(quizzes[module.id]),
  ).length;
  const ready = completedCount === modules.length;

  useEffect(() => {
    const loader = Object.entries(brdSources).find(([path]) =>
      path.endsWith(`/${project}.brd.md`),
    )?.[1];
    if (!loader) {
      setBrdMarkdown('');
      return;
    }
    void loader().then(setBrdMarkdown);
  }, [project]);

  function generate(): void {
    const next = { generatedAt: new Date().toISOString(), graphBuilt: false };
    saveFinalReport(next);
    setReport(next);
  }

  function buildGraph(): void {
    if (!report) return;
    const next = { ...report, graphBuilt: true };
    saveFinalReport(next);
    saveModuleKnowledgeGraphUpdate(
      'all-modules',
      modules.map((module) => module.name),
    );
    setReport(next);
  }

  function downloadBrd(kind: BrdKind): void {
    const part = FINAL_BRDS[kind];
    const body = brdSections(brdMarkdown)
      .filter((section) => part.sections.includes(section.number))
      .map((section) => section.text.trimEnd())
      .join('\n\n');
    const projectName = getCompany(engagement).name;
    const blob = new Blob([`# ${part.title}: ${projectName}\n\n${body}\n`], {
      type: 'text/markdown',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${project}-${kind}-brd.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const available = brdSections(brdMarkdown);

  return (
    <section
      className="mt-7 rounded-lg border border-border bg-white p-5 shadow-sm"
      aria-labelledby="final-report-heading"
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 id="final-report-heading" className="text-base font-semibold text-slate-800">
            Final BRDs &amp; knowledge graph
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Finish every module quiz to generate the functional and business BRDs.
          </p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600">
          {completedCount} of {modules.length} quizzes completed
        </span>
      </div>

      <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => {
          const done = isModuleQuizComplete(quizzes[module.id]);
          return (
            <li
              key={module.id}
              className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-2 text-xs"
            >
              <span className="font-medium text-slate-700">{module.name}</span>
              {done ? (
                <span className="flex items-center gap-1 text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Quiz completed
                </span>
              ) : (
                <span className="text-slate-400">Quiz pending</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!ready}
          className="bg-[#00338D] hover:bg-[#002a73]"
          onClick={generate}
        >
          {ready ? <FileBarChart className="h-3.5 w-3.5" /> : <Lock className="h-3.5 w-3.5" />}
          {report ? 'Regenerate final BRDs' : 'Generate final BRDs'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!ready || !report}
          onClick={buildGraph}
        >
          <Network className="h-3.5 w-3.5" /> Create knowledge graph
        </Button>
        {report?.graphBuilt ? (
          <NavLink
            to="/graph"
            className="inline-flex items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
          >
            Open Knowledge Graph
          </NavLink>
        ) : null}
      </div>

      {ready && report ? (
        <div className="mt-5">
          <p className="mb-3 text-xs text-slate-500">
            Generated {new Date(report.generatedAt).toLocaleString()}
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            {(Object.keys(FINAL_BRDS) as BrdKind[]).map((kind) => {
              const part = FINAL_BRDS[kind];
              const titles = available
                .filter((section) => part.sections.includes(section.number))
                .map((section) => section.title);
              return (
                <div key={kind} className="rounded-md border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{part.title}</p>
                      <p className="mt-0.5 text-xs text-slate-500">{part.description}</p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={!titles.length}
                      onClick={() => downloadBrd(kind)}
                    >
                      <Download className="h-3.5 w-3.5" /> .md
                    </Button>
                  </div>
                  {titles.length ? (
                    <ul className="mt-3 grid gap-x-4 text-xs text-slate-600 sm:grid-cols-2">
                      {titles.map((title) => (
                        <li key={title}>· {title}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-xs text-slate-400">No BRD generated yet.</p>
                  )}
                </div>
              );
            })}
          </div>
          {report.graphBuilt ? (
            <p className="mt-3 text-xs font-medium text-emerald-700">
              Knowledge graph created from both BRDs, quizzes and context.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
