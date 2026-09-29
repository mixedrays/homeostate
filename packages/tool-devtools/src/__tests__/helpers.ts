import type { StoreAdapter } from "@homeostate/core";

/** A minimal store and its adapter, notifying synchronously like most state managers. */
export const createTestStore = <S extends object>(initial: S) => {
  let state = initial;
  const listeners = new Set<() => void>();

  const set = (next: S): void => {
    state = next;
    listeners.forEach((listener) => listener());
  };

  const adapter: StoreAdapter<S> = {
    getState: () => state,
    setState: set,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };

  return { adapter, set, get: () => state };
};

/** Lets the inspector's microtask flush run. */
export const tick = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0));
