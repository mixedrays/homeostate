import { useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { compareReports, formatPercent, type ComparisonRow, type MetricDelta } from '@homeostate/benchmark/report';
import { Heatmap, type HeatCell } from '../components/Heatmap';
import { Card, Controls, Field, Note, Select, StatTile } from '../components/ui';
import { cx, tableClass, tdClass, thClass } from '../components/classes';
import { inkFor, mix } from '../lib/color';
import { DIVERGING, STATUS, colorFor } from '../lib/palette';
import { backendsOf, runLabel, scenariosOf, sizesOf, type Run } from '../lib/runs';

interface CompareViewProps {
  current: Run;
  runs: Run[];
  baselineId: string | null;
  onBaselineChange(id: string): void;
  slots: Map<string, number>;
}

const REPLICA_METRICS = ['seed', 'adopt', 'doc size', 'heap / replica'];
const OPERATION_METRICS = ['write', 'roundtrip', 'wire / op', 'doc Δ / op', 'heap Δ / op'];

const isRegression = (delta: MetricDelta): boolean => delta.significant && (Number.isNaN(delta.change) || delta.change > 0);
const isImprovement = (delta: MetricDelta): boolean => delta.significant && delta.change < 0;

const columnsFor = (rows: ComparisonRow[], metrics: string[]): string[] =>
  metrics.filter((metric) => rows.some((row) => row.deltas.some((d) => d.metric === metric)));

function DeltaCell({ delta }: { delta: MetricDelta | undefined }) {
  if (!delta) return <td className={cx(tdClass, 'text-slate-400')}>—</td>;
  const regression = isRegression(delta);
  const improvement = isImprovement(delta);
  return (
    <td className={tdClass}>
      <span className="inline-flex items-center gap-2">
        <span className="text-slate-500">
          {delta.format(delta.before)} <span className="text-slate-300">→</span>{' '}
          <span className={cx(delta.significant ? 'font-semibold text-slate-900' : 'text-slate-700')}>{delta.format(delta.after)}</span>
        </span>
        <span
          className={cx(
            'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-medium tabular-nums',
            regression && 'bg-red-50 text-red-800 ring-1 ring-red-200',
            improvement && 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200',
            !delta.significant && 'bg-slate-100 text-slate-500'
          )}
          title={delta.significant ? (regression ? 'regression beyond the threshold' : 'improvement beyond the threshold') : 'within the threshold or the margin of error'}
        >
          {regression && <TrendingUp size={12} aria-hidden style={{ color: STATUS.critical }} />}
          {improvement && <TrendingDown size={12} aria-hidden style={{ color: STATUS.goodText }} />}
          {formatPercent(delta.change)}
        </span>
      </span>
    </td>
  );
}

export function CompareView({ current, runs, baselineId, onBaselineChange, slots }: CompareViewProps) {
  const [thresholdPct, setThresholdPct] = useState(5);
  const [onlySignificant, setOnlySignificant] = useState(false);
  const [heatMetric, setHeatMetric] = useState('write');

  const others = runs.filter((run) => run.id !== current.id);
  const baseline = others.find((run) => run.id === baselineId) ?? null;

  const comparison = useMemo(
    () => (baseline ? compareReports(baseline.report, current.report, Math.max(0, thresholdPct) / 100) : null),
    [baseline, current, thresholdPct]
  );

  if (others.length === 0)
    return (
      <Card title="Compare two runs">
        <Note>
          Load a second report to compare against: save one with <code className="rounded-sm bg-slate-100 px-1 py-0.5 font-mono">pnpm bench -- --json results/before.json</code>{' '}
          or drop any report JSON onto this page. Rows are joined by backend, scenario, and size, so the runs should cover the same matrix.
        </Note>
      </Card>
    );

  const deltas = comparison?.rows.flatMap((row) => row.deltas) ?? [];
  const regressions = deltas.filter(isRegression).length;
  const improvements = deltas.filter(isImprovement).length;
  const unmatched = baseline
    ? current.report.operations.length + current.report.replicas.length - (comparison?.rows.length ?? 0)
    : 0;

  const sizes = sizesOf(current.report);
  const backends = backendsOf(current.report);
  const scenarios = scenariosOf(current.report);
  const cap = Math.max(0.1, ...deltas.filter((d) => d.metric === heatMetric && Number.isFinite(d.change)).map((d) => Math.abs(d.change)));

  const heatCell = (row: { key: string }, group: { key: string }, column: { key: string }): HeatCell | null => {
    const match = comparison?.rows.find((r) => r.size === Number(group.key) && r.scenario === row.key && r.backend === column.key);
    const delta = match?.deltas.find((d) => d.metric === heatMetric);
    if (!delta) return null;
    const t = Number.isNaN(delta.change) ? 1 : Math.min(1, Math.abs(delta.change) / cap);
    const fill = !delta.significant
      ? DIVERGING.mid
      : mix(DIVERGING.mid, delta.change > 0 || Number.isNaN(delta.change) ? DIVERGING.high : DIVERGING.low, 0.2 + 0.8 * t);
    return {
      text: formatPercent(delta.change),
      fill,
      ink: delta.significant ? inkFor(fill) : '#898781',
      rows: [
        { label: 'before', value: delta.format(delta.before) },
        { label: 'after', value: delta.format(delta.after) },
        { label: 'change', value: formatPercent(delta.change) },
        { label: 'verdict', value: isRegression(delta) ? 'regression' : isImprovement(delta) ? 'improvement' : 'within noise' },
      ],
    };
  };

  const visibleRows = (rows: ComparisonRow[]): ComparisonRow[] =>
    onlySignificant ? rows.filter((row) => row.deltas.some((d) => d.significant)) : rows;

  return (
    <div className="space-y-6">
      <Controls>
        <Field label="Baseline">
          <Select value={baseline?.id ?? ''} onChange={(event) => onBaselineChange(event.target.value)}>
            {!baseline && <option value="">choose a run…</option>}
            {others.map((run) => (
              <option key={run.id} value={run.id}>
                {runLabel(run)} — {run.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Threshold">
          <span className="inline-flex items-center gap-1">
            <input
              type="number"
              min={0}
              step={1}
              value={thresholdPct}
              onChange={(event) => setThresholdPct(Number(event.target.value))}
              className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm tabular-nums shadow-xs focus:border-blue-500 focus:outline-hidden focus:ring-4 focus:ring-blue-500/15"
              aria-label="Threshold in percent"
            />
            <span className="text-sm text-slate-500">%</span>
          </span>
        </Field>
        <label className="inline-flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" checked={onlySignificant} onChange={(event) => setOnlySignificant(event.target.checked)} className="h-4 w-4 rounded-sm border-slate-300 text-blue-600 focus:ring-blue-500" />
          only rows with a significant change
        </label>
      </Controls>

      {!baseline || !comparison ? (
        <Card title="Compare two runs">
          <Note>Choose a baseline run above. The current run is {runLabel(current)}.</Note>
        </Card>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Regressions" value={String(regressions)} detail={`metrics that grew beyond ${thresholdPct}% and the margins of error`} />
            <StatTile label="Improvements" value={String(improvements)} detail={`metrics that shrank beyond ${thresholdPct}% and the margins of error`} />
            <StatTile
              label="Rows compared"
              value={String(comparison.rows.length)}
              detail={unmatched > 0 ? `${unmatched} rows of the current run have no counterpart in the baseline` : 'every row of the current run has a counterpart in the baseline'}
            />
          </div>

          <Note>
            Baseline {runLabel(baseline)} ({baseline.name}) → current {runLabel(current)} ({current.name}). A change counts as significant beyond the
            threshold and, for timings, beyond both runs' margins of error; byte metrics must also move by a small absolute amount.
          </Note>

          <Card
            title="Change per scenario, backend, and size"
            subtitle="Red grows, blue shrinks, gray is within noise. Every metric here is better when lower."
            actions={
              <Field label="Metric">
                <Select value={heatMetric} onChange={(event) => setHeatMetric(event.target.value)}>
                  {OPERATION_METRICS.map((metric) => (
                    <option key={metric} value={metric}>
                      {metric}
                    </option>
                  ))}
                </Select>
              </Field>
            }
          >
            <Heatmap
              ariaLabel={`change in ${heatMetric} between the baseline and the current run`}
              rows={scenarios.map((scenario) => ({ key: scenario, label: scenario }))}
              groups={sizes.map((size) => ({
                key: String(size),
                label: `${size.toLocaleString('en-US')} todos`,
                columns: backends.map((backend) => ({ key: backend, label: backend })),
              }))}
              cell={heatCell}
            />
          </Card>

          {sizes.map((size) => {
            const rows = comparison.rows.filter((row) => row.size === size);
            const replicaRows = visibleRows(rows.filter((row) => row.scenario === null));
            const operationRows = visibleRows(rows.filter((row) => row.scenario !== null));
            if (replicaRows.length === 0 && operationRows.length === 0) return null;
            const replicaColumns = columnsFor(replicaRows, REPLICA_METRICS);
            const operationColumns = columnsFor(operationRows, OPERATION_METRICS);
            return (
              <Card key={size} title={`${size.toLocaleString('en-US')} todos`} subtitle="before → after (change)">
                <div className="space-y-6">
                  {replicaRows.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className={tableClass}>
                        <thead>
                          <tr>
                            <th scope="col" className={thClass}>
                              backend
                            </th>
                            {replicaColumns.map((column) => (
                              <th key={column} scope="col" className={thClass}>
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {replicaRows.map((row) => (
                            <tr key={row.backend} className="hover:bg-slate-50">
                              <td className={tdClass}>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(slots, row.backend) }} aria-hidden />
                                  {row.backend}
                                </span>
                              </td>
                              {replicaColumns.map((column) => (
                                <DeltaCell key={column} delta={row.deltas.find((d) => d.metric === column)} />
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {operationRows.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className={tableClass}>
                        <thead>
                          <tr>
                            <th scope="col" className={thClass}>
                              scenario
                            </th>
                            <th scope="col" className={thClass}>
                              backend
                            </th>
                            {operationColumns.map((column) => (
                              <th key={column} scope="col" className={thClass}>
                                {column}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {operationRows.map((row, index) => (
                            <tr key={`${row.scenario}:${row.backend}`} className="hover:bg-slate-50">
                              <td className={cx(tdClass, 'font-medium text-slate-900')}>
                                {index === 0 || operationRows[index - 1].scenario !== row.scenario ? row.scenario : ''}
                              </td>
                              <td className={tdClass}>
                                <span className="inline-flex items-center gap-1.5">
                                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: colorFor(slots, row.backend) }} aria-hidden />
                                  {row.backend}
                                </span>
                              </td>
                              {operationColumns.map((column) => (
                                <DeltaCell key={column} delta={row.deltas.find((d) => d.metric === column)} />
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
