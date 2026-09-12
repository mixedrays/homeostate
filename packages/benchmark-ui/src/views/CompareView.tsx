import { useId, useMemo, useState } from 'react';
import { TrendingDown, TrendingUp } from 'lucide-react';
import { compareReports, formatPercent, type ComparisonRow, type MetricDelta } from '@homeostate/benchmark/report';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { Controls, SelectField } from '../components/Controls';
import { Heatmap, type HeatCell } from '../components/Heatmap';
import { Note } from '../components/Note';
import { SeriesLabel } from '../components/SeriesLabel';
import { StatTile } from '../components/StatTile';
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
  if (!delta) return <TableCell className="text-muted-foreground">—</TableCell>;
  const regression = isRegression(delta);
  const improvement = isImprovement(delta);
  return (
    <TableCell>
      <span className="inline-flex items-center gap-2">
        <span className="text-muted-foreground">
          {delta.format(delta.before)} <span className="text-muted-foreground/50">→</span>{' '}
          <span className={cn(delta.significant ? 'font-semibold text-foreground' : 'text-foreground/80')}>{delta.format(delta.after)}</span>
        </span>
        <Badge
          variant={regression ? 'destructive' : 'secondary'}
          className={cn('tabular-nums', !delta.significant && 'text-muted-foreground')}
          style={improvement ? { color: STATUS.goodText } : undefined}
          title={delta.significant ? (regression ? 'regression beyond the threshold' : 'improvement beyond the threshold') : 'within the threshold or the margin of error'}
        >
          {regression && <TrendingUp aria-hidden />}
          {improvement && <TrendingDown aria-hidden />}
          {formatPercent(delta.change)}
        </Badge>
      </span>
    </TableCell>
  );
}

export function CompareView({ current, runs, baselineId, onBaselineChange, slots }: CompareViewProps) {
  const [thresholdPct, setThresholdPct] = useState(5);
  const [onlySignificant, setOnlySignificant] = useState(false);
  const [heatMetric, setHeatMetric] = useState('write');
  const thresholdId = useId();
  const significantId = useId();

  const others = runs.filter((run) => run.id !== current.id);
  const baseline = others.find((run) => run.id === baselineId) ?? null;

  const comparison = useMemo(
    () => (baseline ? compareReports(baseline.report, current.report, Math.max(0, thresholdPct) / 100) : null),
    [baseline, current, thresholdPct]
  );

  if (others.length === 0)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Compare two runs</CardTitle>
        </CardHeader>
        <CardContent>
          <Note>
            Load a second report to compare against: save one with <code className="rounded-sm bg-muted px-1 py-0.5 font-mono">pnpm bench -- --json results/before.json</code>{' '}
            or drop any report JSON onto this page. Rows are joined by backend, scenario, and size, so the runs should cover the same matrix.
          </Note>
        </CardContent>
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
        <SelectField
          label="Baseline"
          options={others.map((run) => ({ value: run.id, label: `${runLabel(run)} — ${run.name}` }))}
          value={baseline?.id ?? null}
          onChange={onBaselineChange}
          placeholder="choose a run…"
        />
        <Field orientation="horizontal" className="w-auto">
          <FieldLabel htmlFor={thresholdId} className="font-normal text-muted-foreground">
            Threshold
          </FieldLabel>
          <Input
            id={thresholdId}
            type="number"
            min={0}
            step={1}
            value={thresholdPct}
            onChange={(event) => setThresholdPct(Number(event.target.value))}
            className="h-7 w-16 tabular-nums"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </Field>
        <Field orientation="horizontal" className="w-auto">
          <Checkbox id={significantId} checked={onlySignificant} onCheckedChange={setOnlySignificant} />
          <FieldLabel htmlFor={significantId} className="font-normal text-muted-foreground">
            only rows with a significant change
          </FieldLabel>
        </Field>
      </Controls>

      {!baseline || !comparison ? (
        <Card>
          <CardHeader>
            <CardTitle>Compare two runs</CardTitle>
          </CardHeader>
          <CardContent>
            <Note>Choose a baseline run above. The current run is {runLabel(current)}.</Note>
          </CardContent>
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

          <Card>
            <CardHeader>
              <CardTitle>Change per scenario, backend, and size</CardTitle>
              <CardDescription>Red grows, blue shrinks, gray is within noise. Every metric here is better when lower.</CardDescription>
              <CardAction>
                <SelectField
                  label="Metric"
                  options={OPERATION_METRICS.map((metric) => ({ value: metric, label: metric }))}
                  value={heatMetric}
                  onChange={setHeatMetric}
                />
              </CardAction>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {sizes.map((size) => {
            const rows = comparison.rows.filter((row) => row.size === size);
            const replicaRows = visibleRows(rows.filter((row) => row.scenario === null));
            const operationRows = visibleRows(rows.filter((row) => row.scenario !== null));
            if (replicaRows.length === 0 && operationRows.length === 0) return null;
            const replicaColumns = columnsFor(replicaRows, REPLICA_METRICS);
            const operationColumns = columnsFor(operationRows, OPERATION_METRICS);
            return (
              <Card key={size}>
                <CardHeader>
                  <CardTitle>{`${size.toLocaleString('en-US')} todos`}</CardTitle>
                  <CardDescription>before → after (change)</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  {replicaRows.length > 0 && (
                    <Table className="tabular-nums">
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">backend</TableHead>
                          {replicaColumns.map((column) => (
                            <TableHead key={column} scope="col">
                              {column}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {replicaRows.map((row) => (
                          <TableRow key={row.backend}>
                            <TableCell>
                              <SeriesLabel color={colorFor(slots, row.backend)}>{row.backend}</SeriesLabel>
                            </TableCell>
                            {replicaColumns.map((column) => (
                              <DeltaCell key={column} delta={row.deltas.find((d) => d.metric === column)} />
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                  {operationRows.length > 0 && (
                    <Table className="tabular-nums">
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">scenario</TableHead>
                          <TableHead scope="col">backend</TableHead>
                          {operationColumns.map((column) => (
                            <TableHead key={column} scope="col">
                              {column}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {operationRows.map((row, index) => (
                          <TableRow key={`${row.scenario}:${row.backend}`}>
                            <TableCell className="font-medium">
                              {index === 0 || operationRows[index - 1].scenario !== row.scenario ? row.scenario : ''}
                            </TableCell>
                            <TableCell>
                              <SeriesLabel color={colorFor(slots, row.backend)}>{row.backend}</SeriesLabel>
                            </TableCell>
                            {operationColumns.map((column) => (
                              <DeltaCell key={column} delta={row.deltas.find((d) => d.metric === column)} />
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </>
      )}
    </div>
  );
}
