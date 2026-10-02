import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { CheckCircle2, PencilLine, ShieldAlert, XCircle } from 'lucide-react';
import type { ConfidenceLevel } from '@phoenix-ai/shared';
import { useSearchParams } from 'react-router-dom';
import { dataProvider, type ReviewItem } from '../data/index.js';
import { useAsync } from '../lib/useAsync.js';
import {
  describeReviewOutcome,
  REVIEWER_ID,
  type ReviewActionOutcome,
} from '../lib/review-feedback.js';
import { PageHeader } from '../components/page-header.js';
import { LoadingState, ErrorState } from '../components/loading-state.js';
import { ConfidenceBadge } from '../components/confidence-badge.js';
import { ProvenanceList } from '../components/provenance-list.js';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card.js';
import { Badge } from '../components/ui/badge.js';
import { Button } from '../components/ui/button.js';
import { cn } from '../lib/utils.js';

const SEVERITY_ORDER: Record<ConfidenceLevel, number> = { inferred: 0, low: 1, medium: 2, high: 3 };

/** P7-04 — reviewer identity, durability wording and propagation wording are shared with the Correlation Explorer so both surfaces tell the identical story. */
type ReviewSubmissionOutcome = ReviewActionOutcome;

function ReviewRow({
  item,
  highlighted,
  busy,
  outcome,
  onConfirm,
  onCorrect,
  onReject,
}: {
  item: ReviewItem;
  highlighted: boolean;
  /** A submission for THIS item is in flight — actions are disabled so a decision cannot be double-submitted. */
  busy: boolean;
  /** The result of the last submission for this item, reported verbatim: a save is never implied, it is stated. */
  outcome: ReviewSubmissionOutcome | undefined;
  /** Resolves true only when the decision was actually persisted. */
  onConfirm: (item: ReviewItem) => Promise<boolean>;
  onCorrect: (item: ReviewItem, value: string) => Promise<boolean>;
  onReject: (item: ReviewItem) => Promise<boolean>;
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
            {item.status === 'rejected' && (
              <Badge variant="danger" className="gap-1">
                <XCircle className="h-3 w-3" /> Rejected
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
                  disabled={busy}
                  autoFocus
                />
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => {
                    void onCorrect(item, draft).then((ok) => {
                      if (ok) setCorrecting(false);
                    });
                  }}
                >
                  {busy ? 'Saving…' : 'Save correction'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setCorrecting(false)}
                >
                  Cancel
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" disabled={busy} onClick={() => void onConfirm(item)}>
                  <CheckCircle2 className="h-3.5 w-3.5" /> {busy ? 'Saving…' : 'Confirm as-is'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setCorrecting(true)}
                >
                  <PencilLine className="h-3.5 w-3.5" /> Correct
                </Button>
                {/* FR-REV-02's third action: contradict the value without replacing it. */}
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => void onReject(item)}
                >
                  <XCircle className="h-3.5 w-3.5" /> Reject
                </Button>
              </>
            )}
          </div>
        )}
        {outcome && (
          <p
            className={cn(
              'text-[11px]',
              outcome.kind === 'error' ? 'text-rose-700' : 'text-muted-foreground',
            )}
          >
            {outcome.message}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

export function ReviewPage(): JSX.Element {
  const { data, loading, error } = useAsync(() => dataProvider.getReviewItems(), []);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [outcomes, setOutcomes] = useState<Record<string, ReviewSubmissionOutcome>>({});
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

  /**
   * P7-01 — submits a real review decision.
   *
   * The local list is updated ONLY after the provider confirms the decision
   * was actually persisted; a failed or non-persisted submission leaves the
   * item exactly as it was and shows the reason. That is the difference
   * between this and the previous local-state-only behaviour: the UI no
   * longer decides that something was reviewed, the store does.
   */
  async function submit(
    item: ReviewItem,
    decision: 'confirmed' | 'corrected' | 'rejected',
    correctedValue?: string,
  ): Promise<boolean> {
    setBusyId(item.id);
    try {
      const result = await dataProvider.submitReviewDecision({
        targetObjectId: item.elementId ?? item.id,
        targetLabel: item.elementName,
        decision,
        previousValue: item.currentValue,
        reviewerId: REVIEWER_ID,
        previousStatus: item.status,
        ...(correctedValue === undefined ? {} : { correctedValue }),
      });

      const outcome = describeReviewOutcome(result);
      if (outcome.kind === 'error') {
        setOutcomes((prev) => ({ ...prev, [item.id]: outcome }));
        return false;
      }

      setItems((prev) =>
        prev.map((i) =>
          i.id === item.id
            ? {
                ...i,
                status: decision,
                ...(correctedValue === undefined ? {} : { currentValue: correctedValue }),
              }
            : i,
        ),
      );
      setOutcomes((prev) => ({ ...prev, [item.id]: outcome }));
      return true;
    } catch (submitError) {
      setOutcomes((prev) => ({
        ...prev,
        [item.id]: {
          kind: 'error',
          message:
            submitError instanceof Error
              ? `Not saved — ${submitError.message}`
              : 'Not saved — the review decision could not be recorded.',
        },
      }));
      return false;
    } finally {
      setBusyId(null);
    }
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
            busy={busyId === item.id}
            outcome={outcomes[item.id]}
            onConfirm={(target) => submit(target, 'confirmed')}
            onCorrect={(target, value) => submit(target, 'corrected', value)}
            onReject={(target) => submit(target, 'rejected')}
          />
        ))}
      </div>
    </div>
  );
}
