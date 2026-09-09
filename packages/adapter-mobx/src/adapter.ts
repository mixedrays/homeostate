import { reaction, toJS } from 'mobx';
import type { StoreAdapter, Unsubscribe } from '@homeostate/core';

/**
 * MobX-specific store adapter that bridges MobX stores with the sync engine.
 * 
 * This adapter wraps a MobX store to conform to the StoreAdapter interface,
 * enabling MobX stores to sync with Yjs documents.
 * 
 * @example
 * ```typescript
 * import { makeAutoObservable } from 'mobx';
 * import * as Y from 'yjs';
 * 
 * class CounterStore {
 *   count = 0;
 *   constructor() { makeAutoObservable(this); }
 *   increment() { this.count++; }
 * }
 * 
 * const store = new CounterStore();
 * const doc = new Y.Doc();
 * const adapter = createMobxAdapter(store, ['count'], { count: 0 });
 * const engine = createSyncEngine(doc, adapter, { name: 'shared' });
 * engine.connect();
 * ```
 */
export class MobxAdapter<S extends object> implements StoreAdapter<S> {
  private store: S;
  private syncableKeys: (keyof S)[];
  private initialState: Partial<S>;
  private isFromSync = false;

  /**
   * Create a MobX adapter
   * @param store - The MobX store instance
   * @param syncableKeys - Array of property keys that should be synced
   * @param initialState - Initial state values for syncable properties
   */
  constructor(store: S, syncableKeys: (keyof S)[], initialState: Partial<S>) {
    this.store = store;
    this.syncableKeys = syncableKeys;
    this.initialState = initialState;
  }

  getState(): S {
    // Extract only syncable properties and convert to plain JS
    const state: Partial<S> = {};
    for (const key of this.syncableKeys) {
      state[key] = toJS(this.store[key]);
    }
    return state as S;
  }

  setState(state: S, fromSync = false): void {
    if (fromSync) {
      this.isFromSync = true;
    }
    
    // Apply state updates to the MobX store
    for (const key of this.syncableKeys) {
      if (key in state) {
        (this.store as Record<keyof S, unknown>)[key] = state[key];
      }
    }
    
    this.isFromSync = false;
  }

  subscribe(onStoreChange: () => void): Unsubscribe {
    // Use MobX reaction to watch for changes to syncable properties
    const disposers: (() => void)[] = [];
    
    for (const key of this.syncableKeys) {
      const disposer = reaction(
        () => toJS(this.store[key]),
        () => {
          if (!this.isFromSync) {
            onStoreChange();
          }
        },
        { fireImmediately: false }
      );
      disposers.push(disposer);
    }
    
    return () => {
      disposers.forEach((dispose) => dispose());
    };
  }

  getInitialState(): S {
    return this.initialState as S;
  }
}

/**
 * Factory function to create a MobX adapter
 * 
 * @param store - The MobX store instance
 * @param syncableKeys - Array of property keys that should be synced to Yjs
 * @param initialState - Initial state values for syncable properties
 * @returns StoreAdapter instance for the MobX store
 * 
 * @example
 * ```typescript
 * class TodoStore {
 *   todos: Todo[] = [];
 *   filter: string = 'all';
 *   
 *   constructor() { makeAutoObservable(this); }
 *   
 *   addTodo(title: string) {
 *     this.todos.push({ id: crypto.randomUUID(), title, completed: false });
 *   }
 * }
 * 
 * const store = new TodoStore();
 * const adapter = createMobxAdapter(
 *   store,
 *   ['todos', 'filter'],  // Only sync these properties
 *   { todos: [], filter: 'all' }
 * );
 * ```
 */
export function createMobxAdapter<S extends object>(
  store: S,
  syncableKeys: (keyof S)[],
  initialState: Partial<S>
): StoreAdapter<S> {
  return new MobxAdapter(store, syncableKeys, initialState);
}
