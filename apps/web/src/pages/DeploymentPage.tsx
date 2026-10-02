import { useMemo, useState, type JSX } from 'react';
import ReactFlow, { Background, Controls, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { dataProvider, type DeploymentNode } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge, CONFIDENCE_COLORS } from '../components/confidence-badge.js';
import { ProvenanceList } from '../components/provenance-list.js';
import { FullscreenDiagram } from '../components/fullscreen-diagram.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';

const COLUMNS = 4;
const CELL_W = 190;
const CELL_H = 80;
const GAP = 16;
const PADDING_TOP = 48;
const PADDING_SIDE = 20;

function buildFlowNodes(deploymentNodes: DeploymentNode[]): Node[] {
  const environments = deploymentNodes.filter((n) => n.kind === 'environment');
  const nodes: Node[] = [];
  let yOffset = 0;

  for (const env of environments) {
    const instances = deploymentNodes.filter(
      (n) => n.kind === 'instance' && n.environmentId === env.id,
    );
    const rows = Math.ceil(instances.length / COLUMNS);
    const width = PADDING_SIDE * 2 + COLUMNS * CELL_W + (COLUMNS - 1) * GAP;
    const height = PADDING_TOP + rows * CELL_H + (rows - 1) * GAP + 20;

    nodes.push({
      id: env.id,
      position: { x: 0, y: yOffset },
      data: { label: env.name },
      style: {
        width,
        height,
        background: 'rgba(148, 163, 184, 0.08)',
        border: '1.5px dashed #94a3b8',
        borderRadius: 12,
        fontSize: 12,
        fontWeight: 600,
        textAlign: 'left',
        padding: 8,
      },
    });

    instances.forEach((inst, i) => {
      const col = i % COLUMNS;
      const row = Math.floor(i / COLUMNS);
      nodes.push({
        id: inst.id,
        parentNode: env.id,
        extent: 'parent',
        position: {
          x: PADDING_SIDE + col * (CELL_W + GAP),
          y: PADDING_TOP + row * (CELL_H + GAP),
        },
        data: {
          label: (
            <div className="text-left">
              <div className="flex items-center gap-1.5 text-xs font-semibold">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: CONFIDENCE_COLORS[inst.metadata.confidence.level] }}
                />
                {inst.name}
              </div>
              <div className="text-[10px] text-muted-foreground">{inst.runtime}</div>
              <div className="text-[10px] text-muted-foreground">{inst.scale}</div>
            </div>
          ),
        },
        style: {
          width: CELL_W,
          height: CELL_H,
          borderRadius: 8,
          border: '1px solid hsl(214 32% 91%)',
          background: 'white',
          padding: 8,
        },
      });
    });

    yOffset += height + 40;
  }

  return nodes;
}

export function DeploymentPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getDeploymentTopology(), []);
  const [selected, setSelected] = useState<DeploymentNode | null>(null);

  const flowNodes = useMemo(() => (data ? buildFlowNodes(data) : []), [data]);

  if (loading) return <LoadingState label="Loading deployment topology…" />;
  if (error) return <ErrorState message={error.message} />;

  return (
    <div>
      <PageHeader
        title="Deployment"
        description="Where each container actually runs, recovered from infrastructure-as-code — not a target-state diagram."
      />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <FullscreenDiagram className="h-[600px] rounded-lg border border-border lg:col-span-2">
          {(isFullscreen) => (
            <ReactFlow
              key={isFullscreen ? 'fs' : 'normal'}
              nodes={flowNodes}
              edges={[]}
              onNodeClick={(_, node) => {
                const found = data?.find((n) => n.id === node.id) ?? null;
                if (found?.kind === 'instance') setSelected(found);
              }}
              fitView
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
            >
              <Background />
              <Controls />
            </ReactFlow>
          )}
        </FullscreenDiagram>

        <Card>
          <CardHeader>
            <CardTitle>{selected ? selected.name : 'Select an instance'}</CardTitle>
          </CardHeader>
          <CardContent>
            {selected ? (
              <div className="space-y-4">
                <div className="text-xs">
                  <span className="font-medium">Runtime: </span>
                  {selected.runtime}
                </div>
                <div className="text-xs">
                  <span className="font-medium">Scale: </span>
                  {selected.scale}
                </div>
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
                Click any instance in the diagram to see its runtime, scale, confidence, and
                provenance.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
