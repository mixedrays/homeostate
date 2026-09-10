import type {
  BenchmarkReport,
  OperationResult,
  ReplicaResult,
  Timing,
} from './types.js';

export const formatDuration = (ms: number): string => {
  if (!Number.isFinite(ms)) return '—';
  if (ms < 0.0009995) return `${(ms * 1e6).toFixed(0)} ns`;
  if (ms < 0.9995) return `${(ms * 1e3).toFixed(ms < 0.01 ? 1 : 0)} µs`;
  if (ms < 999.5) return `${ms.toFixed(ms < 10 ? 2 : 1)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
};

export const formatBytes = (bytes: number | null, signed = false): string => {
  if (bytes === null || !Number.isFinite(bytes)) return '—';
  const sign = bytes < 0 ? '-' : signed && bytes > 0 ? '+' : '';
  const value = Math.abs(bytes);
  if (value < 1023.5) return `${sign}${value.toFixed(value < 10 && value !== 0 ? 1 : 0)} B`;
  if (value < 1024 ** 2 - 0.5) return `${sign}${(value / 1024).toFixed(1)} KB`;
  return `${sign}${(value / 1024 ** 2).toFixed(2)} MB`;
};

export const formatPercent = (ratio: number): string => {
  if (!Number.isFinite(ratio)) return '—';
  const percent = ratio * 100;
  return `${percent > 0 ? '+' : ''}${percent.toFixed(Math.abs(percent) < 10 ? 1 : 0)}%`;
};

const formatTiming = (timing: Timing): string =>
  `${formatDuration(timing.mean)} ±${timing.rme.toFixed(1)}%`;

const formatRatio = (value: number, best: number): string =>
  best === 0 ? '—' : `${(value / best).toFixed(value / best < 10 ? 1 : 0)}×`;

export const table = (headers: string[], rows: string[][]): string => {
  const widths = headers.map((header, column) =>
    Math.max(header.length, ...rows.map((row) => row[column].length))
  );
  const line = (cells: string[]): string =>
    `| ${cells.map((cell, column) => cell.padEnd(widths[column])).join(' | ')} |`;
  const separator = `| ${widths.map((width) => '-'.repeat(width)).join(' | ')} |`;
  return [line(headers), separator, ...rows.map(line)].join('\n');
};

const groupBy = <T>(items: T[], key: (item: T) => string): Map<string, T[]> => {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const group = groups.get(key(item));
    if (group) group.push(item);
    else groups.set(key(item), [item]);
  }
  return groups;
};

const renderMeta = (report: BenchmarkReport): string => {
  const { meta } = report;
  const commit = meta.commit === null ? 'unknown commit' : `${meta.commit}${meta.dirty ? ' (dirty)' : ''}`;
  const versions = Object.entries(meta.versions)
    .map(([name, version]) => `${name} ${version}`)
    .join(', ');
  return [
    `Homeostate benchmark · ${meta.date} · ${commit} · node ${meta.node}${versions ? ` · ${versions}` : ''}`,
    `${meta.options.time} ms per task, at least ${meta.options.minSamples} samples, ${meta.options.operations} operations per footprint pass`,
  ].join('\n');
};

const renderReplicas = (replicas: ReplicaResult[], size: number): string =>
  table(
    ['backend', 'seed', 'adopt', 'doc size', 'heap / replica'],
    replicas
      .filter((replica) => replica.size === size)
      .map((replica) => [
        replica.backend,
        formatTiming(replica.seed),
        formatTiming(replica.adopt),
        formatBytes(replica.docBytes),
        formatBytes(replica.heapBytes),
      ])
  );

const renderOperations = (operations: OperationResult[], size: number): string => {
  const rows: string[][] = [];
  const groups = groupBy(
    operations.filter((operation) => operation.size === size),
    (operation) => operation.scenario
  );

  for (const [scenario, group] of groups) {
    const best = Math.min(...group.map((operation) => operation.write.mean));
    group.forEach((operation, index) =>
      rows.push([
        index === 0 ? scenario : '',
        operation.backend,
        formatTiming(operation.write),
        formatDuration(operation.write.p99),
        formatRatio(operation.write.mean, best),
        formatTiming(operation.roundtrip),
        formatBytes(operation.wireBytesPerOp),
        formatBytes(operation.docBytesPerOp, true),
        formatBytes(operation.heapBytesPerOp, true),
      ])
    );
  }

  return table(
    ['scenario', 'backend', 'write', 'p99', 'vs best', 'roundtrip', 'wire / op', 'doc Δ / op', 'heap Δ / op'],
    rows
  );
};

export const renderReport = (report: BenchmarkReport): string => {
  const sizes = [...new Set([...report.replicas, ...report.operations].map((r) => r.size))].sort(
    (a, b) => a - b
  );
  const sections = [renderMeta(report)];

  for (const size of sizes) {
    sections.push(`## ${size} todos`);
    if (report.replicas.some((replica) => replica.size === size))
      sections.push(renderReplicas(report.replicas, size));
    if (report.operations.some((operation) => operation.size === size))
      sections.push(renderOperations(report.operations, size));
  }

  return sections.join('\n\n');
};

export interface MetricDelta {
  metric: string;
  before: number;
  after: number;
  /** `(after - before) / |before|`; `NaN` when `before` is zero and `after` is not. */
  change: number;
  /**
   * Beyond the threshold and, for timings, beyond both margins of error; byte metrics must
   * also move by more than a small absolute floor, since encodings and heap snapshots jitter.
   */
  significant: boolean;
  format: (value: number) => string;
}

export interface ComparisonRow {
  size: number;
  scenario: string | null;
  backend: string;
  deltas: MetricDelta[];
}

export interface Comparison {
  baseline: BenchmarkReport['meta'];
  current: BenchmarkReport['meta'];
  threshold: number;
  rows: ComparisonRow[];
}

const timingDelta = (
  metric: string,
  before: Timing,
  after: Timing,
  threshold: number
): MetricDelta => {
  const change = (after.mean - before.mean) / before.mean;
  const noise = (before.rme + after.rme) / 100;
  return {
    metric,
    before: before.mean,
    after: after.mean,
    change,
    significant: Math.abs(change) > Math.max(threshold, noise),
    format: formatDuration,
  };
};

const bytesDelta = (
  metric: string,
  before: number | null,
  after: number | null,
  threshold: number,
  floor: number
): MetricDelta | null => {
  if (before === null || after === null) return null;
  const difference = after - before;
  const change = before === 0 ? (after === 0 ? 0 : NaN) : difference / Math.abs(before);
  return {
    metric,
    before,
    after,
    change,
    significant:
      Math.abs(difference) >= floor && (Number.isNaN(change) || Math.abs(change) > threshold),
    format: (value) => formatBytes(value),
  };
};

/** Bytes a metric must move before its change can count; encodings and heap snapshots jitter. */
const FLOORS = {
  docSize: 64,
  heapPerReplica: 4096,
  wirePerOp: 8,
  docPerOp: 8,
  heapPerOp: 512,
};

const REPLICA_METRICS = ['seed', 'adopt', 'doc size', 'heap / replica'];
const OPERATION_METRICS = ['write', 'roundtrip', 'wire / op', 'doc Δ / op', 'heap Δ / op'];

const replicaKey = (r: ReplicaResult): string => `${r.size}|${r.backend}`;
const operationKey = (o: OperationResult): string => `${o.size}|${o.scenario}|${o.backend}`;

/** Joins two reports on backend, scenario, and size; `threshold` is a ratio such as 0.05. */
export const compareReports = (
  baseline: BenchmarkReport,
  current: BenchmarkReport,
  threshold = 0.05
): Comparison => {
  const rows: ComparisonRow[] = [];

  const baselineReplicas = new Map(baseline.replicas.map((r) => [replicaKey(r), r]));
  for (const after of current.replicas) {
    const before = baselineReplicas.get(replicaKey(after));
    if (!before) continue;
    rows.push({
      size: after.size,
      scenario: null,
      backend: after.backend,
      deltas: [
        timingDelta('seed', before.seed, after.seed, threshold),
        timingDelta('adopt', before.adopt, after.adopt, threshold),
        bytesDelta('doc size', before.docBytes, after.docBytes, threshold, FLOORS.docSize),
        bytesDelta('heap / replica', before.heapBytes, after.heapBytes, threshold, FLOORS.heapPerReplica),
      ].filter((delta): delta is MetricDelta => delta !== null),
    });
  }

  const baselineOperations = new Map(baseline.operations.map((o) => [operationKey(o), o]));
  for (const after of current.operations) {
    const before = baselineOperations.get(operationKey(after));
    if (!before) continue;
    rows.push({
      size: after.size,
      scenario: after.scenario,
      backend: after.backend,
      deltas: [
        timingDelta('write', before.write, after.write, threshold),
        timingDelta('roundtrip', before.roundtrip, after.roundtrip, threshold),
        bytesDelta('wire / op', before.wireBytesPerOp, after.wireBytesPerOp, threshold, FLOORS.wirePerOp),
        bytesDelta('doc Δ / op', before.docBytesPerOp, after.docBytesPerOp, threshold, FLOORS.docPerOp),
        bytesDelta('heap Δ / op', before.heapBytesPerOp, after.heapBytesPerOp, threshold, FLOORS.heapPerOp),
      ].filter((delta): delta is MetricDelta => delta !== null),
    });
  }

  return { baseline: baseline.meta, current: current.meta, threshold, rows };
};

const isRegression = (delta: MetricDelta): boolean =>
  delta.significant && (Number.isNaN(delta.change) || delta.change > 0);

/** True when any timing or byte metric grew beyond the comparison threshold. */
export const hasRegression = (comparison: Comparison): boolean =>
  comparison.rows.some((row) => row.deltas.some(isRegression));

const renderDelta = (delta: MetricDelta): string => {
  const marker = !delta.significant ? '' : isRegression(delta) ? ' ▲' : ' ▼';
  return `${delta.format(delta.before)} → ${delta.format(delta.after)} (${formatPercent(delta.change)})${marker}`;
};

/** Columns in canonical order, limited to the metrics at least one row carries. */
const deltaColumns = (rows: ComparisonRow[], metrics: string[]): string[] =>
  metrics.filter((metric) => rows.some((row) => row.deltas.some((d) => d.metric === metric)));

const deltaCells = (row: ComparisonRow, columns: string[]): string[] =>
  columns.map((metric) => {
    const delta = row.deltas.find((d) => d.metric === metric);
    return delta === undefined ? '—' : renderDelta(delta);
  });

export const renderComparison = (comparison: Comparison): string => {
  const describe = (meta: BenchmarkReport['meta']): string =>
    `${meta.commit ?? 'unknown commit'}${meta.dirty ? ' (dirty)' : ''}, ${meta.date}`;
  const sections = [
    `Compared with baseline ${describe(comparison.baseline)}; current ${describe(comparison.current)}.`,
    `▲ marks a regression and ▼ an improvement beyond ${formatPercent(comparison.threshold).replace('+', '')} and, for timings, beyond both margins of error.`,
  ];

  const sizes = [...new Set(comparison.rows.map((row) => row.size))].sort((a, b) => a - b);
  for (const size of sizes) {
    const rows = comparison.rows.filter((row) => row.size === size);
    const replicas = rows.filter((row) => row.scenario === null);
    const operations = rows.filter((row) => row.scenario !== null);
    sections.push(`## ${size} todos`);

    if (replicas.length > 0) {
      const columns = deltaColumns(replicas, REPLICA_METRICS);
      sections.push(
        table(
          ['backend', ...columns],
          replicas.map((row) => [row.backend, ...deltaCells(row, columns)])
        )
      );
    }

    if (operations.length > 0) {
      const columns = deltaColumns(operations, OPERATION_METRICS);
      const groups = groupBy(operations, (row) => row.scenario as string);
      const tableRows: string[][] = [];
      for (const [scenario, group] of groups)
        group.forEach((row, index) =>
          tableRows.push([index === 0 ? scenario : '', row.backend, ...deltaCells(row, columns)])
        );
      sections.push(table(['scenario', 'backend', ...columns], tableRows));
    }
  }

  return sections.join('\n\n');
};
