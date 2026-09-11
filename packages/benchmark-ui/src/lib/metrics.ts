import { formatBytes, formatDuration } from '@homeostate/benchmark/report';
import type { OperationResult, ReplicaResult, Timing } from '@homeostate/benchmark/types';

export type Unit = 'duration' | 'bytes';

export interface Metric<Row> {
  key: string;
  label: string;
  description: string;
  unit: Unit;
  /** Byte deltas can shrink; timings and sizes cannot. */
  signed: boolean;
  value(row: Row): number | null;
  /** Mean ± relative margin of error, as absolute bounds. */
  spread?(row: Row): [number, number] | null;
}

const bounds = (timing: Timing): [number, number] => {
  const margin = (timing.mean * timing.rme) / 100;
  return [Math.max(0, timing.mean - margin), timing.mean + margin];
};

const timingMetric = <Row>(
  key: string,
  label: string,
  description: string,
  pick: (row: Row) => Timing
): Metric<Row> => ({
  key,
  label,
  description,
  unit: 'duration',
  signed: false,
  value: (row) => pick(row).mean,
  spread: (row) => bounds(pick(row)),
});

const percentileMetric = <Row>(
  key: string,
  label: string,
  description: string,
  pick: (row: Row) => number
): Metric<Row> => ({
  key,
  label,
  description,
  unit: 'duration',
  signed: false,
  value: (row) => pick(row),
});

const bytesMetric = <Row>(
  key: string,
  label: string,
  description: string,
  signed: boolean,
  pick: (row: Row) => number | null
): Metric<Row> => ({ key, label, description, unit: 'bytes', signed, value: pick });

export const operationMetrics: Metric<OperationResult>[] = [
  timingMetric('write', 'write', 'store change to backend.write on a single peer, mean', (o) => o.write),
  percentileMetric('write-p99', 'write p99', '99th percentile of write', (o) => o.write.p99),
  timingMetric(
    'roundtrip',
    'roundtrip',
    "store change on peer A until peer B's store holds it, mean",
    (o) => o.roundtrip
  ),
  percentileMetric('roundtrip-p99', 'roundtrip p99', '99th percentile of roundtrip', (o) => o.roundtrip.p99),
  bytesMetric('wire', 'wire / op', 'bytes over the wire per operation', false, (o) => o.wireBytesPerOp),
  bytesMetric('doc', 'doc Δ / op', 'growth of the encoded document per operation', true, (o) => o.docBytesPerOp),
  bytesMetric(
    'heap',
    'heap Δ / op',
    'retained heap growth of one writing peer per operation; coarse',
    true,
    (o) => o.heapBytesPerOp
  ),
];

export const replicaMetrics: Metric<ReplicaResult>[] = [
  timingMetric('seed', 'seed', 'connect() of a store holding N todos against an empty backend', (r) => r.seed),
  timingMetric(
    'adopt',
    'adopt',
    'connect() of an empty store against a replica that already holds the N todos',
    (r) => r.adopt
  ),
  bytesMetric('doc-size', 'doc size', 'encoded document after seeding', false, (r) => r.docBytes),
  bytesMetric(
    'heap-replica',
    'heap / replica',
    'retained heap of one peer, store state included',
    false,
    (r) => r.heapBytes
  ),
];

export const metricByKey = <Row>(metrics: Metric<Row>[], key: string): Metric<Row> =>
  metrics.find((metric) => metric.key === key) ?? metrics[0];

export const formatValue = (unit: Unit, value: number | null, signed = false): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  return unit === 'duration' ? formatDuration(value) : formatBytes(value, signed);
};

/** Compact axis tick: no trailing `.0`, bytes in 1024 units. */
export const formatTick = (unit: Unit, value: number): string => {
  if (value === 0) return '0';
  const text = unit === 'duration' ? formatDuration(value) : formatBytes(value);
  return text.replace(/\.0+(?=\s)/, '').replace(/(\.\d*?)0+(?=\s)/, '$1');
};

export const formatTiming = (timing: Timing): string =>
  `${formatDuration(timing.mean)} ±${timing.rme.toFixed(1)}%`;

export const formatRatio = (value: number, best: number): string => {
  if (best === 0 || !Number.isFinite(value / best)) return '—';
  const ratio = value / best;
  return `${ratio < 10 ? ratio.toFixed(1) : Math.round(ratio).toLocaleString('en-US')}×`;
};
