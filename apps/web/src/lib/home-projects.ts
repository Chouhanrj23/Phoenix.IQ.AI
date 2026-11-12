import { Users, ShieldCheck, IdCard, ChartPie, Globe, type LucideIcon } from 'lucide-react';
import { getCompany, type CompanyId } from '../data/index.js';

export interface HomeProject {
  id: string;
  /** Tile headline. */
  title: string;
  /** Logo shown on the tile. Defaults to a generic icon when omitted. */
  icon?: LucideIcon;
  /** Name-only tiles show just the logo and name, without the metadata block. */
  nameOnly?: boolean;
  /** Route the tile opens. Omitted for upcoming projects, which are not clickable. */
  to?: string;
  /** Engagement to activate before opening `to`, so the page shows that company's data. */
  engagement?: CompanyId;
  summary: string;
  /** Project name shown in the metadata block. */
  projectName: string | null;
  /** 0–100. Null means no completion figure has been reported yet. */
  completion: number | null;
  /**
   * 0–100. How much of the project the LLM understood well enough to generate output.
   * 90 or more is a good score. 0 until the LLM is integrated for the project.
   */
  confidence: number;
  createdBy: string | null;
  /** ISO date (YYYY-MM-DD). */
  createdOn: string | null;
}

export interface NewProjectInput {
  title: string;
  summary: string;
  projectName: string;
  completion: number | null;
  createdBy: string;
  createdOn: string;
}

export const DEFAULT_SUMMARY = 'Details will be announced when this project is scoped.';

// Metadata sources:
// - Indian Banking System maps to the existing "fintech" engagement (see data/companies.ts).
//   Its name is pulled from there so it stays in sync with the engagement list.
// - createdBy is set to the project owner. createdOn is the repository's first
//   commit date. Update either here if they should change.
// - completion is a placeholder of 20% for the Indian Banking System, set for the
//   visual preview. Replace it with the real figure (or null) once one is reported.
const BANKING_ENGAGEMENT = getCompany('fintech');

export const HOME_PROJECTS: HomeProject[] = [
  {
    id: 'indian-banking-system',
    title: 'Indian Banking System',
    engagement: 'fintech',
    to: '/overview',
    summary: BANKING_ENGAGEMENT.tagline,
    projectName: BANKING_ENGAGEMENT.name,
    completion: 20,
    confidence: 92,
    createdBy: 'Abhijith',
    createdOn: '2026-07-23',
  },
  {
    id: 'kpmg-crm-system',
    title: 'KPMG CRM System',
    icon: Users,
    nameOnly: true,
    summary: DEFAULT_SUMMARY,
    projectName: null,
    completion: 0,
    confidence: 0,
    createdBy: null,
    createdOn: null,
  },
  {
    id: 'compliance-control-room',
    title: 'Compliance Control Room',
    icon: ShieldCheck,
    nameOnly: true,
    summary: DEFAULT_SUMMARY,
    projectName: null,
    completion: 0,
    confidence: 0,
    createdBy: null,
    createdOn: null,
  },
  {
    id: 'know-your-client-legacy-system',
    title: 'Know Your Client Legacy System',
    icon: IdCard,
    nameOnly: true,
    summary: DEFAULT_SUMMARY,
    projectName: null,
    completion: 0,
    confidence: 0,
    createdBy: null,
    createdOn: null,
  },
  {
    id: 'wealth-management-mainframe',
    title: 'Wealth Management Mainframe',
    icon: ChartPie,
    nameOnly: true,
    summary: DEFAULT_SUMMARY,
    projectName: null,
    completion: 0,
    confidence: 0,
    createdBy: null,
    createdOn: null,
  },
  {
    id: 'asia-settlements',
    title: 'Asia Settlements',
    icon: Globe,
    nameOnly: true,
    summary: DEFAULT_SUMMARY,
    projectName: null,
    completion: 0,
    confidence: 0,
    createdBy: null,
    createdOn: null,
  },
];

const CUSTOM_PROJECTS_KEY = 'phoenix.homeProjects.custom.v1';

function asText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function asCompletion(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(100, Math.max(0, value))
    : null;
}

/**
 * Projects added from the "+" tile. They live in this browser's localStorage,
 * so they persist across reloads on this machine but are not shared with others.
 * Storage can be unavailable (private windows, blocked site data), so every
 * access is guarded and falls back to an empty list.
 */
export function loadCustomProjects(): HomeProject[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_PROJECTS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((entry): HomeProject[] => {
      const item = entry as Record<string, unknown>;
      const id = asText(item.id);
      const title = asText(item.title);
      if (!id || !title) return [];
      return [
        {
          id,
          title,
          summary: asText(item.summary) ?? DEFAULT_SUMMARY,
          projectName: asText(item.projectName),
          completion: asCompletion(item.completion),
          confidence: asCompletion(item.confidence) ?? 0,
          createdBy: asText(item.createdBy),
          createdOn: asText(item.createdOn),
        },
      ];
    });
  } catch {
    return [];
  }
}

export function saveCustomProjects(projects: HomeProject[]): void {
  try {
    window.localStorage.setItem(CUSTOM_PROJECTS_KEY, JSON.stringify(projects));
  } catch {
    // Storage unavailable: the project stays visible for this session only.
  }
}

/** Returns `project` with the editable fields replaced by the form values. Routing and icon are kept. */
export function applyProjectInput(project: HomeProject, input: NewProjectInput): HomeProject {
  return {
    ...project,
    title: input.title.trim(),
    summary: input.summary.trim() || DEFAULT_SUMMARY,
    projectName: input.projectName.trim() || null,
    completion: input.completion === null ? null : asCompletion(input.completion),
    createdBy: input.createdBy.trim() || null,
    createdOn: input.createdOn || null,
  };
}

export function createCustomProject(input: NewProjectInput): HomeProject {
  return applyProjectInput(
    {
      id: `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: '',
      summary: DEFAULT_SUMMARY,
      projectName: null,
      completion: null,
      confidence: 0,
      createdBy: null,
      createdOn: null,
    },
    input,
  );
}

/**
 * Edits to the built-in projects, plus the built-in ids the user deleted.
 * Built-in projects are defined in code, so a delete hides the tile and an edit
 * stores the new values here, leaving the defaults in HOME_PROJECTS untouched.
 */
export interface HomeProjectOverrides {
  hidden: string[];
  edits: Record<string, NewProjectInput>;
}

const OVERRIDES_KEY = 'phoenix.homeProjects.overrides.v1';
const NO_OVERRIDES: HomeProjectOverrides = { hidden: [], edits: {} };

export function loadProjectOverrides(): HomeProjectOverrides {
  try {
    const raw = window.localStorage.getItem(OVERRIDES_KEY);
    if (!raw) return NO_OVERRIDES;
    const parsed = JSON.parse(raw) as Partial<HomeProjectOverrides>;
    const hidden = Array.isArray(parsed.hidden)
      ? parsed.hidden.filter((id): id is string => typeof id === 'string')
      : [];
    const edits =
      parsed.edits && typeof parsed.edits === 'object' && !Array.isArray(parsed.edits)
        ? parsed.edits
        : {};
    return { hidden, edits };
  } catch {
    return NO_OVERRIDES;
  }
}

export function saveProjectOverrides(overrides: HomeProjectOverrides): void {
  try {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(overrides));
  } catch {
    // Storage unavailable: the change lasts until the page reloads.
  }
}
