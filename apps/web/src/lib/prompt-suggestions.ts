export type PromptSuggestion = {
  id: string;
  label: string;
  keywords: string[];
  /** Prompt text; `{files}` is replaced with the uploaded file names. */
  prompt: string;
};

const SCREENSHOT_SUGGESTIONS: PromptSuggestion[] = [
  {
    id: 'functional-specs',
    label: 'Functional specs',
    keywords: ['functional', 'spec', 'requirement', 'feature', 'behaviour', 'behavior'],
    prompt:
      'Inspect {files} and write functional specifications: list every screen, its fields, buttons, validations, and the business rule each one implies. Present as numbered requirements (FR-1, FR-2, ...).',
  },
  {
    id: 'data-models',
    label: 'Data models',
    keywords: ['data', 'model', 'entity', 'schema', 'field', 'table'],
    prompt:
      'From the fields and tables visible in {files}, infer the underlying data model: entities, attributes with likely types, primary/foreign keys and relationships. Output an entity list plus a Mermaid ER diagram.',
  },
  {
    id: 'usage-guide',
    label: 'How to use the application',
    keywords: ['use', 'guide', 'how', 'steps', 'manual', 'walkthrough', 'user'],
    prompt:
      'Using {files}, write a step-by-step user guide explaining how to use this part of the application correctly: prerequisites, the order of actions, expected results, and common mistakes to avoid.',
  },
  {
    id: 'user-flows',
    label: 'User flows',
    keywords: ['flow', 'journey', 'navigation', 'process', 'screen'],
    prompt:
      'Reconstruct the user flow across {files}: entry points, navigation between screens, decision points and exit states. Output as a Mermaid flowchart with a short explanation per step.',
  },
  {
    id: 'ui-improvements',
    label: 'Improve this prompt / UI gaps',
    keywords: ['improve', 'gap', 'ui', 'ux', 'accessibility', 'issue', 'better'],
    prompt:
      'Review {files} for UI/UX gaps, missing validations, ambiguous labels and accessibility issues. For each, state the problem, its impact, and a recommended fix.',
  },
];

const STARTERS: Record<string, PromptSuggestion[]> = {
  screenshots: SCREENSHOT_SUGGESTIONS,
  code: [
    {
      id: 'code-summary',
      label: 'Module summary',
      keywords: ['summary', 'overview', 'purpose', 'module'],
      prompt:
        'Summarise the purpose, entry points and public interfaces of the code in {files}, grouped by module.',
    },
    {
      id: 'code-rules',
      label: 'Business rules',
      keywords: ['business', 'rule', 'logic', 'validation', 'calculation'],
      prompt:
        'Extract every business rule, validation and calculation implemented in {files}. Cite the function and line range for each, and rewrite it in plain English.',
    },
    {
      id: 'code-deps',
      label: 'Dependencies & call graph',
      keywords: ['dependency', 'call', 'graph', 'integration', 'api'],
      prompt:
        'Map internal and external dependencies and the call graph for {files}. Flag tightly coupled areas and external API integrations.',
    },
  ],
  logs: [
    {
      id: 'log-errors',
      label: 'Error patterns',
      keywords: ['error', 'exception', 'fail', 'pattern'],
      prompt:
        'Group the errors and exceptions in {files} by root cause, with frequency, first/last occurrence and the likely affected function.',
    },
    {
      id: 'log-flow',
      label: 'Runtime flow',
      keywords: ['flow', 'sequence', 'trace', 'runtime'],
      prompt:
        'Reconstruct the runtime sequence of operations from {files} for a typical transaction and list the services involved.',
    },
  ],
  'technical-documents': [
    {
      id: 'tech-arch',
      label: 'Architecture summary',
      keywords: ['architecture', 'component', 'design', 'summary'],
      prompt:
        'Summarise the architecture described in {files}: components, responsibilities, interfaces and deployment view.',
    },
    {
      id: 'tech-gaps',
      label: 'Gaps vs. implementation',
      keywords: ['gap', 'mismatch', 'outdated', 'compare'],
      prompt:
        'List statements in {files} that are ambiguous, outdated or likely inconsistent with the implementation, and what to verify.',
    },
  ],
  tickets: [
    {
      id: 'ticket-themes',
      label: 'Recurring themes',
      keywords: ['theme', 'recurring', 'defect', 'change', 'history'],
      prompt:
        'Cluster the work items in {files} into recurring themes (defects, change requests, enhancements) and show which features changed most.',
    },
  ],
  'data-models': [
    {
      id: 'dm-er',
      label: 'ER diagram',
      keywords: ['er', 'entity', 'relationship', 'diagram'],
      prompt:
        'Produce an ER diagram and a data dictionary from {files}, including constraints and relationships.',
    },
  ],
  database: [
    {
      id: 'db-tables',
      label: 'Table purposes',
      keywords: ['table', 'purpose', 'query', 'index'],
      prompt:
        'Describe the purpose of each table in {files}, key columns, and which business function each query supports.',
    },
  ],
  email: [
    {
      id: 'email-triggers',
      label: 'Notification triggers',
      keywords: ['trigger', 'notification', 'event', 'template'],
      prompt:
        'For each notification in {files}, identify the triggering event, recipients, template variables and business condition.',
    },
  ],
  telemetrics: [
    {
      id: 'tele-hotspots',
      label: 'Hotspots & usage',
      keywords: ['metric', 'latency', 'usage', 'hotspot', 'trace'],
      prompt:
        'From {files}, identify the most used features, slowest operations and unusual traces, and relate them to likely modules.',
    },
  ],
};

const GENERIC: PromptSuggestion[] = [
  {
    id: 'generic-summary',
    label: 'Summarise & extract requirements',
    keywords: ['summary', 'summarise', 'summarize', 'requirement', 'extract'],
    prompt:
      'Summarise {files} and extract the functional and non-functional requirements they imply.',
  },
];

export function getSuggestions(artifactId: string): PromptSuggestion[] {
  return STARTERS[artifactId] ?? GENERIC;
}

export function buildPrompt(suggestion: PromptSuggestion, files: string[]): string {
  const fileText = files.length ? files.join(', ') : 'the uploaded files';
  return suggestion.prompt.replace(/\{files\}/g, fileText);
}

/** Rank suggestions against the free text typed so far; already-used ones sink. */
export function rankSuggestions(
  suggestions: PromptSuggestion[],
  typed: string,
  files: string[],
): PromptSuggestion[] {
  const words = typed
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((word) => word.length > 2);
  const score = (suggestion: PromptSuggestion): number => {
    if (typed.includes(buildPrompt(suggestion, files))) return -1;
    return words.reduce(
      (total, word) =>
        total +
        (suggestion.keywords.some((keyword) => keyword.startsWith(word) || word.startsWith(keyword))
          ? 1
          : 0),
      0,
    );
  };
  return [...suggestions].sort((a, b) => score(b) - score(a));
}
