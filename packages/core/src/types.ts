/**
 * Core types for the state-manager and CRDT-backend agnostic sync engine.
 * These interfaces let any store be kept in sync through any replicated backend.
 */

/**
 * Unsubscribe function returned by subscribe
 */
export type Unsubscribe = () => void;

/**
 * Adapter interface that bridges a specific state manager with the sync engine.
 * Implement this interface to add support for any state manager (Zustand, Redux, MobX, etc.)
 *
 * State must be plain JSON: objects, arrays, strings, numbers, booleans, and null.
 * Functions are dropped by the default filter; other values such as Date, Map, or Set
 * are neither diffed nor synced.
 */
export interface StoreAdapter<S extends object> {
  /** Get the current state from the store */
  getState: () => S;

  /**
   * Replace the store state. Called only for changes coming from the backend; the
   * engine ignores store notifications raised while it runs, so the adapter needs no
   * echo suppression of its own.
   */
  setState: (state: S) => void;

  /**
   * Subscribe to store changes that should be written to the backend.
   * @returns Unsubscribe function
   */
  subscribe: (onStoreChange: () => void) => Unsubscribe;
}

/**
 * Backend that holds the synced subtree in a CRDT or any other replicated store.
 * The engine only ever exchanges plain JSON with it.
 */
export interface CrdtBackend {
  /** Plain JSON snapshot of the synced subtree. Must not alias backend internals. */
  read: () => unknown;

  /**
   * Make the backend equal to `next` in one atomic transaction.
   * The backend decides the granularity of the operations; `getChanges` is exported for that.
   */
  write: (next: unknown) => void;

  /**
   * Notify about changes that did not come through this backend's own `write`.
   * @returns Unsubscribe function
   */
  subscribe: (onRemoteChange: () => void) => Unsubscribe;
}

/**
 * When to write the store's state into the backend on connect.
 * - `'if-empty'`: only when the backend holds nothing yet (default)
 * - `'never'`: leave seeding to the caller; a non-empty backend is still adopted
 */
export type SeedStrategy = 'if-empty' | 'never';

/**
 * Configuration options for the sync engine
 */
export interface SyncEngineConfig {
  /**
   * Filter function to determine which state keys should be synced, in both directions.
   * Return true to sync the key, false to exclude it.
   * By default, functions are excluded from sync.
   */
  filter?: (key: string, value: unknown) => boolean;
  /** Seeding strategy used by `connect()`; defaults to `'if-empty'` */
  seed?: SeedStrategy;
}

/**
 * The sync engine interface - manages bidirectional sync between a store and a backend
 */
export interface SyncEngine {
  /** Start synchronization */
  connect: () => void;
  /** Stop synchronization and cleanup */
  disconnect: () => void;
  /** Check if engine is connected */
  isConnected: () => boolean;
}

/**
 * Default filter that excludes functions from sync
 */
export const defaultSyncFilter = (_key: string, value: unknown): boolean => {
  return typeof value !== 'function';
};
