import type { StoreApi as ZustandStoreApi } from 'zustand';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';

/**
 * Zustand-specific store adapter that bridges Zustand stores with the sync engine.
 * 
 * This adapter wraps a Zustand store API to conform to the StoreAdapter interface,
 * enabling Zustand stores to sync with Yjs documents.
 * 
 * @example
 * ```typescript
 * const doc = new Y.Doc();
 * const zustandStore = create(() => ({ count: 0 }));
 * const adapter = createZustandAdapter(zustandStore, { count: 0 });
 * const engine = createSyncEngine(doc, adapter, { name: 'shared' });
 * engine.connect();
 * ```
 */
export class ZustandAdapter<S> implements StoreAdapter<S> {
  private store: ZustandStoreApi<S>;
  private initialState: S;
  private isFromSync = false;
  private pendingSubscribers: Set<() => void> = new Set();

  constructor(store: ZustandStoreApi<S>, initialState: S) {
    this.store = store;
    this.initialState = initialState;
  }

  getState(): S {
    return this.store.getState();
  }

  setState(state: S, fromSync = false): void {
    if (fromSync) {
      this.isFromSync = true;
    }
    this.store.setState(state, true);
    this.isFromSync = false;
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    // Wrap the callback to filter out sync-originated changes
    const wrappedCallback = () => {
      if (!this.isFromSync) {
        onStoreChange();
      }
    };
    
    this.pendingSubscribers.add(wrappedCallback);
    
    const unsubscribe = this.store.subscribe(wrappedCallback);
    
    return () => {
      this.pendingSubscribers.delete(wrappedCallback);
      unsubscribe();
    };
  }

  getInitialState(): S {
    return this.initialState;
  }
}

/**
 * Factory function to create a Zustand adapter
 */
export function createZustandAdapter<S>(
  store: ZustandStoreApi<S>,
  initialState: S
): StoreAdapter<S> {
  return new ZustandAdapter(store, initialState);
}
