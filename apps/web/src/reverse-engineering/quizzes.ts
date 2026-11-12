// Registry of module quizzes produced by scripts/reverse-engineer/quiz.ts
// (one JSON per project under ./quizzes, written after each BRD run).
import type { ModuleQuizData, ProjectQuiz } from './quiz-types.js';

const files = import.meta.glob<{ default: ProjectQuiz }>('./quizzes/*.json', { eager: true });

const QUIZZES: Record<string, ProjectQuiz> = Object.fromEntries(
  Object.values(files).map((mod) => [mod.default.project, mod.default]),
);

export function getProjectQuiz(project: string): ProjectQuiz | null {
  return QUIZZES[project] ?? null;
}

export function getModuleQuiz(project: string, moduleId: string): ModuleQuizData | null {
  return getProjectQuiz(project)?.modules.find((m) => m.moduleId === moduleId) ?? null;
}
