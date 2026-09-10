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
 */
export interface StoreAdapter<S> {
  /** Get the current state from the store */
  getState: () => S;

  /**
   * Set state in the store.
   * @param state - New state to set
   * @param fromSync - If true, this update came from the backend and should not trigger a write back
   */
  setState: (state: S, fromSync?: boolean) => void;

  /**
   * Subscribe to store changes that should be written to the backend.
   * @returns Unsubscribe function
   */
  subscribe: (onStoreChange: () => void) => Unsubscribe;

  /** Get the initial state of the store */
  getInitialState: () => S;
}

/**
 * Backend that holds the synced subtree in a CRDT or any other replicated store.
 * The engine only ever exchanges plain JSON with it.
 */
export interface CrdtBackend<Native = unknown> {
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

  /** True while the synced subtree holds nothing; drives `seed: 'if-empty'` */
  isEmpty: () => boolean;

  /** The underlying native object for backend-specific access */
  native: () => Native;
}

/**
 * When to write the store's initial state into the backend on connect.
 * - `'if-empty'`: only when the backend holds nothing yet (default)
 * - `'never'`: leave seeding to the caller; a non-empty backend is still adopted
 */
export type SeedStrategy = 'if-empty' | 'never';

/**
 * Configuration options for the sync engine
 */
export interface SyncEngineConfig {
  /**
   * Filter function to determine which state keys should be synced.
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
export interface SyncEngine<Native = unknown> {
  /** Start synchronization */
  connect: () => void;
  /** Stop synchronization and cleanup */
  disconnect: () => void;
  /** Get the backend this engine writes to */
  getBackend: () => CrdtBackend<Native>;
  /** Check if engine is connected */
  isConnected: () => boolean;
}

/**
 * Default filter that excludes functions from sync
 */
export const defaultSyncFilter = (_key: string, value: unknown): boolean => {
  return typeof value !== 'function';
};
