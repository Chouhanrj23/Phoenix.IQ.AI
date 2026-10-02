import { useState, type JSX } from 'react';
import { ChevronDown, ChevronRight, PlugZap } from 'lucide-react';
import type { ConnectedSourceGroup } from '../lib/connected-sources.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.js';
import { cn } from '../lib/utils.js';

interface ConnectedSourcesSummaryProps {
  groups: readonly ConnectedSourceGroup[];
}

/**
 * PC-06/PC-08 — compact "Connected Sources" summary. One row per REAL
 * source kind actually referenced in the currently loaded data (see
 * `lib/connected-sources.ts`) — never a dense prose block, never a
 * fabricated count. A source kind with zero real references simply never
 * appears here; there is no "0 Repositories" placeholder row.
 *
 * PC-08: each card is a real, working expand/collapse control (matching
 * "everything presented as clickable must work") — clicking it reveals the
 * actual distinct sources behind that count (e.g. which repository, which
 * Jira issue), each with its real provenance type and how many times it's
 * referenced across the loaded system. Never a dead click into nothing.
 */
export function ConnectedSourcesSummary({ groups }: ConnectedSourcesSummaryProps): JSX.Element {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function toggle(id: string): void {
    setExpandedId((current) => (current === id ? null : id));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <PlugZap className="h-4 w-4 text-muted-foreground" /> Connected Sources
        </CardTitle>
        <CardDescription>
          Enterprise knowledge sources Phoenix has processed for this system.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No sources have been connected for this system yet.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {groups.map((group) => {
              const isExpanded = group.id === expandedId;
              return (
                <div
                  key={group.id}
                  className={cn('rounded-md border border-border', isExpanded && 'sm:col-span-3')}
                >
                  <button
                    type="button"
                    onClick={() => toggle(group.id)}
                    aria-expanded={isExpanded}
                    className="flex w-full items-start gap-2 p-3 text-left hover:bg-muted/40"
                  >
                    <span
                      className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-emerald-500"
                      aria-hidden
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-1 text-sm font-medium">
                        {group.label}
                        {isExpanded ? (
                          <ChevronDown className="h-3 w-3 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {group.count} {group.quantityLabel}
                      </div>
                    </div>
                  </button>
                  {isExpanded ? (
                    <ul className="space-y-1 border-t border-border p-3">
                      {group.items.map((item) => (
                        <li
                          key={item.key}
                          className="flex items-center justify-between gap-2 rounded bg-muted/30 px-2 py-1.5 text-xs"
                        >
                          <span className="font-mono text-foreground">{item.key}</span>
                          <span className="shrink-0 text-muted-foreground">
                            {item.sourceType} · referenced {item.referenceCount}×
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
