import { describe, expect, it } from 'vitest';
import type { OperationResult, ReplicaResult } from '@homeostate/benchmark/types';
import {
  formatRatio,
  formatTick,
  formatTiming,
  formatValue,
  metricByKey,
  operationMetrics,
  replicaMetrics,
} from '../lib/metrics';

const operation: OperationResult = {
  backend: 'yjs',
  scenario: 'toggle',
  size: 1000,
  write: { mean: 0.48, p50: 0.45, p99: 0.9, rme: 5, samples: 100 },
  roundtrip: { mean: 1.2, p50: 1.1, p99: 2, rme: 2, samples: 50 },
  wireBytesPerOp: 30,
  docBytesPerOp: -12,
  heapBytesPerOp: null,
};

const replica: ReplicaResult = {
  backend: 'yjs',
  size: 1000,
  seed: { mean: 2.5, p50: 2.4, p99: 3, rme: 4, samples: 20 },
  adopt: { mean: 1.5, p50: 1.4, p99: 2, rme: 4, samples: 20 },
  docBytes: 80_000,
  heapBytes: null,
};

describe('metrics', () => {
  it('reads operation figures and their spread', () => {
    const write = metricByKey(operationMetrics, 'write');
    expect(write.value(operation)).toBe(0.48);
    const [low, high] = write.spread?.(operation) ?? [NaN, NaN];
    expect(low).toBeCloseTo(0.456);
    expect(high).toBeCloseTo(0.504);
    expect(metricByKey(operationMetrics, 'write-p99').value(operation)).toBe(0.9);
    expect(metricByKey(operationMetrics, 'wire').value(operation)).toBe(30);
    expect(metricByKey(operationMetrics, 'doc').signed).toBe(true);
    expect(metricByKey(operationMetrics, 'heap').value(operation)).toBeNull();
  });

  it('reads replica figures', () => {
    expect(metricByKey(replicaMetrics, 'seed').value(replica)).toBe(2.5);
    expect(metricByKey(replicaMetrics, 'doc-size').value(replica)).toBe(80_000);
    expect(metricByKey(replicaMetrics, 'heap-replica').value(replica)).toBeNull();
  });

  it('falls back to the first metric for an unknown key', () => {
    expect(metricByKey(operationMetrics, 'nope').key).toBe('write');
  });
});

describe('formatting', () => {
  it('formats values by unit', () => {
    expect(formatValue('duration', 0.48)).toBe('480 µs');
    expect(formatValue('bytes', 2048)).toBe('2.0 KB');
    expect(formatValue('bytes', -12, true)).toBe('-12 B');
    expect(formatValue('bytes', null)).toBe('—');
  });

  it('keeps axis ticks compact', () => {
    expect(formatTick('duration', 0)).toBe('0');
    expect(formatTick('duration', 1)).toBe('1 ms');
    expect(formatTick('duration', 0.001)).toBe('1 µs');
    expect(formatTick('bytes', 1024)).toBe('1 KB');
    expect(formatTick('bytes', 10240)).toBe('10 KB');
    expect(formatTick('bytes', 100)).toBe('100 B');
  });

  it('formats timings and ratios like the CLI', () => {
    expect(formatTiming(operation.write)).toBe('480 µs ±5.0%');
    expect(formatRatio(1, 1)).toBe('1.0×');
    expect(formatRatio(48, 1)).toBe('48×');
    expect(formatRatio(542796, 1)).toBe('542,796×');
    expect(formatRatio(1, 0)).toBe('—');
  });
});
