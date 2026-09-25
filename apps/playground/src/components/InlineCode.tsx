import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';

export function InlineCode({ className, ...props }: ComponentProps<'code'>) {
  return (
    <code
      className={cn('rounded-sm bg-muted px-1 py-0.5 font-mono text-[0.9em] text-foreground/80', className)}
      {...props}
    />
  );
}
