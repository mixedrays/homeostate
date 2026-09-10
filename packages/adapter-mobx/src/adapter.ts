import { reaction, runInAction, toJS } from 'mobx';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';

/**
 * MobX-specific store adapter that bridges MobX stores with the sync engine.
 *
 * @example
 * ```typescript
 * import { makeAutoObservable } from 'mobx';
 * import * as Y from 'yjs';
 * import { createYjsBackend } from '@homeostate/crdt-yjs';
 *
 * class CounterStore {
 *   count = 0;
 *   constructor() { makeAutoObservable(this); }
 *   increment() { this.count++; }
 * }
 *
 * const store = new CounterStore();
 * const adapter = createMobxAdapter(store, ['count']);
 * const engine = createSyncEngine(createYjsBackend(new Y.Doc(), 'shared'), adapter);
 * engine.connect();
 * ```
 */
export class MobxAdapter<S extends object> implements StoreAdapter<S> {
  private store: S;
  private syncableKeys: (keyof S)[];

  /**
   * Create a MobX adapter
   * @param store - The MobX store instance
   * @param syncableKeys - Array of property keys that should be synced
   */
  constructor(store: S, syncableKeys: (keyof S)[]) {
    this.store = store;
    this.syncableKeys = syncableKeys;
  }

  getState(): S {
    const state: Partial<S> = {};
    for (const key of this.syncableKeys) {
      state[key] = toJS(this.store[key]);
    }
    return state as S;
  }

  setState(state: S): void {
    runInAction(() => {
      for (const key of this.syncableKeys) {
        if (key in state) (this.store as Record<keyof S, unknown>)[key] = state[key];
      }
    });
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    return reaction(
      () => this.getState(),
      () => onStoreChange()
    );
  }
}

/**
 * Factory function to create a MobX adapter
 *
 * @param store - The MobX store instance
 * @param syncableKeys - Array of property keys that should be synced
 * @returns StoreAdapter instance for the MobX store
 */
export function createMobxAdapter<S extends object>(
  store: S,
  syncableKeys: (keyof S)[]
): StoreAdapter<S> {
  return new MobxAdapter(store, syncableKeys);
}
