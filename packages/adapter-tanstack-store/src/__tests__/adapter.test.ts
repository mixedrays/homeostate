import { describe, expect, it } from 'vitest';
import { Store, batch, createStore } from '@tanstack/store';
import { createMemoryBackend, createSyncEngine, type MemoryBackend } from '@homeostate/core';
import { createTanStackStoreAdapter } from '../index.js';

interface Counter {
  count: number;
  label: string;
}

const countingWrites = (backend: MemoryBackend) => {
  const writes: unknown[] = [];
  const counting: MemoryBackend = {
    ...backend,
    write: (next) => {
      writes.push(next);
      backend.write(next);
    },
  };
  return { backend: counting, writes };
};

describe('TanStackStoreAdapter', () => {
  it('seeds the backend, writes store changes, and applies remote changes', () => {
    const store = new Store<Counter>({ count: 0, label: 'a' });
    const backend = createMemoryBackend();
    const engine = createSyncEngine(backend, createTanStackStoreAdapter(store));

    engine.connect();
    expect(backend.read()).toEqual({ count: 0, label: 'a' });

    store.setState((prev) => ({ ...prev, count: 1 }));
    expect(backend.read()).toEqual({ count: 1, label: 'a' });

    backend.receive({ count: 5, label: 'b' });
    expect(store.state).toEqual({ count: 5, label: 'b' });
  });

  it('adopts a non-empty backend as the initial state', () => {
    const store = new Store<Counter>({ count: 0, label: 'a' });
    const backend = createMemoryBackend({ count: 7, label: 'z' });

    createSyncEngine(backend, createTanStackStoreAdapter(store)).connect();

    expect(store.state).toEqual({ count: 7, label: 'z' });
  });

  it('accepts a store created with actions', () => {
    const store = createStore({ count: 0, label: 'a' }, ({ setState }) => ({
      increment: () => setState((s) => ({ ...s, count: s.count + 1 })),
    }));
    const backend = createMemoryBackend();

    createSyncEngine(backend, createTanStackStoreAdapter(store)).connect();
    store.actions.increment();

    expect(backend.read()).toEqual({ count: 1, label: 'a' });
  });

  it('writes once for a batch of updates', () => {
    const store = new Store<Counter>({ count: 0, label: 'a' });
    const { backend, writes } = countingWrites(createMemoryBackend());
    createSyncEngine(backend, createTanStackStoreAdapter(store)).connect();
    expect(writes).toHaveLength(1);

    batch(() => {
      store.setState((s) => ({ ...s, count: 1 }));
      store.setState((s) => ({ ...s, label: 'b' }));
    });

    expect(writes).toHaveLength(2);
    expect(backend.read()).toEqual({ count: 1, label: 'b' });
  });

  it('stops both directions after disconnect', () => {
    const store = new Store<Counter>({ count: 0, label: 'a' });
    const backend = createMemoryBackend();
    const engine = createSyncEngine(backend, createTanStackStoreAdapter(store));
    engine.connect();

    engine.disconnect();
    store.setState((s) => ({ ...s, count: 1 }));
    expect(backend.read()).toEqual({ count: 0, label: 'a' });

    backend.receive({ count: 9, label: 'a' });
    expect(store.state.count).toBe(1);
  });
});
