import {
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { Layers, TriangleAlert, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "../components/ui/sheet";
import { Switch } from "../components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import type { DevtoolsSource, Inspector } from "../inspector";
import { usePersistedState } from "../lib/use-persisted-state";
import { HomeostateMark } from "./mark";
import { LogTab } from "./log-tab";
import { StateTab } from "./state-tab";
import { StorageTab } from "./storage-tab";
import { SyncTab } from "./sync-tab";

export type PanelPosition = "right" | "left" | "bottom" | "top";

export interface SourceInspector {
  source: DevtoolsSource;
  inspector: Inspector;
}

const TABS = ["state", "sync", "log", "storage"];
const MIN_SIZE = 280;
const RESIZE_STEP = 16;

interface DevtoolsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: PanelPosition;
  sources: SourceInspector[];
  selected: number;
  onSelect: (name: string) => void;
}

/**
 * A non-modal Base UI dialog docked to one edge: the page stays usable while it is open,
 * so the state can be watched while the app is being driven.
 */
export function DevtoolsPanel({
  open,
  onOpenChange,
  position,
  sources,
  selected,
  onSelect,
}: DevtoolsPanelProps) {
  const vertical = position === "left" || position === "right";
  const [size, setSize] = usePersistedState<number>(
    vertical ? "width" : "height",
    vertical ? 440 : 360,
  );
  const current = sources[selected];

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      modal={false}
      disablePointerDismissal
    >
      <SheetContent
        side={position}
        showOverlay={false}
        showCloseButton={false}
        style={
          vertical
            ? { width: size, maxWidth: "100vw" }
            : { height: size, maxHeight: "100vh" }
        }
        className="z-40 gap-0 overflow-visible p-0 shadow-2xl data-[side=left]:sm:max-w-none data-[side=right]:sm:max-w-none"
      >
        <ResizeHandle position={position} size={size} onResize={setSize} />
        <header className="flex min-h-11 items-center gap-2 border-b px-3 py-1.5">
          <HomeostateMark className="size-5 shrink-0" />
          <SheetTitle className="text-sm font-semibold">Homeostate</SheetTitle>
          <SheetDescription className="sr-only">
            Inspect and edit the state homeostate keeps in sync.
          </SheetDescription>
          {sources.length > 1 ? (
            <Select
              value={current?.source.name ?? null}
              onValueChange={(name) => name !== null && onSelect(name)}
            >
              <SelectTrigger
                size="sm"
                aria-label="Source"
                className="min-w-0 text-xs"
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
              <span className="min-w-0 truncate text-xs text-muted-foreground">
                {current.source.name}
              </span>
            )
          )}
          <div className="ml-auto flex shrink-0 items-center gap-2">
            {current && <EngineSwitch inspector={current.inspector} />}
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Close devtools"
                />
              }
            >
              <X />
            </SheetClose>
          </div>
        </header>

        {current ? (
          <SourceView
            key={current.source.name}
            name={current.source.name}
            inspector={current.inspector}
          />
        ) : (
          <Empty className="flex-1">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Layers />
              </EmptyMedia>
              <EmptyTitle>No sources</EmptyTitle>
              <EmptyDescription>
                Pass the stores to inspect in the <code>sources</code> prop.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </SheetContent>
    </Sheet>
  );
}

function useInspectorSnapshot(inspector: Inspector) {
  return useSyncExternalStore(inspector.subscribe, inspector.getSnapshot);
}

function SourceView({
  name,
  inspector,
}: {
  name: string;
  inspector: Inspector;
}) {
  const snapshot = useInspectorSnapshot(inspector);
  const [stored, setTab] = usePersistedState<string>("tab", "state");
  const tab = TABS.includes(stored) ? stored : "state";

  return (
    <>
      {snapshot.connected === false && (
        <p className="border-b bg-amber-500/10 px-3 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          Disconnected: changes stay in this store and peers do not see them.
          Reconnecting adopts the backend&apos;s values, so edits made meanwhile
          to keys it holds are dropped.
        </p>
      )}
      <Tabs
        value={tab}
        onValueChange={(value: string) => setTab(value)}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="border-b">
          <TabsList variant="line" className="h-7">
            <TabsTrigger value="state" className="text-xs">
              State
              {snapshot.warnings.length > 0 && (
                <TriangleAlert
                  role="img"
                  aria-label={`${snapshot.warnings.length} not JSON`}
                  className="size-3! text-amber-600 dark:text-amber-400"
                />
              )}
            </TabsTrigger>
            <TabsTrigger value="sync" className="text-xs">
              Sync
            </TabsTrigger>
            <TabsTrigger value="log" className="text-xs">
              Log
              <span className="text-muted-foreground tabular-nums">
                {snapshot.log.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="storage" className="text-xs">
              Storage
            </TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="state" className="flex min-h-0 flex-col">
          <StateTab snapshot={snapshot} inspector={inspector} />
        </TabsContent>
        <TabsContent value="sync" className="flex min-h-0 flex-col">
          <SyncTab snapshot={snapshot} />
        </TabsContent>
        <TabsContent value="log" className="flex min-h-0 flex-col">
          <LogTab name={name} snapshot={snapshot} inspector={inspector} />
        </TabsContent>
        <TabsContent value="storage" className="flex min-h-0 flex-col">
          <StorageTab snapshot={snapshot} inspector={inspector} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function EngineSwitch({ inspector }: { inspector: Inspector }) {
  const { connected } = useInspectorSnapshot(inspector);
  if (connected === null) return null;

  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          connected ? "bg-emerald-500" : "bg-amber-500",
        )}
      />
      {connected ? "Connected" : "Disconnected"}
      <Switch
        size="sm"
        checked={connected}
        onCheckedChange={(checked: boolean) =>
          checked ? inspector.connect() : inspector.disconnect()
        }
        aria-label="Sync engine connected"
      />
    </label>
  );
}

const handleClass: Record<PanelPosition, string> = {
  right: "inset-y-0 left-0 w-2 -translate-x-1/2 cursor-col-resize",
  left: "inset-y-0 right-0 w-2 translate-x-1/2 cursor-col-resize",
  bottom: "inset-x-0 top-0 h-2 -translate-y-1/2 cursor-row-resize",
  top: "inset-x-0 bottom-0 h-2 translate-y-1/2 cursor-row-resize",
};

/** Drag or use the arrow keys to resize; the size is remembered. */
function ResizeHandle({
  position,
  size,
  onResize,
}: {
  position: PanelPosition;
  size: number;
  onResize: (size: number) => void;
}) {
  const vertical = position === "left" || position === "right";
  const clamp = (next: number): number => {
    const max = (vertical ? window.innerWidth : window.innerHeight) - 40;
    return Math.round(Math.max(MIN_SIZE, Math.min(next, max)));
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);

    const move = (moved: globalThis.PointerEvent): void => {
      const next =
        position === "right"
          ? window.innerWidth - moved.clientX
          : position === "left"
            ? moved.clientX
            : position === "bottom"
              ? window.innerHeight - moved.clientY
              : moved.clientY;
      onResize(clamp(next));
    };
    const end = (): void => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", end);
      handle.removeEventListener("pointercancel", end);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", end);
    handle.addEventListener("pointercancel", end);
  };

  // Arrow keys move the edge the way it points on screen.
  const grow: Record<PanelPosition, string> = {
    right: "ArrowLeft",
    left: "ArrowRight",
    bottom: "ArrowUp",
    top: "ArrowDown",
  };
  const shrink: Record<PanelPosition, string> = {
    right: "ArrowRight",
    left: "ArrowLeft",
    bottom: "ArrowDown",
    top: "ArrowUp",
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === grow[position]) onResize(clamp(size + RESIZE_STEP));
    else if (event.key === shrink[position])
      onResize(clamp(size - RESIZE_STEP));
    else return;
    event.preventDefault();
  };

  return (
    <div
      role="separator"
      aria-label="Resize devtools"
      aria-orientation={vertical ? "vertical" : "horizontal"}
      aria-valuenow={size}
      aria-valuemin={MIN_SIZE}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onKeyDown={onKeyDown}
      className={cn(
        "absolute z-10 touch-none outline-none transition-colors hover:bg-ring/40 focus-visible:bg-ring/60",
        handleClass[position],
      )}
    />
  );
}
