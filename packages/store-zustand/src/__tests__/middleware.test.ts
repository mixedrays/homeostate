import { describe, expect, it } from 'vitest';
import { createStore } from 'zustand/vanilla';
import { createMemoryBackend, type MemoryBackend } from '@homeostate/core';
import { homeostate } from '../index.js';

interface CounterState {
  count: number;
  increment: () => void;
}

const createCounter = (backend: MemoryBackend) =>
  createStore<CounterState>()(
    homeostate(backend, (set) => ({
      count: 0,
      increment: () => set((s) => ({ count: s.count + 1 })),
    }))
  );

describe('homeostate middleware', () => {
  it('seeds the backend, writes store changes, and applies remote changes', () => {
    const backend = createMemoryBackend();
    const store = createCounter(backend);
    expect(backend.read()).toEqual({ count: 0 });

    store.getState().increment();
    expect(backend.read()).toEqual({ count: 1 });

    backend.receive({ count: 5 });
    expect(store.getState().count).toBe(5);
    expect(typeof store.getState().increment).toBe('function');
  });

  it('adopts a non-empty backend as the initial state', () => {
    const backend = createMemoryBackend({ count: 7 });

    const store = createCounter(backend);

    expect(store.getState().count).toBe(7);
    expect(backend.read()).toEqual({ count: 7 });
  });

  it('exposes the engine so the store can disconnect from the backend', () => {
    const backend = createMemoryBackend();
    const store = createCounter(backend);
    expect(store.homeostate.isConnected()).toBe(true);

    store.homeostate.disconnect();
    store.getState().increment();
    expect(backend.read()).toEqual({ count: 0 });

    backend.receive({ count: 9 });
    expect(store.getState().count).toBe(1);
    expect(store.homeostate.isConnected()).toBe(false);
  });
});
