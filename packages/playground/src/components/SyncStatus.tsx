import { CloudOff, Loader2, ServerCrash, Wifi, type LucideIcon } from 'lucide-react';
import type { SyncStatus as SyncStatusValue } from '../hooks/useSyncConnection';
import { SYNC_SERVER_URL } from '../sync';
import { cx } from './ui/classes';

interface StatusView {
  label: string;
  icon: LucideIcon;
  className: string;
  title: string;
  spin?: boolean;
}

const STATUS_VIEWS: Record<SyncStatusValue, StatusView> = {
  connecting: {
    label: 'Connecting',
    icon: Loader2,
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    title: `Sync server: ${SYNC_SERVER_URL}`,
    spin: true,
  },
  connected: {
    label: 'Syncing',
    icon: Loader2,
    className: 'bg-amber-50 text-amber-800 ring-amber-200',
    title: `Sync server: ${SYNC_SERVER_URL}`,
    spin: true,
  },
  synced: {
    label: 'Synced',
    icon: Wifi,
    className: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    title: `Sync server: ${SYNC_SERVER_URL}`,
  },
  unreachable: {
    label: 'Server offline',
    icon: ServerCrash,
    className: 'bg-red-50 text-red-800 ring-red-200',
    title: `Sync server unreachable: ${SYNC_SERVER_URL}`,
  },
  offline: {
    label: 'Offline',
    icon: CloudOff,
    className: 'bg-slate-100 text-slate-700 ring-slate-300',
    title: 'Sync is turned off for this tab',
  },
};

interface SyncStatusProps {
  status: SyncStatusValue;
}

export function SyncStatus({ status }: SyncStatusProps) {
  const { label, icon: Icon, className, title, spin } = STATUS_VIEWS[status];

  return (
    <span
      role="status"
      aria-live="polite"
      title={title}
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
