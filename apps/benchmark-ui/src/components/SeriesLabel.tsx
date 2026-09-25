import type { ReactNode } from 'react';

interface SeriesLabelProps {
  color: string;
  children: ReactNode;
}

export function SeriesLabel({ color, children }: SeriesLabelProps) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="inline-block size-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      {children}
    </span>
  );
}
