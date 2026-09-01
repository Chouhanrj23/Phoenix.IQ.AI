import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { AlertTriangle, CheckCircle2, ClipboardList, Layers } from 'lucide-react';
import type { ConfidenceLevel } from '@phoenix-ai/shared';
import type { GapSeverity } from '../data/index.js';
import { dataProvider } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { computeConfidenceStats } from '../lib/confidence-stats.js';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { CONFIDENCE_COLORS } from '../components/confidence-badge.js';
import { BusinessOverviewSection } from '../components/business-overview.js';
import { ConnectedSourcesSummary } from '../components/connected-sources.js';
import { computeConnectedSources } from '../lib/connected-sources.js';

const GAP_SEVERITY_COLORS: Record<GapSeverity, string> = {
  blocking: '#e11d48',
  high: '#f59e0b',
  medium: '#3b82f6',
  low: '#94a3b8',
};

const REVIEW_STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  confirmed: '#10b981',
  corrected: '#8b5cf6',
};

const CONFIDENCE_LEVEL_ORDER: ConfidenceLevel[] = ['high', 'medium', 'low', 'inferred'];

export function OverviewPage(): JSX.Element {
  const summary = useAsync(() => dataProvider.getSystemSummary(), []);
  const architecture = useAsync(() => dataProvider.getArchitecture('container'), []);
  const domains = useAsync(() => dataProvider.getDomains(), []);
  const reviewItems = useAsync(() => dataProvider.getReviewItems(), []);
  const driftAlerts = useAsync(() => dataProvider.getDriftAlerts(), []);
  const gapItems = useAsync(() => dataProvider.getGapItems(), []);
  const driftHistory = useAsync(() => dataProvider.getDriftHistory(), []);
  const fullGraph = useAsync(() => dataProvider.getFullGraph(), []);
  const personas = useAsync(() => dataProvider.getPersonas(), []);
  const journeys = useAsync(() => dataProvider.getJourneys(), []);
  const capabilities = useAsync(() => dataProvider.getBusinessCapabilities(), []);
  const flows = useAsync(() => dataProvider.getExecutionFlows(), []);
  const deployment = useAsync(() => dataProvider.getDeploymentTopology(), []);
  const integrations = useAsync(() => dataProvider.getIntegrations(), []);
  const nfrs = useAsync(() => dataProvider.getNonFunctionalRequirements(), []);

  const loading =
    summary.loading ||
    architecture.loading ||
    domains.loading ||
    reviewItems.loading ||
    driftAlerts.loading ||
    gapItems.loading ||
    driftHistory.loading ||
    fullGraph.loading ||
    personas.loading ||
    journeys.loading ||
    capabilities.loading ||
    flows.loading ||
    deployment.loading ||
    integrations.loading ||
    nfrs.loading;
  const error =
    summary.error ??
    architecture.error ??
    domains.error ??
    reviewItems.error ??
    driftAlerts.error ??
    gapItems.error ??
    driftHistory.error ??
    fullGraph.error ??
    personas.error ??
    journeys.error ??
    capabilities.error ??
    flows.error ??
    deployment.error ??
    integrations.error ??
    nfrs.error;

  const domainEntityNames = useMemo(() => {
    if (!domains.data) return [];
    const names = new Set<string>();
    for (const domain of domains.data) {
      for (const aggregate of domain.aggregates) {
        for (const entity of aggregate.entities) names.add(entity);
      }
    }
    return [...names].sort();
  }, [domains.data]);

  const connectedSources = useMemo(() => {
    if (loading || error) return [];
    return computeConnectedSources({
      personas: personas.data ?? [],
      journeys: journeys.data ?? [],
      flows: flows.data ?? [],
      domains: domains.data ?? [],
      capabilities: capabilities.data ?? [],
      containers: architecture.data?.nodes ?? [],
      deploymentNodes: deployment.data ?? [],
      integrations: integrations.data ?? [],
      nonFunctionalRequirements: nfrs.data ?? [],
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
    nfrs.data,
  ]);

  const confidenceStats = useMemo(() => {
    if (!architecture.data || !domains.data || !reviewItems.data) return [];
    const elements = [
      ...architecture.data.nodes.map((n) => n.metadata),
      ...domains.data.flatMap((d) => d.aggregates.map((a) => a.metadata)),
      ...reviewItems.data.map((r) => r.metadata),
    ];
    return computeConfidenceStats(elements).filter((s) => s.count > 0);
  }, [architecture.data, domains.data, reviewItems.data]);

  const elementsByKind = useMemo(() => {
    if (!fullGraph.data) return [];
    const counts = new Map<string, number>();
    for (const node of fullGraph.data.nodes) {
      counts.set(node.kind, (counts.get(node.kind) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count);
  }, [fullGraph.data]);

  const domainCoverage = useMemo(() => {
    if (!domains.data) return [];
    return domains.data.map((domain) => {
      const row: Record<string, string | number> = { name: domain.name };
      for (const level of CONFIDENCE_LEVEL_ORDER) row[level] = 0;
      for (const agg of domain.aggregates) {
        const level = agg.metadata.confidence.level;
        row[level] = (row[level] as number) + 1;
      }
      return row;
    });
  }, [domains.data]);

  const reviewStatusStats = useMemo(() => {
    if (!reviewItems.data) return [];
    const counts = new Map<string, number>();
    for (const item of reviewItems.data) {
      counts.set(item.status, (counts.get(item.status) ?? 0) + 1);
    }
    return [...counts.entries()].map(([status, count]) => ({ status, count }));
  }, [reviewItems.data]);

  const gapSeverityStats = useMemo(() => {
    if (!gapItems.data) return [];
    const order: GapSeverity[] = ['blocking', 'high', 'medium', 'low'];
    const counts = new Map<GapSeverity, number>();
    for (const gap of gapItems.data) counts.set(gap.severity, (counts.get(gap.severity) ?? 0) + 1);
    return order
      .filter((s) => counts.has(s))
      .map((severity) => ({ severity, count: counts.get(severity) ?? 0 }));
  }, [gapItems.data]);

  const driftActivity = useMemo(() => {
    if (!driftHistory.data) return [];
    return [...driftHistory.data]
      .sort((a, b) => new Date(a.runDate).getTime() - new Date(b.runDate).getTime())
      .map((run) => ({
        date: new Date(run.runDate).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
        changes: run.changes.length,
      }));
  }, [driftHistory.data]);

  if (loading) return <LoadingState label="Loading system overview…" />;
  if (error) return <ErrorState message={error.message} />;
  if (!summary.data) return <ErrorState message="No system summary available." />;

  const s = summary.data;

  return (
    <div>
      <PageHeader title={s.name} description={s.description} />

      <BusinessOverviewSection
        personas={personas.data ?? []}
        journeys={journeys.data ?? []}
        capabilities={capabilities.data ?? []}
        entityNames={domainEntityNames}
        services={architecture.data?.nodes ?? []}
      />

      <div className="mb-6">
        <ConnectedSourcesSummary groups={connectedSources} />
      </div>

      <h2 className="mb-3 text-sm font-semibold text-muted-foreground">System Health</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5" /> Elements analysed
            </CardDescription>
            <CardTitle className="text-2xl">{s.totalElements}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5" /> Coverage
            </CardDescription>
            <CardTitle className="text-2xl">{Math.round(s.coverageScore * 100)}%</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <ClipboardList className="h-3.5 w-3.5" /> Pending review
            </CardDescription>
            <CardTitle className="text-2xl">{s.pendingReviewCount}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Drift alerts
            </CardDescription>
            <CardTitle className="text-2xl">{s.driftAlertCount}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Confidence distribution</CardTitle>
            <CardDescription>
              Across architecture, domain, and review elements analysed so far.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={confidenceStats}
                    dataKey="count"
                    nameKey="label"
                    innerRadius={45}
                    outerRadius={75}
                    paddingAngle={2}
                  >
                    {confidenceStats.map((entry) => (
                      <Cell key={entry.level} fill={CONFIDENCE_COLORS[entry.level]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {confidenceStats.map((entry) => (
                <Badge key={entry.level} variant="outline" className="gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: CONFIDENCE_COLORS[entry.level] }}
                  />
                  {entry.label}: {entry.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Elements by type</CardTitle>
            <CardDescription>Every kind of node in the shared knowledge graph.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={elementsByKind} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="kind" width={80} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Domain coverage</CardTitle>
          <CardDescription>
            Aggregates recovered per domain, broken down by confidence level.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={domainCoverage} margin={{ left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                  height={50}
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {CONFIDENCE_LEVEL_ORDER.map((level) => (
                  <Bar
                    key={level}
                    dataKey={level}
                    stackId="confidence"
                    fill={CONFIDENCE_COLORS[level]}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Review queue status</CardTitle>
            <CardDescription>Pending vs. resolved elements.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={reviewStatusStats}
                    dataKey="count"
                    nameKey="status"
                    innerRadius={35}
                    outerRadius={65}
                  >
                    {reviewStatusStats.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={REVIEW_STATUS_COLORS[entry.status] ?? '#94a3b8'}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {reviewStatusStats.map((entry) => (
                <Badge key={entry.status} variant="outline" className="gap-1.5 capitalize">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: REVIEW_STATUS_COLORS[entry.status] ?? '#94a3b8' }}
                  />
                  {entry.status}: {entry.count}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gap severity</CardTitle>
            <CardDescription>Open items from Gap Analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gapSeverityStats}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="severity" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                    {gapSeverityStats.map((entry) => (
                      <Cell key={entry.severity} fill={GAP_SEVERITY_COLORS[entry.severity]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Drift activity</CardTitle>
            <CardDescription>Changes detected per differential run.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={driftActivity}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="changes"
                    stroke="#f59e0b"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent drift alerts</CardTitle>
          <CardDescription>Detected since the last differential run.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {(driftAlerts.data ?? []).map((alert) => (
            <div
              key={alert.id}
              className="flex items-start gap-2 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
              <div>
                <div className="text-sm font-medium">
                  {alert.elementName}{' '}
                  <Badge variant="secondary" className="ml-1 align-middle text-[10px] uppercase">
                    {alert.changeType}
                  </Badge>
                </div>
                <div className="text-xs text-muted-foreground">{alert.description}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {new Date(alert.detectedAt).toLocaleDateString()}
                </div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
