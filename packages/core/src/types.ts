/**
 * Core types for the state-manager and CRDT-backend agnostic sync engine.
 * These interfaces let any store be kept in sync through any replicated backend.
 */

/**
 * Unsubscribe function returned by subscribe
 */
export type Unsubscribe = () => void;

/**
 * A plain object, which is what the sync engine and a `CrdtBackend` exchange. Its values are
 * typed `unknown`: they are meant to be JSON, but a store's state may also hold what
 * `JSON.stringify` leaves out or turns into `null`, such as `undefined` or `NaN`.
 */
export type JsonObject = Record<string, unknown>;

/**
 * Any object but an array or another iterable, which is what a caller may pass where a backend
 * takes state, such as `CrdtBackend.write`. Unlike `JsonObject`, it accepts state typed with an
 * `interface`, which has no index signature; arrays, `Map`s, `Set`s and primitives fail to
 * compile. It is assignable to `JsonObject`, so a backend uses it as one without a cast.
 */
export type JsonObjectInput = {
  // An interface is assignable to an index signature only when its values are `any`.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  [Symbol.iterator]?: never;
};

/**
 * Adapter interface that bridges a specific state manager with the sync engine.
 * Implement this interface to add support for any state manager (Zustand, Redux, MobX, etc.)
 *
 * State must be plain JSON: objects, arrays, strings, numbers, booleans, and null.
 * Functions are dropped by the default filter; other values such as Date, Map, or Set
 * are neither diffed nor synced.
 */
export interface StoreAdapter<S extends object> {
  /**
   * Get the current state from the store, as an object; the engine throws a `TypeError` for
   * anything else. Its synced part must change immutably, with a new object for every container
   * that changes: the engine diffs each write against the state it last wrote, so a container
   * changed in place looks unchanged and is not written.
   */
  getState: () => S;

  /**
   * Replace the store state. Called only for changes coming from the backend; the
   * engine ignores store notifications raised while it runs, so the adapter needs no
   * echo suppression of its own. When it returns, the engine writes the store's synced
   * state once if it differs from what was applied, such as a key the store normalised or
   * derived meanwhile, so the backend ends up equal to it. If `getState()` then returns the
   * same object as before the call, the store is taken to have ignored the change, and nothing
   * is written.
   *
   * What the store changes meanwhile must not change again when the same state is applied a
   * second time, and every peer must agree on it. A store that breaks this, such as one that
   * stamps the time on every call, or two peers that enforce contradicting rules, would make
   * the peers re-write each other's changes forever. Instead, when another peer changes the keys
   * the engine's last write back changed and the store changes them again, the engine stops
   * writing them back and the store keeps values for them that differ from the backend's. It
   * reports them once as a `WriteLoopError` to `onError`, or without it warns once in development.
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
  /**
   * Plain JSON snapshot of the synced subtree. Must not alias backend internals. The engine
   * still checks that it is a plain object, and throws a `TypeError` for anything else.
   *
   * An object in it may carry a prototype that a peer's `__proto__` entry set, as when a library
   * builds objects by assignment. The engine copies every object whose prototype is neither
   * `Object.prototype` nor `null` into a plain object of its own entries before it reaches the
   * store, so a backend needs no guard of its own.
   */
  read: () => JsonObject;

  /**
   * Make the backend equal to `next` in one atomic transaction.
   * The backend decides the granularity of the operations; `getChanges` is exported for that.
   *
   * `previous`, when given, is what the synced subtree holds now, as `JSON.stringify` would
   * store it: like `next`, it may hold `undefined` and functions where the subtree holds nothing,
   * and `NaN` or infinite numbers where it holds `null`.
   * The sync engine passes the synced state it last wrote or read, once `revision` or a read
   * shows that the backend still holds it, so a backend can diff against it with `json: true`
   * instead of reading its document, and unchanged subtrees of `next` match it by identity.
   * A backend may ignore it.
   */
  write: (next: JsonObjectInput, previous?: JsonObjectInput) => void;

  /**
   * The synced subtree's revision: a value equal (`===`) to an earlier one only if the subtree
   * has not changed since, whether or not `subscribe` has reported the change yet. It may change
   * without the subtree changing, and is `undefined` while the backend cannot tell, as inside a
   * transaction. Must be cheap: the engine calls it around every write.
   *
   * Before writing a local change, the sync engine reads the backend unless the revision is the
   * one it recorded with what it last wrote or read, so that a remote change another listener
   * heard first is applied before the local change instead of being written over. Without
   * `revision`, the engine reads the backend before every local change.
   */
  revision?: () => unknown;

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
 *
 * With `SyncEngineConfig.ready`, seeding happens once `ready` resolves, and a local change made
 * during the wait counts as the next local change for `'never'`.
 */
export type SeedStrategy = "if-empty" | "never";

/**
 * Configuration options for the sync engine, typed by the store's state `S`, which
 * `createSyncEngine` takes from the store adapter. Without `S`, as `SyncEngineConfig`, a key is
 * any string and a value `unknown`.
 *
 * A key is synced, in both directions, when `filter` keeps it and, by name, `keys` lists it or
 * `omit` does not name it. Give `keys` or `omit`, not both; at runtime, `keys` less `omit` is
 * synced.
 */
export type SyncEngineConfig<S extends object = JsonObject> = {
  /**
   * Decides per top-level key whether it is synced: return true to sync it. Defaults to
   * `defaultSyncFilter`, which excludes functions; a custom filter replaces it. It is called only
   * for the keys `keys` and `omit` leave. Its types follow `S`, but it is also called with the
   * keys and values of a backend holding keys that `S` does not declare, such as those an older
   * or newer peer writes.
   */
  filter?: (key: keyof S & string, value: S[keyof S]) => boolean;
  /** Seeding strategy used by `connect()`; defaults to `'if-empty'` */
  seed?: SeedStrategy;
  /**
   * Coalesces remote changes: the first one hands `schedule` a `flush` to call later, such as
   * `(flush) => queueMicrotask(flush)`, and every remote change before that call is applied
   * with one read of the backend and one `setState`. Without it, each remote change is applied
   * synchronously, so `getState()` sees it at once.
   *
   * Local changes are still written synchronously. One made while an apply is pending runs that
   * apply first, and the remote changes replace the store's synced state: the local change keeps
   * only what it did to keys the engine does not sync. `disconnect()` runs a pending apply too,
   * and so does the end of a wait for `ready`, unless that wait failed.
   */
  schedule?: (flush: () => void) => void;
  /**
   * Called with what the store adapter or the backend threw once the engine is connected, while
   * it applies a remote change or writes a local one, instead of letting the error reach the
   * other side's notifier. Without it, the error propagates to whoever triggered the work.
   * `connect()` always throws what it runs into itself. With `ready`, a rejection and a failure
   * while reconciling after it come later, so they go here, and without `onError` they surface as
   * unhandled rejections. See `SyncErrorSource`.
   */
  onError?: (error: unknown, source: SyncErrorSource) => void;
  /**
   * What the engine waits for before it writes to the backend: a promise, or a function
   * returning one that every `connect()` calls. Resolve it once the document holds what the
   * app wants to adopt, such as when `whenLoaded` resolves or a provider has synced, so that a
   * peer joining a populated room does not compete with it.
   *
   * `connect()` adopts what the backend holds, keeps the keys only the store holds, and
   * subscribes to both sides. While waiting, remote changes are applied the same way, except that
   * a key the backend held and no longer holds is removed from the store. Nothing is written: no
   * seed, no local change, and nothing the store changes during an apply.
   *
   * Once `ready` resolves, the engine runs a pending apply, then reconciles per key as `connect()`
   * does without it. Local changes made meanwhile are provisional: a key the backend holds keeps
   * the backend's value, and a key it lacks is written then, also with `seed: 'never'`.
   *
   * A rejected `ready`, or a failure while reconciling, disconnects the engine: it forgoes a
   * pending apply, writes nothing more, hears neither side, and reports the error to `onError`. A
   * later `connect()` tries
   * again, which only a function can make succeed: a promise stays rejected. A `ready` that never
   * settles keeps the engine waiting until `disconnect()`.
   *
   * Every `connect()` reconciles after waiting, at least a microtask later. A promise made ahead
   * is already settled on a reconnect, so that wait ends at once; a function can wait anew, and
   * local changes are then provisional again meanwhile. A promise rejected before `connect()`
   * is not an unhandled rejection: the engine takes it up when it connects. A `connect()` that
   * throws abandons its wait, and what the promise does afterwards is ignored.
   */
  ready?: PromiseLike<unknown> | (() => PromiseLike<unknown>);
} & (
  | {
      /**
       * The only keys to sync, if `filter` keeps them. A key the backend holds that it does not
       * list is ignored, like one the store holds.
       */
      keys: readonly (keyof S & string)[];
      omit?: never;
    }
  | {
      keys?: never;
      /**
       * Keys to keep local; every other key `filter` keeps is synced, including one the
       * backend holds that `S` does not declare.
       */
      omit?: readonly (keyof S & string)[];
    }
);

/**
 * The options every setup helper takes, typed by the store's state `S`: the backend, the
 * connect mode and the sync engine's config. A setup helper is the one call in a `store-*`
 * package, such as the Zustand `homeostate` middleware, that creates the store adapter and the
 * sync engine for one store; its options add their own to these.
 */
export type SetupOptions<S extends object = JsonObject> =
  SyncEngineConfig<S> & {
    /** The CRDT backend the store syncs with */
    backend: CrdtBackend;
    /**
     * Who connects the engine:
     * - `'auto'`: the helper, once the store is ready, such as when it is created (default)
     * - `'manual'`: the app, by calling `connect()` on the engine the helper exposes; until then
     *   the engine reads and writes neither the store nor the backend
     */
    connect?: "auto" | "manual";
  };

/**
 * What an error reported to `onError` came from:
 * - `'store'`: the store adapter's `getState` or `setState`, or a store that keeps changing
 *   what it is given (see `WriteLoopError`)
 * - `'backend'`: the backend's `read` or `write`
 * - `'ready'`: the `ready` promise, which rejected with this error; the engine has disconnected
 */
export type SyncErrorSource = "store" | "backend" | "ready";

/**
 * What the sync engine has just handled, as `SyncEngine.subscribe` reports it:
 * - `'local'`: a store notification while connected, once its write to the backend returned,
 *   even when it changed only local keys. An echo raised while a remote change is applied sends
 *   none, and neither does a local change while waiting for `ready`, which writes nothing.
 * - `'remote'`: an apply of the backend's state, once `setState` and the write of what the store
 *   changed meanwhile returned; once per flush with `schedule`, even when the store is unchanged.
 *   A local change that first runs a pending apply sends `'remote'` instead of `'local'`.
 * - `'connect'`: a `connect()` that connected, once reconciliation and both subscriptions are
 *   done. It covers seeding and the values adopted from the backend, which send nothing else.
 *   With `ready` it comes before the wait, so it covers only the values adopted, and `'ready'`
 *   covers the rest.
 * - `'disconnect'`: a `disconnect()` that disconnected, once both subscriptions are removed. A
 *   pending apply it runs sends its `'remote'` first, and `'disconnect'` follows even when that
 *   apply throws, since the engine is disconnected all the same. A wait for `ready` that fails
 *   sends it too, before `onError` runs.
 * - `'ready'`: the end of a wait for `ready`, once reconciliation is done. It covers seeding and
 *   the values adopted, and is never sent without the `ready` option.
 */
export type SyncEvent = "local" | "remote" | "connect" | "disconnect" | "ready";

/**
 * What went wrong in the sync engine, as `SyncStatus.failure` holds it. It is kept with or without
 * `onError`, which it does not replace: `onError` still receives the error or, without it, the
 * error still propagates.
 */
export interface SyncFailure {
  /** What was thrown or rejected. It may be anything, `undefined` included. */
  readonly error: unknown;
  /**
   * What the error came from, as `onError` is told. Missing for what comes from none of those
   * sources, such as an error thrown by `filter`, `schedule` or `onError` itself.
   */
  readonly source?: SyncErrorSource;
}

/**
 * The sync engine's own state, as `SyncEngine.getStatus` returns it. It describes the engine and
 * says nothing about the network, since the engine does not know the provider: a provider that is
 * offline, or a sync server that is down, changes no field.
 */
export interface SyncStatus {
  /**
   * What `isConnected()` returns: the engine is subscribed to the store and the backend, also
   * while it waits for `ready`.
   */
  readonly connected: boolean;
  /**
   * What `isReady()` returns: a local change is written. Without the `ready` option it equals
   * `connected`, so it says nothing about the room either.
   */
  readonly ready: boolean;
  /**
   * The failure the engine has not recovered from, or `null`. It is set by:
   * - a failed write, read or `setState` while the engine syncs. The engine stays connected.
   * - a `connect()` that throws, which leaves it disconnected.
   * - a failed wait for `ready`: a rejection, or a failure while reconciling after it, which
   *   disconnects it.
   * - a `WriteLoopError`, in every build and with or without `onError`. The engine stays connected.
   *   Unlike `onError`, the status shows a loop each time it comes back.
   *
   * A later `'local'`, `'remote'`, `'connect'` or `'ready'` sync event sent while connected clears
   * it, since the store and the backend agree again, unless the apply that sent it stopped a write
   * loop. `disconnect()` keeps it, to say why the engine stopped.
   *
   * It holds only what the engine has seen. A provider's errors never reach it, and it cannot
   * clear while the store sends no notification.
   */
  readonly failure: SyncFailure | null;
}

/**
 * The sync engine interface - manages bidirectional sync between a store and a backend
 */
export interface SyncEngine {
  /** Start synchronization */
  connect: () => void;
  /** Stop synchronization and cleanup */
  disconnect: () => void;
  /** Check if engine is connected, which includes waiting for `ready`; see `isReady` */
  isConnected: () => boolean;
  /**
   * Whether the engine is connected and done reconciling, so that a local change is written. With
   * the `ready` option it is false until `ready` has resolved and reconciliation is done, and
   * false again on every reconnect until the same is true. Without the option it equals
   * `isConnected()`. Whichever the options, it is false while disconnected.
   */
  isReady: () => boolean;
  /**
   * The engine's status, which agrees with `isConnected()` and `isReady()` whenever it is read. It
   * returns one object until a field changes, frozen, and the same object whenever the fields are
   * those of an earlier status without a failure, so comparing by identity tells whether it
   * changed. See `SyncStatus`.
   */
  getStatus: () => SyncStatus;
  /**
   * Calls `listener` after every change of `getStatus()`, until unsubscribed and across
   * reconnects, and after the listeners of the sync event that came with the change. A local or
   * remote change that leaves the status as it was calls nothing. Unlike `subscribe`, it also
   * hears of a failure, which sends no sync event. A listener that changes
   * the status tells every listener of the new status, and those it was to tell of the old one
   * are not called. Each listener runs on its own: what it throws goes to `console.error`, and the
   * other listeners still run.
   */
  subscribeStatus: (listener: () => void) => Unsubscribe;
  /**
   * The store's synced keys with the values the store holds, connected or not: a new object
   * holding the keys `filter`, `keys` and `omit` keep, without `__proto__`. Its values are the
   * store's own, by identity, and are not turned into JSON.
   */
  getSyncedState: () => Record<string, unknown>;
  /**
   * Calls `listener` after every sync event until unsubscribed, across reconnects. Events are
   * sent synchronously once the work is done, and not at all when it throws or when `connect()`
   * or `disconnect()` changes nothing. Each listener runs on its own: what it throws goes to
   * `console.error`, and the other listeners still run.
   */
  subscribe: (listener: (event: SyncEvent) => void) => Unsubscribe;
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
   * twice, or updates out of order, must be safe. Throw for bytes it cannot apply, such as
   * another CRDT library's update, so `createPersistence` keeps them in storage.
   */
  apply: (update: Uint8Array) => void;

  /**
   * Report every change to the document, local or from a peer, as an update `apply`
   * accepts. Changes made by `apply` itself are not reported, but a change made in response
   * while it runs, such as a sync engine's write, is.
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
   * defaults to 100. `Infinity` only compacts on load and to repair a failed write.
   */
  compactAfter?: number;
  /**
   * Called once for each storage failure and each stored update that cannot be applied, as it
   * happens; defaults to `console.error`. It only observes: what it throws is logged with
   * `console.error`, and storage work goes on.
   */
  onError?: (error: unknown) => void;
}

/** What `Persistence.stats()` reports about the stored document. */
export interface PersistenceStats {
  /** Stored updates, compacted snapshots included. */
  updates: number;
  /** Their total size in bytes, as handed to the adapter. */
  bytes: number;
}

/**
 * How the initial load of `createPersistence` restored the document, as `whenLoaded` resolves
 * with it. It describes reading and applying the stored log only: not the initial snapshot
 * written after it, nor any later storage work, which `flush()` reports.
 * - `'empty'`: nothing is stored under the key, as on a first visit. The document may still
 *   hold state of its own, which the initial snapshot then stores.
 * - `'loaded'`: every stored update was applied.
 * - `'partial'`: the log was read, but at least one stored update could not be applied, maybe
 *   none could. `errors` holds what `apply` threw for each, in log order. The document holds
 *   the others, and the log is kept for recovery.
 * - `'failed'`: storage could not be read, and `error` is what the adapter's `load` rejected
 *   with. The document holds only what it held before.
 *
 * The errors are the objects `onError` received for the load, not those of later storage work.
 */
export type PersistenceLoadResult =
  | { status: "empty" }
  | { status: "loaded" }
  | { status: "partial"; errors: unknown[] }
  | { status: "failed"; error: unknown };

/**
 * A document kept in storage by `createPersistence`. Its methods report failures through
 * their promises, with the error `onError` already received; a promise left unawaited never
 * becomes an unhandled rejection.
 */
export interface Persistence {
  /**
   * Resolves with how the stored updates were restored, once they are applied to the document
   * and before the initial snapshot is written. It never rejects: a failed load, or a stored
   * update that cannot be applied, resolves after `onError` with `'failed'` or `'partial'`, so
   * the app decides whether to start with what could be restored. See `PersistenceLoadResult`.
   */
  whenLoaded: Promise<PersistenceLoadResult>;
  /**
   * Resolves once the work queued so far is done and every update reported so far is stored.
   * A failed write not repaired since, also one that failed before this call, makes it compact
   * once first, to store the whole document again. When that fails too, which goes to
   * `onError`, it rejects with the error of the earliest unrepaired write: an append, the
   * initial load or the initial snapshot. Any later snapshot, or `clear()`, repairs it too.
   * Updates reported after the call need another one.
   */
  flush: () => Promise<void>;
  /**
   * Merge the stored log into one snapshot now, as every `compactAfter` appends do. Resolves
   * once it is written, and rejects with the storage error when it fails; does nothing once
   * storing has stopped. Keeps the log, after `onError`, when one of its updates cannot be
   * applied, and still resolves; it appends the snapshot then while a failed write is
   * unrepaired.
   */
  compact: () => Promise<void>;
  /**
   * What is stored, read once every update reported so far has been written. Rejects when
   * storage cannot be read.
   */
  stats: () => Promise<PersistenceStats>;
  /**
   * Stop storing updates; stored data is kept. Settles once pending writes finish, as `flush()`
   * does, after the same repair of a failed write; storing stops even when it rejects, and
   * later calls, or `flush()`, repair nothing more.
   */
  destroy: () => Promise<void>;
  /**
   * Stop storing updates and remove the stored document, also a log holding updates that
   * cannot be applied. Resolves once it is removed, even after earlier writes failed, and
   * rejects with the storage error when it cannot be.
   */
  clear: () => Promise<void>;
}
