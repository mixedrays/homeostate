import { Loader2, Wifi, WifiOff, type LucideIcon } from 'lucide-react';
import type { ProviderStatus } from '../hooks/useProviderStatus';
import { SYNC_SERVER_URL } from '../sync';
import { cx } from './ui/classes';

interface StatusView {
  label: string;
  icon: LucideIcon;
  className: string;
  spin?: boolean;
}

const STATUS_VIEWS: Record<ProviderStatus, StatusView> = {
  connecting: {
    label: 'Connecting',
    icon: Loader2,
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    spin: true,
  },
  connected: {
    label: 'Syncing',
    icon: Loader2,
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    spin: true,
  },
  synced: {
    label: 'Synced',
    icon: Wifi,
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  },
  offline: {
    label: 'Server offline',
    icon: WifiOff,
    className: 'bg-red-50 text-red-800 ring-red-200',
  },
};

interface SyncStatusProps {
  status: ProviderStatus;
}

export function SyncStatus({ status }: SyncStatusProps) {
  const { label, icon: Icon, className, spin } = STATUS_VIEWS[status];

  return (
    <span
      role="status"
      aria-live="polite"
      title={`Sync server: ${SYNC_SERVER_URL}`}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1',
        className
      )}
    >
      <Icon size={14} aria-hidden className={spin ? 'animate-spin' : undefined} />
      {label}
    </span>
  );
}
