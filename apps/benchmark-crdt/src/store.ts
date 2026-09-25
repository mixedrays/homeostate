import type { StoreAdapter } from '@homeostate/core';

/** The smallest store that satisfies `StoreAdapter`, so the store adds nothing to the numbers. */
export interface BenchStore<S extends object> {
  adapter: StoreAdapter<S>;
  getState(): S;
  setState(next: S): void;
}

export const createStore = <S extends object>(initial: S): BenchStore<S> => {
  let state = initial;
  const listeners = new Set<() => void>();

  const setState = (next: S): void => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    adapter: {
      getState: () => state,
      setState,
      subscribe: (onStoreChange) => {
        listeners.add(onStoreChange);
        return () => {
          listeners.delete(onStoreChange);
        };
      },
    },
    getState: () => state,
    setState,
  };
};
