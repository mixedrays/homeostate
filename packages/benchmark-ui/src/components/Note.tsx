import type { ReactNode } from 'react';

interface NoteProps {
  children: ReactNode;
}

export function Note({ children }: NoteProps) {
  return <p className="text-xs leading-relaxed text-muted-foreground">{children}</p>;
}
