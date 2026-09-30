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
 * Whether `connect()` may write the store's synced keys that the backend does not hold.
 * Reconciliation is per key over the filtered view: a key the backend holds always wins
 * over the store's value, a key only the store holds always stays in the store.
 * - `'if-empty'`: seed the keys the backend lacks, in one write (default)
 * - `'never'`: leave seeding to the caller; the keys are written on the next local change
 */
export type SeedStrategy = "if-empty" | "never";

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
  return typeof value !== "function";
};

/**
 * A CRDT document seen as binary updates, which is what persistence stores. `crdt-*`
 * packages implement it next to their `CrdtBackend`. Persisting the document rather than the
 * JSON state keeps its history, so a restored document merges with its peers instead of
 * competing with them.
 */
export interface PersistableDoc {
  /** Encode the whole document as one update that `apply` accepts. */
  encode: () => Uint8Array;

  /**
   * Merge an update or an `encode()` result into the document. Applying the same update
   * twice, or updates out of order, must be safe.
   */
  apply: (update: Uint8Array) => void;

  /**
   * Report every change to the document, local or from a peer, as an update `apply`
   * accepts. Changes made by `apply` itself are not reported.
   * @returns Unsubscribe function
   */
  subscribe: (onUpdate: (update: Uint8Array) => void) => Unsubscribe;
}

/** What a `PersistenceAdapter` holds under one key. */
export interface StoredUpdates {
  /** Every stored update, oldest first; empty when nothing is stored. */
  updates: Uint8Array[];
  /** Position of the newest update, handed back to `compact`; 0 when nothing is stored. */
  version: number;
}

/**
 * Storage for persisted documents: an append-only log of updates per key.
 * `persist-*` packages implement it for localStorage and IndexedDB.
 */
export interface PersistenceAdapter {
  /** Read every update stored under `key`. */
  load: (key: string) => Promise<StoredUpdates>;

  /** Store one more update under `key`. */
  append: (key: string, update: Uint8Array) => Promise<void>;

  /**
   * In one atomic step, remove the updates under `key` up to and including `version`, and
   * store `snapshot`. Updates appended after that `load` must be kept.
   */
  compact: (
    key: string,
    snapshot: Uint8Array,
    version: number,
  ) => Promise<void>;

  /** Remove everything stored under `key`. */
  clear: (key: string) => Promise<void>;
}

/** Configuration options for `createPersistence` */
export interface PersistenceConfig {
  /** Name the document is stored under, such as its room name. */
  key: string;
  /**
   * Number of appended updates after which the stored log is merged into one snapshot;
   * defaults to 100. `Infinity` only compacts on load.
   */
  compactAfter?: number;
  /** Called when storage fails or a stored update cannot be applied; defaults to `console.error`. */
  onError?: (error: unknown) => void;
}

/** A document kept in storage by `createPersistence` */
export interface Persistence {
  /**
   * Resolves once the stored updates are applied to the document. It also resolves when
   * loading fails, after `onError`, so the app still starts without its stored state.
   */
  whenLoaded: Promise<void>;
  /** Resolves when every update reported so far has been written. */
  flush: () => Promise<void>;
  /** Stop storing updates; stored data is kept. Resolves once pending writes finish. */
  destroy: () => Promise<void>;
  /** Stop storing updates and remove the stored document. */
  clear: () => Promise<void>;
}
