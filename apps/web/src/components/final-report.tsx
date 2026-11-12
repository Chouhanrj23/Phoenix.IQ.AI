import { useState, type JSX } from 'react';
import { NavLink } from 'react-router-dom';
import { CheckCircle2, FileBarChart, Lock, Network } from 'lucide-react';
import { Button } from './ui/button.js';
import {
  QUIZ_LEVELS,
  isModuleQuizComplete,
  levelScore,
  loadAllQuizStates,
  loadFinalReport,
  loadModuleUploads,
  saveFinalReport,
  type FinalReportState,
} from '../lib/module-quiz.js';
import { saveModuleKnowledgeGraphUpdate } from '../lib/module-knowledge-graph.js';

interface FinalReportProps {
  modules: { id: string; name: string }[];
  /** Changes whenever any module's quiz progress changes, so the section re-reads storage. */
  refreshKey: unknown;
}

export function FinalReport({ modules, refreshKey }: FinalReportProps): JSX.Element {
  const [report, setReport] = useState<FinalReportState | null>(() => loadFinalReport());
  void refreshKey;
  const quizzes = loadAllQuizStates();
  const uploads = loadModuleUploads();
  const completedCount = modules.filter((module) =>
    isModuleQuizComplete(quizzes[module.id]),
  ).length;
  const ready = completedCount === modules.length;

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

  return (
    <section
      className="mt-7 rounded-lg border border-border bg-white p-5 shadow-sm"
      aria-labelledby="final-report-heading"
    >
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
        <div>
          <h2 id="final-report-heading" className="text-base font-semibold text-slate-800">
            Final report &amp; project knowledge graph
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Complete every module quiz to combine all documents, quiz results and context into a
            final report, then build the project knowledge graph.
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
          {report ? 'Regenerate final report' : 'Generate final report'}
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
        <div className="mt-5 space-y-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-700">
          <p className="text-sm font-semibold">
            Final report · generated {new Date(report.generatedAt).toLocaleString()}
          </p>
          <p className="text-slate-500">
            Placeholder report. Once the LLM is integrated, the narrative will be written from the
            documents and quiz answers below.
          </p>
          {modules.map((module) => {
            const files = Object.values(uploads[module.id] ?? {}).flat();
            return (
              <div key={module.id} className="rounded border border-slate-200 bg-white p-3">
                <p className="font-semibold text-slate-800">{module.name}</p>
                <p className="mt-1">
                  Documents: {files.length ? files.join(', ') : 'none uploaded'}
                </p>
                <p className="mt-0.5">
                  Quiz:{' '}
                  {QUIZ_LEVELS.map((level) => {
                    const score = levelScore(quizzes[module.id], module.name, level.id);
                    return `${level.name} ${score.correct}/${score.total}`;
                  }).join(' · ')}
                </p>
              </div>
            );
          })}
          {report.graphBuilt ? (
            <p className="font-medium text-emerald-700">
              Knowledge graph created from all documents, quizzes and context.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
