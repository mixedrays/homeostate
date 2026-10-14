import type { ReactNode } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SheetDescription, SheetTitle } from "../components/ui/sheet";
import { Toggle } from "../components/ui/toggle";
import { useInspectorSnapshot } from "../lib/use-inspector-snapshot";
import { useNetworkSnapshot } from "../lib/use-network-snapshot";
import { HomeostateMark } from "./mark";
import type { SourceInspector } from "./panel";

/**
 * The inspected source has room to stay readable. Beside it, toggles take the network link
 * offline and disconnect the engine.
 */
export function StatusBar({
  sources,
  current,
  onSelect,
}: {
  sources: SourceInspector[];
  current: SourceInspector | undefined;
  onSelect: (name: string) => void;
}) {
  return (
    <footer className="flex min-h-8 shrink-0 items-center gap-1.5 border-t px-2 py-1 text-xs text-muted-foreground">
      <HomeostateMark className="size-3.5 shrink-0" />
      <SheetTitle className={current ? "sr-only" : "text-xs font-semibold"}>
        Homeostate
      </SheetTitle>
      <SheetDescription className="sr-only">
        Inspect and edit the state homeostate keeps in sync.
      </SheetDescription>
      <div className="min-w-0 flex-1">
        {sources.length > 1 ? (
          <Select
            value={current?.source.name ?? null}
            onValueChange={(name) => name !== null && onSelect(name)}
          >
            <SelectTrigger
              size="sm"
              aria-label="Source"
              title={current?.source.name}
              className="w-full min-w-0 gap-1 px-1.5 py-0 text-xs hover:bg-muted data-[size=sm]:h-6 data-[size=sm]:rounded-sm dark:bg-transparent [&_svg]:size-3"
            >
              <SelectValue className="min-w-0">
                <span className="min-w-0 truncate font-medium text-foreground">
                  {current?.source.name}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent
              side="top"
              align="start"
              alignItemWithTrigger={false}
              className="min-w-40 max-w-[calc(100vw-1rem)]"
            >
              {sources.map(({ source }) => (
                <SelectItem
                  key={source.name}
                  value={source.name}
                  className="text-xs"
                >
                  <span className="min-w-0 whitespace-normal [overflow-wrap:anywhere]">
                    {source.name}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          current && (
            <span
              title={current.source.name}
              className="block min-w-0 truncate font-medium text-foreground"
            >
              {current.source.name}
            </span>
          )
        )}
      </div>
      {current && <SyncToggles key={current.source.name} current={current} />}
    </footer>
  );
}

/**
 * The link and the engine as two toggles: Online takes the network link offline and back,
 * Connected disconnects and reconnects the engine. Each shows only for a source that has
 * what it switches, and turns amber while its side is down.
 */
function SyncToggles({
  current: { source, inspector },
}: {
  current: SourceInspector;
}) {
  const { connected } = useInspectorSnapshot(inspector);
  const { network } = source;
  const link = useNetworkSnapshot(network);
  if (!link && connected === null) return null;

  return (
    <div className="flex shrink-0 items-center gap-1">
      {network && link && (
        <StatusToggle
          pressed={!link.conditions.offline}
          warn={!link.connected}
          title={`Network link: ${link.conditions.offline ? "offline" : link.connected ? "online" : "down for a moment"}. Its conditions are on the Network tab.`}
          onPressedChange={(online) =>
            network.setConditions({ offline: !online })
          }
        >
          {link.connected ? <Wifi /> : <WifiOff />}
          Online
        </StatusToggle>
      )}
      {connected !== null && (
        <StatusToggle
          pressed={connected}
          warn={!connected}
          title={`Sync engine: ${connected ? "syncing the store with the backend" : "disconnected, so changes stay in this store"}.`}
          onPressedChange={(next) =>
            next ? inspector.connect() : inspector.disconnect()
          }
        >
          <HomeostateMark
            state={connected ? "connected" : "disconnected"}
            className="[--hm-ink:currentColor]"
          />
          Connected
        </StatusToggle>
      )}
    </div>
  );
}

function StatusToggle({
  pressed,
  warn,
  title,
  onPressedChange,
  children,
}: {
  pressed: boolean;
  warn: boolean;
  title: string;
  onPressedChange: (pressed: boolean) => void;
  children: ReactNode;
}) {
  return (
    <Toggle
      size="xs"
      variant="outline"
      pressed={pressed}
      onPressedChange={onPressedChange}
      title={title}
      className={cn(
        "gap-1 [&_svg]:size-3",
        warn && "text-amber-700 dark:text-amber-400",
      )}
    >
      {children}
    </Toggle>
  );
}
