import type { JSX } from 'react';
import { currentDataSourceMode, seedNotice } from '../lib/data-origin.js';

/**
 * P8 -- shown on drift and gap views when the API answered them with its
 * built-in sample rather than a real analysis run. Renders nothing when the
 * data came from a run (or in demo mode, where everything is a fixture and
 * the masthead already says so).
 */
export function SeedNotice({ paths }: { paths: readonly string[] }): JSX.Element | null {
  const message = seedNotice(paths, currentDataSourceMode());
  if (message === undefined) return null;
  return (
    <div
      role="note"
      className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-900"
    >
      {message}
    </div>
  );
}
