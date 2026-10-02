import { Gauge, ShieldCheck, Lock, ScrollText, TrendingUp } from 'lucide-react';
import type { NfrCategory } from '../data/index.js';
import { dataProvider } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge } from '../components/confidence-badge.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';

import type { JSX } from 'react';

const ICON_BY_CATEGORY: Record<NfrCategory, typeof Gauge> = {
  performance: Gauge,
  availability: TrendingUp,
  security: Lock,
  compliance: ScrollText,
  scalability: ShieldCheck,
};

const LABEL_BY_CATEGORY: Record<NfrCategory, string> = {
  performance: 'Performance',
  availability: 'Availability',
  security: 'Security',
  compliance: 'Compliance',
  scalability: 'Scalability',
};

export function NfrPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getNonFunctionalRequirements(), []);

  if (loading) return <LoadingState label="Loading non-functional requirements…" />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div>
      <PageHeader
        title="Non-Functional Requirements"
        description="Performance, availability, security, compliance, and scalability targets recovered from infra code, load-test reports, and tickets — each with its own confidence."
      />
      <div className="space-y-3">
        {(data ?? []).map((nfr) => {
          const Icon = ICON_BY_CATEGORY[nfr.category];
          return (
            <Card key={nfr.id}>
              <CardHeader>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex items-start gap-2">
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                    <div>
                      <Badge variant="outline" className="mb-1.5">
                        {LABEL_BY_CATEGORY[nfr.category]}
                      </Badge>
                      <CardTitle>{nfr.requirement}</CardTitle>
                    </div>
                  </div>
                  <ConfidenceBadge
                    level={nfr.metadata.confidence.level}
                    score={nfr.metadata.confidence.score}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="rounded-md bg-muted p-2 text-sm">
                  <span className="font-medium">Target: </span>
                  {nfr.target}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {nfr.appliesTo.map((target) => (
                    <Badge key={target} variant="secondary">
                      {target}
                    </Badge>
                  ))}
                </div>
                {nfr.metadata.confidence.rationale ? (
                  <p className="text-xs text-muted-foreground">
                    {nfr.metadata.confidence.rationale}
                  </p>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
