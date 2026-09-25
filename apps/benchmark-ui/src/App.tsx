import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import { AlertTriangle, FolderOpen, Upload, X } from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MetaStrip } from "./components/MetaStrip";
import { Note } from "./components/Note";
import { discoverRuns } from "./lib/discover";
import {
  assignAdapterSlots,
  parseRenderReport,
  sortRenderRuns,
  type RenderRun,
} from "./lib/render-runs";
import {
  assignSlots,
  parseReport,
  runLabel,
  sortRuns,
  type Run,
} from "./lib/runs";
import { CompareView } from "./views/CompareView";
import { OperationsView } from "./views/OperationsView";
import { OverviewView } from "./views/OverviewView";
import { RendersView } from "./views/RendersView";
import { ReplicasView } from "./views/ReplicasView";
import { ScalingView } from "./views/ScalingView";

type Tab =
  "overview" | "operations" | "scaling" | "replicas" | "compare" | "renders";

/** `renders` reads the render benchmark; every other tab reads the backend matrix. */
const TABS: Array<{ key: Tab; label: string; hint: string }> = [
  {
    key: "overview",
    label: "Overview",
    hint: "every cell of the matrix at a glance",
  },
  {
    key: "operations",
    label: "Operations",
    hint: "backends side by side at one state size",
  },
  {
    key: "scaling",
    label: "Scaling",
    hint: "how a scenario grows with state size",
  },
  {
    key: "replicas",
    label: "Replicas",
    hint: "seed, adopt, document size, and heap per replica",
  },
  {
    key: "compare",
    label: "Compare",
    hint: "before and after between two runs",
  },
  {
    key: "renders",
    label: "Renders",
    hint: "components each adapter re-renders for one change from a peer",
  },
];

/**
 * A dropped file is whichever report it parses as; only a file that is neither is an error,
 * and the message then names the backend report, which is what most files are.
 */
const readFiles = async (
  files: FileList | File[],
): Promise<{ runs: Run[]; renderRuns: RenderRun[]; errors: string[] }> => {
  const runs: Run[] = [];
  const renderRuns: RenderRun[] = [];
  const errors: string[] = [];
  await Promise.all(
    Array.from(files).map(async (file) => {
      const text = await file.text();
      const id = `file:${file.name}:${file.lastModified}:${file.size}`;
      try {
        runs.push({
          kind: "backend",
          id,
          name: file.name,
          source: "file",
          report: parseReport(text),
        });
      } catch (error) {
        try {
          renderRuns.push({
            kind: "render",
            id,
            name: file.name,
            source: "file",
            report: parseRenderReport(text),
          });
        } catch {
          errors.push(
            `${file.name}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }
    }),
  );
  return { runs, renderRuns, errors };
};

function App() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [renderRuns, setRenderRuns] = useState<RenderRun[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [renderId, setRenderId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [errors, setErrors] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const slotsRef = useRef<Map<string, number>>(new Map());
  const slots = useMemo(() => {
    const next = assignSlots(runs, slotsRef.current);
    slotsRef.current = next;
    return next;
  }, [runs]);

  // Adapters get their own color slots: they are a different set of series from the backends.
  const adapterSlotsRef = useRef<Map<string, number>>(new Map());
  const adapterSlots = useMemo(() => {
    const next = assignAdapterSlots(renderRuns, adapterSlotsRef.current);
    adapterSlotsRef.current = next;
    return next;
  }, [renderRuns]);

  const addRuns = useCallback((incoming: Run[]) => {
    if (incoming.length === 0) return;
    setRuns((previous) => {
      const byId = new Map(previous.map((run) => [run.id, run]));
      for (const run of incoming) byId.set(run.id, run);
      return sortRuns([...byId.values()]);
    });
    setCurrentId((previous) => previous ?? sortRuns(incoming)[0].id);
  }, []);

  const addRenderRuns = useCallback((incoming: RenderRun[]) => {
    if (incoming.length === 0) return;
    setRenderRuns((previous) => {
      const byId = new Map(previous.map((run) => [run.id, run]));
      for (const run of incoming) byId.set(run.id, run);
      return sortRenderRuns([...byId.values()]);
    });
    setRenderId((previous) => previous ?? sortRenderRuns(incoming)[0].id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    discoverRuns().then(
      ({ runs: found, renderRuns: foundRenders, errors: problems }) => {
        if (cancelled) return;
        addRuns(found);
        addRenderRuns(foundRenders);
        setErrors(problems);
        setLoading(false);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [addRuns, addRenderRuns]);

  const current = runs.find((run) => run.id === currentId) ?? runs[0] ?? null;
  const currentRender =
    renderRuns.find((run) => run.id === renderId) ?? renderRuns[0] ?? null;
  // With only render reports loaded there is no backend matrix to show, so that tab is it.
  const tabs =
    current === null ? TABS.filter((item) => item.key === "renders") : TABS;
  const activeTab = tabs.some((item) => item.key === tab) ? tab : tabs[0].key;

  useEffect(() => {
    if (!current) return;
    const others = runs.filter((run) => run.id !== current.id);
    if (baselineId !== null && others.some((run) => run.id === baselineId))
      return;
    const previousRun =
      others.find(
        (run) =>
          Date.parse(run.report.meta.date) <=
          Date.parse(current.report.meta.date),
      ) ?? others[0];
    setBaselineId(previousRun?.id ?? null);
  }, [runs, current, baselineId]);

  const openFiles = async (files: FileList | File[] | null): Promise<void> => {
    if (!files || files.length === 0) return;
    const {
      runs: parsed,
      renderRuns: parsedRenders,
      errors: problems,
    } = await readFiles(files);
    addRuns(parsed);
    addRenderRuns(parsedRenders);
    if (parsed.length > 0) setCurrentId(sortRuns(parsed)[0].id);
    if (parsedRenders.length > 0) {
      setRenderId(sortRenderRuns(parsedRenders)[0].id);
      if (parsed.length === 0) setTab("renders");
    }
    if (problems.length > 0)
      setErrors((previous) => [...previous, ...problems]);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setDragging(false);
    void openFiles(event.dataTransfer.files);
  };

  const removeRun = (id: string): void => {
    setRuns((previous) => previous.filter((run) => run.id !== id));
    if (currentId === id) setCurrentId(null);
    if (baselineId === id) setBaselineId(null);
  };

  const runOptions = runs.map((run) => ({
    value: run.id,
    label: `${runLabel(run)} — ${run.name}`,
  }));

  return (
    <div
      className="min-h-screen"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <h1 className="mr-auto font-heading text-base font-semibold tracking-tight">
            Homeostate <span className="text-muted-foreground">benchmark</span>
          </h1>
          {runs.length > 0 && current && activeTab !== "renders" && (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">Run</span>
              <Select
                value={current.id}
                onValueChange={(id) => {
                  if (id !== null) setCurrentId(id);
                }}
                items={runOptions}
              >
                <SelectTrigger
                  size="sm"
                  aria-label="Run"
                  className="max-w-[60vw]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    {runOptions.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          )}
          {current && activeTab !== "renders" && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeRun(current.id)}
              title="Remove this run from the list"
              aria-label="Remove this run from the list"
              className="text-muted-foreground"
            >
              <X aria-hidden />
            </Button>
          )}
          <Button onClick={() => fileInput.current?.click()}>
            <FolderOpen aria-hidden />
            Open JSON
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            multiple
            className="sr-only"
            onChange={(event) => {
              void openFiles(event.target.files);
              event.target.value = "";
            }}
          />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {errors.length > 0 && (
          <Alert className="mb-4">
            <AlertTriangle />
            <AlertTitle>Some reports could not be loaded.</AlertTitle>
            <AlertDescription>
              <ul className="list-inside list-disc">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </AlertDescription>
            <AlertAction>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setErrors([])}
                aria-label="Dismiss"
              >
                <X aria-hidden />
              </Button>
            </AlertAction>
          </Alert>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-24 text-muted-foreground">
            <Spinner aria-label="Loading reports" className="size-5" />
            <span aria-hidden>Loading reports</span>
          </div>
        ) : !current && !currentRender ? (
          <EmptyState onOpen={() => fileInput.current?.click()} />
        ) : (
          <div className="space-y-6">
            {current && activeTab !== "renders" && <MetaStrip run={current} />}

            <Tabs
              value={activeTab}
              onValueChange={(value) => setTab(value as Tab)}
              className="gap-6"
            >
              <TabsList
                variant="line"
                aria-label="Views"
                className="h-auto w-full justify-start border-b"
              >
                {tabs.map((item) => (
                  <TabsTrigger
                    key={item.key}
                    value={item.key}
                    title={item.hint}
                    className="flex-none py-1.5"
                  >
                    {item.label}
                    {item.key === "compare" && runs.length > 1 && (
                      <Badge
                        variant="secondary"
                        className="h-4 px-1.5 text-[10px] tabular-nums"
                      >
                        {runs.length}
                      </Badge>
                    )}
                    {item.key === "renders" && renderRuns.length > 1 && (
                      <Badge
                        variant="secondary"
                        className="h-4 px-1.5 text-[10px] tabular-nums"
                      >
                        {renderRuns.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

              {current && (
                <>
                  <TabsContent value="overview">
                    <OverviewView report={current.report} slots={slots} />
                  </TabsContent>
                  <TabsContent value="operations">
                    <OperationsView report={current.report} slots={slots} />
                  </TabsContent>
                  <TabsContent value="scaling">
                    <ScalingView report={current.report} slots={slots} />
                  </TabsContent>
                  <TabsContent value="replicas">
                    <ReplicasView report={current.report} slots={slots} />
                  </TabsContent>
                  <TabsContent value="compare">
                    <CompareView
                      current={current}
                      runs={runs}
                      baselineId={baselineId}
                      onBaselineChange={setBaselineId}
                      slots={slots}
                    />
                  </TabsContent>
                </>
              )}
              <TabsContent value="renders">
                {currentRender ? (
                  <RendersView
                    run={currentRender}
                    runs={renderRuns}
                    onRunChange={setRenderId}
                    slots={adapterSlots}
                  />
                ) : (
                  <Note>
                    No render report loaded. Save one with{" "}
                    <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">
                      pnpm bench:store -- --json results/quick.json
                    </code>{" "}
                    and it appears here from apps/benchmark-store/results.
                  </Note>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-foreground/40 p-6">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-background/80 bg-background/95 px-8 py-6 text-foreground shadow-xl">
            <Upload size={22} aria-hidden />
            <span className="text-base font-medium">
              Drop benchmark JSON reports to open them
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function EmptyState({ onOpen }: { onOpen(): void }) {
  return (
    <Empty className="mx-auto mt-10 max-w-2xl border-2 bg-card p-8">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Upload />
        </EmptyMedia>
        <EmptyTitle className="text-lg">No benchmark reports yet</EmptyTitle>
        <EmptyDescription>
          Save a run as JSON and this page picks it up from{" "}
          <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">
            apps/benchmark-crdt/results
          </code>{" "}
          or{" "}
          <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">
            apps/benchmark-store/results
          </code>
          :
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-xl">
        <pre className="w-full overflow-x-auto rounded-xl bg-foreground p-4 text-left text-xs leading-relaxed text-background">
          <code>
            {
              "pnpm bench:crdt -- --json results/main.json\npnpm bench:crdt -- --quick --json results/quick.json   # smoke run, under a minute\npnpm bench:store -- --json results/quick.json   # render counts per adapter"
            }
          </code>
        </pre>
        <p className="text-sm text-muted-foreground">
          Or drop report files anywhere on this page.
        </p>
        <Button onClick={onOpen}>
          <FolderOpen aria-hidden />
          Open JSON
        </Button>
        <div className="text-left">
          <Note>
            In development the results folder is watched, so a newly saved
            report appears without a reload. A production build bundles whatever
            is in the folder at build time.
          </Note>
        </div>
      </EmptyContent>
    </Empty>
  );
}

export default App;
