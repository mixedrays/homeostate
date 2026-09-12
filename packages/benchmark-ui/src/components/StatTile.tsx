import type { ReactNode } from 'react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface StatTileProps {
  label: string;
  value: string;
  detail?: ReactNode;
}

export function StatTile({ label, value, detail }: StatTileProps) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardDescription className="text-xs font-medium uppercase tracking-wide">{label}</CardDescription>
        <CardTitle className="text-2xl font-semibold tracking-tight">{value}</CardTitle>
        {detail && <CardDescription>{detail}</CardDescription>}
      </CardHeader>
    </Card>
  );
}
