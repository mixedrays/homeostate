import v8 from 'node:v8';
import vm from 'node:vm';

type Collect = () => void;

let collect: Collect | null | undefined;

/** A garbage collector handle: `globalThis.gc` when Node runs with `--expose-gc`, otherwise obtained through V8 flags. */
export const garbageCollector = (): Collect | null => {
  if (collect !== undefined) return collect;
  const exposed = (globalThis as { gc?: Collect }).gc;
  if (exposed) return (collect = exposed);
  try {
    v8.setFlagsFromString('--expose-gc');
    collect = vm.runInNewContext('gc') as Collect;
  } catch {
    collect = null;
  }
  return collect;
};

/** Heap in use after a full collection, in bytes. */
export const settledHeap = (): number => {
  const gc = garbageCollector();
  if (gc === null) throw new Error('No garbage collector available; run Node with --expose-gc');
  gc();
  gc();
  return process.memoryUsage().heapUsed;
};

/** Runs `allocate` and returns what it built together with the heap it retains. */
export const retainedHeap = <T>(allocate: () => T): { value: T; bytes: number } => {
  const before = settledHeap();
  const value = allocate();
  const after = settledHeap();
  return { value, bytes: after - before };
};
