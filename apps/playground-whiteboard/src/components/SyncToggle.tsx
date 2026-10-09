import { Plug, PlugZap } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

interface SyncToggleProps {
  online: boolean;
  onToggle: () => void;
}

/**
 * A plain button whose label names the action it takes. It deliberately has no `aria-pressed`:
 * the label already changes with the state, and a toggle's label must stay constant, or a
 * screen reader announces the state twice with opposite meanings.
 */
export function SyncToggle({ online, onToggle }: SyncToggleProps) {
  const Icon = online ? PlugZap : Plug;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onToggle}
      title={
        online
          ? "Disconnect from the sync server to edit offline"
          : "Reconnect and merge the edits made while offline"
      }
      className={cn(
        !online &&
          "border-primary/30 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary dark:border-primary/30 dark:bg-primary/10 dark:hover:bg-primary/15",
      )}
    >
      <Icon aria-hidden />
      {online ? "Go offline" : "Go online"}
    </Button>
  );
}
