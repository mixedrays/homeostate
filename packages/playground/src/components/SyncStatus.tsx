import { CloudOff, Loader2, ServerCrash, Wifi, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SyncStatus as SyncStatusValue } from '../hooks/useSyncConnection';
import { SYNC_SERVER_URL } from '../sync';

interface StatusView {
  label: string;
  icon: LucideIcon;
  variant: 'outline' | 'secondary' | 'destructive';
  className?: string;
  title: string;
  spin?: boolean;
}

const STATUS_VIEWS: Record<SyncStatusValue, StatusView> = {
  connecting: {
    label: 'Connecting',
    icon: Loader2,
    variant: 'outline',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    title: `Sync server: ${SYNC_SERVER_URL}`,
    spin: true,
  },
  connected: {
    label: 'Syncing',
    icon: Loader2,
    variant: 'outline',
    className: 'border-amber-200 bg-amber-50 text-amber-900',
    title: `Sync server: ${SYNC_SERVER_URL}`,
    spin: true,
  },
  synced: {
    label: 'Synced',
    icon: Wifi,
    variant: 'outline',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-900',
    title: `Sync server: ${SYNC_SERVER_URL}`,
  },
  unreachable: {
    label: 'Server offline',
    icon: ServerCrash,
    variant: 'destructive',
    title: `Sync server unreachable: ${SYNC_SERVER_URL}`,
  },
  offline: {
    label: 'Offline',
    icon: CloudOff,
    variant: 'secondary',
    title: 'Sync is turned off for this tab',
  },
};

interface SyncStatusProps {
  status: SyncStatusValue;
}

export function SyncStatus({ status }: SyncStatusProps) {
  const { label, icon: Icon, variant, className, title, spin } = STATUS_VIEWS[status];

  return (
    <Badge
      variant={variant}
      role="status"
      aria-live="polite"
      title={title}
      className={cn('h-6 px-2.5', className)}
    >
      <Icon aria-hidden className={spin ? 'animate-spin' : undefined} />
      {label}
    </Badge>
  );
}
