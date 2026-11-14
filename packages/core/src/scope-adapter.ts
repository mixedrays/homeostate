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
   * Returns the store's next state with `slice` replacing the whole slice: a key that `slice`
   * lacks has been removed by a peer. Called with the state the store holds at that moment.
   */
  set: (state: S, slice: T) => S;
}

/**
 * Turns a store adapter into one for a slice of the store, so that the sync engine treats the
 * slice as the store's whole state: `keys`, `omit` and `filter` apply to the slice's keys, and
 * the backend holds those keys at its root. Use it for a nested slice, which `keys` and `omit`
 * cannot reach, and to sync several slices of one store to several rooms, each with an engine, a
 * backend and a synced subtree of its own. A store change outside the slice causes no write and
 * no `'local'` sync event. For an absent slice, a store that ignores a change, and keys `T` does
 * not declare, see
 * {@link https://homeostate.pages.dev/docs/core/sync-engine#scopeadapter | scopeAdapter}.
 *
 * @example
 * ```typescript
 * const adapter = createZustandAdapter(store);
 * const docAdapter = scopeAdapter(adapter, {
 *   get: (state) => state.doc,
 *   set: (state, doc) => ({ ...state, doc }),
 * });
 * createSyncEngine({
 *   backend: createYjsBackend(new Y.Doc(), 'doc'),
 *   adapter: docAdapter,
 * }).connect();
 * ```
 */
export function scopeAdapter<S extends object, T extends JsonObjectInput>(
  adapter: StoreAdapter<S>,
  scope: AdapterScope<S, T>,
): StoreAdapter<T> {
  /**
   * The root state last read and its slice, so that one root state gives one slice object even
   * when `get` builds a new one. Otherwise the engine would not see that a store ignored a
   * change, and would write the store's old state over the backend.
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

    // The slice notifies as often as the store does.
    batchWrites: adapter.batchWrites,
  };
}
