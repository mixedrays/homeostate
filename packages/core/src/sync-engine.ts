import type {
  CrdtBackend,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  Unsubscribe,
} from './types.js';
import { defaultSyncFilter } from './types.js';
import { patchState } from './patching.js';

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
 * const adapter = new ZustandAdapter(store, initialState);
 * const engine = createSyncEngine(backend, adapter);
 * engine.connect();
 * ```
 */
export function createSyncEngine<S, Native = unknown>(
  backend: CrdtBackend<Native>,
  adapter: StoreAdapter<S>,
  config: SyncEngineConfig = {}
): SyncEngine<Native> {
  const { filter = defaultSyncFilter, seed = 'if-empty' } = config;

  let connected = false;
  let storeUnsubscribe: Unsubscribe | null = null;
  let backendUnsubscribe: Unsubscribe | null = null;
  let applyingRemote = false;

  const filterState = (state: S): Partial<S> => {
    if (typeof state !== 'object' || state === null) {
      return state;
    }

    const filtered: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(state as Record<string, unknown>)) {
      if (filter(key, value)) {
        filtered[key] = value;
      }
    }
    return filtered as Partial<S>;
  };

  const mergeStates = (current: S, remote: Partial<S>): S => {
    if (typeof current !== 'object' || current === null) {
      return remote as S;
    }

    const currentObj = current as Record<string, unknown>;
    const patched = patchState(currentObj, remote as Record<string, unknown>);
    if (patched === currentObj) return current;

    const merged: Record<string, unknown> = { ...patched };
    for (const [key, value] of Object.entries(currentObj)) {
      if (!filter(key, value)) {
        merged[key] = value;
      }
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
      const merged = mergeStates(current, backend.read() as Partial<S>);
      if (merged !== current) adapter.setState(merged, true);
    } finally {
      applyingRemote = false;
    }
  };

  return {
    connect: (): void => {
      if (connected) return;

      if (backend.isEmpty()) {
        if (seed === 'if-empty') backend.write(filterState(adapter.getInitialState()));
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

    getBackend: (): CrdtBackend<Native> => backend,

    isConnected: (): boolean => connected,
  };
}
