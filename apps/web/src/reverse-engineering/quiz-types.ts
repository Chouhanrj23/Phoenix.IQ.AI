// Expert questionnaires generated from a finished reverse-engineering run by
// scripts/reverse-engineer/quiz.ts (one JSON per project under ./quizzes).
// Every question is grounded in the final BRD dataset and its knowledge graph.
// There are no right or wrong answers: domain experts answer in their own words
// and each answer is saved as training data for the model.

export const QUIZ_LEVEL_IDS = ['introductory', 'intermediate', 'indepth'] as const;

export type QuizLevelId = (typeof QUIZ_LEVEL_IDS)[number];

export interface QuizSource {
  /** Id of the BRD element or knowledge-graph node the question is about. */
  id: string;
  label: string;
}

/** What the question asks the expert to do. */
export type QuestionIntent = 'confirm' | 'explain' | 'edge-cases' | 'fill-gap' | 'resolve';

export interface GeneratedQuestion {
  /** Stable id: <moduleId>-<level>-<n>. */
  id: string;
  prompt: string;
  /** What the BRD currently says about this, shown to the expert before they answer. */
  context: string;
  intent: QuestionIntent;
  sources: QuizSource[];
  /** 'llm' when the model wrote it, 'brd-rules' when built directly from BRD facts. */
  origin: 'llm' | 'brd-rules';
}

export interface ModuleQuizData {
  moduleId: string;
  moduleName: string;
  generatedBy: { mode: 'llm' | 'brd-rules' | 'mixed'; provider: string; model: string };
  levels: Record<QuizLevelId, GeneratedQuestion[]>;
}

export interface ProjectQuiz {
  project: string;
  /** Hash of the BRD dataset and knowledge graph the questions were generated from. */
  sourceHash: string;
  generatedAt: string;
  modules: ModuleQuizData[];
}
