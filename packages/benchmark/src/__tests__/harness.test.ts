import { describe, expect, it } from 'vitest';
import { candidates } from '../candidates.js';
import { collectMeta, countTasks, runBenchmark } from '../harness.js';
import { remove, replace, toggle } from '../scenarios.js';
import type { BenchmarkOptions, Timing } from '../types.js';

const options: BenchmarkOptions = {
  candidates,
  scenarios: [toggle, remove],
  sizes: [8],
  time: 2,
  minSamples: 2,
  operations: 3,
  memory: false,
};

const expectTiming = (timing: Timing): void => {
  expect(timing.mean).toBeGreaterThan(0);
  expect(timing.p50).toBeGreaterThan(0);
  expect(timing.p99).toBeGreaterThanOrEqual(timing.p50);
  expect(timing.samples).toBeGreaterThanOrEqual(options.minSamples);
  expect(Number.isFinite(timing.rme)).toBe(true);
};

describe('runBenchmark', () => {
  it('produces one replica row per backend and one operation row per backend and scenario', async () => {
    const progress: string[] = [];
    const report = await runBenchmark({
      ...options,
      onProgress: (done, total, label) => progress.push(`${done}/${total} ${label}`),
    });

    expect(report.replicas.map((r) => r.backend)).toEqual(candidates.map((c) => c.name));
    expect(report.operations).toHaveLength(candidates.length * options.scenarios.length);
    expect(progress).toHaveLength(countTasks(options));
    expect(progress[progress.length - 1]).toMatch(/^15\/15 8 todos · automerge · remove$/);

    for (const replica of report.replicas) {
      expectTiming(replica.seed);
      expectTiming(replica.adopt);
      expect(replica.heapBytes).toBeNull();
    }
    for (const operation of report.operations) {
      expectTiming(operation.write);
      expectTiming(operation.roundtrip);
      expect(operation.heapBytesPerOp).toBeNull();
    }
  }, 30_000);

  it('accounts wire bytes and document growth only for backends that encode', async () => {
    const report = await runBenchmark({ ...options, scenarios: [toggle] });
    const byBackend = new Map(report.operations.map((o) => [o.backend, o]));
    const replicas = new Map(report.replicas.map((r) => [r.backend, r]));

    expect(byBackend.get('passthrough')?.wireBytesPerOp).toBeNull();
    expect(byBackend.get('passthrough')?.docBytesPerOp).toBeNull();
    expect(replicas.get('passthrough')?.docBytes).toBeNull();

    const memory = byBackend.get('memory');
    expect(memory?.wireBytesPerOp).toBeCloseTo(replicas.get('memory')?.docBytes ?? 0, -1);
    expect(Math.abs(memory?.docBytesPerOp ?? 0)).toBeLessThan(2);

    const yjs = byBackend.get('yjs');
    expect(yjs?.wireBytesPerOp).toBeGreaterThan(0);
    expect(yjs?.wireBytesPerOp).toBeLessThan(100);
    expect(yjs?.docBytesPerOp).toBeGreaterThan(0);
    expect(replicas.get('yjs')?.docBytes).toBeGreaterThan(0);

    const loro = byBackend.get('loro');
    expect(loro?.wireBytesPerOp).toBeGreaterThan(0);
    expect(loro?.wireBytesPerOp).toBeLessThan(200);
    expect(loro?.docBytesPerOp).toBeGreaterThan(0);
    expect(replicas.get('loro')?.docBytes).toBeGreaterThan(0);

    const automerge = byBackend.get('automerge');
    expect(automerge?.wireBytesPerOp).toBeGreaterThan(0);
    expect(automerge?.wireBytesPerOp).toBeLessThan(200);
    expect(automerge?.docBytesPerOp).toBeGreaterThan(0);
    expect(replicas.get('automerge')?.docBytes).toBeGreaterThan(0);
  }, 30_000);

  it('measures heap when asked', async () => {
    const report = await runBenchmark({
      ...options,
      candidates: [candidates[2]],
      scenarios: [toggle],
      memory: true,
    });
    expect(report.replicas[0].heapBytes).toBeGreaterThan(0);
    expect(typeof report.operations[0].heapBytesPerOp).toBe('number');
  }, 30_000);

  it('skips scenarios above their maximum size', () => {
    expect(countTasks({ ...options, scenarios: [replace], sizes: [1000, 1001] })).toBe(
      candidates.length * 2 + candidates.length
    );
  });

  it('records provenance in the meta block', () => {
    const meta = collectMeta(options);
    expect(meta.node).toBe(process.version);
    expect(meta.options).toEqual({ time: 2, minSamples: 2, operations: 3, sizes: [8] });
    expect(meta.versions.yjs).toMatch(/^\d+\.\d+\.\d+/);
    expect(meta.versions['loro-crdt']).toMatch(/^\d+\.\d+\.\d+/);
    expect(meta.versions['@automerge/automerge']).toMatch(/^\d+\.\d+\.\d+/);
    expect(meta.commit === null || /^[0-9a-f]{7,}$/.test(meta.commit)).toBe(true);
  });
});
