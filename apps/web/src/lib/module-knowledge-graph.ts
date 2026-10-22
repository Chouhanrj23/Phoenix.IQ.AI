export const KNOWLEDGE_GRAPH_DESTINATIONS = [
  'Business Domains',
  'Domain Model',
  'Actions / Activities',
  'Execution / Business Process Flow',
  'Personas & User Journeys',
  'Reports',
  'Capabilities',
  'Epics',
  'User Stories',
] as const;

export type ModuleKnowledgeGraphUpdate = {
  moduleId: string;
  artifactLabels: string[];
  updatedAt: string;
};

const STORAGE_KEY = 'phoenix.module-knowledge-graph-update';

/** Browser-only hand-off for the UI prototype; no API or backend is involved. */
export function saveModuleKnowledgeGraphUpdate(
  moduleId: string,
  artifactLabels: string[],
): ModuleKnowledgeGraphUpdate {
  const update = { moduleId, artifactLabels, updatedAt: new Date().toISOString() };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(update));
  return update;
}

export function getModuleKnowledgeGraphUpdate(): ModuleKnowledgeGraphUpdate | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value ? (JSON.parse(value) as ModuleKnowledgeGraphUpdate) : null;
  } catch {
    return null;
  }
}
