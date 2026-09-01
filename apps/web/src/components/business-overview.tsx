import { useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { Boxes, Briefcase, Route, Server, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { BusinessCapability, C4Node, Journey, Persona } from '../data/types.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card.js';
import { Badge } from './ui/badge.js';
import { cn } from '../lib/utils.js';

export type BusinessOverviewCategory =
  'personas' | 'journeys' | 'capabilities' | 'entities' | 'services';

interface BusinessOverviewSectionProps {
  personas: Persona[];
  journeys: Journey[];
  capabilities: BusinessCapability[];
  /** Domain entity names, already flattened + deduplicated across every domain's aggregates. */
  entityNames: string[];
  /** Real architecture containers (Services) — "APIs" is deliberately absent: no real API/Interface data source exists anywhere in this app (see docs/phase-5/README.md and lib/journey-detail.ts), so it is never shown rather than fabricated. */
  services: C4Node[];
}

interface OverviewCard {
  key: BusinessOverviewCategory;
  label: string;
  icon: LucideIcon;
  count: number;
  names: string[];
  /** Where "View all" navigates — omitted when no page shows this category yet (business capabilities). */
  viewAllHref?: string;
}

const PREVIEW_LIMIT = 8;

/**
 * PC-01 — the client-facing Business Overview: Personas / Journeys /
 * Business Capabilities / Domain Entities as four selectable count cards.
 * Counts and names come from `dataProvider` (real API response length where
 * a backend route exists, mock fixture length otherwise) — never hard-coded.
 * Selecting a card previews its real items and, where a detail page already
 * exists, links to it. Full drill-down (Persona -> Journey -> Detail ->
 * Correlation) is PC-02/PC-03 — this only prepares the selection surface.
 */
export function BusinessOverviewSection({
  personas,
  journeys,
  capabilities,
  entityNames,
  services,
}: BusinessOverviewSectionProps): JSX.Element {
  const [selected, setSelected] = useState<BusinessOverviewCategory | null>(null);

  const cards: OverviewCard[] = [
    {
      key: 'personas',
      label: 'Personas',
      icon: Users,
      count: personas.length,
      names: personas.map((p) => p.name),
      viewAllHref: '/personas',
    },
    {
      key: 'journeys',
      label: 'Journeys',
      icon: Route,
      count: journeys.length,
      names: journeys.map((j) => j.name),
      viewAllHref: '/personas',
    },
    {
      key: 'capabilities',
      label: 'Business Capabilities',
      icon: Briefcase,
      count: capabilities.length,
      names: capabilities.map((c) => c.name),
    },
    {
      key: 'entities',
      label: 'Domain Entities',
      icon: Boxes,
      count: entityNames.length,
      names: entityNames,
      viewAllHref: '/domains',
    },
    {
      key: 'services',
      label: 'Services',
      icon: Server,
      count: services.length,
      names: services.map((s) => s.name),
      viewAllHref: '/architecture',
    },
  ];

  const active = cards.find((card) => card.key === selected);

  function toggle(key: BusinessOverviewCategory): void {
    setSelected((current) => (current === key ? null : key));
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    key: BusinessOverviewCategory,
  ): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      toggle(key);
    }
  }

  return (
    <div className="mb-6">
      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Business Overview</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((card) => {
          const Icon = card.icon;
          const isSelected = card.key === selected;
          return (
            <Card
              key={card.key}
              role="button"
              tabIndex={0}
              aria-pressed={isSelected}
              onClick={() => toggle(card.key)}
              onKeyDown={(event) => handleKeyDown(event, card.key)}
              className={cn(
                'cursor-pointer select-none transition-colors',
                isSelected
                  ? 'border-primary bg-primary/5 ring-1 ring-primary'
                  : 'hover:border-primary/40',
              )}
            >
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5" /> {card.label}
                </CardDescription>
                <CardTitle className="text-2xl">{card.count}</CardTitle>
              </CardHeader>
            </Card>
          );
        })}
      </div>

      {active ? (
        <Card className="mt-3">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>{active.label}</CardTitle>
              {active.viewAllHref ? (
                <Link
                  to={active.viewAllHref}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  View all →
                </Link>
              ) : null}
            </div>
            <CardDescription>
              {active.count === 0
                ? 'None recovered for this system yet.'
                : `${active.count} recovered so far.`}
            </CardDescription>
          </CardHeader>
          {active.count > 0 ? (
            <CardContent className="flex flex-wrap gap-1.5">
              {active.names.slice(0, PREVIEW_LIMIT).map((name) => (
                <Badge key={name} variant="outline">
                  {name}
                </Badge>
              ))}
              {active.names.length > PREVIEW_LIMIT ? (
                <Badge variant="secondary">+{active.names.length - PREVIEW_LIMIT} more</Badge>
              ) : null}
            </CardContent>
          ) : null}
        </Card>
      ) : null}
    </div>
  );
}
