import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import { cn } from "cn";
import { Button } from "./components/ui/button";
import {
  createInspector,
  type DevtoolsSource,
  type Inspector,
} from "./inspector";
import { usePersistedState } from "./lib/use-persisted-state";
import type {
  ButtonPosition,
  DevtoolsTheme,
  HomeostateDevtoolsProps,
  PanelPosition,
} from "./options";
import { HomeostateMark } from "./panel/mark";
import { DevtoolsPanel, type SourceInspector } from "./panel/panel";
import { healthOf, issuesOf } from "./panel/sync-health";
import { ShadowHost } from "./shadow-host";

const buttonPositionClass: Record<ButtonPosition, string> = {
  "bottom-right": "right-4 bottom-4",
  "bottom-left": "bottom-4 left-4",
  "top-right": "top-4 right-4",
  "top-left": "top-4 left-4",
};

const BUTTON_POSITIONS: ButtonPosition[] = [
  "bottom-right",
  "bottom-left",
  "top-right",
  "top-left",
];
const PANEL_POSITIONS: PanelPosition[] = ["right", "left", "bottom", "top"];
const THEMES: DevtoolsTheme[] = ["system", "light", "dark"];

/** The choice stored when it is one of `options`, otherwise `fallback`. */
const storedOr = <T extends string>(
  stored: string,
  options: T[],
  fallback: T,
): T => ((options as string[]).includes(stored) ? (stored as T) : fallback);

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
  // Picked in the panel's settings; until then the props apply.
  const [storedPosition, setPosition] = usePersistedState<string>(
    "panelPosition",
    "",
  );
  const position = storedOr(storedPosition, PANEL_POSITIONS, panelPosition);
  const [storedCorner, setCorner] = usePersistedState<string>(
    "buttonPosition",
    "",
  );
  const corner = storedOr(storedCorner, BUTTON_POSITIONS, buttonPosition);
  const [storedTheme, setTheme] = usePersistedState<string>("theme", "");
  const activeTheme = storedOr(storedTheme, THEMES, theme);
  const issues = useIssues(inspectors);

  return (
    <ShadowHost theme={activeTheme}>
      <Button
        variant="outline"
        size="icon-lg"
        aria-label={
          open ? "Close Homeostate devtools" : "Open Homeostate devtools"
        }
        aria-expanded={open}
        title={issues || undefined}
        onClick={() => setOpen(!open)}
        className={cn(
          "fixed z-40 size-11 rounded-full bg-background shadow-lg hover:scale-105 dark:bg-background",
          buttonPositionClass[corner],
        )}
      >
        <HomeostateMark className="size-6!" />
        {issues && (
          <span
            aria-hidden
            className="absolute top-0.5 right-0.5 size-2.5 rounded-full bg-amber-500 ring-2 ring-background"
          />
        )}
      </Button>
      <DevtoolsPanel
        open={open}
        onOpenChange={setOpen}
        position={position}
        onPositionChange={setPosition}
        buttonPosition={corner}
        onButtonPositionChange={setCorner}
        theme={activeTheme}
        onThemeChange={setTheme}
        sources={inspectors}
        selected={selected}
        onSelect={setSelectedName}
      />
    </ShadowHost>
  );
}

/**
 * What needs a look across all sources, such as `Todos: disconnected, Offline`, for the
 * floating button while the panel is closed; empty when all is well.
 */
function useIssues(sources: SourceInspector[]): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const stops = sources.flatMap(({ source, inspector }) => [
        inspector.subscribe(onChange),
        ...(source.network ? [source.network.subscribe(onChange)] : []),
      ]);
      return () => stops.forEach((stop) => stop());
    },
    [sources],
  );
  const read = (): string =>
    sources
      .map(({ source, inspector }) => {
        const health = healthOf(
          inspector.getSnapshot(),
          source.network?.getSnapshot() ?? null,
        );
        const issues = issuesOf(health);
        return issues.length > 0 ? `${source.name}: ${issues.join(", ")}` : "";
      })
      .filter(Boolean)
      .join("; ");
  return useSyncExternalStore(subscribe, read);
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

  // A new name, filter or persistence for the same setup keeps the inspector and its log.
  useEffect(() => {
    for (const { source, inspector } of current) {
      const cached = cache.current.find(
        (entry) => entry.inspector === inspector,
      );
      if (!cached || cached.source === source) continue;
      if (
        cached.source.name !== source.name ||
        cached.source.filter !== source.filter ||
        cached.source.persistence !== source.persistence
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
