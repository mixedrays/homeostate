import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../store.js';

describe('createStore', () => {
  it('exposes the current state through the adapter and the store alike', () => {
    const store = createStore({ count: 0 });
    store.setState({ count: 1 });
    expect(store.getState()).toEqual({ count: 1 });
    expect(store.adapter.getState()).toBe(store.getState());
  });

  it('notifies subscribers on every setState until they unsubscribe', () => {
    const store = createStore({ count: 0 });
    const listener = vi.fn();
    const unsubscribe = store.adapter.subscribe(listener);

    store.setState({ count: 1 });
    store.adapter.setState({ count: 2 });
    unsubscribe();
    store.setState({ count: 3 });

    expect(listener).toHaveBeenCalledTimes(2);
    expect(store.getState()).toEqual({ count: 3 });
  });
});
