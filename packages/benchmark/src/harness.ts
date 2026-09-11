import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { Bench, type Task } from 'tinybench';
import { createSyncEngine, type SyncEngine } from '@homeostate/core';
import { retainedHeap, settledHeap } from './memory.js';
import { emptyState, makeState } from './scenarios.js';
import { createStore, type BenchStore } from './store.js';
import type {
  BackendCandidate,
  BenchmarkMeta,
  BenchmarkOptions,
  BenchmarkReport,
  OperationResult,
  Replica,
  ReplicaResult,
  Scenario,
  Timing,
  TodoState,
  Wire,
} from './types.js';

interface Peer<R extends Replica> {
  replica: R;
  store: BenchStore<TodoState>;
  engine: SyncEngine;
}

interface Pair<R extends Replica> {
  a: Peer<R>;
  b: Peer<R>;
  wire: Wire;
  destroy(): void;
}

const createPeer = <R extends Replica>(
  candidate: BackendCandidate<R>,
  state: TodoState,
  replica: R = candidate.createReplica()
): Peer<R> => {
  const store = createStore(state);
  const engine = createSyncEngine(replica.backend, store.adapter);
  engine.connect();
  return { replica, store, engine };
};

const destroyPeer = (peer: Peer<Replica>): void => {
  peer.engine.disconnect();
  peer.replica.destroy?.();
};

/** Replica `a` is seeded with `size` todos; `b` starts empty and adopts them over the wire. */
const createPair = <R extends Replica>(candidate: BackendCandidate<R>, size: number): Pair<R> => {
  const replicaA = candidate.createReplica();
  const replicaB = candidate.createReplica();
  const wire = candidate.connect(replicaA, replicaB);
  const a = createPeer(candidate, makeState(size), replicaA);
  const b = createPeer(candidate, emptyState(), replicaB);

  return {
    a,
    b,
    wire,
    destroy: () => {
      destroyPeer(a);
      destroyPeer(b);
      wire.disconnect();
    },
  };
};

const deepEqual = (x: unknown, y: unknown): boolean => {
  if (x === y) return true;
  if (Array.isArray(x) && Array.isArray(y))
    return x.length === y.length && x.every((value, i) => deepEqual(value, y[i]));
  if (x !== null && y !== null && typeof x === 'object' && typeof y === 'object') {
    const a = x as Record<string, unknown>;
    const b = y as Record<string, unknown>;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length && keys.every((key) => deepEqual(a[key], b[key]));
  }
  return false;
};

const assertConverged = (pair: Pair<Replica>, label: string): void => {
  if (!deepEqual(pair.a.store.getState(), pair.b.store.getState()))
    throw new Error(`${label}: the two stores diverged; the candidate does not replicate correctly`);
};

/** Runs the untimed part of an iteration: restore the steady size, then compute the next state. */
const prepare = (
  store: BenchStore<TodoState>,
  scenario: Scenario,
  size: number,
  i: number
): TodoState => {
  let state = store.getState();
  const restored = scenario.reset?.(state, size);
  if (restored !== undefined && restored !== state) {
    store.setState(restored);
    state = restored;
  }
  return scenario.step(state, i);
};

const toTiming = (task: Task): Timing => {
  const result = task.result;
  if (result.state === 'errored') throw result.error;
  if (!('latency' in result))
    throw new Error(`Benchmark task "${task.name}" ended in state "${result.state}"`);
  const { latency } = result;
  return {
    mean: latency.mean,
    p50: latency.p50,
    p99: latency.p99,
    rme: latency.rme,
    samples: task.runs,
  };
};

interface Hooks {
  beforeAll?(): void;
  beforeEach?(): void;
  afterEach?(): void;
  afterAll?(): void;
}

const measure = async (
  options: BenchmarkOptions,
  name: string,
  fn: () => void,
  hooks: Hooks
): Promise<Timing> => {
  const bench = new Bench({
    time: options.time,
    iterations: options.minSamples,
    warmupTime: Math.ceil(options.time / 4),
    warmupIterations: Math.max(1, Math.ceil(options.minSamples / 4)),
    throws: true,
  });
  bench.add(name, fn, hooks);
  const [task] = await bench.run();
  return toTiming(task);
};

const measureWrite = <R extends Replica>(
  options: BenchmarkOptions,
  candidate: BackendCandidate<R>,
  scenario: Scenario,
  size: number
): Promise<Timing> => {
  let peer!: Peer<R>;
  let next!: TodoState;
  let i = 0;

  return measure(options, 'write', () => peer.store.setState(next), {
    beforeAll: () => {
      peer = createPeer(candidate, makeState(size));
      i = 0;
    },
    beforeEach: () => {
      next = prepare(peer.store, scenario, size, i++);
    },
    afterAll: () => destroyPeer(peer),
  });
};

const measureRoundtrip = <R extends Replica>(
  options: BenchmarkOptions,
  candidate: BackendCandidate<R>,
  scenario: Scenario,
  size: number
): Promise<Timing> => {
  let pair!: Pair<R>;
  let next!: TodoState;
  let i = 0;

  return measure(options, 'roundtrip', () => pair.a.store.setState(next), {
    beforeAll: () => {
      pair = createPair(candidate, size);
      i = 0;
    },
    beforeEach: () => {
      next = prepare(pair.a.store, scenario, size, i++);
    },
    afterAll: () => {
      assertConverged(pair, `${candidate.name}/${scenario.name}@${size}`);
      pair.destroy();
    },
  });
};

const HEAP_PASS_MAX_OPERATIONS = 200;
const HEAP_PASS_MAX_MS = 1000;

interface Footprint {
  wireBytesPerOp: number | null;
  docBytesPerOp: number | null;
  heapBytesPerOp: number | null;
}

/**
 * Deterministic pass over `options.operations` iterations. Wire bytes and document growth
 * are read around the measured write only, so a scenario's untimed restore does not count.
 * Heap growth is the retained heap of one writing replica divided by the operations it ran,
 * restores included; that loop keeps going past `options.operations`, up to
 * `HEAP_PASS_MAX_OPERATIONS` or `HEAP_PASS_MAX_MS`, because a collected heap only resolves
 * growth to a few kilobytes.
 */
const measureFootprint = <R extends Replica>(
  options: BenchmarkOptions,
  candidate: BackendCandidate<R>,
  scenario: Scenario,
  size: number
): Footprint => {
  const pair = createPair(candidate, size);
  const wireBytes = pair.wire.bytes?.bind(pair.wire);
  const encodedSize = pair.a.replica.encodedSize?.bind(pair.a.replica);
  let wire = 0;
  let doc = 0;

  for (let i = 0; i < options.operations; i++) {
    const next = prepare(pair.a.store, scenario, size, i);
    const wire0 = wireBytes?.() ?? 0;
    const doc0 = encodedSize?.() ?? 0;
    pair.a.store.setState(next);
    wire += (wireBytes?.() ?? 0) - wire0;
    doc += (encodedSize?.() ?? 0) - doc0;
  }

  assertConverged(pair, `${candidate.name}/${scenario.name}@${size}`);
  pair.destroy();

  let heapBytesPerOp: number | null = null;
  if (options.memory) {
    const peer = createPeer(candidate, makeState(size));
    const before = settledHeap();
    const deadline = performance.now() + HEAP_PASS_MAX_MS;
    let i = 0;
    while (i < options.operations || (i < HEAP_PASS_MAX_OPERATIONS && performance.now() < deadline))
      peer.store.setState(prepare(peer.store, scenario, size, i++));
    const after = settledHeap();
    heapBytesPerOp = (after - before) / i;
    destroyPeer(peer);
  }

  return {
    wireBytesPerOp: wireBytes ? wire / options.operations : null,
    docBytesPerOp: encodedSize ? doc / options.operations : null,
    heapBytesPerOp,
  };
};

const runOperation = async <R extends Replica>(
  options: BenchmarkOptions,
  candidate: BackendCandidate<R>,
  scenario: Scenario,
  size: number
): Promise<OperationResult> => ({
  backend: candidate.name,
  scenario: scenario.name,
  size,
  write: await measureWrite(options, candidate, scenario, size),
  roundtrip: await measureRoundtrip(options, candidate, scenario, size),
  ...measureFootprint(options, candidate, scenario, size),
});

const measureSeed = <R extends Replica>(
  options: BenchmarkOptions,
  candidate: BackendCandidate<R>,
  size: number
): Promise<Timing> => {
  let replica!: R;
  let engine!: SyncEngine;

  return measure(options, 'seed', () => engine.connect(), {
    beforeEach: () => {
      replica = candidate.createReplica();
      engine = createSyncEngine(replica.backend, createStore(makeState(size)).adapter);
    },
    afterEach: () => {
      engine.disconnect();
      replica.destroy?.();
    },
  });
};

const measureAdopt = <R extends Replica>(
  options: BenchmarkOptions,
  candidate: BackendCandidate<R>,
  size: number
): Promise<Timing> => {
  let seeded!: Peer<R>;
  let replica!: R;
  let wire!: Wire;
  let engine!: SyncEngine;

  return measure(options, 'adopt', () => engine.connect(), {
    beforeEach: () => {
      const replicaA = candidate.createReplica();
      replica = candidate.createReplica();
      wire = candidate.connect(replicaA, replica);
      seeded = createPeer(candidate, makeState(size), replicaA);
      engine = createSyncEngine(replica.backend, createStore(emptyState()).adapter);
    },
    afterEach: () => {
      engine.disconnect();
      wire.disconnect();
      destroyPeer(seeded);
      replica.destroy?.();
    },
  });
};

/** Replicas measured together for the per-replica heap figure; more of them at small sizes. */
const replicasForHeap = (size: number): number =>
  Math.max(1, Math.min(20, Math.round(5000 / size)));

const runReplica = async <R extends Replica>(
  options: BenchmarkOptions,
  candidate: BackendCandidate<R>,
  size: number
): Promise<ReplicaResult> => {
  const seed = await measureSeed(options, candidate, size);
  const adopt = await measureAdopt(options, candidate, size);

  const probe = createPeer(candidate, makeState(size));
  const docBytes = probe.replica.encodedSize?.() ?? null;
  destroyPeer(probe);

  let heapBytes: number | null = null;
  if (options.memory) {
    const count = replicasForHeap(size);
    const { value, bytes } = retainedHeap(() =>
      Array.from({ length: count }, () => createPeer(candidate, makeState(size)))
    );
    value.forEach(destroyPeer);
    heapBytes = bytes / count;
  }

  return { backend: candidate.name, size, seed, adopt, docBytes, heapBytes };
};

const git = (args: string): string | null => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
};

const dependencyVersion = (name: string): string | null => {
  try {
    const require = createRequire(import.meta.url);
    return (require(`${name}/package.json`) as { version: string }).version;
  } catch {
    return null;
  }
};

export const collectMeta = (options: BenchmarkOptions): BenchmarkMeta => {
  const status = git('status --porcelain');
  const versions: Record<string, string> = {};
  for (const name of ['yjs', 'loro-crdt', 'tinybench']) {
    const version = dependencyVersion(name);
    if (version !== null) versions[name] = version;
  }

  return {
    date: new Date().toISOString(),
    node: process.version,
    commit: git('rev-parse --short HEAD'),
    dirty: status === null ? null : status.length > 0,
    versions,
    options: {
      time: options.time,
      minSamples: options.minSamples,
      operations: options.operations,
      sizes: options.sizes,
    },
  };
};

const applies = (scenario: Scenario, size: number): boolean =>
  scenario.maxSize === undefined || size <= scenario.maxSize;

export const countTasks = (options: BenchmarkOptions): number =>
  options.sizes.reduce(
    (total, size) =>
      total +
      options.candidates.length *
        (1 + options.scenarios.filter((scenario) => applies(scenario, size)).length),
    0
  );

export const runBenchmark = async (options: BenchmarkOptions): Promise<BenchmarkReport> => {
  const total = countTasks(options);
  let done = 0;
  const progress = (label: string): void => options.onProgress?.(++done, total, label);

  const replicas: ReplicaResult[] = [];
  const operations: OperationResult[] = [];

  for (const size of options.sizes) {
    for (const candidate of options.candidates) {
      replicas.push(await runReplica(options, candidate, size));
      progress(`${size} todos · ${candidate.name} · seed/adopt`);
    }

    for (const scenario of options.scenarios) {
      if (!applies(scenario, size)) continue;
      for (const candidate of options.candidates) {
        operations.push(await runOperation(options, candidate, scenario, size));
        progress(`${size} todos · ${candidate.name} · ${scenario.name}`);
      }
    }
  }

  return { meta: collectMeta(options), replicas, operations };
};
