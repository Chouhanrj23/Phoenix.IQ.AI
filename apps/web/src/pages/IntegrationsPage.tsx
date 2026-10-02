import { ArrowLeftRight, ArrowRight, ArrowLeft } from 'lucide-react';
import type { IntegrationDirection } from '../data/index.js';
import { dataProvider } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge } from '../components/confidence-badge.js';
import { ProvenanceList } from '../components/provenance-list.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';

import type { JSX } from 'react';

const ICON_BY_DIRECTION: Record<IntegrationDirection, typeof ArrowRight> = {
  outbound: ArrowRight,
  inbound: ArrowLeft,
  bidirectional: ArrowLeftRight,
};

export function IntegrationsPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getIntegrations(), []);

  if (loading) return <LoadingState label="Loading integrations…" />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div>
      <PageHeader
        title="Integrations & Data Flows"
        description="Every external system this platform talks to, the protocol used, and what data crosses the boundary — decomposed from the Architecture context view."
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {(data ?? []).map((integration) => {
          const Icon = ICON_BY_DIRECTION[integration.direction];
          return (
            <Card key={integration.id}>
              <CardHeader>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <CardTitle>{integration.name}</CardTitle>
                    <CardDescription>{integration.counterpart}</CardDescription>
                  </div>
                  <ConfidenceBadge
                    level={integration.metadata.confidence.level}
                    score={integration.metadata.confidence.score}
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-xs">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                  <Badge variant="outline">{integration.direction}</Badge>
                  <span className="text-muted-foreground">{integration.protocol}</span>
                </div>
                <div className="rounded-md bg-muted p-2 text-sm">{integration.dataExchanged}</div>
                {integration.metadata.confidence.rationale ? (
                  <p className="text-xs text-muted-foreground">
                    {integration.metadata.confidence.rationale}
                  </p>
                ) : null}
                <details className="text-xs">
                  <summary className="cursor-pointer select-none font-medium text-muted-foreground">
                    Provenance ({integration.metadata.provenance.length})
                  </summary>
                  <div className="mt-2">
                    <ProvenanceList provenance={integration.metadata.provenance} />
                  </div>
                </details>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
