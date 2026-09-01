import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  PencilLine,
  Waypoints,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ReviewItem } from '../data/index.js';
import {
  CORRELATION_KIND_LABEL,
  CORRELATION_KIND_LABEL_PLURAL,
  type CorrelationNode,
  type RelatedGroup,
  type ReviewStatus,
} from '../lib/correlation.js';
import { physicalModelProvenance, technicalEvidenceServices } from '../lib/technical-trace.js';
import { distinctSourceTypes } from '../lib/evidence.js';
import { Badge } from './ui/badge.js';
import { Button } from './ui/button.js';
import { ConfidenceBadge } from './confidence-badge.js';
import { ProvenanceList } from './provenance-list.js';
import { DisclosureSection } from './disclosure-section.js';

const REVIEW_STATUS_META: Record<
  ReviewStatus,
  {
    label: string;
    variant: 'warning' | 'success' | 'info' | 'secondary';
    icon: typeof AlertTriangle;
  }
> = {
  pending: { label: 'Awaiting Human Review', variant: 'warning', icon: AlertTriangle },
  confirmed: { label: 'Validated by Human', variant: 'success', icon: CheckCircle2 },
  corrected: { label: 'Human Corrected', variant: 'info', icon: PencilLine },
  none: {
    label: 'No review item recorded for this object',
    variant: 'secondary',
    icon: HelpCircle,
  },
};

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

interface ObjectDetailPanelProps {
  node: CorrelationNode;
  reviewStatus: ReviewStatus;
  /** True only when the CURRENT user confirmed/corrected this object in this session — distinct from an object that simply started out confirmed/corrected in the underlying data (e.g. Aurora's real "Order — schema" review item). Controls whether the "not persisted" disclaimer is shown, so it never appears next to a status the user didn't just set. */
  reviewIsSessionOverride: boolean;
  /** The real pending ReviewItem for this object, when `reviewStatus === 'pending'` — enables the inline Confirm/Correct actions and the "Review" deep-link. Undefined otherwise. */
  pendingReviewItem?: ReviewItem;
  onConfirmReview: (item: ReviewItem) => void;
  onCorrectReview: (item: ReviewItem, value: string) => void;
  groups: readonly RelatedGroup[];
  immediateCount: number;
  onSelect: (node: CorrelationNode) => void;
}

/**
 * PC-09/PC-HR-02/PC-HR-03/PC-HR-04/PC-HR-05 — the complete client-facing
 * "what does Phoenix think this is, how confident is it, what evidence
 * supports it, and has a human validated it" panel, in the priority order
 * PC-HR-05 specifies: Description, Review Status, Confidence, Related,
 * Evidence, then — collapsed, since business meaning comes first — the
 * deeper "Technical Trace" (full provenance citations, the Service/Source
 * chain, business-to-physical mapping). Every value comes directly from the
 * same real Phase 1-5 data `lib/correlation.ts` already indexes — no second
 * object model, no fabricated confidence/evidence/relationship, no invented
 * physical mapping.
 *
 * PC-HR-04 — Confidence and Evidence are independent, real signals: an
 * object with no `metadata` of its own (Entity, Technology — bare derived
 * labels, never their own tracked object anywhere in Phase 1-5) honestly
 * shows "Confidence unavailable" / "No evidence recorded" rather than
 * borrowing a neighboring object's numbers.
 *
 * PC-HR-03/PC-HR-05 — Confirm/Correct are real, working actions (mirroring
 * `ReviewPage.tsx`'s own Confirm/Correct interaction exactly) but they
 * update the SAME kind of local, in-memory state `ReviewPage.tsx` already
 * uses — there is no write method anywhere on `OkfDataProvider`, so nothing
 * here ever claims persistence that doesn't exist. The parent page owns
 * this local state (so the Review Status field above updates immediately
 * after acting); this component only renders it and reports the decision
 * upward.
 */
export function ObjectDetailPanel({
  node,
  reviewStatus,
  reviewIsSessionOverride,
  pendingReviewItem,
  onConfirmReview,
  onCorrectReview,
  groups,
  immediateCount,
  onSelect,
}: ObjectDetailPanelProps): JSX.Element {
  const reviewMeta = REVIEW_STATUS_META[reviewStatus];
  const ReviewIcon = reviewMeta.icon;
  const confidence = node.metadata?.confidence;
  const provenance = node.metadata?.provenance ?? [];
  const sourceTypes = distinctSourceTypes(provenance);
  const evidenceServices = technicalEvidenceServices(node, groups);
  const physicalProvenance = physicalModelProvenance(node, groups);
  const [correcting, setCorrecting] = useState(false);
  const [draft, setDraft] = useState('');

  return (
    <div className="space-y-4 text-sm">
      <div>
        <h3 className="text-base font-semibold leading-snug text-foreground">{node.label}</h3>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <Badge variant="outline">{CORRELATION_KIND_LABEL[node.kind]}</Badge>
          {node.secondary ? (
            <span className="text-xs text-muted-foreground">{node.secondary}</span>
          ) : null}
        </div>
      </div>

      <Field label="Description">
        <p className="leading-relaxed text-foreground">
          {node.description && node.description.trim().length > 0
            ? node.description
            : 'Description not available from current evidence.'}
        </p>
      </Field>

      <Field label="Review Status">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={reviewMeta.variant} className="gap-1">
            <ReviewIcon className="h-3 w-3" /> {reviewMeta.label}
          </Badge>
          {reviewStatus === 'pending' && pendingReviewItem ? (
            <Link
              to={`/review?item=${pendingReviewItem.id}`}
              className="inline-flex h-8 items-center rounded-md border border-border px-3 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Open in Review Queue
            </Link>
          ) : null}
        </div>
        {reviewIsSessionOverride ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            Recorded for this browser session only — not written back to the underlying knowledge
            graph, and independent of the Review Queue page's own session state.
          </p>
        ) : null}
      </Field>

      <Field label="Confidence">
        {confidence ? (
          <ConfidenceBadge level={confidence.level} score={confidence.score} />
        ) : (
          <p className="text-sm text-muted-foreground">Confidence unavailable</p>
        )}
      </Field>

      <div className="border-t border-border pt-3">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Related
          </span>
          <span className="text-xs text-muted-foreground">
            {immediateCount} direct connection(s)
          </span>
        </div>
        {groups.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No related items found in the current knowledge graph.
          </p>
        ) : (
          <div className="space-y-3">
            {groups.map((group) => (
              <div key={group.kind}>
                <div className="mb-1.5 text-xs font-semibold text-muted-foreground">
                  {CORRELATION_KIND_LABEL_PLURAL[group.kind]}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.nodes.map((related) => (
                    <button key={related.key} type="button" onClick={() => onSelect(related)}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-muted">
                        {related.label}
                      </Badge>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Field label="Evidence">
        {node.metadata === undefined ? (
          <p className="text-sm text-muted-foreground">Evidence unavailable</p>
        ) : provenance.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence recorded for this object.</p>
        ) : (
          <div className="space-y-1">
            <p className="text-foreground">
              {provenance.length} supporting signal{provenance.length === 1 ? '' : 's'}
            </p>
            <ul className="space-y-0.5 text-xs text-muted-foreground">
              {sourceTypes.map((source) => (
                <li key={source.type}>• {source.label}</li>
              ))}
            </ul>
          </div>
        )}
      </Field>

      <div className="-mx-1 border-t border-border">
        <DisclosureSection title="Technical Trace">
          <div className="space-y-4">
            {confidence === undefined ? (
              <p className="text-xs text-muted-foreground">
                {CORRELATION_KIND_LABEL[node.kind]} is a derived label rather than its own
                independently tracked object, so it carries no confidence/evidence record of its
                own.
              </p>
            ) : (
              <>
                {confidence.rationale ? (
                  <p className="text-xs text-muted-foreground">{confidence.rationale}</p>
                ) : null}
                {provenance.length > 0 ? <ProvenanceList provenance={[...provenance]} /> : null}
              </>
            )}

            {evidenceServices.length > 0 ? (
              <div className="border-t border-border pt-3">
                <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  <Waypoints className="h-3 w-3" /> Technical Evidence
                </div>
                <ul className="space-y-2.5">
                  {evidenceServices.map((service) => {
                    const serviceProvenance = service.metadata?.provenance ?? [];
                    return (
                      <li key={service.key} className="text-xs">
                        <div className="flex items-center gap-1.5 text-foreground">
                          <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                          <span className="font-medium">{service.label}</span>
                          <span className="text-muted-foreground">(Service)</span>
                        </div>
                        {serviceProvenance.length > 0 ? (
                          <div className="ml-4 mt-1 pl-3.5">
                            <ProvenanceList provenance={[...serviceProvenance]} />
                          </div>
                        ) : (
                          <p className="ml-4 pl-3.5 text-muted-foreground">
                            No source/repository evidence recorded for this service.
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-2 text-[11px] text-muted-foreground">
                  API-level evidence is not available — no API/interface objects exist in the
                  current knowledge graph.
                </p>
              </div>
            ) : null}

            {physicalProvenance.length > 0 ? (
              <div className="border-t border-border pt-3">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Business ↔ Physical Model
                </div>
                <ProvenanceList provenance={[...physicalProvenance]} />
              </div>
            ) : null}
          </div>
        </DisclosureSection>
      </div>

      {reviewStatus === 'pending' && pendingReviewItem ? (
        <div className="border-t border-border pt-3">
          {correcting ? (
            <div className="space-y-2">
              <textarea
                className="w-full rounded-md border border-border px-2 py-1.5 text-sm"
                rows={2}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={() => {
                    onCorrectReview(pendingReviewItem, draft);
                    setCorrecting(false);
                  }}
                >
                  Save correction
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setCorrecting(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => onConfirmReview(pendingReviewItem)}>
                <CheckCircle2 className="h-3.5 w-3.5" /> Confirm
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setDraft(pendingReviewItem.currentValue);
                  setCorrecting(true);
                }}
              >
                <PencilLine className="h-3.5 w-3.5" /> Correct
              </Button>
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            Recorded for this browser session only — not written back to the underlying knowledge
            graph.
          </p>
        </div>
      ) : null}
    </div>
  );
}
