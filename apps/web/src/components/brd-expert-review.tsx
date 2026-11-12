import { useEffect, useRef, useState, type JSX } from 'react';
import { Loader2, UserCheck } from 'lucide-react';
import { Button } from './ui/button.js';
import { Badge } from './ui/badge.js';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.js';
import { getBrdUpdateStatus, startBrdUpdate, type RunStatus } from '../lib/re-inputs.js';
import type { ReverseEngineeringReport } from '../reverse-engineering/types.js';

const INTENT_LABEL: Record<string, string> = {
  confirm: 'Confirm',
  explain: 'Explain',
  'edge-cases': 'Edge cases',
  'fill-gap': 'Fill a gap',
  resolve: 'Resolve',
};

/**
 * Merges the expert answers saved from the Modules page questions into the BRD.
 * The dev server re-renders the BRD and reloads the page when it finishes.
 */
export function UpdateBrdButton({ project }: { project: string }): JSX.Element {
  const [status, setStatus] = useState<RunStatus>({ state: 'idle' });
  const [error, setError] = useState('');
  const timer = useRef<number | undefined>(undefined);
  const running = status.state === 'running';

  useEffect(() => {
    let cancelled = false;
    async function poll(): Promise<void> {
      try {
        const s = await getBrdUpdateStatus(project);
        if (cancelled) return;
        setStatus(s);
        if (s.state === 'running') timer.current = window.setTimeout(() => void poll(), 1500);
      } catch {
        // Endpoints only exist on the dev server.
      }
    }
    void poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
  }, [project, running]);

  async function start(): Promise<void> {
    setError('');
    try {
      await startBrdUpdate(project);
      setStatus({ state: 'running', stepLabel: 'Starting' });
    } catch (err) {
      setError((err as Error).message);
    }
  }

  const last = status.log?.[status.log.length - 1];
  const message =
    error ||
    (status.state === 'failed' ? status.error : '') ||
    (running ? (last ?? 'Updating…') : status.state === 'done' ? last : '');

  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="outline" disabled={running} onClick={() => void start()}>
        {running ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <UserCheck className="mr-2 h-4 w-4" />
        )}
        Update BRD from expert answers
      </Button>
      {message ? (
        <p
          className={`max-w-xs text-right text-[11px] ${error || status.state === 'failed' ? 'text-rose-600' : 'text-muted-foreground'}`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}

/** The experts' answers merged into the BRD, with the BRD's version history. */
export function ExpertReviewPanel({
  report: r,
  moduleId,
}: {
  report: ReverseEngineeringReport;
  moduleId: string;
}): JSX.Element {
  const review = r.expertReview;
  if (!review?.inputs.length) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          No expert answers in this BRD yet. Experts answer the questions on each module&apos;s
          Quiz, then <strong>Update BRD from expert answers</strong> merges them in.
        </CardContent>
      </Card>
    );
  }
  const modules = r.modules.filter((m) => moduleId === 'all' || m.id === moduleId);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Version history</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          {review.revisions.map((v) => (
            <p key={v.at}>
              <span className="text-muted-foreground">{new Date(v.at).toLocaleString()} — </span>
              {v.summary}
            </p>
          ))}
        </CardContent>
      </Card>
      {modules.map((m) => {
        const inputs = review.inputs.filter((i) => i.moduleId === m.id);
        if (!inputs.length) return null;
        return (
          <Card key={m.id}>
            <CardHeader>
              <CardTitle>{m.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {inputs.map((i) => (
                <div
                  key={i.questionId}
                  className="space-y-1.5 border-t border-border pt-3 first:border-0 first:pt-0"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{INTENT_LABEL[i.intent] ?? i.intent}</Badge>
                    <span className="text-xs capitalize text-muted-foreground">{i.level}</span>
                  </div>
                  <p className="text-sm font-medium">{i.question}</p>
                  <p className="rounded-md bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                    <span className="font-semibold">What the BRD said: </span>
                    {i.brdContext}
                  </p>
                  <div className="whitespace-pre-line text-sm">{i.statement}</div>
                  {i.statement !== i.answer ? (
                    <details className="text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Expert&apos;s own words</summary>
                      <p className="mt-1 whitespace-pre-line">{i.answer}</p>
                    </details>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {i.answeredBy ?? 'Expert'} · {new Date(i.answeredAt).toLocaleDateString()}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
