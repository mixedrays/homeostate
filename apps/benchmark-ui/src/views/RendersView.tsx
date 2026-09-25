import { useState } from 'react';
import { formatDuration } from '@homeostate/benchmark-crdt/report';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChoiceGroup, Controls, SelectField } from '../components/Controls';
import { Heatmap, type HeatCell } from '../components/Heatmap';
import { MetaStrip } from '../components/MetaStrip';
import { Note } from '../components/Note';
import { SeriesLabel } from '../components/SeriesLabel';
import { StatTile } from '../components/StatTile';
import { inkFor } from '../lib/color';
import { formatValue, metricByKey, renderMetrics } from '../lib/metrics';
import { SEQUENTIAL, STATUS, colorFor } from '../lib/palette';
import {
  adaptersOf,
  renderResultAt,
  renderRunLabel,
  renderScenariosOf,
  renderSizesOf,
  type RenderRun,
} from '../lib/render-runs';
import { metricOptions } from './shared';

const COLUMNS = ['scenario', 'adapter', 'row renders', 'list', 'search', 'footer', 'apply', 'commit', 'mount'];

interface RendersViewProps {
  run: RenderRun;
  runs: RenderRun[];
  onRunChange(id: string): void;
  slots: Map<string, number>;
}

/**
 * The adapter comparison. Row renders is the metric and it is an exact integer, so the grid is
 * colored by how far a cell is from the ideal of one row rather than by a magnitude ramp: a
 * cell that re-renders the whole list should not look like a slightly slower one.
 */
export function RendersView({ run, runs, onRunChange, slots }: RendersViewProps) {
  const report = run.report;
  const sizes = renderSizesOf(report);
  const adapters = adaptersOf(report);
  const scenarios = renderScenariosOf(report);

  const [sizeChoice, setSizeChoice] = useState<number | null>(null);
  const [metricKey, setMetricKey] = useState('row-renders');

  const size = sizeChoice !== null && sizes.includes(sizeChoice) ? sizeChoice : sizes[sizes.length - 1];
  const metric = metricByKey(renderMetrics, metricKey);

  const timings = report.results.map(metric.value).filter((v): v is number => v !== null && v > 0);
  const slowest = timings.length > 0 ? Math.max(...timings) : 1;

  const ramp = (t: number): string => SEQUENTIAL[Math.round(Math.min(1, Math.max(0, t)) * (SEQUENTIAL.length - 1))];

  /** Counts are scored against the list they belong to; timings against the slowest cell. */
  const fillFor = (value: number, rows: number): string =>
    metric.unit === 'count' ? ramp((value - 1) / Math.max(1, rows - 1)) : ramp(value / slowest);

  const cell = (row: { key: string }, group: { key: string }, column: { key: string }): HeatCell | null => {
    const at = Number(group.key);
    const result = renderResultAt(report, at, row.key, column.key);
    if (!result) return null;
    const value = metric.value(result);
    if (value === null || !Number.isFinite(value)) return null;
    const fill = fillFor(value, at);
    return {
      text: formatValue(metric.unit, value),
      fill,
      ink: inkFor(fill),
      rows: [
        { label: 'row renders', value: `${result.rowRenders.toLocaleString('en-US')} of ${at.toLocaleString('en-US')}` },
        { label: 'list renders', value: String(result.listRenders) },
        { label: 'search / footer', value: `${result.searchBoxRenders} / ${result.footerRenders}` },
        { label: 'apply', value: formatDuration(result.applyMs) },
        { label: 'commit', value: formatDuration(result.commitMs) },
        { label: 'mount', value: formatDuration(result.mountMs) },
      ],
    };
  };

  const atSize = report.results.filter((result) => result.size === size);
  const worst = atSize.length > 0 ? atSize.reduce((a, b) => (b.rowRenders > a.rowRenders ? b : a)) : null;
  const best = atSize.length > 0 ? atSize.reduce((a, b) => (b.rowRenders < a.rowRenders ? b : a)) : null;

  return (
    <div className="space-y-6">
      <MetaStrip run={run} />

      <Controls>
        {runs.length > 1 && (
          <SelectField
            label="Run"
            options={runs.map((item) => ({ value: item.id, label: `${renderRunLabel(item)} — ${item.name}` }))}
            value={run.id}
            onChange={onRunChange}
            className="max-w-[60vw]"
          />
        )}
        <ChoiceGroup
          label="State size"
          options={sizes.map((s) => ({ value: s, label: `${s.toLocaleString('en-US')} rows` }))}
          value={size}
          onChange={setSizeChoice}
        />
        <SelectField label="Metric" options={metricOptions(renderMetrics)} value={metric.key} onChange={setMetricKey} />
      </Controls>

      {best && worst && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <StatTile
            label="Best row renders"
            value={best.rowRenders.toLocaleString('en-US')}
            detail={`${best.adapter} · ${best.scenario} · ${size.toLocaleString('en-US')} rows`}
          />
          <StatTile
            label="Worst row renders"
            value={worst.rowRenders.toLocaleString('en-US')}
            detail={`${worst.adapter} · ${worst.scenario} · ${size.toLocaleString('en-US')} rows`}
          />
          <StatTile
            label="Ideal"
            value="1"
            detail="one change from a peer should re-render one row"
          />
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Every scenario, adapter, and size</CardTitle>
          <CardDescription>{metric.description}</CardDescription>
        </CardHeader>
        <CardContent>
          {scenarios.length === 0 ? (
            <Note>This run has no results.</Note>
          ) : (
            <Heatmap
              ariaLabel={`${metric.label} for every scenario, adapter, and size`}
              rows={scenarios.map((scenario) => ({ key: scenario, label: scenario }))}
              groups={sizes.map((at) => ({
                key: String(at),
                label: `${at.toLocaleString('en-US')} rows`,
                columns: adapters.map((adapter) => ({ key: adapter, label: adapter })),
              }))}
              cell={cell}
              legend={
                metric.unit === 'count' ? (
                  <Note>
                    Color is the share of the list the cell re-renders: the lightest cell leaves the list alone or
                    touches the one row that changed, the darkest re-renders all of it. A dash marks a cell the run
                    did not measure.
                  </Note>
                ) : (
                  <Note>
                    Timings are advisory: they depend on the fixture&rsquo;s DOM, on jsdom, and on the machine. The
                    counts next to them do not.
                  </Note>
                )
              }
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{`All figures at ${size.toLocaleString('en-US')} rows`}</CardTitle>
          <CardDescription>
            One component per row, counted as it renders. Row renders is the metric; apply, commit and mount are
            advisory.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow>
                {COLUMNS.map((column) => (
                  <TableHead key={column} scope="col">
                    {column}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {scenarios.map((scenario) => {
                const group = adapters
                  .map((adapter) => renderResultAt(report, size, scenario, adapter))
                  .filter((result): result is NonNullable<typeof result> => result !== undefined);
                return group.map((result, index) => {
                  const ideal = result.rowRenders <= 1;
                  return (
                    <TableRow key={`${scenario}:${result.adapter}`}>
                      <TableCell className="font-medium">{index === 0 ? scenario : ''}</TableCell>
                      <TableCell>
                        <SeriesLabel color={colorFor(slots, result.adapter)}>{result.adapter}</SeriesLabel>
                      </TableCell>
                      <TableCell
                        className="font-semibold"
                        style={{ color: ideal ? STATUS.goodText : STATUS.critical }}
                        title={`${result.rowRenders.toLocaleString('en-US')} of ${size.toLocaleString('en-US')} rows`}
                      >
                        {result.rowRenders.toLocaleString('en-US')}
                        {!ideal && (
                          <Badge variant="destructive" className="ml-2 tabular-nums">
                            {Math.round((result.rowRenders / size) * 100)}% of the list
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>{result.listRenders}</TableCell>
                      <TableCell>{result.searchBoxRenders}</TableCell>
                      <TableCell>{result.footerRenders}</TableCell>
                      <TableCell>{formatDuration(result.applyMs)}</TableCell>
                      <TableCell>{formatDuration(result.commitMs)}</TableCell>
                      <TableCell>{formatDuration(result.mountMs)}</TableCell>
                    </TableRow>
                  );
                });
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
