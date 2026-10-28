import type { JSX, PointerEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Banknote, Layers, Pencil, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils.js';
import type { HomeProject } from '../lib/home-projects.js';
import type { CompanyId } from '../data/index.js';

const FALLBACK = {
  projectName: 'To be announced',
  completion: 'Not yet reported',
  createdBy: 'To be confirmed',
  createdOn: 'To be confirmed',
} as const;

// Shared easing so every hover movement settles the same way.
const EASE = 'ease-[cubic-bezier(0.22,1,0.36,1)]';

function formatCreatedOn(isoDate: string | null): string {
  if (!isoDate) return FALLBACK.createdOn;
  // Parse as local midnight so the day does not shift across time zones.
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** Moves a soft light spot to follow the pointer across a tile. */
function trackSpotlight(event: PointerEvent<HTMLElement>): void {
  const rect = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty('--spot-x', `${event.clientX - rect.left}px`);
  event.currentTarget.style.setProperty('--spot-y', `${event.clientY - rect.top}px`);
}

interface HomeProjectTileProps {
  project: HomeProject;
  /** Activates the project's engagement before its route opens. */
  onOpenEngagement: (engagement: CompanyId) => void;
  /** Shows an Edit button when provided. */
  onEdit?: () => void;
  /** Shows a Delete button when provided. */
  onDelete?: () => void;
}

export function HomeProjectTile({
  project,
  onOpenEngagement,
  onEdit,
  onDelete,
}: HomeProjectTileProps): JSX.Element {
  const isActive = project.to !== undefined;
  const nameOnly = project.nameOnly === true;
  // Tiles with a hover effect: the active tile and the name-only placeholders.
  const hasHoverFx = isActive || nameOnly;
  const Icon = project.icon ?? (isActive ? Banknote : Layers);
  const hasCompletion = project.completion !== null;
  const completion = hasCompletion ? Math.min(100, Math.max(0, project.completion ?? 0)) : 0;

  // The active tile keeps its identity visible and reveals the detail block on
  // hover or keyboard focus. Touch screens (no fine pointer) always show it, so
  // the information never depends on hover.
  const details = (
    <dl className="space-y-3 border-t border-slate-100 pt-4 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <div className="col-span-2">
          <dt className="text-slate-400">Project name</dt>
          <dd className="mt-0.5 font-medium text-slate-700">
            {project.projectName ?? FALLBACK.projectName}
          </dd>
        </div>

        <div className="col-span-2">
          <div className="flex items-baseline justify-between">
            <dt className="text-slate-400">Completion</dt>
            <dd
              className={cn(
                'font-semibold tabular-nums',
                hasCompletion ? 'text-sm text-[#00338D]' : 'text-slate-700',
              )}
            >
              {hasCompletion ? `${completion}%` : FALLBACK.completion}
            </dd>
          </div>
          <div
            role="progressbar"
            aria-label={`Completion for ${project.title}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={hasCompletion ? completion : undefined}
            aria-valuetext={hasCompletion ? `${completion}%` : FALLBACK.completion}
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100 outline outline-1 outline-offset-2 outline-[#00338D]/15"
          >
            <div
              className={cn(
                'h-full rounded-full transition-[width] duration-700',
                EASE,
                isActive ? 'bg-gradient-to-r from-[#0091DA] to-[#00338D]' : 'bg-slate-300',
              )}
              style={{ width: `${completion}%` }}
            />
          </div>
        </div>

        <div>
          <dt className="text-slate-400">Created by</dt>
          <dd className="mt-0.5 font-medium text-slate-700">
            {project.createdBy ?? FALLBACK.createdBy}
          </dd>
        </div>
        <div>
          <dt className="text-slate-400">Created on</dt>
          <dd className="mt-0.5 font-medium text-slate-700">
            {formatCreatedOn(project.createdOn)}
          </dd>
        </div>
      </div>
    </dl>
  );

  const header = (
    <div className="relative flex items-start justify-between gap-3">
      <span
        className={cn(
          'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-[transform,background-color,color] duration-500',
          EASE,
          isActive
            ? 'bg-[#0091DA]/10 text-[#00338D] group-hover:scale-105 group-hover:bg-[#0091DA] group-hover:text-white'
            : nameOnly
              ? 'bg-[#00338D]/5 text-[#00338D]/70 group-hover:scale-105 group-hover:bg-[#00338D]/10 group-hover:text-[#00338D]'
              : 'bg-slate-100 text-slate-400',
        )}
      >
        <Icon className="h-5 w-5" />
      </span>
      <span
        className={cn(
          'rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
          isActive
            ? 'border-[#0091DA]/20 bg-[#0091DA]/5 text-[#00338D]'
            : 'border-slate-200 bg-slate-50 text-slate-500',
        )}
      >
        {isActive ? 'Available' : 'Upcoming'}
      </span>
    </div>
  );

  const content = (
    <>
      {hasHoverFx ? (
        // Soft light that follows the pointer.
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:transition-none"
          style={{
            background:
              'radial-gradient(260px circle at var(--spot-x, 50%) var(--spot-y, 50%), rgba(0,51,141,0.07), transparent 70%)',
          }}
        />
      ) : null}

      <span
        className={cn(
          'absolute inset-x-0 top-0 h-0.5 origin-left transition-transform duration-700',
          EASE,
          isActive
            ? 'scale-x-[0.25] bg-gradient-to-r from-[#0091DA] to-[#00338D] group-hover:scale-x-100'
            : nameOnly
              ? 'scale-x-[0.25] bg-gradient-to-r from-[#0091DA] to-[#00338D] group-hover:scale-x-100'
              : 'bg-slate-200',
        )}
      />

      {header}

      <h2 className="relative mt-5 text-lg font-semibold tracking-tight text-slate-900">
        {project.title}
      </h2>
      {nameOnly ? null : (
        <p className="relative mt-1.5 text-sm leading-relaxed text-slate-500">{project.summary}</p>
      )}

      {isActive ? (
        <div
          className={cn(
            'relative grid transition-[grid-template-rows,opacity] duration-700 motion-reduce:transition-none',
            EASE,
            'pointer-fine:grid-rows-[0fr] pointer-fine:opacity-0 pointer-fine:group-focus-visible:grid-rows-[1fr] pointer-fine:group-focus-visible:opacity-100 pointer-fine:group-hover:grid-rows-[1fr] pointer-fine:group-hover:opacity-100',
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="mt-5">{details}</div>
          </div>
        </div>
      ) : (
        <div className="relative mt-5">{details}</div>
      )}

      {/* The active tile's "Open project" line is matched by an empty spacer on
          placeholders, so expanding the details on hover never changes row height. */}
      {isActive ? (
        <span
          className={cn(
            'relative mt-auto flex h-5 items-center gap-1.5 pt-5 text-sm font-medium text-[#00338D]',
          )}
        >
          Open project
          <ArrowRight
            className={cn(
              'h-4 w-4 transition-transform duration-500 group-hover:translate-x-1',
              EASE,
            )}
          />
        </span>
      ) : nameOnly ? null : (
        <span aria-hidden="true" className="relative mt-auto block h-5 pt-5" />
      )}
    </>
  );

  const className = cn(
    // min-h keeps every row as tall as the expanded active tile, so hovering never shifts the grid.
    'group relative flex h-full min-h-[25rem] flex-col overflow-hidden rounded-xl border bg-white p-6 shadow-sm transition-[transform,box-shadow,border-color] duration-500 motion-reduce:transition-none',
    EASE,
    isActive
      ? 'border-slate-200 hover:-translate-y-1 hover:border-[#0091DA]/30 hover:shadow-xl hover:shadow-[#00338D]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0091DA] focus-visible:ring-offset-2 motion-reduce:hover:translate-y-0'
      : nameOnly
        ? 'border-slate-200 hover:-translate-y-1 hover:border-[#00338D]/20 hover:shadow-lg hover:shadow-[#00338D]/10 motion-reduce:hover:translate-y-0'
        : 'cursor-default border-dashed border-slate-300 bg-slate-50/50',
  );

  const tile =
    isActive && project.to ? (
      <Link
        to={project.to}
        data-home-tile
        className={className}
        onPointerMove={trackSpotlight}
        onClick={() => {
          if (project.engagement) onOpenEngagement(project.engagement);
        }}
      >
        {content}
      </Link>
    ) : (
      <div
        data-home-tile
        aria-disabled="true"
        className={className}
        onPointerMove={hasHoverFx ? trackSpotlight : undefined}
      >
        {content}
      </div>
    );

  if (!onEdit && !onDelete) return tile;

  // The buttons sit beside the tile rather than inside it: a link cannot contain
  // buttons, and clicking Edit or Delete must not open the project.
  return (
    <div className="group/tile relative h-full">
      {tile}
      <div className="absolute bottom-4 right-4 z-10 flex gap-1 opacity-60 transition-opacity duration-300 focus-within:opacity-100 group-hover/tile:opacity-100 motion-reduce:transition-none">
        {onEdit ? (
          <button
            type="button"
            onClick={onEdit}
            aria-label={`Edit ${project.title}`}
            title="Edit"
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition-colors hover:border-[#0091DA]/40 hover:text-[#00338D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0091DA]"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            aria-label={`Delete ${project.title}`}
            title="Delete"
            className="rounded-md border border-slate-200 bg-white p-1.5 text-slate-500 shadow-sm transition-colors hover:border-rose-200 hover:text-rose-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
