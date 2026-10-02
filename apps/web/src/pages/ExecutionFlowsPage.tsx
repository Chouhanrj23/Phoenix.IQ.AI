import { useEffect, useMemo, useState, type JSX } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactFlow, { Background, Controls, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { dataProvider, type ExecutionFlow, type FlowStep } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge, CONFIDENCE_COLORS } from '../components/confidence-badge.js';
import { ProvenanceList } from '../components/provenance-list.js';
import { FullscreenDiagram } from '../components/fullscreen-diagram.js';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '../components/ui/card.js';
import { Button } from '../components/ui/button.js';
import { Badge } from '../components/ui/badge.js';
import { cn } from '../lib/utils.js';
import { pairwise } from '../lib/pairwise.js';

function stepLabel(step: FlowStep, index: number): JSX.Element {
  return (
    <div className="text-left">
      <div className="flex items-center gap-1.5 text-xs font-semibold">
        <span
          className="h-2 w-2 shrink-0 rounded-full"
          style={{ backgroundColor: CONFIDENCE_COLORS[step.metadata.confidence.level] }}
        />
        {index + 1}. {step.name}
      </div>
    </div>
  );
}

function FlowDiagram({
  flow,
  onSelectStep,
}: {
  flow: ExecutionFlow;
  onSelectStep: (step: FlowStep) => void;
}): JSX.Element {
  const { flowNodes, flowEdges } = useMemo(() => {
    const flowNodes: Node[] = flow.steps.map((step, i) => ({
      id: step.id,
      position: { x: i * 220, y: 0 },
      data: { label: stepLabel(step, i) },
      style: {
        width: 190,
        borderRadius: 8,
        border: '1px solid hsl(214 32% 91%)',
        background: 'white',
        padding: 8,
      },
    }));
    const flowEdges: Edge[] = pairwise(flow.steps).map(([prev, curr]) => ({
      id: `${prev.id}-${curr.id}`,
      source: prev.id,
      target: curr.id,
      style: { stroke: '#94a3b8' },
    }));
    return { flowNodes, flowEdges };
  }, [flow]);

  return (
    <FullscreenDiagram className="h-64 rounded-lg border border-border">
      {(isFullscreen) => (
        <ReactFlow
          key={isFullscreen ? 'fs' : 'normal'}
          nodes={flowNodes}
          edges={flowEdges}
          onNodeClick={(_, node) => {
            const step = flow.steps.find((s) => s.id === node.id);
            if (step) onSelectStep(step);
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
  );
}

export function ExecutionFlowsPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getExecutionFlows(), []);
  const [searchParams] = useSearchParams();
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const [selectedStep, setSelectedStep] = useState<FlowStep | null>(null);

  useEffect(() => {
    const flowParam = searchParams.get('flow');
    if (flowParam) setSelectedFlowId(flowParam);
  }, [searchParams]);

  if (loading) return <LoadingState label="Loading execution flows…" />;
  if (error) return <ErrorState message={error.message} />;

  const flows = data ?? [];
  const activeFlow = flows.find((f) => f.id === selectedFlowId) ?? flows[0] ?? null;

  return (
    <div>
      <PageHeader
        title="Execution Flows"
        description="Recovered step-by-step flows, each step tied to the entities it reads and writes."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        {flows.map((flow) => (
          <Button
            key={flow.id}
            variant={activeFlow?.id === flow.id ? 'default' : 'outline'}
            size="sm"
            onClick={() => {
              setSelectedFlowId(flow.id);
              setSelectedStep(null);
            }}
          >
            {flow.name}
          </Button>
        ))}
      </div>

      {activeFlow ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-3 lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle>{activeFlow.name}</CardTitle>
                <CardDescription>
                  {activeFlow.description} · Triggered from {activeFlow.triggerScreen}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <FlowDiagram flow={activeFlow} onSelectStep={setSelectedStep} />
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{selectedStep ? selectedStep.name : 'Select a step'}</CardTitle>
            </CardHeader>
            <CardContent>
              {selectedStep ? (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">{selectedStep.description}</p>
                  <ConfidenceBadge
                    level={selectedStep.metadata.confidence.level}
                    score={selectedStep.metadata.confidence.score}
                  />
                  {selectedStep.metadata.confidence.rationale ? (
                    <p className="rounded-md bg-muted p-2 text-xs text-muted-foreground">
                      {selectedStep.metadata.confidence.rationale}
                    </p>
                  ) : null}
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Reads
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStep.readsEntities.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        selectedStep.readsEntities.map((e) => (
                          <Badge key={e} variant="outline">
                            {e}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                      Writes
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedStep.writesEntities.length === 0 ? (
                        <span className="text-xs text-muted-foreground">None</span>
                      ) : (
                        selectedStep.writesEntities.map((e) => (
                          <Badge
                            key={e}
                            variant="secondary"
                            className={cn('bg-sky-100 text-sky-800')}
                          >
                            {e}
                          </Badge>
                        ))
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                      Provenance
                    </div>
                    <ProvenanceList provenance={selectedStep.metadata.provenance} />
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Click a step in the diagram to see what it reads, writes, and where it came from.
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
