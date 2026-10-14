import { useState, type ReactNode } from "react";
import { ChevronUp, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTitle,
  PopoverTrigger,
} from "../components/ui/popover";
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
import { healthOf, linkLabel, type SyncHealth } from "./sync-health";

/**
 * The inspected source has room to stay readable. A compact sync summary opens the
 * detailed statuses, each linking to the tab that explains it.
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
  const [open, setOpen] = useState(false);
  const health = healthOf(snapshot, useNetworkSnapshot(source.network));

  const { engine } = health;
  const items = indicatorsOf(health);
  if (items.length === 0) return null;
  const issues = items.filter(({ warn }) => warn).length;
  const summary =
    issues > 0
      ? `${issues} ${issues === 1 ? "issue" : "issues"}`
      : engine
        ? "Connected"
        : items[0].label;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="xs"
            aria-label="Sync status"
            title={items.map(({ label }) => label).join(", ")}
            className={cn(
              "max-w-36 shrink-0 gap-1",
              issues > 0 && "text-amber-700 dark:text-amber-400",
            )}
          />
        }
      >
        {issues > 0 ? (
          <TriangleAlert />
        ) : engine ? (
          <HomeostateMark state={engine} className="[--hm-ink:currentColor]" />
        ) : (
          <Wifi />
        )}
        <span className="min-w-0 truncate">{summary}</span>
        <ChevronUp />
      </PopoverTrigger>
      <PopoverContent
        side="top"
        positionMethod="fixed"
        collisionAvoidance={{
          side: "none",
          align: "shift",
          fallbackAxisSide: "none",
        }}
        align="end"
        aria-label="Sync status details"
        className="max-h-(--available-height) w-64 max-w-[calc(100vw-1rem)] gap-1 overflow-y-auto"
      >
        <PopoverTitle className="mb-1 text-xs [overflow-wrap:anywhere]">
          Sync status for {source.name}
        </PopoverTitle>
        {items.map(({ id, label, warn, tab, title, icon }) => (
          <StatusItem
            key={id}
            warn={warn}
            title={title}
            onClick={() => {
              onOpenTab(tab);
              setOpen(false);
            }}
          >
            {icon}
            <span>{label}</span>
          </StatusItem>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/** The available indicators, including expected simulation conditions that need a look. */
function indicatorsOf({ engine, link, diverged, backendError }: SyncHealth) {
  const items: {
    id: string;
    label: string;
    warn: boolean;
    tab: string;
    title: string;
    icon: ReactNode;
  }[] = [];
  if (backendError)
    items.push({
      id: "backend",
      label: "Backend error",
      warn: true,
      tab: "sync",
      title: "Backend inspection failed: show the error on the Sync tab",
      icon: <TriangleAlert />,
    });
  if (diverged > 0)
    items.push({
      id: "diverged",
      label: `${diverged} diverged`,
      warn: true,
      tab: "sync",
      title:
        "Keys the backend holds another value for: show them on the Sync tab",
      icon: <TriangleAlert />,
    });
  if (link)
    items.push({
      id: "link",
      label: linkLabel[link],
      warn: link !== "online",
      tab: "network",
      title: "Network link: show it on the Network tab",
      icon: link === "online" || link === "conditions" ? <Wifi /> : <WifiOff />,
    });
  if (engine)
    items.push({
      id: "engine",
      label: engine === "connected" ? "Connected" : "Disconnected",
      warn: engine === "disconnected",
      tab: "network",
      title: "Sync engine: switch it on the Network tab",
      icon: (
        <HomeostateMark state={engine} className="[--hm-ink:currentColor]" />
      ),
    });
  return items;
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
    <Button
      size="xs"
      variant="ghost"
      title={title}
      onClick={onClick}
      className={cn(
        "h-auto w-full justify-start gap-2 rounded-sm px-2 py-1.5 text-left whitespace-normal [&_svg]:size-3 [&_svg]:shrink-0",
        warn && "text-amber-700 dark:text-amber-400",
      )}
    >
      {children}
    </Button>
  );
}
