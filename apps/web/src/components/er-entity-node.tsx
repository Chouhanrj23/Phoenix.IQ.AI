import { Handle, Position } from 'reactflow';
import { KeyRound, Link2 } from 'lucide-react';
import type { ErEntityNode } from '../lib/er-model.js';
import { CONFIDENCE_COLORS } from './confidence-badge.js';
import { cn } from '../lib/utils.js';

export interface ErEntityNodeData {
  entity: ErEntityNode;
  isSelected: boolean;
}

/** Custom ReactFlow node rendering one entity as a classic ER attribute box. */
export function ErEntityNodeComponent({ data }: { data: ErEntityNodeData }): JSX.Element {
  const { entity, isSelected } = data;
  return (
    <div
      className={cn(
        'w-[220px] overflow-hidden rounded-md border bg-card text-left shadow-sm',
        isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted-foreground/40" />
      <Handle type="source" position={Position.Right} className="!bg-muted-foreground/40" />

      <div className="flex items-center gap-1.5 border-b border-border bg-muted/60 px-2.5 py-1.5">
        <span
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: CONFIDENCE_COLORS[entity.metadata.confidence.level] }}
        />
        <span className="truncate text-xs font-semibold">{entity.name}</span>
        {entity.isAggregateRoot ? (
          <span className="ml-auto shrink-0 rounded-sm bg-primary/10 px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">
            root
          </span>
        ) : null}
      </div>

      <div>
        {entity.fields.map((field) => (
          <div
            key={field.name}
            className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1 last:border-b-0"
          >
            {field.pk ? (
              <KeyRound className="h-2.5 w-2.5 shrink-0 text-amber-600" />
            ) : field.fk ? (
              <Link2 className="h-2.5 w-2.5 shrink-0 text-sky-600" />
            ) : (
              <span className="h-2.5 w-2.5 shrink-0" />
            )}
            <span
              className={cn(
                'truncate text-[11px]',
                field.pk ? 'font-semibold text-foreground' : 'text-foreground/90',
              )}
            >
              {field.name}
            </span>
            <span className="ml-auto shrink-0 truncate text-[10px] text-muted-foreground">
              {field.type}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export const ER_NODE_TYPES = { erEntity: ErEntityNodeComponent };
