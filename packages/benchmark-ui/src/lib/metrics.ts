import { formatBytes, formatDuration } from '@homeostate/benchmark/report';
import type { OperationResult, ReplicaResult, Timing } from '@homeostate/benchmark/types';
import type { RenderResult } from '@homeostate/benchmark-render/types';

export type Unit = 'duration' | 'bytes' | 'count';

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

/** A figure the run measured once: no distribution behind it, so no spread to draw. */
const plainMetric = <Row>(
  key: string,
  label: string,
  description: string,
  unit: Unit,
  pick: (row: Row) => number | null
): Metric<Row> => ({ key, label, description, unit, signed: false, value: pick });

const bytesMetric = <Row>(
  key: string,
  label: string,
  description: string,
  signed: boolean,
  pick: (row: Row) => number | null
): Metric<Row> => ({ key, label, description, unit: 'bytes', signed, value: pick });

export const operationMetrics: Metric<OperationResult>[] = [
  timingMetric('write', 'write', 'store change to backend.write on a single peer, mean', (o) => o.write),
  plainMetric('write-p99', 'write p99', '99th percentile of write', 'duration', (o) => o.write.p99),
  timingMetric(
    'roundtrip',
    'roundtrip',
    "store change on peer A until peer B's store holds it, mean",
    (o) => o.roundtrip
  ),
  plainMetric(
    'roundtrip-p99',
    'roundtrip p99',
    '99th percentile of roundtrip',
    'duration',
    (o) => o.roundtrip.p99
  ),
  plainMetric(
    'renders',
    'renders / op',
    'rows of the receiving store that came back as a new object, matched by id; the upper bound on the row components a UI re-renders',
    'count',
    (o) => o.rendersPerOp
  ),
  plainMetric(
    'wasted',
    'wasted / op',
    'of those, the rows whose data is deep-equal, so the re-render bought nothing',
    'count',
    (o) => o.wastedPerOp
  ),
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

/**
 * The render benchmark's own rows. Counts first: they are exact integers and they are the
 * point of that run, while the three timings are advisory.
 */
export const renderMetrics: Metric<RenderResult>[] = [
  plainMetric(
    'row-renders',
    'row renders',
    'row components React re-rendered for one change from a peer; ideal 1',
    'count',
    (r) => r.rowRenders
  ),
  plainMetric('list-renders', 'list renders', 'whether the list container itself re-rendered', 'count', (r) => r.listRenders),
  plainMetric(
    'search-renders',
    'search renders',
    'whether the search box re-rendered, which only a change to the search term should do',
    'count',
    (r) => r.searchBoxRenders
  ),
  plainMetric('footer-renders', 'footer renders', 'whether the footer re-rendered', 'count', (r) => r.footerRenders),
  plainMetric('apply', 'apply', "the peer's write until this peer's store has settled, React excluded", 'duration', (r) => r.applyMs),
  plainMetric('commit', 'commit', "React's render and commit for that change", 'duration', (r) => r.commitMs),
  plainMetric('mount', 'mount', 'first render of the whole list', 'duration', (r) => r.mountMs),
];

export const metricByKey = <Row>(metrics: Metric<Row>[], key: string): Metric<Row> =>
  metrics.find((metric) => metric.key === key) ?? metrics[0];

export const formatValue = (unit: Unit, value: number | null, signed = false): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  if (unit === 'count') return value.toLocaleString('en-US');
  return unit === 'duration' ? formatDuration(value) : formatBytes(value, signed);
};

/** Compact axis tick: no trailing `.0`, bytes in 1024 units. */
export const formatTick = (unit: Unit, value: number): string => {
  if (value === 0) return '0';
  if (unit === 'count')
    return Number.isInteger(value) ? value.toLocaleString('en-US') : value.toFixed(1);
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
