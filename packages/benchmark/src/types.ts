import type { CrdtBackend } from '@homeostate/core';

export interface Todo {
  id: string;
  title: string;
  completed: boolean;
}

export interface TodoState {
  todos: Todo[];
  searchTerm: string;
  filterStatus: 'all' | 'active' | 'completed';
}

/** One instance of a backend, the unit that a peer in the benchmark owns. */
export interface Replica {
  backend: CrdtBackend;
  /** Bytes of the fully encoded document; omit when the backend has no wire format. */
  encodedSize?(): number;
  destroy?(): void;
}

/** A synchronous link between two replicas that counts what goes over it. */
export interface Wire {
  /** Bytes delivered so far in both directions; omit when the wire passes references. */
  bytes?(): number;
  disconnect(): void;
}

/**
 * A backend under test. Add one per `CrdtBackend` implementation; the harness only
 * needs to create replicas and connect two of them.
 */
export interface BackendCandidate<R extends Replica = Replica> {
  name: string;
  description: string;
  createReplica(): R;
  /** Wire two replicas so that every write on either reaches the other synchronously. */
  connect(a: R, b: R): Wire;
}

/** A store operation the engine has to sync, expressed as a pure state transition. */
export interface Scenario {
  name: string;
  description: string;
  /** Next state for iteration `i`; computed untimed, only the resulting write is measured. */
  step(state: TodoState, i: number): TodoState;
  /** Untimed restore to the steady size; return the same reference when nothing is needed. */
  reset?(state: TodoState, size: number): TodoState;
  /** Skip sizes above this when the operation is pathological at scale. */
  maxSize?: number;
}

/** Latency statistics in milliseconds; `rme` is the relative margin of error in percent. */
export interface Timing {
  mean: number;
  p50: number;
  p99: number;
  rme: number;
  samples: number;
}

export interface OperationResult {
  backend: string;
  scenario: string;
  size: number;
  /** Store change to `backend.write` on a single replica. */
  write: Timing;
  /** Store change on one replica until the linked replica's store holds it. */
  roundtrip: Timing;
  wireBytesPerOp: number | null;
  docBytesPerOp: number | null;
  heapBytesPerOp: number | null;
}

export interface ReplicaResult {
  backend: string;
  size: number;
  /** `connect()` of a fresh replica against an empty backend. */
  seed: Timing;
  /** `connect()` of an empty store against a replica that already holds the state. */
  adopt: Timing;
  docBytes: number | null;
  heapBytes: number | null;
}

export interface BenchmarkOptions {
  candidates: BackendCandidate[];
  scenarios: Scenario[];
  sizes: number[];
  /** Milliseconds tinybench spends on each task. */
  time: number;
  /** Samples tinybench collects per task even when `time` has elapsed. */
  minSamples: number;
  /** Operations per footprint pass (wire bytes, document growth, heap growth). */
  operations: number;
  /** Measure heap; needs a garbage collector handle, which the harness exposes itself. */
  memory: boolean;
  onProgress?(done: number, total: number, label: string): void;
}

export interface BenchmarkMeta {
  date: string;
  node: string;
  commit: string | null;
  dirty: boolean | null;
  versions: Record<string, string>;
  options: Pick<BenchmarkOptions, 'time' | 'minSamples' | 'operations' | 'sizes'>;
}

export interface BenchmarkReport {
  meta: BenchmarkMeta;
  replicas: ReplicaResult[];
  operations: OperationResult[];
}
