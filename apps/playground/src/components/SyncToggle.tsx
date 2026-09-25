import { Plug, PlugZap } from 'lucide-react';
import { Toggle } from '@/components/ui/toggle';

interface SyncToggleProps {
  online: boolean;
  onToggle: () => void;
}

export function SyncToggle({ online, onToggle }: SyncToggleProps) {
  const Icon = online ? PlugZap : Plug;

  return (
    <Toggle
      variant="outline"
      size="sm"
      pressed={!online}
      onPressedChange={onToggle}
      title={
        online
          ? 'Disconnect from the sync server to edit offline'
          : 'Reconnect and merge the edits made while offline'
      }
      className="aria-pressed:border-primary/30 aria-pressed:bg-primary/10 aria-pressed:text-primary aria-pressed:hover:bg-primary/15"
    >
      <Icon aria-hidden />
      {online ? 'Go offline' : 'Go online'}
    </Toggle>
  );
}
