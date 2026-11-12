import { useEffect, useRef, useState, type JSX } from 'react';
import { CheckCircle2, Loader2, Lock, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from './ui/button.js';
import {
  QUIZ_LEVELS,
  isModuleQuizComplete,
  loadExpertName,
  saveExpertName,
  type ModuleQuizState,
  type QuizLevelId,
} from '../lib/module-quiz.js';
import {
  getQuizStatus,
  saveQuizAnswers,
  startQuizGeneration,
  type RunStatus,
} from '../lib/re-inputs.js';
import type { ModuleQuizData, QuestionIntent } from '../reverse-engineering/quiz-types.js';

interface ModuleQuizProps {
  project: string;
  moduleId: string;
  moduleName: string;
  /** Expert questions generated from the final BRD and knowledge graph, or null before the first run. */
  quiz: ModuleQuizData | null;
  /** Whether a final BRD exists for the project to generate questions from. */
  hasBrd: boolean;
  state: ModuleQuizState;
  onChange: (state: ModuleQuizState) => void;
  onClose: () => void;
}

const MODE_LABEL: Record<ModuleQuizData['generatedBy']['mode'], string> = {
  llm: 'written by the LLM',
  mixed: 'written by the LLM, topped up from BRD facts',
  'brd-rules': 'built from BRD facts (no LLM configured)',
};

const INTENT_LABEL: Record<QuestionIntent, { label: string; tone: string }> = {
  confirm: { label: 'Confirm', tone: 'bg-blue-50 text-blue-700' },
  explain: { label: 'Explain', tone: 'bg-slate-100 text-slate-700' },
  'edge-cases': { label: 'Edge cases', tone: 'bg-amber-50 text-amber-700' },
  'fill-gap': { label: 'Fill a gap', tone: 'bg-rose-50 text-rose-700' },
  resolve: { label: 'Resolve', tone: 'bg-violet-50 text-violet-700' },
};

export function ModuleQuiz({
  project,
  moduleId,
  moduleName,
  quiz,
  hasBrd,
  state,
  onChange,
  onClose,
}: ModuleQuizProps): JSX.Element {
  const firstOpen = QUIZ_LEVELS.find((level) => !state.completed.includes(level.id));
  const [active, setActive] = useState<QuizLevelId>(firstOpen?.id ?? 'introductory');
  const [expert, setExpert] = useState(loadExpertName);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [generation, setGeneration] = useState<RunStatus>({ state: 'idle' });
  const [generateError, setGenerateError] = useState('');
  const timer = useRef<number | undefined>(undefined);

  const generating = generation.state === 'running';

  // Follows a generation started here or automatically after a BRD run. When it
  // finishes the dev server reloads the page with the new questions.
  useEffect(() => {
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const s = await getQuizStatus(project);
        if (cancelled) return;
        setGeneration(s);
        if (s.state === 'running') timer.current = window.setTimeout(() => void poll(), 2000);
      } catch {
        // Endpoints only exist on the dev server.
      }
    }
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [project, generating]);

  async function generate(): Promise<void> {
    setGenerateError('');
    try {
      await startQuizGeneration(project);
      setGeneration({ state: 'running', stepLabel: 'Starting' });
    } catch (err) {
      setGenerateError((err as Error).message);
    }
  }

  const complete = isModuleQuizComplete(state);
  const isUnlocked = (index: number): boolean =>
    index === 0 || state.completed.includes(QUIZ_LEVELS[index - 1]!.id);
  const activeLevel = QUIZ_LEVELS.find((level) => level.id === active)!;
  const questions = quiz?.levels[active] ?? [];
  const answers = state.answers[active] ?? {};
  const levelDone = state.completed.includes(active);
  const answeredCount = questions.filter((question) => answers[question.id]?.trim()).length;

  function write(questionId: string, text: string): void {
    if (levelDone) return;
    onChange({
      ...state,
      answers: { ...state.answers, [active]: { ...answers, [questionId]: text } },
    });
  }

  async function submitLevel(): Promise<void> {
    setSaveError('');
    if (answeredCount) {
      setSaving(true);
      try {
        const { saved } = await saveQuizAnswers(project, moduleId, active, answers, expert);
        // A mismatch means the server did not accept every answer (e.g. it runs older code).
        if (saved !== answeredCount)
          throw new Error(`the server saved ${saved} of ${answeredCount} answers`);
      } catch (err) {
        setSaveError(`Answers were not saved: ${(err as Error).message}`);
        return;
      } finally {
        setSaving(false);
      }
    }
    const levels: readonly (typeof QUIZ_LEVELS)[number][] = QUIZ_LEVELS;
    const next = levels[activeLevel.number];
    onChange({ ...state, completed: [...state.completed, active] });
    if (next) setActive(next.id);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`${moduleName} expert questions`}
    >
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-5">
          <div>
            <h2 className="text-lg font-semibold">{moduleName} · expert questions</h2>
            <p className="text-xs text-slate-500">
              {quiz
                ? `Generated from the final BRD and knowledge graph — ${MODE_LABEL[quiz.generatedBy.mode]}.`
                : 'Questions are generated from the final BRD and knowledge graph.'}{' '}
              There are no right or wrong answers: answer from your experience, and your answers are
              saved as training data for the model.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {quiz && hasBrd ? (
              <button
                type="button"
                onClick={() => void generate()}
                disabled={generating}
                className="flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-blue-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-3 w-3 ${generating ? 'animate-spin' : ''}`} /> Regenerate
              </button>
            ) : null}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close expert questions"
              className="text-slate-400 hover:text-slate-700"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {generating ? (
          <div className="flex items-center gap-2 border-b border-blue-100 bg-blue-50 px-5 py-2 text-xs text-blue-800">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Generating questions from the BRD
            {generation.log?.length ? ` — ${generation.log[generation.log.length - 1]}` : '…'}
          </div>
        ) : null}
        {generateError || generation.state === 'failed' ? (
          <p
            role="alert"
            className="border-b border-rose-100 bg-rose-50 px-5 py-2 text-xs text-rose-700"
          >
            {generateError || `Question generation failed: ${generation.error ?? 'unknown error'}`}
          </p>
        ) : null}

        {!quiz ? (
          <div className="space-y-3 p-6 text-sm text-slate-600">
            {hasBrd ? (
              <>
                <p>
                  No questions yet for this project. They are written level by level from the final
                  BRD and its knowledge graph, about what the BRD leaves uncertain.
                </p>
                <Button
                  type="button"
                  size="sm"
                  disabled={generating}
                  className="bg-[#00338D] hover:bg-[#002a73]"
                  onClick={() => void generate()}
                >
                  <Sparkles className="h-3.5 w-3.5" /> Generate questions from the BRD
                </Button>
              </>
            ) : (
              <p>
                Generate the BRD first (upload the module inputs, then Generate BRD). The expert
                questions are created from it automatically.
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2 border-b border-slate-100 px-5 py-3">
              {QUIZ_LEVELS.map((level, index) => {
                const unlocked = isUnlocked(index);
                const done = state.completed.includes(level.id);
                return (
                  <button
                    key={level.id}
                    type="button"
                    disabled={!unlocked}
                    onClick={() => setActive(level.id)}
                    className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                      active === level.id
                        ? 'bg-[#00338D] text-white'
                        : unlocked
                          ? 'border border-slate-200 text-slate-600 hover:bg-blue-50'
                          : 'cursor-not-allowed border border-slate-100 text-slate-300'
                    }`}
                  >
                    {done ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : !unlocked ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : null}
                    Level {level.number} · {level.name}
                  </button>
                );
              })}
            </div>

            <div className="space-y-5 overflow-y-auto p-5">
              {complete ? (
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                  All levels done for {moduleName}. Thank you — your answers were saved as training
                  data.
                </div>
              ) : null}
              <label className="block text-xs font-medium text-slate-700">
                Answering as{' '}
                <span className="font-normal text-slate-400">(name or role, optional)</span>
                <input
                  value={expert}
                  onChange={(event) => {
                    setExpert(event.target.value);
                    saveExpertName(event.target.value);
                  }}
                  placeholder="e.g. Payments operations lead"
                  className="mt-1 w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-[#00338D] focus:ring-2 focus:ring-blue-100"
                />
              </label>
              {!questions.length ? (
                <p className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-3 text-sm text-slate-500">
                  The BRD does not hold enough about {moduleName} for{' '}
                  {activeLevel.name.toLowerCase()} questions yet, so none were generated. Add more
                  inputs for this module and regenerate the BRD.
                </p>
              ) : null}
              {questions.map((question, index) => {
                const intent = INTENT_LABEL[question.intent];
                return (
                  <div key={question.id} className="space-y-2">
                    <div className="flex items-start gap-2">
                      <span
                        className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${intent.tone}`}
                      >
                        {intent.label}
                      </span>
                      <label htmlFor={question.id} className="text-sm font-medium text-slate-800">
                        {index + 1}. {question.prompt}
                      </label>
                    </div>
                    <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600">
                      <span className="font-semibold text-slate-700">What the BRD says: </span>
                      {question.context}
                      <p className="mt-1 text-slate-400">
                        Source: {question.sources.map((source) => source.label).join(' · ')}
                      </p>
                    </div>
                    <textarea
                      id={question.id}
                      value={answers[question.id] ?? ''}
                      readOnly={levelDone}
                      onChange={(event) => write(question.id, event.target.value)}
                      placeholder={levelDone ? 'Not answered' : 'Your answer, in your own words'}
                      className="min-h-20 w-full rounded-md border border-slate-300 p-3 text-sm outline-none transition placeholder:text-slate-400 read-only:bg-slate-50 focus:border-[#00338D] focus:ring-2 focus:ring-blue-100"
                    />
                  </div>
                );
              })}
            </div>

            <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-4">
              <p className={`text-xs ${saveError ? 'text-rose-600' : 'text-slate-500'}`}>
                {saveError ||
                  (levelDone
                    ? `Level ${activeLevel.number} done · answers saved as training data`
                    : `${answeredCount} of ${questions.length} answered · skip any you can't answer`)}
              </p>
              {levelDone ? (
                <Button type="button" size="sm" onClick={onClose}>
                  Close
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  disabled={(questions.length > 0 && !answeredCount) || saving}
                  className="bg-[#00338D] hover:bg-[#002a73]"
                  onClick={() => void submitLevel()}
                >
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {!questions.length
                    ? 'Continue'
                    : activeLevel.number < QUIZ_LEVELS.length
                      ? 'Save answers & next level'
                      : 'Save answers & finish'}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
