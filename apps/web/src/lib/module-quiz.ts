export const QUIZ_LEVELS = [
  { id: 'introductory', name: 'Introductory', number: 1 },
  { id: 'intermediate', name: 'Intermediate', number: 2 },
  { id: 'indepth', name: 'In-depth', number: 3 },
] as const;

export type QuizLevelId = (typeof QUIZ_LEVELS)[number]['id'];

export interface ModuleQuizState {
  /** The expert's answer text per question, keyed by level id then question id. */
  answers: Partial<Record<QuizLevelId, Record<string, string>>>;
  completed: QuizLevelId[];
  /** sourceHash of the quiz the answers belong to; a regenerated quiz starts fresh. */
  version?: string;
}

export const EMPTY_QUIZ_STATE: ModuleQuizState = { answers: {}, completed: [] };

/** Saved progress if it belongs to this version of the quiz, otherwise a fresh start. */
export function quizStateFor(
  saved: ModuleQuizState | undefined,
  version: string | undefined,
): ModuleQuizState {
  if (saved && saved.version === version) return saved;
  return version === undefined ? EMPTY_QUIZ_STATE : { ...EMPTY_QUIZ_STATE, version };
}

// v2: answers are expert text, not multiple-choice indexes.
const QUIZ_KEY = 'phoenix.module-quiz.v2';
const EXPERT_KEY = 'phoenix.quiz-expert.v1';
const FINAL_KEY = 'phoenix.final-report.v1';
const WORKSPACE_KEY = 'phoenix.module-workspace.v1';

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage unavailable: progress lasts until the page reloads.
  }
}

export function loadAllQuizStates(): Record<string, ModuleQuizState> {
  return readJson<Record<string, ModuleQuizState>>(QUIZ_KEY, {});
}

export function saveQuizState(moduleId: string, state: ModuleQuizState): void {
  writeJson(QUIZ_KEY, { ...loadAllQuizStates(), [moduleId]: state });
}

/** Name or role of the expert answering, remembered so it is entered once. */
export function loadExpertName(): string {
  return readJson<string>(EXPERT_KEY, '');
}

export function saveExpertName(name: string): void {
  writeJson(EXPERT_KEY, name);
}

export function isModuleQuizComplete(state: ModuleQuizState | undefined): boolean {
  return QUIZ_LEVELS.every((level) => state?.completed.includes(level.id));
}

export function loadModuleUploads(): Record<string, Record<string, string[]>> {
  const all = readJson<Record<string, { uploads?: Record<string, string[]> }>>(WORKSPACE_KEY, {});
  return Object.fromEntries(Object.entries(all).map(([id, value]) => [id, value.uploads ?? {}]));
}

export interface FinalReportState {
  generatedAt: string;
  graphBuilt: boolean;
}

export function loadFinalReport(): FinalReportState | null {
  return readJson<FinalReportState | null>(FINAL_KEY, null);
}

export function saveFinalReport(report: FinalReportState | null): void {
  writeJson(FINAL_KEY, report);
}
