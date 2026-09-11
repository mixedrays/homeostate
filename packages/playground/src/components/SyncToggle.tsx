import { Plug, PlugZap } from 'lucide-react';
import { cx, focusRing } from './ui/classes';

interface SyncToggleProps {
  online: boolean;
  onToggle: () => void;
}

export function SyncToggle({ online, onToggle }: SyncToggleProps) {
  const Icon = online ? PlugZap : Plug;

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={!online}
      title={
        online
          ? 'Disconnect from the sync server to edit offline'
          : 'Reconnect and merge the edits made while offline'
      }
      className={cx(
        'inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition',
        online
          ? 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
          : 'border-accent-300 bg-accent-50 text-accent-700 hover:bg-accent-100',
        focusRing
      )}
    >
      <Icon size={14} aria-hidden />
      {online ? 'Go offline' : 'Go online'}
    </button>
  );
}
