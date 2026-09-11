import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from 'react';
import { AlertTriangle, FolderOpen, Loader2, Upload, X } from 'lucide-react';
import { MetaStrip } from './components/MetaStrip';
import { Note, Select } from './components/ui';
import { cx, focusRing } from './components/classes';
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
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <h1 className="mr-auto text-base font-semibold tracking-tight">
            Homeostate <span className="text-slate-500">benchmark</span>
          </h1>
          {runs.length > 0 && current && (
            <label className="inline-flex items-center gap-2 text-sm text-slate-600">
              <span className="hidden sm:inline">Run</span>
              <Select value={current.id} onChange={(event) => setCurrentId(event.target.value)} className="max-w-[60vw]">
                {runs.map((run) => (
                  <option key={run.id} value={run.id}>
                    {runLabel(run)} — {run.name}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {current && (
            <button
              type="button"
              onClick={() => removeRun(current.id)}
              className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700', focusRing)}
              title="Remove this run from the list"
              aria-label="Remove this run from the list"
            >
              <X size={16} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className={cx(
              'inline-flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700',
              focusRing
            )}
          >
            <FolderOpen size={16} aria-hidden />
            Open JSON
          </button>
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
          <div role="alert" className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="font-medium">Some reports could not be loaded.</p>
              <ul className="mt-1 list-inside list-disc">
                {errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
            <button type="button" onClick={() => setErrors([])} className={cx('self-start rounded-md p-1 hover:bg-amber-100', focusRing)} aria-label="Dismiss">
              <X size={16} aria-hidden />
            </button>
          </div>
        )}

        {loading ? (
          <div role="status" className="flex items-center justify-center gap-2 py-24 text-slate-400">
            <Loader2 size={20} aria-hidden className="animate-spin" />
            Loading reports
          </div>
        ) : !current ? (
          <EmptyState onOpen={() => fileInput.current?.click()} />
        ) : (
          <div className="space-y-6">
            <MetaStrip run={current} />

            <nav role="tablist" aria-label="Views" className="flex flex-wrap gap-1 border-b border-slate-200">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.key}
                  title={item.hint}
                  onClick={() => setTab(item.key)}
                  className={cx(
                    '-mb-px border-b-2 px-3 py-2 text-sm font-medium transition',
                    tab === item.key ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-800',
                    focusRing
                  )}
                >
                  {item.label}
                  {item.key === 'compare' && runs.length > 1 && (
                    <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600">{runs.length}</span>
                  )}
                </button>
              ))}
            </nav>

            <div role="tabpanel">
              {tab === 'overview' && <OverviewView report={current.report} slots={slots} />}
              {tab === 'operations' && <OperationsView report={current.report} slots={slots} />}
              {tab === 'scaling' && <ScalingView report={current.report} slots={slots} />}
              {tab === 'replicas' && <ReplicasView report={current.report} slots={slots} />}
              {tab === 'compare' && (
                <CompareView current={current} runs={runs} baselineId={baselineId} onBaselineChange={setBaselineId} slots={slots} />
              )}
            </div>
          </div>
        )}
      </main>

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 p-6">
          <div className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/80 bg-white/95 px-8 py-6 text-slate-800 shadow-xl">
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
    <section className="mx-auto mt-10 max-w-2xl rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center">
      <Upload size={28} aria-hidden className="mx-auto text-slate-400" />
      <h2 className="mt-3 text-lg font-semibold tracking-tight">No benchmark reports yet</h2>
      <p className="mt-2 text-sm text-slate-600">
        Save a run as JSON and this page picks it up from <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-xs">packages/benchmark/results</code>:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-left text-xs leading-relaxed text-slate-100">
        <code>{'pnpm bench -- --json results/main.json\npnpm bench -- --quick --json results/quick.json   # smoke run, under a minute'}</code>
      </pre>
      <p className="mt-4 text-sm text-slate-600">Or drop report files anywhere on this page.</p>
      <button
        type="button"
        onClick={onOpen}
        className={cx('mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-slate-700', focusRing)}
      >
        <FolderOpen size={16} aria-hidden />
        Open JSON
      </button>
      <div className="mt-6 text-left">
        <Note>
          In development the results folder is watched, so a newly saved report appears without a reload. A production build bundles whatever is
          in the folder at build time.
        </Note>
      </div>
    </section>
  );
}

export default App;
