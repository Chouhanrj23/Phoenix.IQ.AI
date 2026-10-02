import type { ReactNode, JSX } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  ExternalLink,
  HelpCircle,
  Plug,
  Server,
  ShieldCheck,
  Activity,
} from 'lucide-react';
import type { GraphCrossRefKind, GraphEdge, GraphNode } from '../data/index.js';
import { Badge } from './ui/badge.js';
import { ConfidenceBadge, CONFIDENCE_COLORS } from './confidence-badge.js';
import { ProvenanceList } from './provenance-list.js';

const CROSSREF_META: Record<
  GraphCrossRefKind,
  { icon: typeof AlertTriangle; tone: 'danger' | 'warning' | 'info' | 'success' | 'secondary' }
> = {
  review: { icon: AlertTriangle, tone: 'danger' },
  gap: { icon: HelpCircle, tone: 'warning' },
  drift: { icon: Activity, tone: 'info' },
  nfr: { icon: ShieldCheck, tone: 'success' },
  integration: { icon: Plug, tone: 'secondary' },
  deployment: { icon: Server, tone: 'secondary' },
};

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="border-t border-border pt-3">
      <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h4>
      {children}
    </section>
  );
}

export function NodeDetailPanel({
  node,
  nodes,
  edges,
  onSelectNode,
}: {
  node: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onSelectNode: (id: string) => void;
}): JSX.Element {
  const detail = node.detail;
  const byId = new Map(nodes.map((n) => [n.id, n]));

  const outgoing = edges
    .filter((e) => e.source === node.id)
    .map((e) => ({ edge: e, other: byId.get(e.target) }))
    .filter((r): r is { edge: GraphEdge; other: GraphNode } => Boolean(r.other));
  const incoming = edges
    .filter((e) => e.target === node.id)
    .map((e) => ({ edge: e, other: byId.get(e.source) }))
    .filter((r): r is { edge: GraphEdge; other: GraphNode } => Boolean(r.other));

  const confidence = detail?.metadata.confidence;
  const score = confidence?.score;

  return (
    <div className="space-y-4 text-sm">
      {/* Identity ------------------------------------------------------- */}
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{node.kind}</Badge>
        <ConfidenceBadge level={node.confidenceLevel} score={score} />
        <span className="font-mono text-[10px] text-muted-foreground">{node.id}</span>
      </div>

      {detail ? (
        <>
          <p className="leading-relaxed text-foreground">{detail.summary}</p>

          {/* Confidence & rationale --------------------------------------- */}
          <Section title="Confidence">
            <div className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.round((score ?? 0.5) * 100)}%`,
                  backgroundColor: CONFIDENCE_COLORS[node.confidenceLevel],
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {confidence?.rationale ??
                'No rationale recorded — confidence was assigned from source agreement alone.'}
            </p>
          </Section>

          {/* Attributes --------------------------------------------------- */}
          {detail.attributes.length > 0 && (
            <Section title="Attributes">
              <dl className="grid grid-cols-[minmax(0,7rem)_1fr] gap-x-3 gap-y-1.5">
                {detail.attributes.map((attr) => (
                  <div key={attr.label} className="contents">
                    <dt className="text-xs text-muted-foreground">{attr.label}</dt>
                    <dd className="text-xs text-foreground">{attr.value}</dd>
                  </div>
                ))}
              </dl>
            </Section>
          )}

          {/* Nested detail lists ------------------------------------------ */}
          {detail.sections.map((section) => (
            <Section key={section.label} title={section.label}>
              <ul className="space-y-1">
                {section.items.map((item, i) => (
                  <li key={`${section.label}-${i}`} className="flex gap-2 text-xs">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span className="text-foreground">{item}</span>
                  </li>
                ))}
              </ul>
            </Section>
          ))}
        </>
      ) : (
        <p className="text-xs text-muted-foreground">
          No dossier available for this node — the active data source returned a slim graph.
        </p>
      )}

      {/* Relationships -------------------------------------------------- */}
      {(outgoing.length > 0 || incoming.length > 0) && (
        <Section title={`Relationships (${incoming.length} in · ${outgoing.length} out)`}>
          <ul className="space-y-1">
            {outgoing.map(({ edge, other }) => (
              <li key={`out-${edge.id}`}>
                <button
                  type="button"
                  onClick={() => onSelectNode(other.id)}
                  className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
                >
                  <ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="text-muted-foreground">{edge.label ?? 'relates to'} </span>
                    <span className="font-medium text-foreground">{other.label}</span>
                    <span className="text-muted-foreground"> ({other.kind})</span>
                  </span>
                </button>
              </li>
            ))}
            {incoming.map(({ edge, other }) => (
              <li key={`in-${edge.id}`}>
                <button
                  type="button"
                  onClick={() => onSelectNode(other.id)}
                  className="flex w-full items-start gap-1.5 rounded px-1 py-0.5 text-left text-xs hover:bg-muted"
                >
                  <ArrowLeft className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
                  <span>
                    <span className="font-medium text-foreground">{other.label}</span>
                    <span className="text-muted-foreground">
                      {' '}
                      {edge.label ?? 'relates to'} this
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Open questions & related items --------------------------------- */}
      {detail && detail.crossRefs.length > 0 && (
        <Section title={`Needs attention & related items (${detail.crossRefs.length})`}>
          <ul className="space-y-2">
            {detail.crossRefs.map((ref) => {
              const { icon: Icon, tone } = CROSSREF_META[ref.kind];
              return (
                <li key={ref.id} className="rounded-md border border-border p-2">
                  <div className="mb-1 flex items-start gap-1.5">
                    <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-xs font-medium text-foreground">{ref.label}</span>
                  </div>
                  <p className="mb-1.5 text-xs text-muted-foreground">{ref.detail}</p>
                  <div className="flex items-center gap-2">
                    <Badge variant={tone}>{ref.kind}</Badge>
                    <Link
                      to={ref.route}
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      Open <ExternalLink className="h-3 w-3" />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {/* Provenance ------------------------------------------------------ */}
      {detail && (
        <Section title={`Sources (${detail.metadata.provenance.length})`}>
          <ProvenanceList provenance={detail.metadata.provenance} />
        </Section>
      )}

      {/* Where it's rendered --------------------------------------------- */}
      {detail && (
        <Section title="Projected onto">
          <Link
            to={detail.route}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
          >
            View in {detail.routeLabel} <ExternalLink className="h-3 w-3" />
          </Link>
        </Section>
      )}
    </div>
  );
}
