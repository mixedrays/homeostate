import { describe, expect, it } from 'vitest';
import { atom, createStore, getDefaultStore } from 'jotai/vanilla';
import { createMemoryBackend, createSyncEngine } from '@homeostate/core';
import { createJotaiAdapter } from '../index.js';

interface Counter {
  count: number;
  label: string;
}

describe('JotaiAdapter', () => {
  it('seeds the backend, writes atom changes, and applies remote changes', () => {
    const counterAtom = atom<Counter>({ count: 0, label: 'a' });
    const store = createStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(backend, createJotaiAdapter(counterAtom, store));

    engine.connect();
    expect(backend.read()).toEqual({ count: 0, label: 'a' });

    store.set(counterAtom, (prev) => ({ ...prev, count: 1 }));
    expect(backend.read()).toEqual({ count: 1, label: 'a' });

    backend.receive({ count: 5, label: 'b' });
    expect(store.get(counterAtom)).toEqual({ count: 5, label: 'b' });
  });

  it('adopts a non-empty backend as the initial state', () => {
    const counterAtom = atom<Counter>({ count: 0, label: 'a' });
    const store = createStore();
    const backend = createMemoryBackend({ count: 7, label: 'z' });

    createSyncEngine(backend, createJotaiAdapter(counterAtom, store)).connect();

    expect(store.get(counterAtom)).toEqual({ count: 7, label: 'z' });
  });

  it('uses the default store when none is given', () => {
    const counterAtom = atom<Counter>({ count: 0, label: 'a' });
    const backend = createMemoryBackend();

    createSyncEngine(backend, createJotaiAdapter(counterAtom)).connect();
    getDefaultStore().set(counterAtom, { count: 3, label: 'a' });

    expect(backend.read()).toEqual({ count: 3, label: 'a' });
  });

  it('syncs a derived writable atom that spans several atoms', () => {
    const countAtom = atom(0);
    const labelAtom = atom('a');
    const rootAtom = atom(
      (get) => ({ count: get(countAtom), label: get(labelAtom) }),
      (_get, set, next: Counter) => {
        set(countAtom, next.count);
        set(labelAtom, next.label);
      }
    );
    const store = createStore();
    const backend = createMemoryBackend();

    createSyncEngine(backend, createJotaiAdapter(rootAtom, store)).connect();
    store.set(countAtom, 2);
    expect(backend.read()).toEqual({ count: 2, label: 'a' });

    backend.receive({ count: 9, label: 'q' });
    expect(store.get(countAtom)).toBe(9);
    expect(store.get(labelAtom)).toBe('q');
  });

  it('stops both directions after disconnect', () => {
    const counterAtom = atom<Counter>({ count: 0, label: 'a' });
    const store = createStore();
    const backend = createMemoryBackend();
    const engine = createSyncEngine(backend, createJotaiAdapter(counterAtom, store));
    engine.connect();

    engine.disconnect();
    store.set(counterAtom, { count: 1, label: 'a' });
    expect(backend.read()).toEqual({ count: 0, label: 'a' });

    backend.receive({ count: 9, label: 'a' });
    expect(store.get(counterAtom).count).toBe(1);
  });
});
