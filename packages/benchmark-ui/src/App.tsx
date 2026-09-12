import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, FolderOpen, Upload, X } from 'lucide-react';
import { Alert, AlertAction, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MetaStrip } from './components/MetaStrip';
import { Note } from './components/Note';
import { discoverRuns } from './lib/discover';
import { assignSlots, parseReport, runLabel, sortRuns, type Run } from './lib/runs';
import { CompareView } from './views/CompareView';
import { OperationsView } from './views/OperationsView';
import { OverviewView } from './views/OverviewView';
import { ReplicasView } from './views/ReplicasView';
import { ScalingView } from './views/ScalingView';

type Tab = 'overview' | 'operations' | 'scaling' | 'replicas' | 'compare';

const TABS: Array<{ key: Tab; label: string; hint: string }> = [
  { key: 'overview', label: 'Overview', hint: 'every cell of the matrix at a glance' },
  { key: 'operations', label: 'Operations', hint: 'backends side by side at one state size' },
  { key: 'scaling', label: 'Scaling', hint: 'how a scenario grows with state size' },
  { key: 'replicas', label: 'Replicas', hint: 'seed, adopt, document size, and heap per replica' },
  { key: 'compare', label: 'Compare', hint: 'before and after between two runs' },
];

const readFiles = async (files: FileList | File[]): Promise<{ runs: Run[]; errors: string[] }> => {
  const runs: Run[] = [];
  const errors: string[] = [];
  await Promise.all(
    Array.from(files).map(async (file) => {
      try {
        const report = parseReport(await file.text());
        runs.push({ id: `file:${file.name}:${file.lastModified}:${file.size}`, name: file.name, source: 'file', report });
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : String(error)}`);
      }
    })
  );
  return { runs, errors };
};

function App() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
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

  const addRuns = useCallback((incoming: Run[]) => {
    if (incoming.length === 0) return;
    setRuns((previous) => {
      const byId = new Map(previous.map((run) => [run.id, run]));
      for (const run of incoming) byId.set(run.id, run);
      return sortRuns([...byId.values()]);
    });
    setCurrentId((previous) => previous ?? sortRuns(incoming)[0].id);
  }, []);

  useEffect(() => {
    let cancelled = false;
    discoverRuns().then(({ runs: found, errors: problems }) => {
      if (cancelled) return;
      addRuns(found);
      setErrors(problems);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [addRuns]);

  const current = runs.find((run) => run.id === currentId) ?? runs[0] ?? null;

  useEffect(() => {
    if (!current) return;
    const others = runs.filter((run) => run.id !== current.id);
    if (baselineId !== null && others.some((run) => run.id === baselineId)) return;
    const previousRun = others.find((run) => Date.parse(run.report.meta.date) <= Date.parse(current.report.meta.date)) ?? others[0];
    setBaselineId(previousRun?.id ?? null);
  }, [runs, current, baselineId]);

  const openFiles = async (files: FileList | File[] | null): Promise<void> => {
    if (!files || files.length === 0) return;
    const { runs: parsed, errors: problems } = await readFiles(files);
    addRuns(parsed);
    if (parsed.length > 0) setCurrentId(sortRuns(parsed)[0].id);
    if (problems.length > 0) setErrors((previous) => [...previous, ...problems]);
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

  const runOptions = runs.map((run) => ({ value: run.id, label: `${runLabel(run)} — ${run.name}` }));

  return (
    <div
      className="min-h-screen"
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={onDrop}
    >
      <header className="sticky top-0 z-20 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <h1 className="mr-auto font-heading text-base font-semibold tracking-tight">
            Homeostate <span className="text-muted-foreground">benchmark</span>
          </h1>
          {runs.length > 0 && current && (
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="hidden sm:inline">Run</span>
              <Select
                value={current.id}
                onValueChange={(id) => {
                  if (id !== null) setCurrentId(id);
                }}
                items={runOptions}
              >
                <SelectTrigger size="sm" aria-label="Run" className="max-w-[60vw]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {runOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {current && (
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
              event.target.value = '';
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
              <Button variant="ghost" size="icon-xs" onClick={() => setErrors([])} aria-label="Dismiss">
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
        ) : !current ? (
          <EmptyState onOpen={() => fileInput.current?.click()} />
        ) : (
          <div className="space-y-6">
            <MetaStrip run={current} />

            <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="gap-6">
              <TabsList variant="line" aria-label="Views" className="h-auto w-full justify-start border-b">
                {TABS.map((item) => (
                  <TabsTrigger key={item.key} value={item.key} title={item.hint} className="flex-none py-1.5">
                    {item.label}
                    {item.key === 'compare' && runs.length > 1 && (
                      <Badge variant="secondary" className="h-4 px-1.5 text-[10px] tabular-nums">
                        {runs.length}
                      </Badge>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>

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
                <CompareView current={current} runs={runs} baselineId={baselineId} onBaselineChange={setBaselineId} slots={slots} />
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-foreground/40 p-6">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-background/80 bg-background/95 px-8 py-6 text-foreground shadow-xl">
            <Upload size={22} aria-hidden />
            <span className="text-base font-medium">Drop benchmark JSON reports to open them</span>
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
          Save a run as JSON and this page picks it up from{' '}
          <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">packages/benchmark/results</code>:
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="max-w-xl">
        <pre className="w-full overflow-x-auto rounded-xl bg-foreground p-4 text-left text-xs leading-relaxed text-background">
          <code>{'pnpm bench -- --json results/main.json\npnpm bench -- --quick --json results/quick.json   # smoke run, under a minute'}</code>
        </pre>
        <p className="text-sm text-muted-foreground">Or drop report files anywhere on this page.</p>
        <Button onClick={onOpen}>
          <FolderOpen aria-hidden />
          Open JSON
        </Button>
        <div className="text-left">
          <Note>
            In development the results folder is watched, so a newly saved report appears without a reload. A production build bundles whatever is
            in the folder at build time.
          </Note>
        </div>
      </EmptyContent>
    </Empty>
  );
}

export default App;
