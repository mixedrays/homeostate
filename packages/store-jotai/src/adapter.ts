import { getDefaultStore, type WritableAtom, type createStore } from 'jotai/vanilla';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';

export type JotaiStore = ReturnType<typeof createStore>;

/** A writable atom that holds the whole synced state and accepts a full replacement */
export type SyncedAtom<S> = WritableAtom<S, [S], unknown>;

/**
 * Jotai-specific store adapter that syncs one writable atom with the sync engine.
 * Pass a primitive atom, or a derived writable atom that fans a replacement out
 * to several atoms to sync a slice spread across the atom graph.
 *
 * @example
 * ```typescript
 * import { atom, createStore } from 'jotai';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * const counterAtom = atom({ count: 0 });
 * const store = createStore();
 * const adapter = createJotaiAdapter(counterAtom, store);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * ```
 */
export class JotaiAdapter<S extends object> implements StoreAdapter<S> {
  private atom: SyncedAtom<S>;
  private store: JotaiStore;

  /**
   * Create a Jotai adapter
   * @param atom - Writable atom holding the synced state
   * @param store - Jotai store the atom lives in; defaults to the global default store
   */
  constructor(atom: SyncedAtom<S>, store: JotaiStore = getDefaultStore()) {
    this.atom = atom;
    this.store = store;
  }

  getState(): S {
    return this.store.get(this.atom);
  }

  setState(state: S): void {
    this.store.set(this.atom, state);
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    return this.store.sub(this.atom, onStoreChange);
  }
}

/**
 * Factory function to create a Jotai adapter
 *
 * @param atom - Writable atom holding the synced state
 * @param store - Jotai store the atom lives in; defaults to the global default store
 * @returns StoreAdapter instance for the atom
 */
export function createJotaiAdapter<S extends object>(
  atom: SyncedAtom<S>,
  store?: JotaiStore
): StoreAdapter<S> {
  return new JotaiAdapter(atom, store);
}
