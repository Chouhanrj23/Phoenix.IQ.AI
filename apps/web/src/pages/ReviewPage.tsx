import { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, PencilLine, ShieldAlert } from 'lucide-react';
import type { ConfidenceLevel } from '@phoenix-ai/shared';
import { useSearchParams } from 'react-router-dom';
import { dataProvider, type ReviewItem } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge } from '../components/confidence-badge.js';
import { ProvenanceList } from '../components/provenance-list.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';

const SEVERITY_ORDER: Record<ConfidenceLevel, number> = { inferred: 0, low: 1, medium: 2, high: 3 };

function ReviewRow({
  item,
  highlighted,
  sessionModified,
  onConfirm,
  onCorrect,
}: {
  item: ReviewItem;
  highlighted: boolean;
  /** True only when THIS decision was made in the current session (via Confirm/Correct below) — not when the item simply started out confirmed/corrected in the underlying data. */
  sessionModified: boolean;
  onConfirm: (id: string) => void;
  onCorrect: (id: string, value: string) => void;
}): JSX.Element {
  const [correcting, setCorrecting] = useState(false);
  const [draft, setDraft] = useState(item.currentValue);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlighted]);

  return (
    <Card ref={ref} className={cn(highlighted && 'ring-2 ring-primary')}>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <Badge variant="outline" className="mb-1.5">
              {item.elementType}
            </Badge>
            <CardTitle>{item.elementName}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            {item.status === 'confirmed' && (
              <Badge variant="success" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Confirmed
              </Badge>
            )}
            {item.status === 'corrected' && (
              <Badge variant="info" className="gap-1">
                <PencilLine className="h-3 w-3" /> Corrected
              </Badge>
            )}
            <ConfidenceBadge
              level={item.metadata.confidence.level}
              score={item.metadata.confidence.score}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {item.conflict ? (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase text-rose-700">
              <ShieldAlert className="h-3.5 w-3.5" /> Sources disagree
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {item.conflict.map((c) => (
                <div key={c.sourceId} className="rounded-md border border-rose-200 bg-rose-50 p-2">
                  <div className="text-[11px] font-medium text-rose-800">{c.sourceLabel}</div>
                  <div className="text-sm text-rose-900">{c.value}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="rounded-md bg-muted p-2 text-sm">{item.currentValue}</div>
        )}

        {item.metadata.confidence.rationale ? (
          <p className="text-xs text-muted-foreground">{item.metadata.confidence.rationale}</p>
        ) : null}

        <details className="text-xs">
          <summary className="cursor-pointer select-none font-medium text-muted-foreground">
            Provenance ({item.metadata.provenance.length})
          </summary>
          <div className="mt-2">
            <ProvenanceList provenance={item.metadata.provenance} />
          </div>
        </details>

        {item.status === 'pending' && (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {correcting ? (
              <>
                <input
                  className="min-w-64 flex-1 rounded-md border border-border px-2 py-1 text-sm"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  autoFocus
                />
                <Button
                  size="sm"
                  onClick={() => {
                    onCorrect(item.id, draft);
                    setCorrecting(false);
                  }}
                >
                  Save correction
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCorrecting(false)}>
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" onClick={() => onConfirm(item.id)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirm as-is
                </Button>
                <Button size="sm" variant="outline" onClick={() => setCorrecting(true)}>
                  <PencilLine className="h-3.5 w-3.5" /> Correct
                </Button>
              </>
            )}
          </div>
        )}
        {sessionModified && (
          <p className="text-[11px] text-muted-foreground">
            This decision is recorded for your current browser session only — it is not yet written
            back to the underlying knowledge graph.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getReviewItems(), []);
  const [items, setItems] = useState<ReviewItem[]>([]);
  /** Ids the CURRENT user actually acted on this session — distinct from items that simply started out confirmed/corrected in the underlying data. */
  const [sessionModifiedIds, setSessionModifiedIds] = useState<ReadonlySet<string>>(new Set());
  const [searchParams] = useSearchParams();
  const highlightedId = searchParams.get('item');

  useEffect(() => {
    if (data) setItems(data);
  }, [data]);

  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) =>
          SEVERITY_ORDER[a.metadata.confidence.level] - SEVERITY_ORDER[b.metadata.confidence.level],
      ),
    [items],
  );

  function handleConfirm(id: string): void {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status: 'confirmed' } : i)));
    setSessionModifiedIds((prev) => new Set(prev).add(id));
  }

  function handleCorrect(id: string, value: string): void {
    setItems((prev) =>
      prev.map((i) => (i.id === id ? { ...i, status: 'corrected', currentValue: value } : i)),
    );
    setSessionModifiedIds((prev) => new Set(prev).add(id));
  }

  if (loading) return <LoadingState label="Loading review queue…" />;
  if (error) return <ErrorState message={error.message} />;

  const pendingCount = items.filter((i) => i.status === 'pending').length;

  return (
    <div>
      <PageHeader
        title="Human Review & Correction"
        description={`${pendingCount} element${pendingCount === 1 ? '' : 's'} awaiting review, prioritised by lowest confidence first. Gaps and conflicts are surfaced as collaborative requests, not audit findings.`}
      />
      <div className="space-y-4">
        {sorted.map((item) => (
          <ReviewRow
            key={item.id}
            item={item}
            highlighted={item.id === highlightedId}
            sessionModified={sessionModifiedIds.has(item.id)}
            onConfirm={handleConfirm}
            onCorrect={handleCorrect}
          />
        ))}
      </div>
    </div>
  );
}
