import { describe, expect, it } from 'vitest';
import type { BenchmarkReport, OperationResult, ReplicaResult, Timing } from '@homeostate/benchmark/types';
import {
  assignSlots,
  backendsOf,
  formatDate,
  isReport,
  parseReport,
  runLabel,
  scenariosOf,
  shortCommit,
  sizesOf,
  sortRuns,
  type Run,
} from '../lib/runs';

const timing = (mean: number): Timing => ({ mean, p50: mean, p99: mean * 2, rme: 1, samples: 10 });

const replica = (backend: string, size: number): ReplicaResult => ({
  backend,
  size,
  seed: timing(1),
  adopt: timing(2),
  docBytes: null,
  heapBytes: 1024,
});

const operation = (backend: string, scenario: string, size: number): OperationResult => ({
  backend,
  scenario,
  size,
  write: timing(0.5),
  roundtrip: timing(1),
  wireBytesPerOp: 30,
  docBytesPerOp: 12,
  heapBytesPerOp: null,
});

const report = (date: string, commit: string | null = 'abc1234'): BenchmarkReport => ({
  meta: {
    date,
    node: 'v22.0.0',
    commit,
    dirty: false,
    versions: {},
    options: { time: 250, minSamples: 10, operations: 20, sizes: [1000, 100] },
  },
  replicas: [replica('yjs', 1000), replica('memory', 1000), replica('yjs', 100)],
  operations: [
    operation('yjs', 'toggle', 1000),
    operation('memory', 'toggle', 1000),
    operation('yjs', 'add', 1000),
    operation('yjs', 'toggle', 100),
  ],
});

const run = (id: string, date: string): Run => ({ id, name: `${id}.json`, source: 'file', report: report(date) });

describe('parseReport', () => {
  it('accepts a report written by the CLI', () => {
    const parsed = parseReport(JSON.stringify(report('2026-09-10T00:00:00.000Z')));
    expect(parsed.operations).toHaveLength(4);
  });

  it('names the problem', () => {
    expect(() => parseReport('{')).toThrow('not valid JSON');
    expect(() => parseReport('{"meta":{}}')).toThrow('not a benchmark report');
    expect(isReport({ meta: { date: 'x' }, replicas: [], operations: [{ backend: 'a' }] })).toBe(false);
    expect(isReport({ meta: { date: 'x' }, replicas: [], operations: [] })).toBe(true);
  });
});

describe('derived lists', () => {
  const r = report('2026-09-10T00:00:00.000Z');

  it('sorts sizes and keeps run order for backends and scenarios', () => {
    expect(sizesOf(r)).toEqual([100, 1000]);
    expect(backendsOf(r)).toEqual(['yjs', 'memory']);
    expect(scenariosOf(r)).toEqual(['toggle', 'add']);
  });

  it('labels a run by commit and date', () => {
    expect(shortCommit({ ...r.meta, dirty: true })).toBe('abc1234*');
    expect(shortCommit({ ...r.meta, commit: null })).toBe('unknown commit');
    expect(formatDate('2026-09-10T14:37:48.341Z')).toBe('2026-09-10 14:37 UTC');
    expect(formatDate('garbage')).toBe('garbage');
    expect(runLabel(run('a', '2026-09-10T14:37:48.341Z'))).toBe('abc1234 · 2026-09-10 14:37 UTC');
  });
});

describe('runs', () => {
  it('sorts newest first', () => {
    const sorted = sortRuns([run('old', '2026-09-01T00:00:00Z'), run('new', '2026-09-10T00:00:00Z')]);
    expect(sorted.map((r) => r.id)).toEqual(['new', 'old']);
  });

  it('keeps a backend on its slot as runs come and go', () => {
    const first = assignSlots([run('a', '2026-09-01T00:00:00Z')]);
    expect([...first.entries()]).toEqual([['yjs', 0], ['memory', 1]]);

    const extra: Run = {
      ...run('b', '2026-09-02T00:00:00Z'),
      report: { ...report('2026-09-02T00:00:00Z'), operations: [operation('automerge', 'toggle', 100)] },
    };
    const second = assignSlots([extra], first);
    expect(second.get('automerge')).toBe(2);
    expect(second.get('yjs')).toBe(0);
    expect(assignSlots([], second)).toEqual(second);
  });
});
