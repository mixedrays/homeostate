import { jsonEqual } from "./json.js";
import type { JsonObjectInput, StoreAdapter } from "./types.js";

/** How `scopeAdapter` reaches one slice `T` of a store whose state is `S`. */
export interface AdapterScope<S extends object, T extends JsonObjectInput> {
  /**
   * Reads the slice from the store's state, as a function of `state` alone. It must return an
   * object that is not an array, and it may build a new one on every call, as with
   * `({ todos }) => ({ todos })`, which is how to sync an array.
   */
  get: (state: S) => T;
  /**
   * Returns the store's next state with `slice` in place of the slice, whole: a key `slice`
   * lacks has been removed by a peer. Called with the state the store holds at that moment.
   */
  set: (state: S, slice: T) => S;
}

/**
 * Turns a store adapter into one for a slice of the store, so that the sync engine treats the
 * slice as the store's whole state: `keys`, `omit` and `filter` apply to the slice's keys, and
 * the backend holds those keys at its root. Use it for a nested slice, which `keys` and `omit`
 * cannot reach, and to sync several slices of one store to several rooms, with one engine and one
 * backend each. It creates no engine, and the slice must be plain JSON like any synced state.
 *
 * A store change reaches the engine only when the slice differs as JSON, by identity first and
 * then with `jsonEqual`. So a change elsewhere in the store causes no write and no `'local'` sync
 * event, also with a `get` that builds a new object and an adapter whose `getState` returns a
 * fresh copy, such as the MobX adapter's.
 *
 * `get` must return an object, as `getState` must. If it does not, `connect()` throws a
 * `TypeError`, and once connected the error goes to `onError` when it is given and otherwise to
 * whoever changed the store. The engine writes nothing meanwhile, and applies no remote change, so
 * a slice that returns overwrites what the backend holds, remote changes made meanwhile included.
 * With a `get` that falls back to an empty object, such as `(state) => state.doc ?? {}`, nothing
 * throws, but the store removing the slice is then a local change that empties the backend.
 *
 * When `get` returns the same object after `setState` as before it, the engine takes the store to
 * have ignored the change, as `StoreAdapter.setState` describes, and writes nothing. That holds
 * for a store that keeps the slice's object in a new root state to reject a remote change: the
 * backend and the store then disagree until the store's next change to the slice. An unscoped
 * adapter returns the new root state there, so the engine writes the store's values back.
 *
 * Every peer sharing a room should sync the same keys, scoped the same way, and each slice needs a
 * synced subtree of its own, since every write replaces the subtree. A key the backend holds
 * reaches the slice even if `T` does not declare it, unless `keys` leaves it out, in which case
 * the next local change removes it from the backend.
 *
 * @param adapter - The store adapter of the whole store
 * @param scope - How to read the slice from the store's state and put it back
 * @returns StoreAdapter instance for the slice
 *
 * @example
 * ```typescript
 * const adapter = createZustandAdapter(store);
 * const docAdapter = scopeAdapter(adapter, {
 *   get: (state) => state.doc,
 *   set: (state, doc) => ({ ...state, doc }),
 * });
 * createSyncEngine(createYjsBackend(new Y.Doc(), 'doc'), docAdapter).connect();
 * ```
 */
export function scopeAdapter<S extends object, T extends JsonObjectInput>(
  adapter: StoreAdapter<S>,
  scope: AdapterScope<S, T>,
): StoreAdapter<T> {
  /**
   * The root state last read and its slice. One root state gives one object even when `get` builds
   * a new one, or the engine would not see that a store ignored a change, and would write the
   * store's old state over the backend.
   */
  let root: S | undefined;
  let slice: T;

  const read = (): T => {
    const state = adapter.getState();
    if (state !== root) {
      slice = scope.get(state);
      root = state;
    }
    return slice;
  };

  return {
    getState: read,

    setState: (next) => adapter.setState(scope.set(adapter.getState(), next)),

    subscribe: (onStoreChange) => {
      let previous = read();
      return adapter.subscribe(() => {
        let current: T;
        try {
          current = read();
        } catch {
          // The engine's own read throws it again, where `onError` can receive it.
          onStoreChange();
          return;
        }
        const unchanged = jsonEqual(previous, current);
        previous = current;
        if (!unchanged) onStoreChange();
      });
    },
  };
}
