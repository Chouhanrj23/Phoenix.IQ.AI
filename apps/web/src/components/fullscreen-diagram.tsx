import { useEffect, useState, type ReactNode, type JSX } from 'react';
import { Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils.js';

/**
 * Wraps a reactflow canvas (or any diagram) with a full-screen toggle.
 *
 * Non-fullscreen: renders in-place using `className` (e.g. a fixed-height
 * bordered box inside a grid).
 * Fullscreen: escapes any grid/flex layout via `position: fixed`, covering
 * the whole viewport, with an Escape-to-close handler.
 *
 * `children` is a render-prop so callers can force a clean remount of their
 * <ReactFlow> on toggle (e.g. `key={isFullscreen ? 'fs' : 'normal'}`) —
 * reactflow's `fitView` only runs once on mount, so remounting is the
 * simplest way to get the diagram to re-fit the new viewport size.
 */
export function FullscreenDiagram({
  children,
  className,
}: {
  children: (isFullscreen: boolean) => ReactNode;
  className?: string;
}): JSX.Element {
  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    if (!isFullscreen) return;
    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') setIsFullscreen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isFullscreen]);

  return (
    <div
      className={cn('relative', isFullscreen ? 'fixed inset-0 z-50 bg-background p-4' : className)}
    >
      <button
        type="button"
        onClick={() => setIsFullscreen((v) => !v)}
        className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs font-medium shadow-sm hover:bg-accent"
      >
        {isFullscreen ? (
          <Minimize2 className="h-3.5 w-3.5" />
        ) : (
          <Maximize2 className="h-3.5 w-3.5" />
        )}
        {isFullscreen ? 'Exit full screen' : 'Full screen'}
      </button>
      <div className="h-full w-full">{children(isFullscreen)}</div>
    </div>
  );
}
