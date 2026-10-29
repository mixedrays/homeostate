import type { KeyboardEvent, PointerEvent, ReactNode } from "react";
import {
  ArrowLeftRight,
  HardDrive,
  Layers,
  ListTree,
  ScrollText,
  TriangleAlert,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import { cn } from "cn";
import { Button } from "../components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "../components/ui/empty";
import { Sheet, SheetClose, SheetContent } from "../components/ui/sheet";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../components/ui/tabs";
import type { DevtoolsSource, Inspector } from "../inspector";
import type { NetworkLink } from "../network";
import { useInspectorSnapshot } from "../lib/use-inspector-snapshot";
import { useNetworkSnapshot } from "../lib/use-network-snapshot";
import { usePersistedState } from "../lib/use-persisted-state";
import type { ButtonPosition, DevtoolsTheme, PanelPosition } from "../options";
import { LogTab } from "./log-tab";
import { conditionsActive } from "./format";
import { NetworkTab } from "./network-tab";
import { SettingsMenu } from "./settings";
import { StateTab } from "./state-tab";
import { StatusBar } from "./status-bar";
import { StorageTab } from "./storage-tab";
import { SyncTab } from "./sync-tab";

export interface SourceInspector {
  source: DevtoolsSource;
  inspector: Inspector;
}

const TABS = ["state", "sync", "log", "storage", "network"];
const MIN_SIZE = 280;
const RESIZE_STEP = 16;

interface DevtoolsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: PanelPosition;
  onPositionChange: (position: PanelPosition) => void;
  buttonPosition: ButtonPosition;
  onButtonPositionChange: (position: ButtonPosition) => void;
  theme: DevtoolsTheme;
  onThemeChange: (theme: DevtoolsTheme) => void;
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
  onPositionChange,
  buttonPosition,
  onButtonPositionChange,
  theme,
  onThemeChange,
  sources,
  selected,
  onSelect,
}: DevtoolsPanelProps) {
  const vertical = position === "left" || position === "right";
  // One size per orientation, so docking to another side keeps both.
  const [width, setWidth] = usePersistedState<number>("width", 440);
  const [height, setHeight] = usePersistedState<number>("height", 360);
  const size = vertical ? width : height;
  const setSize = vertical ? setWidth : setHeight;
  const current = sources[selected];
  const [storedTab, setTab] = usePersistedState<string>("tab", "state");
  const tab = TABS.includes(storedTab) ? storedTab : "state";
  const actions = (
    <div className="flex shrink-0 items-center gap-0.5 px-0.5">
      <SettingsMenu
        position={position}
        onPositionChange={onPositionChange}
        buttonPosition={buttonPosition}
        onButtonPositionChange={onButtonPositionChange}
        theme={theme}
        onThemeChange={onThemeChange}
      />
      <CloseButton />
    </div>
  );

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

        {current ? (
          <SourceView
            key={current.source.name}
            name={current.source.name}
            inspector={current.inspector}
            network={current.source.network}
            tab={tab}
            onTabChange={setTab}
            actions={actions}
          />
        ) : (
          <>
            <div className="flex justify-end border-b bg-muted py-0.5 dark:bg-background">
              {actions}
            </div>
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
          </>
        )}

        <StatusBar sources={sources} current={current} onSelect={onSelect} />
      </SheetContent>
    </Sheet>
  );
}

function SourceView({
  name,
  inspector,
  network,
  tab,
  onTabChange,
  actions,
}: {
  name: string;
  inspector: Inspector;
  network: NetworkLink | undefined;
  tab: string;
  onTabChange: (tab: string) => void;
  actions: ReactNode;
}) {
  const snapshot = useInspectorSnapshot(inspector);
  const link = useNetworkSnapshot(network);

  return (
    <Tabs
      value={tab}
      onValueChange={(value: string) => onTabChange(value)}
      className="min-h-0 flex-1 gap-0"
    >
      {/* A shade darker than the panel, so the tabs read as their own bar. */}
      <div className="@container/tabs flex items-center border-b bg-muted dark:bg-background">
        <div className="min-w-0 flex-1 overflow-x-auto">
          <TabsList variant="line" className="h-7">
            <Tab value="state" icon={ListTree} label="State">
              {snapshot.warnings.length > 0 && (
                <TriangleAlert
                  role="img"
                  aria-label={`${snapshot.warnings.length} not JSON`}
                  className="size-3! text-amber-600 dark:text-amber-400"
                />
              )}
            </Tab>
            <Tab value="sync" icon={ArrowLeftRight} label="Sync" />
            <Tab value="log" icon={ScrollText} label="Log">
              <span className="text-muted-foreground tabular-nums">
                {snapshot.log.length}
              </span>
            </Tab>
            <Tab value="storage" icon={HardDrive} label="Storage" />
            <Tab value="network" icon={Wifi} label="Network">
              {link && conditionsActive(link) && (
                <span
                  role="img"
                  aria-label="conditions on"
                  className="size-1.5 rounded-full bg-amber-500"
                />
              )}
            </Tab>
          </TabsList>
        </div>
        {actions}
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
      <TabsContent value="network" className="flex min-h-0 flex-col">
        <NetworkTab
          snapshot={snapshot}
          inspector={inspector}
          network={network}
        />
      </TabsContent>
    </Tabs>
  );
}

/** A tab with its icon. In a narrow panel only the icon shows, and the name is its tooltip. */
function Tab({
  value,
  icon: Icon,
  label,
  children,
}: {
  value: string;
  icon: LucideIcon;
  label: string;
  children?: ReactNode;
}) {
  return (
    <TabsTrigger value={value} title={label} className="text-xs">
      <Icon aria-hidden data-icon="inline-start" className="size-3.5" />
      <span className="@max-[27rem]/tabs:sr-only">{label}</span>
      {children}
    </TabsTrigger>
  );
}

function CloseButton() {
  return (
    <SheetClose
      render={
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Close devtools"
          className="hover:bg-foreground/10"
        />
      }
    >
      <X />
    </SheetClose>
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
