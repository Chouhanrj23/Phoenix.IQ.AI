import { useEffect, useRef, useState, type FormEvent, type JSX } from 'react';
import { Plus, X } from 'lucide-react';
import { createCustomProject, type HomeProject } from '../lib/home-projects.js';

const INPUT_CLASS =
  'mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition-[border-color,box-shadow] duration-300 placeholder:text-slate-400 focus:border-[#0091DA] focus:ring-2 focus:ring-[#0091DA]/20';

const LABEL_CLASS = 'block text-xs font-medium text-slate-600';

/** Dashed "+" tile at the end of the grid. */
export function AddProjectTile({ onClick }: { onClick: () => void }): JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full min-h-[200px] flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-[#0091DA]/40 bg-white p-6 text-center transition-[transform,border-color,background-color,box-shadow] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-1 hover:border-[#0091DA] hover:bg-[#0091DA]/5 hover:shadow-lg hover:shadow-[#00338D]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0091DA] focus-visible:ring-offset-2 motion-reduce:transition-none motion-reduce:hover:translate-y-0"
    >
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[#0091DA]/10 text-[#00338D] transition-[transform,background-color,color] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:rotate-90 group-hover:bg-[#0091DA] group-hover:text-white">
        <Plus className="h-6 w-6" />
      </span>
      <span className="text-sm font-semibold text-[#00338D]">Add project</span>
      <span className="text-xs text-slate-400">Track another engagement</span>
    </button>
  );
}

interface AddProjectDialogProps {
  onClose: () => void;
  onCreate: (project: HomeProject) => void;
}

/** Modal form for adding a project. New projects appear as upcoming placeholders. */
export function AddProjectDialog({ onClose, onCreate }: AddProjectDialogProps): JSX.Element {
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [projectName, setProjectName] = useState('');
  const [completion, setCompletion] = useState('');
  const [createdBy, setCreatedBy] = useState('');
  const [createdOn, setCreatedOn] = useState('');
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (title.trim() === '') {
      setError('Give the project a title.');
      return;
    }
    const trimmedCompletion = completion.trim();
    const parsedCompletion = trimmedCompletion === '' ? null : Number(trimmedCompletion);
    if (
      parsedCompletion !== null &&
      (!Number.isFinite(parsedCompletion) || parsedCompletion < 0 || parsedCompletion > 100)
    ) {
      setError('Completion must be a number between 0 and 100, or left empty.');
      return;
    }
    onCreate(
      createCustomProject({
        title,
        summary,
        projectName,
        completion: parsedCompletion,
        createdBy,
        createdOn,
      }),
    );
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px]"
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="add-project-title"
        className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h2
              id="add-project-title"
              className="text-lg font-semibold tracking-tight text-slate-900"
            >
              Add a project
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              It appears as an upcoming project. Only the title is required.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className={LABEL_CLASS}>
            Title <span className="text-[#0091DA]">*</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={INPUT_CLASS}
              maxLength={80}
            />
          </label>

          <label className={LABEL_CLASS}>
            Summary
            <textarea
              value={summary}
              onChange={(event) => setSummary(event.target.value)}
              rows={2}
              className={`${INPUT_CLASS} resize-none`}
              maxLength={200}
            />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <label className={LABEL_CLASS}>
              Project name
              <input
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Completion (%)
              <input
                value={completion}
                onChange={(event) => setCompletion(event.target.value)}
                inputMode="numeric"
                placeholder="Not yet reported"
                className={INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Created by
              <input
                value={createdBy}
                onChange={(event) => setCreatedBy(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
            <label className={LABEL_CLASS}>
              Created on
              <input
                type="date"
                value={createdOn}
                onChange={(event) => setCreatedOn(event.target.value)}
                className={INPUT_CLASS}
              />
            </label>
          </div>

          {error ? (
            <p role="alert" className="text-xs font-medium text-red-600">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="rounded-lg bg-[#00338D] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-[background-color,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[#0091DA] active:scale-[0.98]"
            >
              Add project
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
