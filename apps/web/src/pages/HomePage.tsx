import { useMemo, useState, type JSX } from 'react';
import {
  AddProjectDialog,
  AddProjectTile,
  DeleteProjectDialog,
} from '../components/add-project.js';
import { HomeProjectTile } from '../components/home-project-tile.js';
import type { CompanyId } from '../data/index.js';
import {
  applyProjectInput,
  createCustomProject,
  DEFAULT_SUMMARY,
  HOME_PROJECTS,
  loadCustomProjects,
  loadProjectOverrides,
  saveCustomProjects,
  saveProjectOverrides,
  type HomeProject,
  type HomeProjectOverrides,
  type NewProjectInput,
} from '../lib/home-projects.js';

/** Which dialog is open: a new project, or an edit of an existing one. */
type ProjectDialog = { mode: 'add' } | { mode: 'edit'; project: HomeProject };

// A very faint grid on white keeps the hero from looking flat without adding weight.
const GRID_PATTERN =
  'bg-[linear-gradient(rgba(0,51,141,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,51,141,0.035)_1px,transparent_1px)] bg-[size:40px_40px]';

interface HomePageProps {
  onOpenEngagement: (engagement: CompanyId) => void;
}

export function HomePage({ onOpenEngagement }: HomePageProps): JSX.Element {
  // Loaded once on mount; the lazy initializer keeps storage reads out of re-renders.
  const [customProjects, setCustomProjects] = useState<HomeProject[]>(() => loadCustomProjects());
  const [overrides, setOverrides] = useState<HomeProjectOverrides>(() => loadProjectOverrides());
  const [dialog, setDialog] = useState<ProjectDialog | null>(null);
  const [pendingDelete, setPendingDelete] = useState<HomeProject | null>(null);

  // Built-in projects minus the deleted ones, with any saved edits applied.
  const projects = useMemo(() => {
    const builtIn = HOME_PROJECTS.filter((project) => !overrides.hidden.includes(project.id)).map(
      (project) => {
        const edit = overrides.edits[project.id];
        return edit ? applyProjectInput(project, edit) : project;
      },
    );
    return [...builtIn, ...customProjects];
  }, [customProjects, overrides]);
  const hiddenCount = overrides.hidden.length;
  const available = projects.filter((project) => project.to !== undefined).length;
  const stats = [
    { label: 'Projects', value: projects.length },
    { label: 'Available', value: available },
    { label: 'Upcoming', value: projects.length - available },
  ];

  function updateOverrides(next: HomeProjectOverrides): void {
    setOverrides(next);
    saveProjectOverrides(next);
  }

  function updateCustomProjects(next: HomeProject[]): void {
    setCustomProjects(next);
    saveCustomProjects(next);
  }

  function handleSubmit(input: NewProjectInput): void {
    if (dialog?.mode === 'add') {
      updateCustomProjects([...customProjects, createCustomProject(input)]);
    } else if (dialog?.mode === 'edit') {
      const { id } = dialog.project;
      if (customProjects.some((project) => project.id === id)) {
        updateCustomProjects(
          customProjects.map((project) =>
            project.id === id ? applyProjectInput(project, input) : project,
          ),
        );
      } else {
        updateOverrides({ ...overrides, edits: { ...overrides.edits, [id]: input } });
      }
    }
    setDialog(null);
  }

  function handleDelete(project: HomeProject): void {
    if (customProjects.some((item) => item.id === project.id)) {
      updateCustomProjects(customProjects.filter((item) => item.id !== project.id));
    } else {
      updateOverrides({ ...overrides, hidden: [...overrides.hidden, project.id] });
    }
    setPendingDelete(null);
  }

  // Edit form values for the project being edited, using the same defaults the tile shows.
  const editing = dialog?.mode === 'edit' ? dialog.project : null;
  const editInitial: NewProjectInput | undefined = editing
    ? {
        title: editing.title,
        summary: editing.summary === DEFAULT_SUMMARY ? '' : editing.summary,
        projectName: editing.projectName ?? '',
        completion: editing.completion,
        createdBy: editing.createdBy ?? '',
        createdOn: editing.createdOn ?? '',
      }
    : undefined;

  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-xl border border-[#00338D]/15 bg-gradient-to-br from-[#00338D]/[0.06] via-[#00338D]/[0.02] to-white p-8 shadow-sm sm:p-10">
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute inset-0 ${GRID_PATTERN}`}
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-20 -top-24 h-64 w-64 rounded-full bg-[#00338D]/12 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-[#00338D]/12 blur-3xl"
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#0091DA] via-[#00338D] to-[#0091DA]/40"
        />

        <div className="relative flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="max-w-xl">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-[#0091DA]">
              Phoenix.ai · Homepage
            </p>
            <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
              Project portfolio
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              Open an available project to explore its reconstructed architecture, domain model, and
              backlog. Upcoming projects will open once they are scoped.
            </p>
          </div>

          <dl className="grid grid-cols-3 gap-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-lg border border-slate-200 bg-slate-50/70 px-5 py-3 text-center transition-colors duration-500 hover:border-[#0091DA]/30 hover:bg-white"
              >
                <dt className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {stat.label}
                </dt>
                <dd className="mt-1 text-2xl font-semibold tabular-nums text-[#00338D]">
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-700">All projects</h2>
          <div className="flex items-center gap-3">
            {hiddenCount > 0 ? (
              <button
                type="button"
                onClick={() => updateOverrides({ ...overrides, hidden: [] })}
                className="text-xs font-medium text-[#0091DA] transition-colors hover:text-[#00338D] hover:underline"
              >
                Restore {hiddenCount} removed
              </button>
            ) : null}
            <span className="text-xs text-slate-400">{projects.length} projects</span>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 xl:grid-cols-3">
          {projects.map((project) => (
            <HomeProjectTile
              key={project.id}
              project={project}
              onOpenEngagement={onOpenEngagement}
              onEdit={() => setDialog({ mode: 'edit', project })}
              onDelete={() => setPendingDelete(project)}
            />
          ))}
          <AddProjectTile onClick={() => setDialog({ mode: 'add' })} />
        </div>
      </div>

      {dialog ? (
        <AddProjectDialog
          initial={editInitial}
          onClose={() => setDialog(null)}
          onSubmit={handleSubmit}
        />
      ) : null}

      {pendingDelete ? (
        <DeleteProjectDialog
          title={pendingDelete.title}
          onCancel={() => setPendingDelete(null)}
          onConfirm={() => handleDelete(pendingDelete)}
        />
      ) : null}
    </div>
  );
}
