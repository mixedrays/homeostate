import { useState } from 'react';
import { formatBytes, formatDuration } from '@homeostate/benchmark/report';
import type { OperationResult } from '@homeostate/benchmark/types';
import { Heatmap, type HeatCell } from '../components/Heatmap';
import { Card, Field, Note, Select, StatTile } from '../components/ui';
import { inkFor, mix } from '../lib/color';
import { formatRatio, formatValue, metricByKey, operationMetrics } from '../lib/metrics';
import { DIVERGING, SEQUENTIAL } from '../lib/palette';
import { backendsOf, operationAt, scenariosOf, sizesOf } from '../lib/runs';
import { finite, type ViewProps } from './shared';

interface Highlight {
  label: string;
  value: string;
  detail: string;
}

const where = (o: OperationResult): string => `${o.scenario} · ${o.backend} · ${o.size.toLocaleString('en-US')} todos`;

const highlights = (operations: OperationResult[]): Highlight[] => {
  if (operations.length === 0) return [];
  const list: Highlight[] = [];

  const slowest = operations.reduce((a, b) => (b.write.mean > a.write.mean ? b : a));
  list.push({ label: 'Slowest write', value: formatDuration(slowest.write.mean), detail: where(slowest) });

  let widest: { ratio: number; fast: OperationResult; slow: OperationResult } | null = null;
  const groups = new Map<string, OperationResult[]>();
  for (const o of operations) {
    const key = `${o.size}|${o.scenario}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const fast = group.reduce((a, b) => (b.write.mean < a.write.mean ? b : a));
    const slow = group.reduce((a, b) => (b.write.mean > a.write.mean ? b : a));
    const ratio = fast.write.mean === 0 ? Infinity : slow.write.mean / fast.write.mean;
    if (widest === null || ratio > widest.ratio) widest = { ratio, fast, slow };
  }
  if (widest !== null)
    list.push({
      label: 'Widest gap between backends',
      value: formatRatio(widest.slow.write.mean, widest.fast.write.mean),
      detail: `${widest.slow.scenario} · ${widest.slow.size.toLocaleString('en-US')} todos: ${widest.slow.backend} vs ${widest.fast.backend} on write`,
    });

  const noisiest = operations
    .flatMap((o) => [
      { o, which: 'write', rme: o.write.rme },
      { o, which: 'roundtrip', rme: o.roundtrip.rme },
    ])
    .reduce((a, b) => (b.rme > a.rme ? b : a));
  list.push({
    label: 'Noisiest timing',
    value: `±${noisiest.rme.toFixed(1)}%`,
    detail: `${noisiest.which} · ${where(noisiest.o)}`,
  });

  const wired = operations.filter((o) => o.wireBytesPerOp !== null);
  if (wired.length > 0) {
    const heaviest = wired.reduce((a, b) => ((b.wireBytesPerOp ?? 0) > (a.wireBytesPerOp ?? 0) ? b : a));
    list.push({ label: 'Heaviest wire per op', value: formatBytes(heaviest.wireBytesPerOp), detail: where(heaviest) });
  }

  return list;
};

export function OverviewView({ report }: ViewProps) {
  const [metricKey, setMetricKey] = useState('write');
  const metric = metricByKey(operationMetrics, metricKey);
  const sizes = sizesOf(report);
  const backends = backendsOf(report);
  const scenarios = scenariosOf(report);

  const values = finite(report.operations.map(metric.value));
  const positive = values.filter((v) => v > 0);
  const logMin = positive.length > 0 ? Math.log(Math.min(...positive)) : 0;
  const logMax = positive.length > 0 ? Math.log(Math.max(...positive)) : 1;
  const magnitude = Math.max(1, ...values.map((v) => Math.abs(v)));

  const fillFor = (value: number): string => {
    if (metric.signed) {
      const t = Math.min(1, Math.abs(value) / magnitude);
      return value === 0 ? DIVERGING.mid : mix(DIVERGING.mid, value > 0 ? DIVERGING.high : DIVERGING.low, 0.15 + 0.85 * t);
    }
    if (value <= 0 || logMax === logMin) return SEQUENTIAL[0];
    const t = (Math.log(value) - logMin) / (logMax - logMin);
    return SEQUENTIAL[Math.round(t * (SEQUENTIAL.length - 1))];
  };

  const cell = (row: { key: string }, group: { key: string }, column: { key: string }): HeatCell | null => {
    const operation = operationAt(report, Number(group.key), row.key, column.key);
    if (!operation) return null;
    const value = metric.value(operation);
    if (value === null || !Number.isFinite(value)) return null;
    const fill = fillFor(value);
    return {
      text: formatValue(metric.unit, value, metric.signed),
      fill,
      ink: inkFor(fill),
      rows: [
        { label: 'write', value: `${formatDuration(operation.write.mean)} ±${operation.write.rme.toFixed(1)}%` },
        { label: 'write p99', value: formatDuration(operation.write.p99) },
        { label: 'roundtrip', value: `${formatDuration(operation.roundtrip.mean)} ±${operation.roundtrip.rme.toFixed(1)}%` },
        { label: 'wire / op', value: formatBytes(operation.wireBytesPerOp) },
        { label: 'doc Δ / op', value: formatBytes(operation.docBytesPerOp, true) },
        { label: 'heap Δ / op', value: formatBytes(operation.heapBytesPerOp, true) },
      ],
    };
  };

  const tiles = highlights(report.operations);

  return (
    <div className="space-y-6">
      {tiles.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((tile) => (
            <StatTile key={tile.label} label={tile.label} value={tile.value} detail={tile.detail} />
          ))}
        </div>
      )}

      <Card
        title="Every scenario, backend, and size"
        subtitle={metric.description}
        actions={
          <Field label="Metric">
            <Select value={metric.key} onChange={(event) => setMetricKey(event.target.value)}>
              {operationMetrics.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>
        }
      >
        {scenarios.length === 0 ? (
          <Note>This run has no operation results.</Note>
        ) : (
          <Heatmap
            ariaLabel={`${metric.label} for every scenario, backend, and size`}
            rows={scenarios.map((scenario) => ({ key: scenario, label: scenario }))}
            groups={sizes.map((size) => ({
              key: String(size),
              label: `${size.toLocaleString('en-US')} todos`,
              columns: backends.map((backend) => ({ key: backend, label: backend })),
            }))}
            cell={cell}
            legend={
              metric.signed ? (
                <Note>
                  Color shows direction and size of the change per operation: blue shrinks, red grows, gray is
                  unchanged. A dash marks a cell the run did not measure, such as a scenario capped below that size.
                </Note>
              ) : (
                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                  <span>{positive.length > 0 ? formatValue(metric.unit, Math.min(...positive)) : '—'}</span>
                  <span
                    className="h-2.5 w-40 rounded-full"
                    style={{ background: `linear-gradient(to right, ${SEQUENTIAL[0]}, ${SEQUENTIAL[SEQUENTIAL.length - 1]})` }}
                    aria-hidden
                  />
                  <span>{positive.length > 0 ? formatValue(metric.unit, Math.max(...positive)) : '—'}</span>
                  <span className="text-slate-400">
                    log scale across the whole grid; a dash marks a cell the run did not measure
                  </span>
                </div>
              )
            }
          />
        )}
      </Card>
    </div>
  );
}
