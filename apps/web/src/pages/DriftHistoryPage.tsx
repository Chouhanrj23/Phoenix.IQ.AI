import { useEffect, useState, type JSX } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Plus, Minus, Pencil } from 'lucide-react';
import type { DriftAlert } from '../data/index.js';
import { dataProvider } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { Card, CardContent, CardDescription, CardTitle } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';

const ICON_BY_CHANGE: Record<DriftAlert['changeType'], typeof Plus> = {
  added: Plus,
  removed: Minus,
  modified: Pencil,
};

export function DriftHistoryPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getDriftHistory(), []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [seededDefault, setSeededDefault] = useState(false);

  // PC-08 fix: the most recent run should start open, but `data` only
  // arrives asynchronously (after this component's first render), so
  // seeding `expanded` directly in `useState` above always produced an
  // empty set in practice — the row only *looked* open because of a
  // `|| i === 0` fallback in the render below, which also made that row
  // impossible to ever collapse. Seeding once here (only the first time
  // data arrives) preserves the "most recent run open by default" intent
  // while leaving every row, including the first, genuinely toggleable.
  useEffect(() => {
    if (!seededDefault && data && data[0]) {
      setExpanded(new Set([data[0].id]));
      setSeededDefault(true);
    }
  }, [data, seededDefault]);

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <LoadingState label="Loading drift history…" />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div>
      <PageHeader
        title="Drift History"
        description="What changed between each differential run — the platform's continuous-currency guarantee made concrete, not just a point-in-time snapshot."
      />
      <div className="space-y-3">
        {(data ?? []).map((run) => {
          const isOpen = expanded.has(run.id);
          return (
            <Card key={run.id}>
              <button
                type="button"
                onClick={() => toggle(run.id)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <CardTitle>
                      {new Date(run.runDate).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </CardTitle>
                    <CardDescription>{run.summary}</CardDescription>
                  </div>
                </div>
                <Badge variant="outline">
                  {run.changes.length} change{run.changes.length === 1 ? '' : 's'}
                </Badge>
              </button>
              {isOpen ? (
                <CardContent className="space-y-3 border-t border-border pt-4">
                  {run.changes.map((change) => {
                    const Icon = ICON_BY_CHANGE[change.changeType];
                    return (
                      <div key={change.id} className="flex items-start gap-2">
                        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                        <div>
                          <div className="text-sm font-medium">
                            {change.elementName}{' '}
                            <Badge
                              variant="secondary"
                              className="ml-1 align-middle text-[10px] uppercase"
                            >
                              {change.changeType}
                            </Badge>
                          </div>
                          <div className="text-xs text-muted-foreground">{change.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>
      {(data ?? []).length === 0 ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <AlertTriangle className="h-4 w-4" /> No differential runs recorded yet.
        </div>
      ) : null}
    </div>
  );
}
