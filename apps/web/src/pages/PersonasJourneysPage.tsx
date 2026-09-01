import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowRight, Target, AlertCircle, Users } from 'lucide-react';
import { dataProvider } from '../data/index.js';
import type { Journey, Persona } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { deriveJourneyDetail } from '../lib/journey-detail.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge } from '../components/confidence-badge.js';
import { JourneyDetailPanel } from '../components/journey-detail-panel.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { cn } from '../lib/utils.js';

/**
 * PC-02/PC-03 — Persona -> Journey navigation and expandable Journey
 * Detail. Selecting a persona filters "Associated Journeys" down to real
 * journeys with `journey.personaId === persona.id` (the same relationship
 * `build-graph.ts` already encodes as a graph edge — reused here directly,
 * no second relationship model). Selecting a journey opens a Journey Detail
 * panel (`JourneyDetailPanel`, PC-03) built entirely from existing provider
 * data — see `lib/journey-detail.ts` for the exact, non-fabricated joins
 * (flow-step provenance <-> container provenance, entities <-> aggregates,
 * container id <-> deployment instance, etc.). Selection is reflected in
 * the URL (`?persona=<id>&journey=<id>`) so it survives a refresh/share,
 * matching ExecutionFlowsPage's existing `?flow=<id>` convention.
 */
export function PersonasJourneysPage(): JSX.Element {
  const personas = useAsync(() => dataProvider.getPersonas(), []);
  const journeys = useAsync(() => dataProvider.getJourneys(), []);
  const flows = useAsync(() => dataProvider.getExecutionFlows(), []);
  const domains = useAsync(() => dataProvider.getDomains(), []);
  const architecture = useAsync(() => dataProvider.getArchitecture('container'), []);
  const deployment = useAsync(() => dataProvider.getDeploymentTopology(), []);
  const integrations = useAsync(() => dataProvider.getIntegrations(), []);

  const [searchParams, setSearchParams] = useSearchParams();
  const [selectedPersonaId, setSelectedPersonaId] = useState<string | null>(null);
  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(null);

  useEffect(() => {
    setSelectedPersonaId(searchParams.get('persona'));
    setSelectedJourneyId(searchParams.get('journey'));
  }, [searchParams]);

  const loading =
    personas.loading ||
    journeys.loading ||
    flows.loading ||
    domains.loading ||
    architecture.loading ||
    deployment.loading ||
    integrations.loading;
  const error =
    personas.error ??
    journeys.error ??
    flows.error ??
    domains.error ??
    architecture.error ??
    deployment.error ??
    integrations.error;

  const allPersonas = useMemo(() => personas.data ?? [], [personas.data]);
  const allJourneys = useMemo(() => journeys.data ?? [], [journeys.data]);
  const allFlows = useMemo(() => flows.data ?? [], [flows.data]);
  const allDomains = useMemo(() => domains.data ?? [], [domains.data]);
  const allContainers = useMemo(() => architecture.data?.nodes ?? [], [architecture.data]);
  const allDeploymentNodes = useMemo(() => deployment.data ?? [], [deployment.data]);
  const allIntegrations = useMemo(() => integrations.data ?? [], [integrations.data]);

  // Missing-relationship data (a persona id in the URL that no longer exists,
  // a journey deleted from underneath a stale link, etc.) resolves to
  // `undefined` here rather than throwing — the UI below treats that exactly
  // like "nothing selected" instead of showing a broken screen.
  const selectedPersona = allPersonas.find((p) => p.id === selectedPersonaId);
  const selectedJourney = allJourneys.find((j) => j.id === selectedJourneyId);
  const associatedJourneys = selectedPersona
    ? allJourneys.filter((j) => j.personaId === selectedPersona.id)
    : [];

  const journeyDetail = useMemo(() => {
    if (!selectedJourney) return null;
    return deriveJourneyDetail(
      selectedJourney,
      allFlows,
      allDomains,
      allContainers,
      allDeploymentNodes,
      allIntegrations,
    );
  }, [selectedJourney, allFlows, allDomains, allContainers, allDeploymentNodes, allIntegrations]);

  if (loading) return <LoadingState label="Loading personas and journeys…" />;
  if (error) return <ErrorState message={error.message} />;

  function flowName(flowId: string): string {
    return allFlows.find((f) => f.id === flowId)?.name ?? flowId;
  }

  function personaName(personaId: string): string {
    return allPersonas.find((p) => p.id === personaId)?.name ?? personaId;
  }

  function selectPersona(persona: Persona): void {
    if (selectedPersonaId === persona.id) {
      // Re-clicking the selected persona clears the selection entirely.
      setSearchParams({});
      return;
    }
    setSearchParams({ persona: persona.id });
  }

  function selectJourney(journey: Journey): void {
    if (selectedJourneyId === journey.id) {
      // Re-clicking the selected journey closes the detail view but keeps the persona selected.
      setSearchParams({ persona: journey.personaId });
      return;
    }
    setSearchParams({ persona: journey.personaId, journey: journey.id });
  }

  return (
    <div>
      <PageHeader
        title="Personas & Journeys"
        description="Recovered from personas docs, support tickets, and the code paths their goals map to."
      />

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Personas</h2>
      {allPersonas.length === 0 ? (
        <Card className="mb-8">
          <CardContent className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Users className="h-4 w-4" /> No personas have been recovered for this system yet.
          </CardContent>
        </Card>
      ) : (
        <div className="mb-8 grid grid-cols-1 gap-4 md:grid-cols-3">
          {allPersonas.map((persona) => {
            const isSelected = persona.id === selectedPersonaId;
            return (
              <Card
                key={persona.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => selectPersona(persona)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectPersona(persona);
                  }
                }}
                className={cn(
                  'cursor-pointer select-none transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:border-primary/40',
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle>{persona.name}</CardTitle>
                      <CardDescription>{persona.role}</CardDescription>
                    </div>
                    <ConfidenceBadge
                      level={persona.metadata.confidence.level}
                      score={persona.metadata.confidence.score}
                    />
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      <Target className="h-3.5 w-3.5" /> Goals
                    </div>
                    <ul className="list-inside list-disc text-sm text-foreground">
                      {persona.goals.map((goal) => (
                        <li key={goal}>{goal}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      <AlertCircle className="h-3.5 w-3.5" /> Pain points
                    </div>
                    <ul className="list-inside list-disc text-sm text-foreground">
                      {persona.painPoints.map((point) => (
                        <li key={point}>{point}</li>
                      ))}
                    </ul>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {selectedPersona ? (
        <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Associated Journeys</CardTitle>
              <CardDescription>Journeys {selectedPersona.name} experiences.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {associatedJourneys.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-muted-foreground">
                  No journeys have been recovered for this persona yet.
                </p>
              ) : (
                <div>
                  {associatedJourneys.map((journey) => {
                    const isSelected = journey.id === selectedJourneyId;
                    return (
                      <button
                        key={journey.id}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => selectJourney(journey)}
                        className={cn(
                          'flex w-full items-center justify-between gap-2 border-b border-border px-4 py-2.5 text-left text-sm last:border-0 hover:bg-muted/50',
                          isSelected && 'bg-primary/5 font-medium',
                        )}
                      >
                        <span className="flex items-center gap-2">
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-primary" />
                          {journey.name}
                        </span>
                        <ConfidenceBadge
                          level={journey.metadata.confidence.level}
                          score={journey.metadata.confidence.score}
                        />
                      </button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {selectedJourney && journeyDetail ? (
            <JourneyDetailPanel
              journey={selectedJourney}
              persona={allPersonas.find((p) => p.id === selectedJourney.personaId)}
              data={journeyDetail}
              allDeploymentNodes={allDeploymentNodes}
            />
          ) : (
            <Card>
              <CardContent className="flex items-center py-6 text-sm text-muted-foreground">
                Select a journey to see its detail.
              </CardContent>
            </Card>
          )}
        </div>
      ) : null}

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
        {selectedPersona ? 'All Journeys' : 'Journeys'}
      </h2>
      {allJourneys.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No journeys have been recovered for this system yet.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {allJourneys.map((journey) => {
            const isSelected = journey.id === selectedJourneyId;
            return (
              <Card
                key={journey.id}
                role="button"
                tabIndex={0}
                aria-pressed={isSelected}
                onClick={() => selectJourney(journey)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    selectJourney(journey);
                  }
                }}
                className={cn(
                  'cursor-pointer select-none transition-colors',
                  isSelected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary'
                    : 'hover:border-primary/40',
                )}
              >
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <CardTitle>{journey.name}</CardTitle>
                      <CardDescription>
                        Persona: {personaName(journey.personaId)} · {journey.description}
                      </CardDescription>
                    </div>
                    <ConfidenceBadge
                      level={journey.metadata.confidence.level}
                      score={journey.metadata.confidence.score}
                    />
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                    Realised by execution flow
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {journey.flowIds.map((flowId) => (
                      <Badge key={flowId} variant="outline">
                        {flowName(flowId)}
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
