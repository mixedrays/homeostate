import * as Y from 'yjs';
import type {
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  Unsubscribe,
} from './types.js';
import { defaultSyncFilter } from './types.js';
import { patchSharedType, patchState } from './patching.js';

/**
 * Creates a sync engine that manages bidirectional synchronization
 * between any store (via adapter) and a Yjs document.
 * 
 * This is the core abstraction that makes the sync logic state-manager agnostic.
 * 
 * @example
 * ```typescript
 * const doc = new Y.Doc();
 * const adapter = new ZustandAdapter(store);
 * const engine = createSyncEngine(doc, adapter, { name: 'shared' });
 * engine.connect();
 * ```
 */
export function createSyncEngine<S>(
  doc: Y.Doc,
  adapter: StoreAdapter<S>,
  config: SyncEngineConfig
): SyncEngine {
  const { name, filter = defaultSyncFilter } = config;
  
  // The root Y.Map that the store is written and read from
  const yMap: Y.Map<unknown> = doc.getMap(name);
  
  let connected = false;
  let storeUnsubscribe: Unsubscribe | null = null;
  let isUpdatingFromYjs = false;
  let isUpdatingFromStore = false;

  /**
   * Filter state to only include syncable properties
   */
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

  /**
   * Sync store state to Yjs
   */
  const syncToYjs = (): void => {
    if (isUpdatingFromYjs) return;
    
    isUpdatingFromStore = true;
    try {
      const state = adapter.getState();
      const filteredState = filterState(state);

      doc.transact(() => {
        patchSharedType(yMap, filteredState);
      });
    } finally {
      isUpdatingFromStore = false;
    }
  };

  /**
   * Sync Yjs state to store
   */
  const syncToStore = (): void => {
    if (isUpdatingFromStore) return;
    
    isUpdatingFromYjs = true;
    try {
      const yjsState = yMap.toJSON() as S;
      const currentState = adapter.getState();

      // Merge Yjs state with current state (preserving functions and non-synced props)
      const mergedState = mergeStates(currentState, yjsState);
      adapter.setState(mergedState, true);
    } finally {
      isUpdatingFromYjs = false;
    }
  };

  /**
   * Merge Yjs state with current store state, preserving non-syncable properties
   */
  const mergeStates = (current: S, fromYjs: Partial<S>): S => {
    if (typeof current !== 'object' || current === null) {
      return fromYjs as S;
    }

    const currentObj = current as Record<string, unknown>;
    const yjsObj = fromYjs as Record<string, unknown>;
    
    // Start with current state (preserves functions, etc.)
    const merged: Record<string, unknown> = { ...currentObj };
    
    // Apply Yjs state using patching for proper deep merging
    const patchedData = patchState(
      { ...merged },
      yjsObj
    );
    
    // Restore non-syncable properties (like functions)
    for (const [key, value] of Object.entries(currentObj)) {
      if (!filter(key, value)) {
        patchedData[key] = value;
      }
    }
    
    return patchedData as S;
  };

  /**
   * Handler for Yjs changes
   */
  const handleYjsChange = (): void => {
    syncToStore();
  };

  return {
    connect: (): void => {
      if (connected) return;
      
      // Initialize Yjs with current store state
      const initialState = adapter.getInitialState();
      const filteredInitial = filterState(initialState);
      
      doc.transact(() => {
        patchSharedType(yMap, filteredInitial);
      });
      
      // Subscribe to Yjs changes
      yMap.observeDeep(handleYjsChange);
      
      // Subscribe to store changes
      storeUnsubscribe = adapter.subscribe(() => {
        syncToYjs();
      });
      
      connected = true;
    },
    
    disconnect: (): void => {
      if (!connected) return;
      
      // Unsubscribe from Yjs
      yMap.unobserveDeep(handleYjsChange);
      
      // Unsubscribe from store
      if (storeUnsubscribe) {
        storeUnsubscribe();
        storeUnsubscribe = null;
      }
      
      connected = false;
    },
    
    getYMap: (): Y.Map<unknown> => yMap,
    
    isConnected: (): boolean => connected,
  };
}
