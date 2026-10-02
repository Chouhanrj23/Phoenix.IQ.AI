import { useState, type JSX } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { dataProvider } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge } from '../components/confidence-badge.js';
import { Card, CardContent, CardDescription, CardTitle } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';

export function BacklogPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getEpics(), []);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  function toggle(id: string): void {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) return <LoadingState label="Loading backlog…" />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div>
      <PageHeader
        title="Backlog"
        description="Epics, features, and user stories reconstructed from execution flows, tickets, and source code — a requirements baseline for a product that was never formally specified."
      />
      <div className="space-y-3">
        {(data ?? []).map((epic) => {
          const isOpen = expanded.has(epic.id);
          return (
            <Card key={epic.id}>
              <button
                type="button"
                onClick={() => toggle(epic.id)}
                className="flex w-full items-center justify-between p-4 text-left"
              >
                <div className="flex items-center gap-2">
                  {isOpen ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <div>
                    <CardTitle>{epic.name}</CardTitle>
                    <CardDescription>{epic.description}</CardDescription>
                  </div>
                </div>
                <ConfidenceBadge
                  level={epic.metadata.confidence.level}
                  score={epic.metadata.confidence.score}
                />
              </button>
              {isOpen ? (
                <CardContent className="space-y-4 border-t border-border pt-4">
                  {epic.features.map((feature) => (
                    <div key={feature.id} className="rounded-md border border-border p-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-semibold">{feature.name}</span>
                        <ConfidenceBadge
                          level={feature.metadata.confidence.level}
                          score={feature.metadata.confidence.score}
                        />
                      </div>
                      <p className="mb-2 text-xs text-muted-foreground">{feature.description}</p>
                      <div className="space-y-2">
                        {feature.stories.map((story) => (
                          <div key={story.id} className="rounded-md bg-muted p-2">
                            <div className="mb-1 flex items-center justify-between gap-2">
                              <span className="text-sm font-medium">{story.title}</span>
                              <ConfidenceBadge
                                level={story.metadata.confidence.level}
                                score={story.metadata.confidence.score}
                              />
                            </div>
                            <p className="mb-1.5 text-xs text-muted-foreground">
                              {story.description}
                            </p>
                            <ul className="space-y-0.5">
                              {story.acceptanceCriteria.map((ac) => (
                                <li key={ac.id} className="flex items-start gap-1.5 text-xs">
                                  <Badge variant="outline" className="mt-0.5 shrink-0 text-[9px]">
                                    AC
                                  </Badge>
                                  {ac.description}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              ) : null}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
