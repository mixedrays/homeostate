import type { StoreApi as ZustandStoreApi } from 'zustand';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';

/**
 * Zustand-specific store adapter that bridges Zustand stores with the sync engine.
 *
 * @example
 * ```typescript
 * const zustandStore = create(() => ({ count: 0 }));
 * const adapter = createZustandAdapter(zustandStore);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * ```
 */
export class ZustandAdapter<S extends object> implements StoreAdapter<S> {
  private store: ZustandStoreApi<S>;

  constructor(store: ZustandStoreApi<S>) {
    this.store = store;
  }

  getState(): S {
    return this.store.getState();
  }

  setState(state: S): void {
    this.store.setState(state, true);
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    return this.store.subscribe(onStoreChange);
  }
}

/**
 * Factory function to create a Zustand adapter
 */
export function createZustandAdapter<S extends object>(store: ZustandStoreApi<S>): StoreAdapter<S> {
  return new ZustandAdapter(store);
}
