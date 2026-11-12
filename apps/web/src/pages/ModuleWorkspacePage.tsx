import { useEffect, useRef, useState, type ChangeEvent, type JSX } from 'react';
import { NavLink, useParams } from 'react-router-dom';
import {
  Bell,
  Braces,
  CheckCircle2,
  Database,
  FileCode2,
  FileText,
  GraduationCap,
  Mail,
  Network,
  Send,
  Sparkles,
  Ticket,
  Upload,
  X,
} from 'lucide-react';
import {
  buildPrompt,
  getSuggestions,
  rankSuggestions,
  type PromptSuggestion,
} from '../lib/prompt-suggestions.js';
import { Button } from '../components/ui/button.js';
import { ModuleQuiz } from '../components/module-quiz.js';
import { FinalReport } from '../components/final-report.js';
import { GenerateBrdPanel } from '../components/generate-brd-panel.js';
import { getActiveCompany, getCompany } from '../data/index.js';
import {
  PROJECT_FOR_ENGAGEMENT,
  deleteInput,
  listInputs,
  uploadInput,
  type InputsListing,
} from '../lib/re-inputs.js';
import {
  QUIZ_LEVELS,
  isModuleQuizComplete,
  loadAllQuizStates,
  quizStateFor,
  saveQuizState,
  type ModuleQuizState,
} from '../lib/module-quiz.js';
import { hasReport } from '../reverse-engineering/index.js';
import { getModuleQuiz, getProjectQuiz } from '../reverse-engineering/quizzes.js';
import {
  KNOWLEDGE_GRAPH_DESTINATIONS,
  saveModuleKnowledgeGraphUpdate,
} from '../lib/module-knowledge-graph.js';

type ArtifactKind = {
  id: string;
  label: string;
  analysisLabel?: string;
  hideAnalysis?: boolean;
  description: string;
  icon: typeof FileText;
  accent: string;
  iconColour: string;
  allowedExtensions: string[];
};

const ARTIFACTS: ArtifactKind[] = [
  {
    id: 'brd',
    label: 'BRD',
    hideAnalysis: true,
    description: 'Business requirements',
    icon: FileText,
    accent: 'border-l-blue-500',
    iconColour: 'text-blue-600 bg-blue-50',
    allowedExtensions: ['.md', '.txt', '.docx', '.html'],
  },
  {
    id: 'code',
    label: 'Source Code',
    description: 'Source code and repositories',
    icon: Braces,
    accent: 'border-l-violet-500',
    iconColour: 'text-violet-600 bg-violet-50',
    allowedExtensions: [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
      '.py',
      '.java',
      '.cs',
      '.go',
      '.kt',
      '.sql',
      '.yaml',
      '.yml',
      '.json',
      '.xml',
      '.properties',
    ],
  },
  {
    id: 'screenshots',
    label: 'Screenshots',
    analysisLabel: 'Functional Specs',
    description: 'Screenshots and UI captures',
    icon: FileCode2,
    accent: 'border-l-amber-500',
    iconColour: 'text-amber-600 bg-amber-50',
    allowedExtensions: ['.png', '.jpg', '.jpeg'],
  },
  {
    id: 'logs',
    label: 'Logs',
    description: 'Application and system logs',
    icon: FileText,
    accent: 'border-l-slate-500',
    iconColour: 'text-slate-600 bg-slate-100',
    allowedExtensions: ['.log', '.txt', '.json', '.csv'],
  },
  {
    id: 'technical-documents',
    label: 'Technical Document',
    description: 'Architecture and technical specs',
    icon: FileText,
    accent: 'border-l-cyan-500',
    iconColour: 'text-cyan-600 bg-cyan-50',
    allowedExtensions: ['.md', '.txt', '.docx', '.html'],
  },
  {
    id: 'tickets',
    label: 'Ticket',
    description: 'Work items and issue history',
    icon: Ticket,
    accent: 'border-l-rose-500',
    iconColour: 'text-rose-600 bg-rose-50',
    allowedExtensions: ['.csv', '.json', '.txt', '.md'],
  },
  {
    id: 'data-models',
    label: 'Data Models',
    description: 'Schemas and entity definitions',
    icon: Network,
    accent: 'border-l-indigo-500',
    iconColour: 'text-indigo-600 bg-indigo-50',
    allowedExtensions: ['.json', '.xml', '.yaml', '.yml', '.sql'],
  },
  {
    id: 'database',
    label: 'Database',
    description: 'Database exports and queries',
    icon: Database,
    accent: 'border-l-emerald-500',
    iconColour: 'text-emerald-600 bg-emerald-50',
    allowedExtensions: ['.sql', '.csv', '.json'],
  },
  {
    id: 'email',
    label: 'Email Notifications',
    description: 'Notifications and message templates',
    icon: Mail,
    accent: 'border-l-orange-500',
    iconColour: 'text-orange-600 bg-orange-50',
    allowedExtensions: ['.eml', '.html', '.txt'],
  },
  {
    id: 'telemetrics',
    label: 'Telemetrics',
    description: 'Metrics, traces and telemetry',
    icon: Bell,
    accent: 'border-l-fuchsia-500',
    iconColour: 'text-fuchsia-600 bg-fuchsia-50',
    allowedExtensions: ['.json', '.csv', '.log', '.txt'],
  },
];

const MODULES = [
  { id: 'module-1', name: 'Overview' },
  { id: 'module-2', name: 'Accounts' },
  { id: 'module-3', name: 'Payments and Transfer' },
  { id: 'module-4', name: 'Deposits' },
  { id: 'module-5', name: 'Cards' },
  { id: 'module-6', name: 'Loans' },
];

interface ModuleWorkspaceState {
  uploads: Record<string, string[]>;
  prompts: Record<string, string>;
  outputs: Record<string, string>;
}

const WORKSPACE_KEY = 'phoenix.module-workspace.v1';
const EMPTY_WORKSPACE: ModuleWorkspaceState = { uploads: {}, prompts: {}, outputs: {} };

function loadAllWorkspaces(): Record<string, ModuleWorkspaceState> {
  try {
    const raw = window.localStorage.getItem(WORKSPACE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ModuleWorkspaceState>) : {};
  } catch {
    return {};
  }
}

/** Each module's uploads, prompts and outputs, kept under its own id in this browser. */
function loadModuleState(moduleId: string): ModuleWorkspaceState {
  const saved = loadAllWorkspaces()[moduleId];
  return saved
    ? { uploads: saved.uploads ?? {}, prompts: saved.prompts ?? {}, outputs: saved.outputs ?? {} }
    : EMPTY_WORKSPACE;
}

function saveModuleState(moduleId: string, state: ModuleWorkspaceState): void {
  try {
    window.localStorage.setItem(
      WORKSPACE_KEY,
      JSON.stringify({ ...loadAllWorkspaces(), [moduleId]: state }),
    );
  } catch {
    // Storage unavailable: this module's work lasts until the page reloads.
  }
}

function useAnimatedNumber(target: number): number {
  const [value, setValue] = useState(0);
  const current = useRef(0);
  useEffect(() => {
    const from = current.current;
    const start = performance.now();
    const duration = 800;
    let frame = 0;
    const tick = (now: number): void => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      current.current = Math.round(from + (target - from) * eased);
      setValue(current.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target]);
  return value;
}

/** Each module renders its own workspace. Keying on the id gives every module separate state. */
export function ModuleWorkspacePage(): JSX.Element {
  const { moduleId = 'module-1' } = useParams();
  return <ModuleWorkspace key={moduleId} moduleId={moduleId} />;
}

function ModuleWorkspace({ moduleId }: { moduleId: string }): JSX.Element {
  const [initial] = useState(() => loadModuleState(moduleId));
  const [uploads, setUploads] = useState<Record<string, string[]>>(initial.uploads);
  const [prompts, setPrompts] = useState<Record<string, string>>(initial.prompts);
  const [outputs, setOutputs] = useState<Record<string, string>>(initial.outputs);
  const engagement = getActiveCompany();
  const project = PROJECT_FOR_ENGAGEMENT[engagement];
  // Questions come from the project's final BRD; progress saved against an older
  // version of them is dropped so answers always match the questions shown.
  const projectQuiz = getProjectQuiz(project);
  const moduleQuiz = getModuleQuiz(project, moduleId);
  const [quiz, setQuiz] = useState<ModuleQuizState>(() =>
    quizStateFor(loadAllQuizStates()[moduleId], projectQuiz?.sourceHash),
  );
  const [quizOpen, setQuizOpen] = useState(false);
  const [listing, setListing] = useState<InputsListing | null>(null);
  const [uploadErrors, setUploadErrors] = useState<Record<string, string>>({});
  const [analysing, setAnalysing] = useState<Record<string, boolean>>({});
  const inputs = useRef<Record<string, HTMLInputElement | null>>({});
  const typers = useRef<Record<string, number>>({});
  const analysisTimers = useRef<Record<string, number>>({});

  useEffect(
    () => () => {
      Object.values(typers.current).forEach(window.clearInterval);
      Object.values(analysisTimers.current).forEach(window.clearTimeout);
    },
    [],
  );

  useEffect(() => {
    saveModuleState(moduleId, { uploads, prompts, outputs });
  }, [moduleId, uploads, prompts, outputs]);

  function updateQuiz(next: ModuleQuizState): void {
    setQuiz(next);
    saveQuizState(moduleId, next);
  }

  function stopTyping(id: string): void {
    window.clearInterval(typers.current[id]);
  }

  // Simulates the model streaming a suggested prompt into the textarea.
  function typeIntoPrompt(artifact: ArtifactKind, suggestion: PromptSuggestion): void {
    const id = artifact.id;
    stopTyping(id);
    const text = buildPrompt(suggestion, uploads[id] ?? []);
    const existing = prompts[id] ?? '';
    const base = existing.trim() ? `${existing.trimEnd()}\n\n` : '';
    let position = 0;
    typers.current[id] = window.setInterval(() => {
      position = Math.min(position + 3, text.length);
      setPrompts((previous) => ({ ...previous, [id]: base + text.slice(0, position) }));
      if (position >= text.length) stopTyping(id);
    }, 16);
  }

  const moduleName = MODULES.find((module) => module.id === moduleId)?.name ?? moduleId;
  const uploadCount = Object.values(uploads).flat().length;
  const sourceAvailable = Math.round(
    (ARTIFACTS.filter((artifact) => (uploads[artifact.id] ?? []).length > 0).length /
      ARTIFACTS.length) *
      100,
  );
  const animatedSourceAvailable = useAnimatedNumber(sourceAvailable);

  // Uploaded files are saved on the dev server under inputs/<project>/<card>/<module>/,
  // where the "Generate BRD" run reads them. The server's listing is the source of truth.
  function applyListing(next: InputsListing): void {
    setListing(next);
    const forModule: Record<string, string[]> = {};
    for (const f of next.files) if (f.module === moduleId) (forModule[f.kind] ??= []).push(f.name);
    setUploads(forModule);
  }

  useEffect(() => {
    listInputs(project)
      .then(applyListing)
      .catch(() => {
        // Without the dev server's endpoints the cards keep their local file list.
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, moduleId]);

  async function addFiles(
    artifact: ArtifactKind,
    event: ChangeEvent<HTMLInputElement>,
  ): Promise<void> {
    const selectedFiles = Array.from(event.target.files ?? []);
    event.target.value = '';
    const validFiles = selectedFiles.filter((file) =>
      artifact.allowedExtensions.some((extension) => file.name.toLowerCase().endsWith(extension)),
    );
    const rejectedFiles = selectedFiles.filter((file) => !validFiles.includes(file));
    const problems = rejectedFiles.length
      ? [
          `${rejectedFiles.map((file) => file.name).join(', ')} rejected. Allowed: ${artifact.allowedExtensions.join(', ')}.`,
        ]
      : [];

    if (validFiles.length) {
      setAnalysing((previous) => ({ ...previous, [artifact.id]: true }));
      for (const file of validFiles) {
        try {
          applyListing(await uploadInput(project, artifact.id, moduleId, file));
        } catch (err) {
          problems.push(`${file.name} was not saved: ${(err as Error).message}`);
        }
      }
      setAnalysing((previous) => ({ ...previous, [artifact.id]: false }));
    }
    setUploadErrors((previous) => ({ ...previous, [artifact.id]: problems.join(' ') }));
  }

  async function removeFile(kind: string, fileName: string): Promise<void> {
    try {
      applyListing(await deleteInput(project, kind, moduleId, fileName));
    } catch (err) {
      setUploadErrors((previous) => ({
        ...previous,
        [kind]: `${fileName} was not removed: ${(err as Error).message}`,
      }));
    }
  }

  function generateOutput(artifact: ArtifactKind): void {
    const files = uploads[artifact.id] ?? [];
    const artifactLabels = [...new Set([...Object.keys(outputs), artifact.id])]
      .map((id) => ARTIFACTS.find((item) => item.id === id)?.label)
      .filter((label): label is string => Boolean(label));
    setOutputs((previous) => ({
      ...previous,
      [artifact.id]: files.length
        ? `${files.length} ${artifact.label} file${files.length === 1 ? '' : 's'} staged for the LLM.`
        : `Upload ${artifact.label} files first.`,
    }));
    saveModuleKnowledgeGraphUpdate(moduleId, artifactLabels);
  }

  return (
    <div className="-mb-4 flex flex-col">
      <div className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{moduleName}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-md border border-blue-100 bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <span className="font-semibold">{uploadCount}</span> file{uploadCount === 1 ? '' : 's'}{' '}
            staged for analysis
          </div>
          {isModuleQuizComplete(quiz) ? (
            <span className="flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3.5 w-3.5" /> Quiz completed
            </span>
          ) : null}
          <NavLink
            to="/brd"
            className="inline-flex h-8 items-center rounded-md bg-[#00338D] px-3 text-xs font-medium text-white hover:bg-[#002a73]"
          >
            Open full BRD
          </NavLink>
          <Button
            type="button"
            size="sm"
            className="bg-[#00338D] hover:bg-[#002a73]"
            onClick={() => setQuizOpen(true)}
          >
            <GraduationCap className="h-3.5 w-3.5" />
            {isModuleQuizComplete(quiz)
              ? 'Review quiz'
              : quiz.completed.length
                ? `Continue quiz (${quiz.completed.length}/${QUIZ_LEVELS.length})`
                : 'Quiz'}
          </Button>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap gap-2 border-b border-border pb-4">
        {MODULES.map((module) => (
          <NavLink
            key={module.id}
            to={`/modules/${module.id}`}
            className={({ isActive }) =>
              `rounded-md px-4 py-2 text-sm font-medium transition-colors ${isActive ? 'bg-[#00338D] text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-[#00338D]'}`
            }
          >
            {module.name}
          </NavLink>
        ))}
      </div>

      <GenerateBrdPanel
        project={project}
        projectName={getCompany(engagement).name}
        listing={listing}
        onListing={applyListing}
      />

      <section
        aria-labelledby="source-available-heading"
        className="mb-6 rounded-lg border border-border bg-white p-4 shadow-sm"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <h2 id="source-available-heading" className="text-sm font-semibold">
            Source Available Percentage
          </h2>
          <span className="text-2xl font-semibold tabular-nums text-[#00338D]">
            {animatedSourceAvailable}%
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={sourceAvailable}
          className="h-2.5 w-full overflow-hidden rounded-full bg-slate-100"
        >
          <div
            className="relative h-full overflow-hidden rounded-full bg-[#00338D] transition-[width] duration-700 ease-out"
            style={{ width: `${sourceAvailable}%` }}
          >
            {sourceAvailable > 0 ? (
              <span className="absolute inset-0 animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
            ) : null}
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          {ARTIFACTS.filter((artifact) => (uploads[artifact.id] ?? []).length > 0).length} of{' '}
          {ARTIFACTS.length} sources uploaded.
        </p>
      </section>

      <section aria-labelledby="evidence-heading">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 id="evidence-heading" className="text-base font-semibold">
              Evidence intake
            </h2>
          </div>
        </div>
        <div className="grid items-stretch gap-4 xl:grid-cols-2">
          {ARTIFACTS.map((artifact) => {
            const Icon = artifact.icon;
            const files = uploads[artifact.id] ?? [];
            return (
              <div
                key={artifact.id}
                className={`rounded-lg border border-border border-l-4 bg-white p-4 shadow-sm ${artifact.accent}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`flex h-8 w-8 items-center justify-center rounded-md ${artifact.iconColour}`}
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold">{artifact.label}</h3>
                      <p className="text-[11px] text-muted-foreground">{artifact.description}</p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    title={`Allowed: ${artifact.allowedExtensions.join(', ')}`}
                    onClick={() => inputs.current[artifact.id]?.click()}
                  >
                    <Upload className="h-3.5 w-3.5" /> Upload
                  </Button>
                </div>
                <input
                  ref={(node) => {
                    inputs.current[artifact.id] = node;
                  }}
                  className="hidden"
                  type="file"
                  multiple
                  accept={artifact.allowedExtensions.join(',')}
                  onChange={(event) => void addFiles(artifact, event)}
                />
                {files.length ? (
                  <div className="mt-3 space-y-1">
                    {files.map((file, index) => (
                      <div
                        key={`${file}-${index}`}
                        className="flex items-center justify-between gap-2 rounded bg-slate-50 px-2 py-1 text-xs text-slate-600"
                      >
                        <span className="truncate">{file}</span>
                        <button
                          type="button"
                          className="text-slate-400 hover:text-rose-600"
                          aria-label={`Remove ${file}`}
                          onClick={() => void removeFile(artifact.id, file)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-4 text-xs text-slate-400">No files uploaded</p>
                )}
                {uploadErrors[artifact.id] ? (
                  <p role="alert" className="mt-2 text-xs text-rose-600">
                    {uploadErrors[artifact.id]}
                  </p>
                ) : null}
                {artifact.hideAnalysis ? null : (
                  <details className="mt-4 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-[#00338D] marker:text-[#00338D]">
                      {artifact.analysisLabel
                        ? `${artifact.analysisLabel} analysis`
                        : 'Configure LLM analysis'}
                    </summary>
                    <div className="pt-3">
                      <label htmlFor={`${artifact.id}-prompt`} className="sr-only">
                        {artifact.analysisLabel ?? artifact.label} analysis prompt
                      </label>
                      <textarea
                        id={`${artifact.id}-prompt`}
                        value={prompts[artifact.id] ?? ''}
                        onChange={(event) => {
                          stopTyping(artifact.id);
                          setPrompts((previous) => ({
                            ...previous,
                            [artifact.id]: event.target.value,
                          }));
                        }}
                        placeholder={`What should the model reverse engineer from these ${artifact.label} files?`}
                        className="min-h-28 w-full rounded-md border border-slate-300 p-3 text-xs outline-none transition placeholder:text-slate-400 focus:border-[#00338D] focus:ring-2 focus:ring-blue-100"
                      />
                      <div className="mt-2" aria-live="polite">
                        <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-[#00338D]">
                          <Sparkles
                            className={`h-3.5 w-3.5 ${analysing[artifact.id] ? 'animate-pulse' : ''}`}
                          />
                          {analysing[artifact.id]
                            ? 'Analysing uploads…'
                            : (uploads[artifact.id] ?? []).length
                              ? 'Suggested prompts'
                              : 'Upload files for tailored prompts'}
                        </div>
                        {analysing[artifact.id] ? (
                          <div className="flex flex-wrap gap-1.5">
                            {[28, 36, 24].map((width) => (
                              <span
                                key={width}
                                style={{ width: `${width * 4}px` }}
                                className="h-6 animate-pulse rounded-full bg-blue-100"
                              />
                            ))}
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-1.5">
                            {rankSuggestions(
                              getSuggestions(artifact.id),
                              prompts[artifact.id] ?? '',
                              uploads[artifact.id] ?? [],
                            ).map((suggestion) => (
                              <button
                                key={suggestion.id}
                                type="button"
                                title={buildPrompt(suggestion, uploads[artifact.id] ?? [])}
                                onClick={() => typeIntoPrompt(artifact, suggestion)}
                                className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-medium text-[#00338D] transition hover:bg-[#00338D] hover:text-white"
                              >
                                + {suggestion.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        className="mt-3 w-full bg-[#00338D] hover:bg-[#002a73]"
                        onClick={() => generateOutput(artifact)}
                      >
                        <Send className="h-3.5 w-3.5" /> Generate{' '}
                        {artifact.analysisLabel ?? artifact.label} analysis
                      </Button>
                      <div className="mt-3 rounded-md border border-dashed border-slate-300 bg-slate-50 p-3">
                        <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> {artifact.label}{' '}
                          response
                        </div>
                        <p className="text-xs leading-5 text-slate-500">
                          {outputs[artifact.id] ?? 'No output yet.'}
                        </p>
                      </div>
                    </div>
                  </details>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section
        className="mt-7 rounded-lg border border-blue-100 bg-blue-50/60 p-5"
        aria-labelledby="knowledge-graph-heading"
      >
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
          <div>
            <h2 id="knowledge-graph-heading" className="text-base font-semibold text-slate-800">
              Combined output → Knowledge Graph
            </h2>
          </div>
          <NavLink
            to="/graph"
            className="shrink-0 rounded-md bg-[#00338D] px-3 py-2 text-xs font-medium text-white hover:bg-[#002a73]"
          >
            Open Knowledge Graph
          </NavLink>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {KNOWLEDGE_GRAPH_DESTINATIONS.map((destination) => (
            <div
              key={destination}
              className="rounded-md border border-blue-100 bg-white px-3 py-2 text-xs font-medium text-slate-700"
            >
              {destination}
            </div>
          ))}
        </div>
      </section>

      <FinalReport modules={MODULES} refreshKey={quiz} />

      {quizOpen ? (
        <ModuleQuiz
          project={project}
          moduleId={moduleId}
          moduleName={moduleName}
          quiz={moduleQuiz}
          hasBrd={hasReport(engagement)}
          state={quiz}
          onChange={updateQuiz}
          onClose={() => setQuizOpen(false)}
        />
      ) : null}
    </div>
  );
}
