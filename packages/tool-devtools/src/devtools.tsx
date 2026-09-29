import { useEffect, useRef } from "react";
import { cn } from "cn";
import { Button } from "./components/ui/button";
import {
  createInspector,
  type DevtoolsSource,
  type Inspector,
} from "./inspector";
import { usePersistedState } from "./lib/use-persisted-state";
import { HomeostateMark } from "./panel/mark";
import {
  DevtoolsPanel,
  type PanelPosition,
  type SourceInspector,
} from "./panel/panel";
import { ShadowHost, type DevtoolsTheme } from "./shadow-host";

export type ButtonPosition =
  "bottom-right" | "bottom-left" | "top-right" | "top-left";

export interface HomeostateDevtoolsProps {
  /** The stores to inspect. With more than one, the panel shows a switcher. */
  sources: DevtoolsSource[];
  /** Viewport corner of the floating button. Defaults to `"bottom-right"`. */
  buttonPosition?: ButtonPosition;
  /** Viewport edge the panel docks to. Defaults to `"right"`. */
  panelPosition?: PanelPosition;
  /** Whether the panel starts open, until it is opened or closed once. Defaults to `false`. */
  initialIsOpen?: boolean;
  /**
   * Controls whether the panel is open, for opening it from the app's own UI. Leave it
   * out to let the devtools manage and remember it.
   */
  open?: boolean;
  /** Called when the floating button, the close button or Escape opens or closes the panel. */
  onOpenChange?: (open: boolean) => void;
  /** Defaults to `"system"`, which follows `prefers-color-scheme`. */
  theme?: DevtoolsTheme;
  /** Log entries kept per source. Defaults to 200. */
  logLimit?: number;
}

const buttonPositionClass: Record<ButtonPosition, string> = {
  "bottom-right": "right-4 bottom-4",
  "bottom-left": "bottom-4 left-4",
  "top-right": "top-4 right-4",
  "top-left": "top-4 left-4",
};

/**
 * A floating button that opens a panel to inspect and edit the state homeostate keeps in
 * sync: the store as a tree or as JSON, the backend document next to it, a log of every
 * change marked local, remote or devtools, and the sync engine's connection.
 *
 * It renders into a shadow root on `document.body` with its own styles, so the page's CSS
 * and its own do not mix. Every edit goes through the source's `adapter.setState`, so the
 * engine syncs it like any other local change.
 *
 * @example
 * ```tsx
 * <HomeostateDevtools
 *   sources={[{ name: "Todos", adapter, backend, engine }]}
 *   buttonPosition="bottom-left"
 * />
 * ```
 */
export function HomeostateDevtools({
  sources,
  buttonPosition = "bottom-right",
  panelPosition = "right",
  initialIsOpen = false,
  open: controlledOpen,
  onOpenChange,
  theme = "system",
  logLimit,
}: HomeostateDevtoolsProps) {
  const inspectors = useInspectors(sources, logLimit);
  const [storedOpen, setStoredOpen] = usePersistedState("open", initialIsOpen);
  const open = controlledOpen ?? storedOpen;
  const setOpen = (next: boolean): void => {
    if (controlledOpen === undefined) setStoredOpen(next);
    onOpenChange?.(next);
  };
  const [selectedName, setSelectedName] = usePersistedState(
    "source",
    sources[0]?.name ?? "",
  );
  const selected = Math.max(
    0,
    inspectors.findIndex(({ source }) => source.name === selectedName),
  );

  return (
    <ShadowHost theme={theme}>
      <Button
        variant="outline"
        size="icon-lg"
        aria-label={
          open ? "Close Homeostate devtools" : "Open Homeostate devtools"
        }
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed z-40 size-11 rounded-full bg-background shadow-lg hover:scale-105 dark:bg-background",
          buttonPositionClass[buttonPosition],
        )}
      >
        <HomeostateMark className="size-6!" />
      </Button>
      <DevtoolsPanel
        open={open}
        onOpenChange={setOpen}
        position={panelPosition}
        sources={inspectors}
        selected={selected}
        onSelect={setSelectedName}
      />
    </ShadowHost>
  );
}

interface CachedInspector {
  source: DevtoolsSource;
  inspector: Inspector;
}

const sameSetup = (a: DevtoolsSource, b: DevtoolsSource): boolean =>
  a.adapter === b.adapter && a.backend === b.backend && a.engine === b.engine;

/**
 * One inspector per source, kept while its adapter, backend and engine stay the same, so an
 * inline `sources` array does not reset the log on every render. Inspectors watch the store
 * from mount, whether the panel is open or not.
 */
function useInspectors(
  sources: DevtoolsSource[],
  logLimit: number | undefined,
): SourceInspector[] {
  const cache = useRef<CachedInspector[]>([]);

  const current = sources.map((source): SourceInspector => {
    let cached = cache.current.find((entry) => sameSetup(entry.source, source));
    if (!cached) {
      cached = { source, inspector: createInspector(source, { logLimit }) };
      cache.current.push(cached);
    }
    return { source, inspector: cached.inspector };
  });

  const active = current.map(({ inspector }) => inspector);
  const activeRef = useRef(active);
  activeRef.current = active;
  const activeKey = useInspectorKey(active);

  useEffect(() => {
    const running = activeRef.current;
    cache.current = cache.current.filter(({ inspector }) =>
      running.includes(inspector),
    );
    running.forEach((inspector) => inspector.start());
    return () => running.forEach((inspector) => inspector.stop());
  }, [activeKey]);

  // A new name or filter for the same setup keeps the inspector and its log.
  useEffect(() => {
    for (const { source, inspector } of current) {
      const cached = cache.current.find(
        (entry) => entry.inspector === inspector,
      );
      if (!cached || cached.source === source) continue;
      if (
        cached.source.name !== source.name ||
        cached.source.filter !== source.filter
      )
        inspector.update(source);
      cached.source = source;
    }
  });

  return current;
}

const inspectorIds = new WeakMap<Inspector, number>();
let nextInspectorId = 0;

/** A string that changes when the list of inspectors does, for effect dependencies. */
function useInspectorKey(inspectors: Inspector[]): string {
  return inspectors
    .map((inspector) => {
      let id = inspectorIds.get(inspector);
      if (id === undefined) {
        id = nextInspectorId++;
        inspectorIds.set(inspector, id);
      }
      return id;
    })
    .join(",");
}
