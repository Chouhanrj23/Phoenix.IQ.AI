import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { ArrowLeft, Search, Waypoints } from 'lucide-react';
import { dataProvider, type ReviewItem } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { radialLayout } from '../lib/radial-layout.js';
import {
  buildCorrelationGraph,
  getRelated,
  nodeKey,
  reviewMatchesFor,
  reviewStatusFor,
  CORRELATION_KIND_LABEL,
  type CorrelationGraph,
  type CorrelationKind,
  type CorrelationNode,
} from '../lib/correlation.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { FullscreenDiagram } from '../components/fullscreen-diagram.js';
import { ObjectDetailPanel } from '../components/object-detail-panel.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';

const MAX_SEARCH_RESULTS = 10;

/**
 * PC-07 — representative starting points shown on the empty landing state,
 * so a client sees a few real, clickable examples immediately instead of a
 * blank "type something" prompt. One node per kind, most business-relevant
 * kinds first; a kind with zero real nodes simply contributes nothing.
 */
const SUGGESTION_KINDS: readonly CorrelationKind[] = [
  'persona',
  'journey',
  'capability',
  'service',
];

function nodeLabel(node: CorrelationNode, isCenter: boolean): JSX.Element {
  return (
    <div className={cn('text-left', isCenter && 'font-semibold')}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {CORRELATION_KIND_LABEL[node.kind]}
      </div>
      <div className="text-xs">{node.label}</div>
    </div>
  );
}

/**
 * PC-04 — Cross-Correlation View. One graph (`lib/correlation.ts`), built
 * from the same real relationships PC-01/02/03 already established (never a
 * fabricated one), traversable from ANY object it contains: Persona,
 * Journey, Business Capability, Business Concept, Domain Entity, Service,
 * Technology, Deployment, Integration. Entity State and API are absent --
 * see `lib/correlation.ts`'s header for why (no real data source for either
 * exists anywhere in this app).
 *
 * The diagram shows only the selected object plus its IMMEDIATE (1-hop)
 * neighbors by default (never the whole graph); clicking any neighbor
 * re-centers the view on it, which is how "drill-down"/"expansion" works
 * here -- each step is genuinely selectable, and re-centering pushes a new
 * browser history entry (`setSearchParams`), so the existing back button
 * (and this page's own "Back" affordance) navigates correctly.
 */
export function CorrelationExplorerPage(): JSX.Element {
  const personas = useAsync(() => dataProvider.getPersonas(), []);
  const journeys = useAsync(() => dataProvider.getJourneys(), []);
  const flows = useAsync(() => dataProvider.getExecutionFlows(), []);
  const domains = useAsync(() => dataProvider.getDomains(), []);
  const capabilities = useAsync(() => dataProvider.getBusinessCapabilities(), []);
  const architecture = useAsync(() => dataProvider.getArchitecture('container'), []);
  const deployment = useAsync(() => dataProvider.getDeploymentTopology(), []);
  const integrations = useAsync(() => dataProvider.getIntegrations(), []);
  const reviewItems = useAsync(() => dataProvider.getReviewItems(), []);

  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  /**
   * PC-HR-05 — real, working Confirm/Correct actions in the detail panel,
   * mirroring `ReviewPage.tsx`'s own local-state pattern exactly. There is
   * no write method anywhere on `OkfDataProvider`, so this is genuinely
   * local to this page's session — never persisted, and never pretended to
   * be (see the panel's own disclaimer text).
   */
  const [reviewOverrides, setReviewOverrides] = useState<Record<string, ReviewItem>>({});

  const loading =
    personas.loading ||
    journeys.loading ||
    flows.loading ||
    domains.loading ||
    capabilities.loading ||
    architecture.loading ||
    deployment.loading ||
    integrations.loading ||
    reviewItems.loading;
  const error =
    personas.error ??
    journeys.error ??
    flows.error ??
    domains.error ??
    capabilities.error ??
    architecture.error ??
    deployment.error ??
    integrations.error ??
    reviewItems.error;

  /** Real review items, with any in-session Confirm/Correct decisions applied on top — never a second data source, just the same list with local overrides layered in. */
  const effectiveReviewItems = useMemo(
    () => (reviewItems.data ?? []).map((item) => reviewOverrides[item.id] ?? item),
    [reviewItems.data, reviewOverrides],
  );

  const graph: CorrelationGraph | null = useMemo(() => {
    if (loading || error) return null;
    return buildCorrelationGraph({
      personas: personas.data ?? [],
      journeys: journeys.data ?? [],
      flows: flows.data ?? [],
      domains: domains.data ?? [],
      capabilities: capabilities.data ?? [],
      containers: architecture.data?.nodes ?? [],
      deploymentNodes: deployment.data ?? [],
      integrations: integrations.data ?? [],
      reviewItems: effectiveReviewItems,
    });
  }, [
    loading,
    error,
    personas.data,
    journeys.data,
    flows.data,
    domains.data,
    capabilities.data,
    architecture.data,
    deployment.data,
    integrations.data,
    effectiveReviewItems,
  ]);

  const centerKey = useMemo(() => {
    const kind = searchParams.get('kind');
    const id = searchParams.get('id');
    return kind && id ? nodeKey(kind as CorrelationKind, id) : null;
  }, [searchParams]);

  const related = useMemo(() => {
    if (!graph || !centerKey) return undefined;
    return getRelated(graph, centerKey);
  }, [graph, centerKey]);

  const centerReviewStatus = useMemo(() => {
    if (!related) return 'none' as const;
    return reviewStatusFor(effectiveReviewItems, related.center.label);
  }, [related, effectiveReviewItems]);

  const centerPendingReviewItem = useMemo(() => {
    if (!related || centerReviewStatus !== 'pending') return undefined;
    return reviewMatchesFor(effectiveReviewItems, related.center.label).find(
      (item) => item.status === 'pending',
    );
  }, [related, centerReviewStatus, effectiveReviewItems]);

  /** True only when the CURRENT user actually confirmed/corrected this object in this session — distinct from an object that simply started out confirmed/corrected in the underlying data. */
  const centerReviewIsSessionOverride = useMemo(() => {
    if (!related) return false;
    return reviewMatchesFor(effectiveReviewItems, related.center.label).some(
      (item) => item.id in reviewOverrides,
    );
  }, [related, effectiveReviewItems, reviewOverrides]);

  function handleConfirmReview(item: ReviewItem): void {
    setReviewOverrides((prev) => ({ ...prev, [item.id]: { ...item, status: 'confirmed' } }));
  }

  function handleCorrectReview(item: ReviewItem, value: string): void {
    setReviewOverrides((prev) => ({
      ...prev,
      [item.id]: { ...item, status: 'corrected', currentValue: value },
    }));
  }

  const searchResults = useMemo(() => {
    if (!graph) return [];
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return graph.nodes
      .filter((n) => n.label.toLowerCase().includes(q))
      .slice(0, MAX_SEARCH_RESULTS);
  }, [graph, query]);

  const suggestions = useMemo(() => {
    if (!graph) return [];
    return SUGGESTION_KINDS.map((kind) => graph.nodes.find((n) => n.kind === kind)).filter(
      (n): n is CorrelationNode => n !== undefined,
    );
  }, [graph]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph || !related) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };
    const neighborIds = [...related.immediateNeighborKeys];
    const ids = [related.center.key, ...neighborIds];
    const positions = radialLayout(ids, related.center.key, 220);

    const flowNodes: Node[] = ids.map((id) => {
      const node = graph.nodesByKey.get(id)!;
      const isCenter = id === related.center.key;
      return {
        id,
        position: positions[id] ?? { x: 0, y: 0 },
        data: { label: nodeLabel(node, isCenter) },
        style: {
          width: 170,
          borderRadius: 8,
          border: isCenter ? '2px solid hsl(var(--primary))' : '1px solid hsl(214 32% 91%)',
          background: isCenter ? 'hsl(var(--primary) / 0.06)' : 'white',
          padding: 8,
        },
      };
    });

    const flowEdges: Edge[] = graph.edges
      .filter(
        (e) =>
          (e.from === related.center.key && neighborIds.includes(e.to)) ||
          (e.to === related.center.key && neighborIds.includes(e.from)),
      )
      .map((e) => ({
        id: `${e.from}->${e.to}`,
        source: e.from,
        target: e.to,
        label: e.relationship,
        labelStyle: { fontSize: 10 },
        style: { stroke: '#94a3b8' },
      }));

    return { flowNodes, flowEdges };
  }, [graph, related]);

  if (loading) return <LoadingState label="Loading knowledge graph…" />;
  if (error) return <ErrorState message={error.message} />;
  if (!graph)
    return <ErrorState message="Unable to build the correlation graph from the current data." />;

  function selectNode(node: CorrelationNode): void {
    setSearchParams({ kind: node.kind, id: node.id });
    setQuery('');
    setSearchOpen(false);
  }

  return (
    <div>
      <PageHeader
        title="Cross-Correlation"
        description="Personas, journeys, business capabilities, domain entities, services, technology, deployment, and integrations are different views of the same underlying knowledge graph. Pick anything below to see how it connects to everything else."
      />

      <div className="mb-4 flex items-center gap-2">
        {centerKey ? (
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Button>
        ) : null}
        <div className="relative flex-1">
          <div className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5">
            <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSearchOpen(true);
              }}
              onFocus={() => setSearchOpen(true)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setSearchOpen(false);
                if (e.key === 'Enter' && searchResults[0]) selectNode(searchResults[0]);
              }}
              placeholder="Search for a persona, journey, capability, entity, service, technology, deployment, or integration…"
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          {searchOpen && query.trim() ? (
            <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
              {searchResults.length === 0 ? (
                <div className="px-3 py-3 text-sm text-muted-foreground">
                  No matches for "{query}".
                </div>
              ) : (
                searchResults.map((node) => (
                  <button
                    key={node.key}
                    type="button"
                    onClick={() => selectNode(node)}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50"
                  >
                    <span>{node.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {CORRELATION_KIND_LABEL[node.kind]}
                    </span>
                  </button>
                ))
              )}
            </div>
          ) : null}
        </div>
      </div>

      {!related ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-sm text-muted-foreground">
            <Waypoints className="h-6 w-6" />
            Search above and pick an item to see everything it connects to.
            {suggestions.length > 0 ? (
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <span className="w-full text-xs">Or start with:</span>
                {suggestions.map((node) => (
                  <button key={node.key} type="button" onClick={() => selectNode(node)}>
                    <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                      {node.label}
                      <span className="ml-1 text-muted-foreground">
                        · {CORRELATION_KIND_LABEL[node.kind]}
                      </span>
                    </Badge>
                  </button>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{related.center.label}</CardTitle>
                <CardDescription>
                  {CORRELATION_KIND_LABEL[related.center.kind]}
                  {related.center.secondary ? ` · ${related.center.secondary}` : ''} — selected
                  object highlighted below, its immediate connections around it.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FullscreenDiagram className="h-[420px] rounded-lg border border-border">
                  {(isFullscreen) => (
                    <ReactFlow
                      key={isFullscreen ? 'fs' : 'normal'}
                      nodes={flowNodes}
                      edges={flowEdges}
                      onNodeClick={(_, flowNode) => {
                        const found = graph.nodesByKey.get(flowNode.id);
                        if (found) selectNode(found);
                      }}
                      fitView
                      proOptions={{ hideAttribution: true }}
                      nodesDraggable={false}
                    >
                      <Background />
                      <Controls showInteractive={false} />
                    </ReactFlow>
                  )}
                </FullscreenDiagram>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="max-h-[600px] overflow-y-auto pt-4">
              <ObjectDetailPanel
                node={related.center}
                reviewStatus={centerReviewStatus}
                reviewIsSessionOverride={centerReviewIsSessionOverride}
                {...(centerPendingReviewItem ? { pendingReviewItem: centerPendingReviewItem } : {})}
                onConfirmReview={handleConfirmReview}
                onCorrectReview={handleCorrectReview}
                groups={related.groups}
                immediateCount={related.immediateNeighborKeys.size}
                onSelect={selectNode}
              />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
