import { useState } from 'react';
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface DisclosureSectionProps {
  title: string;
  /** Shown next to the title, e.g. an item count — omitted when undefined. */
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * A single expand/collapse section — the same chevron-header pattern
 * `BacklogPage.tsx` already established for progressive disclosure, factored
 * out so `JourneyDetailPanel` (PC-03) doesn't reimplement it per section.
 */
export function DisclosureSection({
  title,
  count,
  defaultOpen = false,
  children,
}: DisclosureSectionProps): JSX.Element {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 py-2.5 text-left text-sm font-semibold"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
        {title}
        {count !== undefined ? (
          <span className="font-normal text-muted-foreground">({count})</span>
        ) : null}
      </button>
      {open ? <div className="pb-3 pl-6">{children}</div> : null}
    </div>
  );
}
