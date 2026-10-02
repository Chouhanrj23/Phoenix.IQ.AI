import type { Provenance } from '@phoenix-ai/shared';
import {
  FileText,
  Code2,
  Ticket,
  ScrollText,
  Database,
  TestTube2,
  Video,
  HelpCircle,
} from 'lucide-react';

import type { JSX } from 'react';

const ICON_BY_SOURCE_TYPE: Record<Provenance['sourceType'], typeof FileText> = {
  'source-code': Code2,
  'technical-doc': FileText,
  'business-doc': FileText,
  ticket: Ticket,
  log: ScrollText,
  'data-model': Database,
  test: TestTube2,
  recording: Video,
  other: HelpCircle,
};

export function ProvenanceList({ provenance }: { provenance: Provenance[] }): JSX.Element {
  return (
    <ul className="space-y-2">
      {provenance.map((p, i) => {
        const Icon = ICON_BY_SOURCE_TYPE[p.sourceType] ?? HelpCircle;
        return (
          <li key={`${p.sourceId}-${i}`} className="flex items-start gap-2 text-sm">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <div className="font-mono text-xs text-foreground">{p.sourceId}</div>
              <div className="text-xs text-muted-foreground">
                {p.sourceType} · derived by {p.derivedBy} ·{' '}
                {new Date(p.derivedAt).toLocaleDateString()}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
