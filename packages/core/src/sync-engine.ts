import type {
  CrdtBackend,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  Unsubscribe,
} from './types.js';
import { defaultSyncFilter } from './types.js';
import { patchState } from './patching.js';

type Plain = Record<string, unknown>;

/**
 * Creates a sync engine that keeps a store (via its adapter) and a CRDT backend
 * in sync in both directions.
 *
 * This is the core abstraction that makes the sync logic state-manager and
 * CRDT-library agnostic.
 *
 * @example
 * ```typescript
 * const backend = createYjsBackend(new Y.Doc(), 'shared');
 * const adapter = new ZustandAdapter(store);
 * const engine = createSyncEngine(backend, adapter);
 * engine.connect();
 * ```
 */
export function createSyncEngine<S extends object>(
  backend: CrdtBackend,
  adapter: StoreAdapter<S>,
  config: SyncEngineConfig = {}
): SyncEngine {
  const { filter = defaultSyncFilter, seed = 'if-empty' } = config;

  let connected = false;
  let storeUnsubscribe: Unsubscribe | null = null;
  let backendUnsubscribe: Unsubscribe | null = null;
  let applyingRemote = false;

  const filterState = (state: object): Plain => {
    const filtered: Plain = {};
    for (const [key, value] of Object.entries(state)) {
      if (filter(key, value)) filtered[key] = value;
    }
    return filtered;
  };

  const readBackend = (): Plain => {
    const value = backend.read();
    return value !== null && typeof value === 'object' ? (value as Plain) : {};
  };

  const mergeStates = (current: S, remote: Plain): S => {
    const synced = filterState(current);
    const patched = patchState(synced, remote);
    if (patched === synced) return current;

    const merged: Plain = { ...current, ...patched };
    for (const key of Object.keys(synced)) {
      if (!(key in patched)) delete merged[key];
    }
    return merged as S;
  };

  const syncToBackend = (): void => {
    if (applyingRemote) return;
    backend.write(filterState(adapter.getState()));
  };

  const syncToStore = (): void => {
    applyingRemote = true;
    try {
      const current = adapter.getState();
      const merged = mergeStates(current, filterState(readBackend()));
      if (merged !== current) adapter.setState(merged);
    } finally {
      applyingRemote = false;
    }
  };

  return {
    connect: (): void => {
      if (connected) return;

      if (Object.keys(readBackend()).length === 0) {
        if (seed === 'if-empty') syncToBackend();
      } else {
        syncToStore();
      }

      backendUnsubscribe = backend.subscribe(syncToStore);
      storeUnsubscribe = adapter.subscribe(syncToBackend);
      connected = true;
    },

    disconnect: (): void => {
      if (!connected) return;

      backendUnsubscribe?.();
      backendUnsubscribe = null;
      storeUnsubscribe?.();
      storeUnsubscribe = null;
      connected = false;
    },

    isConnected: (): boolean => connected,
  };
}
