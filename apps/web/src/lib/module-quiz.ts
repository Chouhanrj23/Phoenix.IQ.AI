export const QUIZ_LEVELS = [
  { id: 'introductory', name: 'Introductory', number: 1 },
  { id: 'intermediate', name: 'Intermediate', number: 2 },
  { id: 'indepth', name: 'In-depth', number: 3 },
] as const;

export type QuizLevelId = (typeof QUIZ_LEVELS)[number]['id'];

export interface QuizQuestion {
  prompt: string;
  options: string[];
}

export interface ModuleQuizState {
  /** Selected option index per question, keyed by level id then question index. */
  answers: Partial<Record<QuizLevelId, Record<number, number>>>;
  completed: QuizLevelId[];
}

export const EMPTY_QUIZ_STATE: ModuleQuizState = { answers: {}, completed: [] };

/**
 * Placeholder questions. Once the LLM is integrated these will be generated from
 * the documents uploaded in each module; until then every module gets the same
 * dummy set, worded with the module's name. The first option is the "correct" one.
 */
export function getQuizQuestions(moduleName: string, level: QuizLevelId): QuizQuestion[] {
  const sets: Record<QuizLevelId, QuizQuestion[]> = {
    introductory: [
      {
        prompt: `What is the main purpose of the ${moduleName} module?`,
        options: [
          'Serve the business capability it covers',
          'Only store logs',
          'Only render reports',
          'Nothing specific',
        ],
      },
      {
        prompt: `Who are the primary users of ${moduleName}?`,
        options: ['Customers and bank staff', 'Only developers', 'Only auditors', 'Vendors only'],
      },
      {
        prompt: `Which document type best describes the requirements of ${moduleName}?`,
        options: ['BRD', 'Screenshots', 'Telemetry', 'Email notifications'],
      },
      {
        prompt: `Is ${moduleName} part of the core banking system?`,
        options: ['Yes', 'No', 'Only in test', 'Only in staging'],
      },
    ],
    intermediate: [
      {
        prompt: `Which systems does ${moduleName} integrate with?`,
        options: [
          'Core ledger and payment rails',
          'Only a spreadsheet',
          'No other systems',
          'A single printer',
        ],
      },
      {
        prompt: `How is data from ${moduleName} persisted?`,
        options: [
          'Relational database tables',
          'Browser cookies only',
          'Plain text emails',
          'It is not persisted',
        ],
      },
      {
        prompt: `Which artefact best shows how ${moduleName} is structured?`,
        options: [
          'Technical document and data models',
          'A logo file',
          'A meeting invite',
          'A press release',
        ],
      },
      {
        prompt: `What triggers the main workflow in ${moduleName}?`,
        options: [
          'A customer or system request',
          'A scheduled holiday',
          'A hardware failure',
          'Nothing triggers it',
        ],
      },
    ],
    indepth: [
      {
        prompt: `Which non-functional requirement matters most for ${moduleName}?`,
        options: ['Availability and data integrity', 'Colour theme', 'Font choice', 'Logo size'],
      },
      {
        prompt: `How would a failure in ${moduleName} be traced?`,
        options: [
          'Through logs, tickets and telemetry',
          'By guessing',
          'By restarting the browser',
          'It cannot be traced',
        ],
      },
      {
        prompt: `Which regulatory concern applies to ${moduleName}?`,
        options: [
          'Audit trail and compliance controls',
          'Printer licensing',
          'Office seating',
          'None',
        ],
      },
      {
        prompt: `What would change in the knowledge graph if ${moduleName} changed?`,
        options: [
          'Linked domains, flows and capabilities',
          'Nothing',
          'Only the page title',
          'Only the footer',
        ],
      },
    ],
  };
  return sets[level];
}

const QUIZ_KEY = 'phoenix.module-quiz.v1';
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

export function isModuleQuizComplete(state: ModuleQuizState | undefined): boolean {
  return QUIZ_LEVELS.every((level) => state?.completed.includes(level.id));
}

export function levelScore(
  state: ModuleQuizState | undefined,
  moduleName: string,
  level: QuizLevelId,
): { correct: number; total: number } {
  const questions = getQuizQuestions(moduleName, level);
  const answers = state?.answers[level] ?? {};
  return {
    correct: questions.filter((_, index) => answers[index] === 0).length,
    total: questions.length,
  };
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
