import { describe, expect, it } from 'vitest';
import {
  compareReports,
  formatBytes,
  formatDuration,
  formatPercent,
  hasRegression,
  renderComparison,
  renderReport,
  table,
} from '../report.js';
import type { BenchmarkReport, OperationResult, ReplicaResult, Timing } from '../types.js';

const timing = (mean: number, rme = 1): Timing => ({ mean, p50: mean, p99: mean * 1.5, rme, samples: 10 });

const replica = (backend: string, seed: number, heap: number | null = 1024): ReplicaResult => ({
  backend,
  size: 100,
  seed: timing(seed),
  adopt: timing(seed * 2),
  docBytes: backend === 'passthrough' ? null : 5000,
  heapBytes: heap,
});

const operation = (backend: string, write: number, wire: number | null = 27): OperationResult => ({
  backend,
  scenario: 'toggle',
  size: 100,
  write: timing(write),
  roundtrip: timing(write * 2),
  wireBytesPerOp: wire,
  docBytesPerOp: wire,
  heapBytesPerOp: 512,
});

const report = (overrides: Partial<BenchmarkReport> = {}): BenchmarkReport => ({
  meta: {
    date: '2026-09-10T00:00:00.000Z',
    node: 'v22.0.0',
    commit: 'abc1234',
    dirty: false,
    versions: { yjs: '13.6.27' },
    options: { time: 250, minSamples: 10, operations: 20, sizes: [100] },
  },
  replicas: [replica('passthrough', 0.01), replica('yjs', 1)],
  operations: [operation('passthrough', 0.01, null), operation('yjs', 1)],
  ...overrides,
});

describe('formatting', () => {
  it('scales durations from nanoseconds to seconds', () => {
    expect(formatDuration(0.0005)).toBe('500 ns');
    expect(formatDuration(0.0042)).toBe('4.2 µs');
    expect(formatDuration(0.5)).toBe('500 µs');
    expect(formatDuration(0.9999)).toBe('1.00 ms');
    expect(formatDuration(999.7)).toBe('1.00 s');
    expect(formatDuration(1.234)).toBe('1.23 ms');
    expect(formatDuration(42.4)).toBe('42.4 ms');
    expect(formatDuration(1500)).toBe('1.50 s');
  });

  it('scales bytes and shows a sign on request', () => {
    expect(formatBytes(null)).toBe('—');
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(27)).toBe('27 B');
    expect(formatBytes(1023.7)).toBe('1.0 KB');
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(3 * 1024 ** 2)).toBe('3.00 MB');
    expect(formatBytes(27, true)).toBe('+27 B');
    expect(formatBytes(-2048, true)).toBe('-2.0 KB');
  });

  it('renders percentages with a sign', () => {
    expect(formatPercent(0.052)).toBe('+5.2%');
    expect(formatPercent(-0.25)).toBe('-25%');
    expect(formatPercent(NaN)).toBe('—');
  });

  it('pads markdown table columns', () => {
    expect(table(['a', 'bbb'], [['1', '2'], ['333', '4']])).toBe(
      ['| a   | bbb |', '| --- | --- |', '| 1   | 2   |', '| 333 | 4   |'].join('\n')
    );
  });
});

describe('renderReport', () => {
  it('prints provenance, one section per size, and both tables', () => {
    const text = renderReport(report());
    expect(text).toContain('abc1234 · node v22.0.0 · yjs 13.6.27');
    expect(text).toContain('## 100 todos');
    expect(text).toContain('| backend     | seed');
    expect(text).toMatch(/\| toggle\s+\| passthrough \| 10 µs ±1\.0%\s+\| 15 µs\s+\| 1\.0×/);
    expect(text).toMatch(/\|\s+\| yjs\s+\| 1\.00 ms ±1\.0%\s+\| 1\.50 ms\s+\| 100×/);
    expect(text).toContain('| —');
  });
});

describe('compareReports', () => {
  it('joins rows by backend, scenario, and size and computes relative changes', () => {
    const baseline = report();
    const current = report({
      replicas: [replica('passthrough', 0.01), replica('yjs', 1.5)],
      operations: [operation('passthrough', 0.01, null), operation('yjs', 0.8, 20)],
    });

    const comparison = compareReports(baseline, current);
    const yjsOperation = comparison.rows.find((row) => row.backend === 'yjs' && row.scenario === 'toggle');
    const write = yjsOperation?.deltas.find((delta) => delta.metric === 'write');
    const wire = yjsOperation?.deltas.find((delta) => delta.metric === 'wire / op');

    expect(write?.change).toBeCloseTo(-0.2);
    expect(write?.significant).toBe(true);
    expect(wire?.change).toBeCloseTo(-7 / 27);
    expect(comparison.rows.find((row) => row.backend === 'passthrough' && row.scenario === 'toggle')?.deltas.map((d) => d.metric)).toEqual(['write', 'roundtrip', 'heap Δ / op']);
    expect(hasRegression(comparison)).toBe(true);
  });

  it('treats changes inside the margin of error as noise', () => {
    const baseline = report({ operations: [{ ...operation('yjs', 1), write: timing(1, 4) }] });
    const current = report({ operations: [{ ...operation('yjs', 1), write: timing(1.06, 4) }] });
    const [row] = compareReports(baseline, current).rows.filter((r) => r.scenario !== null);
    expect(row.deltas[0].significant).toBe(false);
    expect(hasRegression(compareReports(baseline, current))).toBe(false);
  });

  it('needs byte metrics to move by an absolute floor before marking them', () => {
    const baseline = report({ operations: [{ ...operation('yjs', 1), heapBytesPerOp: -126 }] });
    const current = report({
      operations: [{ ...operation('yjs', 1, 20), heapBytesPerOp: 133, docBytesPerOp: 27 }],
    });
    const [row] = compareReports(baseline, current).rows.filter((r) => r.scenario !== null);
    const byMetric = new Map(row.deltas.map((delta) => [delta.metric, delta]));

    expect(byMetric.get('heap Δ / op')?.change).toBeGreaterThan(0);
    expect(byMetric.get('heap Δ / op')?.significant).toBe(false);
    expect(byMetric.get('wire / op')?.significant).toBe(false);
    expect(hasRegression(compareReports(baseline, current))).toBe(false);
  });

  it('keeps comparison columns aligned when some backends lack byte metrics', () => {
    const text = renderComparison(compareReports(report(), report()));
    const widths = new Set(
      text
        .split('\n')
        .filter((line) => line.startsWith('| ') && !line.startsWith('| scenario') && !line.startsWith('| backend'))
        .map((line) => line.split(' | ').length)
    );
    expect(widths).toEqual(new Set([5, 7]));
    expect(text).toMatch(/\| passthrough \| [^|]+\| [^|]+\| —\s+\| [^|]+\|$/m);
  });

  it('ignores rows missing from the baseline', () => {
    const comparison = compareReports(report({ replicas: [], operations: [] }), report());
    expect(comparison.rows).toEqual([]);
  });

  it('renders markers for regressions and improvements', () => {
    const current = report({
      replicas: [replica('passthrough', 0.01), replica('yjs', 1.5)],
      operations: [operation('passthrough', 0.01, null), operation('yjs', 0.8)],
    });
    const text = renderComparison(compareReports(report(), current));
    expect(text).toContain('Compared with baseline abc1234');
    expect(text).toContain('1.00 ms → 1.50 ms (+50%) ▲');
    expect(text).toContain('1.00 ms → 800 µs (-20%) ▼');
  });
});
