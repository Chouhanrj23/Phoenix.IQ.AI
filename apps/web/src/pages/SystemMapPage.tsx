import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { ExternalLink, Info } from 'lucide-react';
import { dataProvider } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import {
  buildCorrelationGraph,
  CORRELATION_KIND_LABEL,
  CORRELATION_KIND_LABEL_PLURAL,
  type CorrelationGraph,
  type CorrelationKind,
} from '../lib/correlation.js';
import { countFor, hasRealEdge, LAYER_EDGES, LAYERS, type LayerId } from '../lib/system-map.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { FullscreenDiagram } from '../components/fullscreen-diagram.js';
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
 * PC-05 — Pictorial System Map: the 10-layer Persona -> ... -> Integration
 * business/technical chain as ONE representative box per layer (never one
 * box per real instance -- that is `/correlation`'s job, PC-04), so the
 * canvas never grows past 11 nodes regardless of how much data exists.
 *
 * Reuses PC-04's `buildCorrelationGraph` as its ONLY data source -- the
 * exact same real, already-tested relationships (never a second graph
 * implementation), just aggregated to layer-level counts here instead of
 * per-instance detail. `Business Concept` is shown as its own layer (Phase
 * 5's real intermediate kind between Capability and Entity in the actual
 * graph) even though the ticket's own ASCII sketch abbreviated it away --
 * omitting it would force either a fabricated direct Capability->Entity
 * line or silently merging two genuinely distinct kinds.
 *
 * `Entity State` and `API` are drawn as explicitly UNAVAILABLE layers
 * (dashed, muted, "(0)") -- never silently dropped (the ticket's own target
 * concept lists all 10 layers), but never populated with invented data
 * either. Every layer-to-layer line's "real" vs "dashed" styling is computed
 * directly from whether the underlying graph actually contains an edge
 * between those two kinds -- never hand-asserted.
 */

export function SystemMapPage(): JSX.Element {
  const personas = useAsync(() => dataProvider.getPersonas(), []);
  const journeys = useAsync(() => dataProvider.getJourneys(), []);
  const flows = useAsync(() => dataProvider.getExecutionFlows(), []);
  const domains = useAsync(() => dataProvider.getDomains(), []);
  const capabilities = useAsync(() => dataProvider.getBusinessCapabilities(), []);
  const architecture = useAsync(() => dataProvider.getArchitecture('container'), []);
  const deployment = useAsync(() => dataProvider.getDeploymentTopology(), []);
  const integrations = useAsync(() => dataProvider.getIntegrations(), []);

  const [selectedLayerId, setSelectedLayerId] = useState<LayerId | null>(null);

  const loading =
    personas.loading ||
    journeys.loading ||
    flows.loading ||
    domains.loading ||
    capabilities.loading ||
    architecture.loading ||
    deployment.loading ||
    integrations.loading;
  const error =
    personas.error ??
    journeys.error ??
    flows.error ??
    domains.error ??
    capabilities.error ??
    architecture.error ??
    deployment.error ??
    integrations.error;

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
  ]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!graph) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };

    const flowNodes: Node[] = LAYERS.map((layer) => {
      const count = countFor(graph, layer);
      const isSelected = layer.id === selectedLayerId;
      return {
        id: layer.id,
        position: { x: layer.x, y: layer.y },
        data: {
          label: (
            <div className={cn('text-center', !layer.available && 'opacity-60')}>
              <div className="text-xs font-semibold">{layer.label}</div>
              <div className="text-[10px] text-muted-foreground">
                {layer.available ? `${count} recovered` : 'not yet available'}
              </div>
            </div>
          ),
        },
        style: {
          width: 150,
          borderRadius: 8,
          border: isSelected
            ? '2px solid hsl(var(--primary))'
            : layer.available
              ? '1px solid hsl(214 32% 91%)'
              : '1px dashed hsl(214 15% 75%)',
          background: isSelected
            ? 'hsl(var(--primary) / 0.06)'
            : layer.available
              ? 'white'
              : '#f8fafc',
          padding: 8,
        },
      };
    });

    const flowEdges: Edge[] = LAYER_EDGES.map(({ from, to }) => {
      const real = hasRealEdge(graph, from, to);
      return {
        id: `${from}->${to}`,
        source: from,
        target: to,
        style: real ? { stroke: '#94a3b8' } : { stroke: '#cbd5e1', strokeDasharray: '4 4' },
        animated: false,
      };
    });

    return { flowNodes, flowEdges };
  }, [graph, selectedLayerId]);

  if (loading) return <LoadingState label="Loading system map…" />;
  if (error) return <ErrorState message={error.message} />;
  if (!graph) return <ErrorState message="Unable to build the system map from the current data." />;

  const selectedLayer = LAYERS.find((l) => l.id === selectedLayerId);
  const selectedInstances =
    selectedLayer && selectedLayer.available
      ? graph.nodes
          .filter((n) => n.kind === selectedLayer.id)
          .sort((a, b) => a.label.localeCompare(b.label))
      : [];

  return (
    <div>
      <PageHeader
        title="System Map"
        description="The business and technical layers that make up this system, and how they genuinely connect — one box per layer, not per record. Click a layer to see what's really in it."
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardContent className="pt-4">
              <FullscreenDiagram className="h-[560px] rounded-lg border border-border">
                {(isFullscreen) => (
                  <ReactFlow
                    key={isFullscreen ? 'fs' : 'normal'}
                    nodes={flowNodes}
                    edges={flowEdges}
                    onNodeClick={(_, node) => setSelectedLayerId(node.id as LayerId)}
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
          <CardHeader>
            <CardTitle>{selectedLayer ? selectedLayer.label : 'Select a layer'}</CardTitle>
            {selectedLayer ? (
              <CardDescription>
                {selectedLayer.available
                  ? `${selectedInstances.length} real ${CORRELATION_KIND_LABEL_PLURAL[selectedLayer.id as CorrelationKind].toLowerCase()} recovered.`
                  : 'No data source for this layer exists in the current system yet.'}
              </CardDescription>
            ) : (
              <CardDescription>
                Click any box in the diagram to see its real contents.
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="max-h-[460px] overflow-y-auto">
            {!selectedLayer ? null : !selectedLayer.available ? (
              <div className="flex items-start gap-2 rounded-md bg-muted/50 p-3 text-sm text-muted-foreground">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                {CORRELATION_KIND_LABEL[selectedLayer.id as CorrelationKind] ??
                  selectedLayer.label}{' '}
                is part of the target system model but has no real data anywhere in this system yet
                — shown honestly as empty rather than invented.
              </div>
            ) : selectedInstances.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No{' '}
                {CORRELATION_KIND_LABEL_PLURAL[selectedLayer.id as CorrelationKind].toLowerCase()}{' '}
                recorded for this system yet.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {selectedInstances.map((node) => (
                  <Link
                    key={node.key}
                    to={`/correlation?kind=${node.kind}&id=${encodeURIComponent(node.id)}`}
                  >
                    <Badge variant="outline" className="cursor-pointer gap-1 hover:bg-muted">
                      {node.label} <ExternalLink className="h-3 w-3" />
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
