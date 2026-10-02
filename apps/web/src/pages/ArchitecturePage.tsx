import { useMemo, useState, type JSX } from 'react';
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { dataProvider, type C4Level, type C4Node } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge, CONFIDENCE_COLORS } from '../components/confidence-badge.js';
import { ProvenanceList } from '../components/provenance-list.js';
import { FullscreenDiagram } from '../components/fullscreen-diagram.js';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { radialLayout } from '../lib/radial-layout.js';
import { cn } from '../lib/utils.js';

const HUB_BY_LEVEL: Record<C4Level, string> = {
  context: 'ctx-aurora',
  container: 'ctr-order-orch',
  component: 'ctr-order-orch',
};

function nodeLabel(node: C4Node): JSX.Element {
  return (
    <div className="text-left">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: CONFIDENCE_COLORS[node.metadata.confidence.level] }}
        />
        {node.name}
      </div>
      {node.technology ? (
        <div className="text-[10px] text-muted-foreground">{node.technology}</div>
      ) : null}
    </div>
  );
}

function Diagram({ level }: { level: C4Level }): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getArchitecture(level), [level]);
  const [selected, setSelected] = useState<C4Node | null>(null);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!data) return { flowNodes: [], flowEdges: [] };
    const positions = radialLayout(
      data.nodes.map((n) => n.id),
      HUB_BY_LEVEL[level],
    );
    const flowNodes: Node[] = data.nodes.map((n) => ({
      id: n.id,
      position: positions[n.id] ?? { x: 0, y: 0 },
      data: { label: nodeLabel(n) },
      style: {
        width: 190,
        borderRadius: 8,
        border: '1px solid hsl(214 32% 91%)',
        background: 'white',
        padding: 8,
      },
    }));
    const flowEdges: Edge[] = data.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      labelStyle: { fontSize: 10 },
      style: { stroke: '#94a3b8' },
      animated: e.metadata.confidence.level === 'low' || e.metadata.confidence.level === 'inferred',
    }));
    return { flowNodes, flowEdges };
  }, [data, level]);

  if (loading) return <LoadingState label="Loading architecture view…" />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <FullscreenDiagram>
      {(isFullscreen) => (
        <div
          className={cn('grid grid-cols-1 gap-4 pt-12 lg:grid-cols-3', isFullscreen && 'h-full')}
        >
          <div
            className={cn(
              'overflow-hidden rounded-lg border border-border lg:col-span-2',
              isFullscreen ? 'h-full' : 'h-[560px]',
            )}
          >
            <ReactFlow
              key={isFullscreen ? 'fs' : 'normal'}
              nodes={flowNodes}
              edges={flowEdges}
              onNodeClick={(_, node) => {
                const found = data?.nodes.find((n) => n.id === node.id) ?? null;
                setSelected(found);
              }}
              fitView
              proOptions={{ hideAttribution: true }}
            >
              <Background />
              <Controls />
              <MiniMap pannable zoomable />
            </ReactFlow>
          </div>

          <Card className={cn(isFullscreen && 'flex h-full flex-col overflow-hidden')}>
            <CardHeader className={cn(isFullscreen && 'shrink-0')}>
              <CardTitle>{selected ? selected.name : 'Select an element'}</CardTitle>
            </CardHeader>
            <CardContent className={cn(isFullscreen && 'flex-1 overflow-y-auto')}>
              {selected ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">{selected.description}</p>
                  {selected.technology ? (
                    <div className="text-xs">
                      <span className="font-medium">Technology: </span>
                      {selected.technology}
                    </div>
                  ) : null}
                  <ConfidenceBadge
                    level={selected.metadata.confidence.level}
                    score={selected.metadata.confidence.score}
                  />
                  {selected.metadata.confidence.rationale ? (
                    <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      {selected.metadata.confidence.rationale}
                    </p>
                  ) : null}
                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      Provenance
                    </div>
                    <ProvenanceList provenance={selected.metadata.provenance} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Click any node in the diagram to see its description, confidence, and provenance —
                  every element traces back to the source it was derived from.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </FullscreenDiagram>
  );
}

export function ArchitecturePage(): JSX.Element {
  return (
    <div>
      <PageHeader
        title="Architecture"
        description="C4 views projected from the knowledge graph. Dashed edges indicate low-confidence or inferred relationships."
      />
      <Tabs defaultValue="context">
        <TabsList>
          <TabsTrigger value="context">Context</TabsTrigger>
          <TabsTrigger value="container">Container</TabsTrigger>
        </TabsList>
        <TabsContent value="context">
          <Diagram level="context" />
        </TabsContent>
        <TabsContent value="container">
          <Diagram level="container" />
        </TabsContent>
      </Tabs>
    </div>
  );
}
