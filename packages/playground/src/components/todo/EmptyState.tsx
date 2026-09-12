import type { LucideIcon } from 'lucide-react';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';

export interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  hint?: string;
}

export function EmptyState({ icon: Icon, title, hint }: EmptyStateProps) {
  return (
    <Empty className="border py-10">
      <EmptyHeader>
        <EmptyMedia variant="icon" className="size-12 rounded-full text-muted-foreground [&_svg]:size-5">
          <Icon aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
        {hint && <EmptyDescription>{hint}</EmptyDescription>}
      </EmptyHeader>
    </Empty>
  );
}
