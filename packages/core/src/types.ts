/**
 * Core types for the state-manager agnostic Yjs sync engine.
 * These interfaces allow any store manager to be connected to Yjs for P2P sync.
 */

/**
 * Unsubscribe function returned by subscribe
 */
export type Unsubscribe = () => void;

/**
 * Adapter interface that bridges a specific state manager with the sync engine.
 * Implement this interface to add support for any state manager (Zustand, Redux, MobX, etc.)
 */
export interface StoreAdapter<S> {
  /** Get the current state from the store */
  getState: () => S;

  /**
   * Set state in the store.
   * @param state - New state to set
   * @param fromSync - If true, this update came from Yjs sync and should not trigger sync back
   */
  setState: (state: S, fromSync?: boolean) => void;

  /**
   * Subscribe to store changes that should trigger Yjs sync.
   * @returns Unsubscribe function
   */
  subscribe: (onStoreChange: () => void) => Unsubscribe;

  /** Get the initial state of the store */
  getInitialState: () => S;
}

/**
 * Configuration options for the sync engine
 */
export interface SyncEngineConfig {
  /** Name of the Y.Map in the Y.Doc to store the state */
  name: string;
  /**
   * Filter function to determine which state keys should be synced.
   * Return true to sync the key, false to exclude it.
   * By default, functions are excluded from sync.
   */
  filter?: (key: string, value: unknown) => boolean;
}

/**
 * The sync engine interface - manages bidirectional sync between store and Yjs
 */
export interface SyncEngine {
  /** Start synchronization */
  connect: () => void;
  /** Stop synchronization and cleanup */
  disconnect: () => void;
  /** Get the underlying Y.Map */
  getYMap: () => unknown;
  /** Check if engine is connected */
  isConnected: () => boolean;
}

/**
 * Default filter that excludes functions from sync
 */
export const defaultSyncFilter = (_key: string, value: unknown): boolean => {
  return typeof value !== 'function';
};
