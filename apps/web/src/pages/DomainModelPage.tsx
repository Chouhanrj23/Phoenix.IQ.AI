import { useMemo, useState, type JSX } from 'react';
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { Info } from 'lucide-react';
import { dataProvider } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { buildDomainErModel, type ErEntityNode } from '../lib/er-model.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge } from '../components/confidence-badge.js';
import { ProvenanceList } from '../components/provenance-list.js';
import { FullscreenDiagram } from '../components/fullscreen-diagram.js';
import { ER_NODE_TYPES } from '../components/er-entity-node.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { cn } from '../lib/utils.js';

const COLUMN_WIDTH = 300;
const ROW_GAP = 28;
const ROW_HEIGHT_PER_FIELD = 22;
const ROW_HEADER_HEIGHT = 46;
const EXTERNAL_NODE_HEIGHT = 54;

export function DomainModelPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getDomains(), []);
  const [activeDomainId, setActiveDomainId] = useState<string | null>(null);
  const [selected, setSelected] = useState<ErEntityNode | null>(null);

  const activeDomain = useMemo(() => {
    if (!data || data.length === 0) return null;
    return data.find((d) => d.id === activeDomainId) ?? data[0];
  }, [data, activeDomainId]);

  const model = useMemo(() => {
    if (!data || !activeDomain) return null;
    return buildDomainErModel(activeDomain, data);
  }, [data, activeDomain]);

  const { flowNodes, flowEdges } = useMemo(() => {
    if (!model) return { flowNodes: [] as Node[], flowEdges: [] as Edge[] };

    const aggregateOrder: string[] = [];
    for (const entity of model.entities) {
      if (!aggregateOrder.includes(entity.aggregateId)) aggregateOrder.push(entity.aggregateId);
    }
    const columnX = new Map(aggregateOrder.map((id, i) => [id, i * COLUMN_WIDTH]));
    const columnY = new Map<string, number>(aggregateOrder.map((id) => [id, 0]));

    const flowNodes: Node[] = model.entities.map((entity) => {
      const x = columnX.get(entity.aggregateId) ?? 0;
      const y = columnY.get(entity.aggregateId) ?? 0;
      const height = ROW_HEADER_HEIGHT + entity.fields.length * ROW_HEIGHT_PER_FIELD;
      columnY.set(entity.aggregateId, y + height + ROW_GAP);
      return {
        id: entity.id,
        type: 'erEntity',
        position: { x, y },
        data: { entity, isSelected: selected?.id === entity.id },
        draggable: false,
      };
    });

    const externalX = aggregateOrder.length * COLUMN_WIDTH;
    const flowExternals: Node[] = model.externals.map((ext, i) => ({
      id: ext.id,
      position: { x: externalX, y: i * (EXTERNAL_NODE_HEIGHT + ROW_GAP) },
      data: {
        label: (
          <div className="text-left">
            <div className="text-[11px] font-medium leading-tight">{ext.entity}</div>
            <div className="text-[9px] text-muted-foreground">in {ext.domainName}</div>
          </div>
        ),
      },
      draggable: false,
      style: {
        width: 180,
        borderRadius: 6,
        border: '1px dashed hsl(214 32% 60%)',
        background: 'transparent',
        padding: 6,
      },
    }));

    const flowEdges: Edge[] = model.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      label: e.label,
      labelStyle: { fontSize: 9 },
      style: { stroke: '#94a3b8' },
    }));

    return { flowNodes: [...flowNodes, ...flowExternals], flowEdges };
  }, [model, selected]);

  if (loading) return <LoadingState label="Loading domain model…" />;
  if (error) return <ErrorState message={error.message} />;
  if (!data || data.length === 0 || !activeDomain || !model) {
    return (
      <div>
        <PageHeader
          title="Domain Model"
          description="Domains and their aggregates, recovered from the data model, source code, and business docs."
        />
        <p className="text-sm text-muted-foreground">No domains recovered yet.</p>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Domain Model"
        description="Domains and their aggregates, recovered from the data model, source code, and business docs — rendered as an entity-relationship diagram."
      />

      <div className="mb-3 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-900">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Domain, aggregate, and entity <em>names</em> are extracted; the field-level schema and
          foreign keys shown below are illustrative, not extracted — Phase 1 only recovers
          aggregate-level entity names (see Gap Analysis).
        </span>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {data.map((domain) => (
          <button key={domain.id} type="button" onClick={() => setActiveDomainId(domain.id)}>
            <Badge variant={domain.id === activeDomain.id ? 'default' : 'outline'}>
              {domain.name}
            </Badge>
          </button>
        ))}
      </div>

      <Card className="mb-4">
        <CardContent className="flex items-center justify-between gap-4 p-4">
          <div>
            <CardTitle className="mb-1">{activeDomain.name}</CardTitle>
            <p className="text-sm text-muted-foreground">{activeDomain.description}</p>
          </div>
          <ConfidenceBadge
            level={activeDomain.metadata.confidence.level}
            score={activeDomain.metadata.confidence.score}
          />
        </CardContent>
      </Card>

      <FullscreenDiagram>
        {(isFullscreen) => (
          <div
            className={cn('grid grid-cols-1 gap-4 pt-12 lg:grid-cols-3', isFullscreen && 'h-full')}
          >
            <div
              className={cn(
                'overflow-hidden rounded-lg border border-border lg:col-span-2',
                isFullscreen ? 'h-full' : 'h-[600px]',
              )}
            >
              <ReactFlow
                key={`${activeDomain.id}-${isFullscreen ? 'fs' : 'normal'}`}
                nodes={flowNodes}
                edges={flowEdges}
                nodeTypes={ER_NODE_TYPES}
                onNodeClick={(_, node) => {
                  const found = model.entities.find((e) => e.id === node.id) ?? null;
                  setSelected(found);
                }}
                fitView
                proOptions={{ hideAttribution: true }}
                nodesDraggable={false}
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </div>

            <Card
              className={cn(
                'flex flex-col overflow-hidden',
                isFullscreen ? 'h-full' : 'max-h-[600px]',
              )}
            >
              <CardHeader className="shrink-0">
                <CardTitle className="text-base leading-snug">
                  {selected ? selected.name : 'Select an entity'}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex-1 space-y-4 overflow-y-auto">
                {selected ? (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{selected.aggregateName} aggregate</Badge>
                      {selected.isAggregateRoot ? <Badge variant="outline">root</Badge> : null}
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
                        Fields
                      </div>
                      <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-1.5">
                        {selected.fields.map((f) => (
                          <div key={f.name} className="contents">
                            <dt className="font-mono text-xs text-foreground">
                              {f.name}
                              {f.pk ? ' (PK)' : ''}
                            </dt>
                            <dd className="text-xs text-muted-foreground">
                              {f.type}
                              {f.fk ? ` — references ${f.fk}` : ''}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </div>

                    {selected.externalRefs.length > 0 ? (
                      <div>
                        <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                          Cross-domain references
                        </div>
                        <ul className="space-y-1">
                          {selected.externalRefs.map((ref) => (
                            <li key={ref.field} className="text-xs text-muted-foreground">
                              {ref.label}{' '}
                              <span className="font-medium text-foreground">{ref.entity}</span> (in{' '}
                              {ref.domainName})
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}

                    <div>
                      <div className="mb-1.5 text-xs font-semibold uppercase text-muted-foreground">
                        Provenance
                      </div>
                      <ProvenanceList provenance={selected.metadata.provenance} />
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Click any entity in the diagram to see its aggregate, confidence, fields, and
                    provenance. Dashed boxes are entities that live in another domain, referenced
                    across the domain boundary.
                  </p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </FullscreenDiagram>
    </div>
  );
}
