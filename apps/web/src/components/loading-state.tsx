import type { JSX } from 'react';
export function LoadingState({ label = 'Loading…' }: { label?: string }): JSX.Element {
  return <div className="py-12 text-center text-sm text-muted-foreground">{label}</div>;
}

export function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <div className="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      {message}
    </div>
  );
}
