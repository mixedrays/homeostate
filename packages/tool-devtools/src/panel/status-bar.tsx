import type { ReactNode } from "react";
import { TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { cn } from "cn";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import { SheetDescription, SheetTitle } from "../components/ui/sheet";
import { useInspectorSnapshot } from "../lib/use-inspector-snapshot";
import { useNetworkSnapshot } from "../lib/use-network-snapshot";
import { HomeostateMark } from "./mark";
import type { SourceInspector } from "./panel";
import { healthOf, linkLabel } from "./sync-health";

/**
 * The thin bar at the bottom of the panel: the mark, the source or a switcher, and the
 * current source's sync at a glance. Each status opens the tab that explains it.
 */
export function StatusBar({
  sources,
  current,
  onSelect,
  onOpenTab,
}: {
  sources: SourceInspector[];
  current: SourceInspector | undefined;
  onSelect: (name: string) => void;
  onOpenTab: (tab: string) => void;
}) {
  return (
    <footer className="@container/status flex h-6 shrink-0 items-center gap-1.5 overflow-hidden border-t px-2 text-[11px] text-muted-foreground">
      <HomeostateMark className="size-3.5 shrink-0" />
      <SheetTitle className="shrink-0 text-[11px] font-semibold @max-[24rem]/status:sr-only">
        Homeostate
      </SheetTitle>
      <SheetDescription className="sr-only">
        Inspect and edit the state homeostate keeps in sync.
      </SheetDescription>
      {current && <span aria-hidden className="h-3 w-px shrink-0 bg-border" />}
      {sources.length > 1 ? (
        <Select
          value={current?.source.name ?? null}
          onValueChange={(name) => name !== null && onSelect(name)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Source"
            className="min-w-0 gap-1 border-transparent px-1 py-0 text-[11px] hover:bg-muted data-[size=sm]:h-5 data-[size=sm]:rounded-sm dark:bg-transparent [&_svg]:size-3"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {sources.map(({ source }) => (
              <SelectItem
                key={source.name}
                value={source.name}
                className="text-xs"
              >
                {source.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        current && (
          <span className="min-w-0 truncate">{current.source.name}</span>
        )
      )}
      {current && (
        <SyncStatus
          key={current.source.name}
          current={current}
          onOpenTab={onOpenTab}
        />
      )}
    </footer>
  );
}

function SyncStatus({
  current: { source, inspector },
  onOpenTab,
}: {
  current: SourceInspector;
  onOpenTab: (tab: string) => void;
}) {
  const snapshot = useInspectorSnapshot(inspector);
  const { engine, link, diverged, backendError } = healthOf(
    snapshot,
    useNetworkSnapshot(source.network),
  );

  return (
    <div className="ml-auto flex shrink-0 items-center gap-0.5">
      {backendError && (
        <StatusItem
          warn
          title="Backend inspection failed: show the error on the Sync tab"
          onClick={() => onOpenTab("sync")}
        >
          <TriangleAlert />
          Backend error
        </StatusItem>
      )}
      {diverged > 0 && (
        <StatusItem
          warn
          title="Keys the backend holds another value for: show them on the Sync tab"
          onClick={() => onOpenTab("sync")}
        >
          <TriangleAlert />
          {diverged} diverged
        </StatusItem>
      )}
      {link && (
        <StatusItem
          warn={link !== "online"}
          title="Network link: show it on the Network tab"
          onClick={() => onOpenTab("network")}
        >
          {link === "online" || link === "conditions" ? <Wifi /> : <WifiOff />}
          {linkLabel[link]}
        </StatusItem>
      )}
      {engine && (
        <StatusItem
          warn={engine === "disconnected"}
          title="Sync engine: switch it on the Network tab"
          onClick={() => onOpenTab("network")}
        >
          <HomeostateMark state={engine} className="[--hm-ink:currentColor]" />
          {engine === "connected" ? "Connected" : "Disconnected"}
        </StatusItem>
      )}
    </div>
  );
}

function StatusItem({
  warn,
  title,
  onClick,
  children,
}: {
  warn: boolean;
  title: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={cn(
        "flex h-5 items-center gap-1 rounded-sm px-1 whitespace-nowrap outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 [&_svg]:size-3 [&_svg]:shrink-0",
        warn && "text-amber-700 dark:text-amber-400",
      )}
    >
      {children}
    </button>
  );
}
