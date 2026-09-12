import type { Store, StoreActionMap } from '@tanstack/store';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';

/**
 * TanStack Store adapter that bridges a `Store` with the sync engine.
 * Stores created with or without an actions factory are both accepted.
 *
 * @example
 * ```typescript
 * import { Store } from '@tanstack/store';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * const store = new Store({ count: 0 });
 * const adapter = createTanStackStoreAdapter(store);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * store.setState((s) => ({ ...s, count: s.count + 1 }));
 * ```
 */
export class TanStackStoreAdapter<S extends object> implements StoreAdapter<S> {
  private store: Store<S, StoreActionMap>;

  constructor(store: Store<S, StoreActionMap>) {
    this.store = store;
  }

  getState(): S {
    return this.store.get();
  }

  setState(state: S): void {
    this.store.setState(() => state);
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    const subscription = this.store.subscribe(() => onStoreChange());
    return () => subscription.unsubscribe();
  }
}

/**
 * Factory function to create a TanStack Store adapter
 *
 * @param store - The TanStack `Store` instance
 * @returns StoreAdapter instance for the store
 */
export function createTanStackStoreAdapter<S extends object>(
  store: Store<S, StoreActionMap>
): StoreAdapter<S> {
  return new TanStackStoreAdapter(store);
}
