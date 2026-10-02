import { Link } from 'react-router-dom';
import { Cloud, Cpu, ExternalLink, Plug, Server, Waypoints } from 'lucide-react';
import type { DeploymentNode, Journey, Persona } from '../data/index.js';
import type { JourneyDetailData } from '../lib/journey-detail.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.js';
import { Badge } from './ui/badge.js';
import { ConfidenceBadge } from './confidence-badge.js';
import { ProvenanceList } from './provenance-list.js';
import { DisclosureSection } from './disclosure-section.js';

import type { JSX } from 'react';

function EmptyNote({ children }: { children: string }): JSX.Element {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function environmentName(
  deploymentNodes: readonly DeploymentNode[],
  environmentId?: string,
): string | undefined {
  return deploymentNodes.find((n) => n.kind === 'environment' && n.id === environmentId)?.name;
}

interface JourneyDetailPanelProps {
  journey: Journey;
  persona: Persona | undefined;
  data: JourneyDetailData;
  /** Every deployment node (environments + instances) — needed only to resolve an instance's environment name for display. */
  allDeploymentNodes: readonly DeploymentNode[];
}

/**
 * PC-03 — the expandable Journey Detail: Persona shown plainly, everything
 * else behind progressive-disclosure sections so the client can understand
 * the journey in seconds and only dig into technical layers on demand.
 * Entity States and APIs are intentionally absent — see journey-detail.ts's
 * header comment for why (no real data source for either exists anywhere
 * in this app; inventing one would violate "do not invent missing
 * information").
 *
 * PC-08 — every Business Concept / Domain Entity / Service / Technology /
 * Deployment / Integration below is a real clickable link into the
 * Correlation Explorer (`/correlation?kind=<kind>&id=<id>`), using the
 * EXACT SAME id each item already carries from `lib/journey-detail.ts` —
 * the same real object `lib/correlation.ts`'s graph uses for that kind, so
 * this is never a second, drifting identity scheme. Previously these were
 * informational-only badges/rows with no click affordance; per the PC-08
 * "everything presented as clickable must work" pass, they're now real
 * navigable entry points into the same underlying knowledge graph.
 */
export function JourneyDetailPanel({
  journey,
  persona,
  data,
  allDeploymentNodes,
}: JourneyDetailPanelProps): JSX.Element {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle>{journey.name}</CardTitle>
            <CardDescription>{journey.description}</CardDescription>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <ConfidenceBadge
              level={journey.metadata.confidence.level}
              score={journey.metadata.confidence.score}
            />
          </div>
        </div>
        <Link
          to={`/correlation?kind=journey&id=${journey.id}`}
          className="inline-flex w-fit items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Waypoints className="h-3 w-3" /> See how this connects to the rest of the system
        </Link>
      </CardHeader>
      <CardContent>
        <div className="mb-3 border-b border-border pb-3">
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Persona</div>
          <div className="text-sm font-medium">{persona?.name ?? journey.personaId}</div>
        </div>

        <DisclosureSection title="Journey Steps" count={data.steps.length} defaultOpen>
          {data.steps.length === 0 ? (
            <EmptyNote>No steps recorded for this journey.</EmptyNote>
          ) : (
            <ol className="space-y-1.5">
              {data.steps.map(({ step, flowName }, index) => (
                <li key={step.id} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 shrink-0 font-mono text-xs text-muted-foreground">
                    {index + 1}.
                  </span>
                  <div>
                    <div className="font-medium text-foreground">{step.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {step.description}
                      {data.steps.some((s) => s.flowName !== flowName) ? ` · ${flowName}` : ''}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </DisclosureSection>

        <DisclosureSection
          title="Business Concepts"
          count={data.businessConcepts.length}
          defaultOpen
        >
          {data.businessConcepts.length === 0 ? (
            <EmptyNote>No business concepts traced for this journey.</EmptyNote>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.businessConcepts.map((concept) => (
                <Link key={concept.id} to={`/correlation?kind=concept&id=${concept.id}`}>
                  <Badge
                    variant="outline"
                    title={`Domain: ${concept.domainName}`}
                    className="cursor-pointer hover:bg-muted"
                  >
                    {concept.name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </DisclosureSection>

        <DisclosureSection title="Domain Entities" count={data.domainEntityNames.length}>
          {data.domainEntityNames.length === 0 ? (
            <EmptyNote>No domain entities traced for this journey.</EmptyNote>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.domainEntityNames.map((name) => (
                <Link key={name} to={`/correlation?kind=entity&id=${encodeURIComponent(name)}`}>
                  <Badge variant="secondary" className="cursor-pointer hover:brightness-95">
                    {name}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </DisclosureSection>

        <DisclosureSection title="Services" count={data.services.length}>
          {data.services.length === 0 ? (
            <EmptyNote>No services traced for this journey.</EmptyNote>
          ) : (
            <ul className="space-y-1.5">
              {data.services.map((service) => (
                <li key={service.id}>
                  <Link
                    to={`/correlation?kind=service&id=${service.id}`}
                    className="flex items-center gap-2 text-sm text-foreground hover:text-primary hover:underline"
                  >
                    <Server className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {service.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DisclosureSection>

        <DisclosureSection title="Technology" count={data.technologies.length}>
          {data.technologies.length === 0 ? (
            <EmptyNote>No technology recorded for this journey's services.</EmptyNote>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.technologies.map((tech) => (
                <Link key={tech} to={`/correlation?kind=technology&id=${encodeURIComponent(tech)}`}>
                  <Badge variant="outline" className="cursor-pointer gap-1 hover:bg-muted">
                    <Cpu className="h-3 w-3" /> {tech}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </DisclosureSection>

        <DisclosureSection title="Deployment" count={data.deploymentInstances.length}>
          {data.deploymentInstances.length === 0 ? (
            <EmptyNote>No deployment information traced for this journey.</EmptyNote>
          ) : (
            <ul className="space-y-1.5">
              {data.deploymentInstances.map((instance) => (
                <li key={instance.id}>
                  <Link
                    to={`/correlation?kind=deployment&id=${instance.id}`}
                    className="flex items-center gap-2 text-sm text-foreground hover:text-primary hover:underline"
                  >
                    <Cloud className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {instance.name}
                    <span className="text-xs text-muted-foreground">
                      {[
                        instance.runtime,
                        environmentName(allDeploymentNodes, instance.environmentId),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DisclosureSection>

        <DisclosureSection title="Integrations" count={data.integrations.length}>
          {data.integrations.length === 0 ? (
            <EmptyNote>No integrations traced for this journey.</EmptyNote>
          ) : (
            <ul className="space-y-1.5">
              {data.integrations.map((integration) => (
                <li key={integration.id}>
                  <Link
                    to={`/correlation?kind=integration&id=${integration.id}`}
                    className="flex items-center gap-2 text-sm text-foreground hover:text-primary hover:underline"
                  >
                    <Plug className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    {integration.name}
                    <span className="text-xs text-muted-foreground">
                      {integration.direction} · {integration.counterpart}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DisclosureSection>

        <DisclosureSection title="Evidence / Technical Trace" count={data.provenance.length}>
          {data.provenance.length === 0 ? (
            <EmptyNote>No technical evidence traced for this journey.</EmptyNote>
          ) : (
            <ProvenanceList provenance={[...data.provenance]} />
          )}
        </DisclosureSection>

        {journey.flowIds.length > 0 ? (
          <div className="flex flex-wrap gap-1.5 pt-3">
            {journey.flowIds.map((flowId) => (
              <Link key={flowId} to={`/flows?flow=${flowId}`}>
                <Badge variant="outline" className="cursor-pointer gap-1 hover:bg-muted">
                  Open execution flow <ExternalLink className="h-3 w-3" />
                </Badge>
              </Link>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
