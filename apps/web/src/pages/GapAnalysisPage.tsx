import { useMemo, type JSX } from 'react';
import { HelpCircle } from 'lucide-react';
import type { GapItem, GapSeverity } from '../data/index.js';
import { dataProvider } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';

const SEVERITY_ORDER: Record<GapSeverity, number> = { blocking: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_VARIANT: Record<GapSeverity, 'danger' | 'warning' | 'info' | 'secondary'> = {
  blocking: 'danger',
  high: 'warning',
  medium: 'info',
  low: 'secondary',
};

function severityRank(item: GapItem): number {
  return SEVERITY_ORDER[item.severity];
}

export function GapAnalysisPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getGapItems(), []);

  const sorted = useMemo(
    () => [...(data ?? [])].sort((a, b) => severityRank(a) - severityRank(b)),
    [data],
  );

  if (loading) return <LoadingState label="Loading gap analysis…" />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div>
      <PageHeader
        title="Gap Analysis"
        description="What the platform couldn't verify from any ingested source — framed as a request for missing inputs, not a finding against the team (per the platform's trust-over-surveillance principle)."
      />
      <div className="space-y-3">
        {sorted.map((gap) => (
          <Card key={gap.id}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex items-start gap-2">
                  <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  <CardTitle>{gap.area}</CardTitle>
                </div>
                <Badge variant={SEVERITY_VARIANT[gap.severity]} className="uppercase">
                  {gap.severity}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">{gap.description}</p>
              <div>
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                  What would resolve this
                </div>
                <ul className="list-inside list-disc text-sm">
                  {gap.missingInputs.map((input) => (
                    <li key={input}>{input}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-md bg-muted p-2 text-sm">
                <span className="font-medium">Suggested next step: </span>
                {gap.suggestedAction}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
