import type {
  CrdtBackend,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  Unsubscribe,
} from "./types.js";
import { defaultSyncFilter } from "./types.js";
import { patchState } from "./patching.js";
import { hasOwn, PROTO_KEY } from "./diff.js";

type Plain = Record<string, unknown>;

/**
 * Creates a sync engine that keeps a store (via its adapter) and a CRDT backend
 * in sync in both directions.
 *
 * This is the core abstraction that makes the sync logic state-manager and
 * CRDT-library agnostic.
 *
 * On `connect()` the two sides are reconciled per key over the filtered view: a key the
 * backend holds wins over the store's value, and a synced key the backend lacks stays in
 * the store and is seeded into the backend unless `seed` is `'never'`. Afterwards the
 * backend owns the synced document: every write replaces it with the store's filtered
 * state, and a key removed from the backend is removed from the store.
 *
 * @example
 * ```typescript
 * const backend = createYjsBackend(new Y.Doc(), 'shared');
 * const adapter = createZustandAdapter(store);
 * const engine = createSyncEngine(backend, adapter);
 * engine.connect();
 * ```
 */
export function createSyncEngine<S extends object>(
  backend: CrdtBackend,
  adapter: StoreAdapter<S>,
  config: SyncEngineConfig = {},
): SyncEngine {
  const { filter = defaultSyncFilter, seed = "if-empty" } = config;

  let connected = false;
  let storeUnsubscribe: Unsubscribe | null = null;
  let backendUnsubscribe: Unsubscribe | null = null;
  let applyingRemote = false;

  const filterState = (state: object): Plain => {
    const filtered: Plain = {};
    for (const [key, value] of Object.entries(state)) {
      if (key !== PROTO_KEY && filter(key, value)) filtered[key] = value;
    }
    return filtered;
  };

  const readBackend = (): Plain => {
    const value = backend.read();
    return value !== null && typeof value === "object" ? (value as Plain) : {};
  };

  /**
   * Builds the next store state from `remote`. With `keepLocalOnly`, a synced key the
   * backend does not hold is left in place instead of being deleted; that is the
   * connect-time reconciliation. Otherwise `remote` is the whole synced state.
   */
  const mergeStates = (
    current: S,
    remote: Plain,
    keepLocalOnly: boolean,
  ): S => {
    const synced = filterState(current);
    const target = keepLocalOnly ? { ...synced, ...remote } : remote;
    const patched = patchState(synced, target);
    if (patched === synced) return current;

    const merged: Plain = { ...current, ...patched };
    for (const key of Object.keys(synced)) {
      if (!hasOwn(patched, key)) delete merged[key];
    }
    return merged as S;
  };

  const syncToBackend = (): void => {
    if (applyingRemote) return;
    backend.write(filterState(adapter.getState()));
  };

  const applyRemote = (remote: Plain, keepLocalOnly: boolean): void => {
    applyingRemote = true;
    try {
      const current = adapter.getState();
      const merged = mergeStates(current, remote, keepLocalOnly);
      if (merged !== current) adapter.setState(merged);
    } finally {
      applyingRemote = false;
    }
  };

  const syncToStore = (): void => {
    applyRemote(filterState(readBackend()), false);
  };

  const unsubscribeAll = (): void => {
    backendUnsubscribe?.();
    backendUnsubscribe = null;
    storeUnsubscribe?.();
    storeUnsubscribe = null;
  };

  return {
    connect: (): void => {
      if (connected) return;

      const remote = filterState(readBackend());
      const local = filterState(adapter.getState());
      const remoteKeys = new Set(Object.keys(remote));
      const missing = Object.keys(local).filter((key) => !remoteKeys.has(key));

      if (seed === "if-empty" && missing.length > 0) {
        const seeded: Plain = { ...remote };
        for (const key of missing) seeded[key] = local[key];
        backend.write(seeded);
      }

      applyRemote(remote, true);

      try {
        backendUnsubscribe = backend.subscribe(syncToStore);
        storeUnsubscribe = adapter.subscribe(syncToBackend);
      } catch (error) {
        // `disconnect()` cannot reach a subscription made before the throw, so drop it here.
        unsubscribeAll();
        throw error;
      }
      connected = true;
    },

    disconnect: (): void => {
      if (!connected) return;

      unsubscribeAll();
      connected = false;
    },

    isConnected: (): boolean => connected,
  };
}
