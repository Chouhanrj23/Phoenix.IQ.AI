import type { JSX } from 'react';
import { currentDataSourceMode, fixtureNotice, type DataArea } from '../lib/data-origin.js';

/**
 * P8 -- shown wherever an area is answered from demo fixtures while the app
 * is in API mode, so fixture data is never presented as backend output.
 * Renders nothing when every listed area really comes from the API (or in
 * demo mode, where the masthead already says all data is fixture data).
 */
export function FixtureNotice({ areas }: { areas: readonly DataArea[] }): JSX.Element | null {
  const message = fixtureNotice(areas, currentDataSourceMode());
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
