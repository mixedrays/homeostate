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
 * A top-level function, such as an action, stays local; other values such as Date, Map, or Set
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
   * echo suppression of its own. When it returns, the engine compares the store's synced state
   * with what it applied. If they differ, for example because the store normalised a key or
   * derived one during the call, the engine writes the store's synced state once, so the backend
   * ends up equal to it. If the store was given a key that it holds neither before nor after the
   * call, such as a key its class does not declare, the engine takes it as a key the store cannot
   * hold and leaves it in the backend. If the store held a key before the call and dropped it,
   * the store removed it, and the engine deletes it from the backend. If `getState()` returns the
   * same object as before the call, the engine concludes that the store ignored the change, and
   * writes nothing.
   *
   * What the store changes during the call must not change again when the same state is applied
   * a second time, and every peer must agree on it. Otherwise the engine stops writing back the
   * paths the store keeps changing and reports a `WriteLoopError`; see
   * {@link https://homeostate.pages.dev/docs/core/sync-engine#write-loops | Write loops}.
   */
  setState: (state: S) => void;

  /** Subscribe to store changes that should be written to the backend. */
  subscribe: (onStoreChange: () => void) => Unsubscribe;

  /**
   * Set to `true` for a store that notifies once per property set rather than once per change,
   * such as a Valtio proxy. On such a store, one array method like `splice`, `unshift`, `shift`,
   * `sort` or `reverse` notifies several times, each time with an intermediate state. Written one
   * by one, those states make every shifted item look replaced, so a peer's concurrent edit lands
   * on the wrong item and its concurrent insert duplicates items.
   *
   * With the flag, the engine batches its writes of local changes into one write per microtask.
   * The first notification queues a write, and later notifications add nothing until it runs.
   * The queued write writes the store's synced state as it is when it runs, and sends one
   * `'local'` sync event. `subscribe` must still notify synchronously, so that the engine ignores
   * the echoes of `setState` as it does without batching. A remote change applied while the write
   * waits is merged with the waiting local change, as a local change is merged into a pending
   * apply (see `SyncEngineConfig.schedule`), and the merged state is written at once, in place of
   * the queued write. `disconnect()` writes a waiting local change before it unsubscribes.
   * Without the flag, every notification is written synchronously. The engine reads the flag
   * once, when the engine is created.
   *
   * A queued write that throws goes to `onError`. Without `onError` it is thrown from the
   * microtask, where nothing catches it, so the runtime reports it as an uncaught error.
   *
   * An adapter that wraps an adapter with this flag must keep the flag, as `scopeAdapter` does.
   * Otherwise the engine writes every intermediate state again.
   */
  batchWrites?: boolean;
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
   * The sync engine passes the whole subtree as `next`: the store's synced keys, and every
   * other key as the backend holds it, so that a write deletes only what the store removed.
   *
   * `previous`, when given, is what the synced subtree holds now, not yet turned into JSON: like
   * `next`, it may hold values that `toJsonValue` leaves out or turns into `null`. The sync engine
   * passes the whole state it last wrote or read, when `revision` or a read shows that the backend
   * still holds that state. A backend can then diff `next` against `previous` with `json: true`
   * instead of reading its document, and the unchanged subtrees of `next` match `previous` by
   * identity. A backend may ignore `previous`.
   */
  write: (next: JsonObjectInput, previous?: JsonObjectInput) => void;

  /**
   * The synced subtree's revision: a value equal (`===`) to an earlier one only if the subtree
   * has not changed since, whether or not `subscribe` has reported the change yet. It may change
   * without the subtree changing, and is `undefined` while the backend cannot tell, as inside a
   * transaction. Must be cheap: the engine calls it around every write.
   *
   * Before writing a local change, the sync engine reads the backend unless the revision equals
   * the one it recorded when it last wrote or read the backend. So a remote change that another
   * listener heard first is applied before the local change, instead of being written over.
   */
  revision: () => unknown;

  /** Notify about changes that did not come through this backend's own `write`. */
  subscribe: (onRemoteChange: () => void) => Unsubscribe;
}

/**
 * Configuration options for the sync engine, typed by the store's state `S`, which
 * `createSyncEngine` takes from the store adapter. Without `S`, as `SyncEngineConfig`, a key is
 * any string and a value `unknown`.
 *
 * A key is synced, in both directions, when `keys` lists it or `omit` does not name it, and
 * `filter` keeps it. Give `keys` or `omit`, not both; at runtime, `keys` less `omit` is synced.
 *
 * A peer deletes a key from the backend only when its store removes a key it syncs: drops it,
 * or makes it a function. A key the backend holds that the store does not sync, or cannot hold,
 * stays as it is, so peers on different app versions can share a room.
 */
export type SyncEngineConfig<S extends object = JsonObject> = {
  /**
   * Decides by name whether a top-level key is synced: return true to sync it. Without it, every
   * key that `keys` and `omit` allow is synced. It is called only for those keys, including keys
   * the backend holds that `S` does not declare, such as keys an older or newer peer writes.
   *
   * A key the store holds as a function, such as an action, is never synced, whatever `filter`
   * returns: the engine does not write it, and does not read the backend's value into it, so the
   * backend keeps its value. Once the store makes a synced key a function, its next write deletes the key from the
   * backend; once the store makes it a JSON value again, the key is synced again.
   */
  filter?: (key: keyof S & string) => boolean;
  /**
   * Whether `connect()` seeds the backend: writes, in one write, each synced key the store holds
   * and the backend lacks, from the store's value. Defaults to `true`. With `false`, nothing is
   * seeded, and those keys are written with the next local change. Reconciliation is per key
   * either way: a key the backend holds wins over the store's value, and a key only the store
   * holds stays in the store.
   */
  seed?: boolean;
  /**
   * Coalesces remote changes. The first remote change hands `schedule` a `flush` to call later,
   * such as `(flush) => queueMicrotask(flush)`, and every remote change before that call is
   * applied with one read of the backend and one `setState`. Without it, each remote change is
   * applied synchronously, so `getState()` sees it at once.
   *
   * Local changes are still written synchronously. A local change made while an apply is pending
   * runs that apply first: `mergeConcurrent` merges the local change into it, against what the
   * backend held before the pending changes, and the engine writes the result, so neither side's
   * change is lost; see
   * {@link https://homeostate.pages.dev/docs/core/sync-engine#coalescing-remote-changes | Coalescing remote changes}.
   * After a backend read or write threw, nothing tells which side changed what, so the remote
   * changes replace what the local change did to synced keys.
   *
   * `disconnect()` runs a pending apply too.
   */
  schedule?: (flush: () => void) => void;
  /**
   * Called with what the store adapter or the backend threw while the connected engine applies a
   * remote change or writes a local one, so that the error does not reach the other side's
   * notifier. Without it, the error propagates to whoever triggered the work. `connect()` always
   * throws the errors it runs into. See `SyncErrorSource`.
   */
  onError?: (error: unknown, source: SyncErrorSource) => void;
} & (
  | {
      /** The only keys to sync, if `filter` keeps them. */
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
 * The options `createSyncEngine` takes: the backend, the store adapter and the sync engine's
 * config. `S` is the store's state, which `createSyncEngine` takes from `adapter`.
 */
export type SyncEngineOptions<S extends object = JsonObject> =
  SyncEngineConfig<S> & {
    backend: CrdtBackend;
    adapter: StoreAdapter<S>;
  };

/**
 * The options every setup helper takes, typed by the store's state `S`: the backend, the
 * connect mode and the sync engine's config. A setup helper is the one call in a `store-*`
 * package, such as the Zustand `homeostate` middleware, that creates the store adapter and the
 * sync engine for one store; each helper adds options of its own to these.
 */
export type SetupOptions<S extends object = JsonObject> =
  SyncEngineConfig<S> & {
    backend: CrdtBackend;
    /**
     * Who connects the engine:
     * - `'auto'`: the helper, once the store is ready, such as when it is created (default)
     * - `'manual'`: the app, by calling `connect()` on the engine the helper exposes; until then
     *   the engine reads and writes neither the store nor the backend. Connect once the document
     *   holds what the app wants to adopt, such as after `await persistence.whenLoaded`, so that
     *   the store does not compete with a populated room
     */
    connect?: "auto" | "manual";
  };

/**
 * What an error reported to `onError` came from:
 * - `'store'`: the store adapter's `getState` or `setState`, or a store that keeps changing
 *   what it is given (see `WriteLoopError`)
 * - `'backend'`: the backend's `read` or `write`
 */
export type SyncErrorSource = "store" | "backend";

/**
 * What the sync engine has just handled, as `SyncEngine.subscribe` reports it:
 * - `'local'`: a store notification while connected, sent once its write to the backend has
 *   returned. It is sent even when the notification changed only local keys, so that nothing was
 *   written. An echo raised while a remote change is applied sends none.
 * - `'remote'`: an apply of the backend's state, sent once `setState` has returned and the engine
 *   has written what the store changed during it. With `schedule`, it is sent once per flush,
 *   even when the store is unchanged. A local change that first runs a pending apply sends
 *   `'remote'` instead of `'local'`, once the merged state is written.
 * - `'connect'`: a `connect()` that connected, once reconciliation and both subscriptions are
 *   done. It covers seeding and the values adopted from the backend, which send nothing else.
 * - `'disconnect'`: a `disconnect()` that disconnected, once both subscriptions are removed. A
 *   pending apply it runs sends its `'remote'` first, and `'disconnect'` follows even when that
 *   apply throws, since the engine is disconnected all the same.
 * - `'error'`: a failure the engine recorded, which `getStatus().failure` holds; see
 *   `SyncStatus.failure`. Work that throws sends it alone, before `onError` runs or the error
 *   propagates. A write loop sends it after the `'remote'` of the apply that stopped it, unless
 *   the loop is the status's failure already.
 */
export type SyncEvent = "local" | "remote" | "connect" | "disconnect" | "error";

/**
 * What went wrong in the sync engine, as `SyncStatus.failure` holds it. It is kept with or without
 * `onError`, which it does not replace: `onError` still receives the error or, without it, the
 * error still propagates.
 */
export interface SyncFailure {
  /** What was thrown. It may be anything, `undefined` included. */
  readonly error: unknown;
  /**
   * What the error came from, as `onError` is told. Missing when the error came from neither the
   * store adapter nor the backend, such as an error thrown by `filter`, `schedule` or `onError`
   * itself.
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
   * Whether the engine is connected: done reconciling and subscribed to the store and the backend,
   * so that a local change is written. It says nothing about the room: a peer that has not loaded
   * or received the room's state yet is connected all the same.
   */
  readonly connected: boolean;
  /**
   * The failure the engine has not recovered from, or `null`. A failure while the engine syncs, a
   * `connect()` that throws, and a `WriteLoopError` set it, each with an `'error'` sync event. A
   * later `'local'`, `'remote'` or `'connect'` event sent while connected clears it, unless the
   * apply that sent it stopped a write loop; `disconnect()` keeps it. It holds only what the
   * engine sees, never a provider's errors; see
   * {@link https://homeostate.pages.dev/docs/core/sync-engine#what-sets-and-clears-a-failure | What sets and clears a failure}.
   */
  readonly failure: SyncFailure | null;
}

/** Keeps a store and a backend in sync, both ways, while connected; see `createSyncEngine`. */
export interface SyncEngine {
  /** Reconciles the store with the backend, then syncs both ways; does nothing while connected. */
  connect: () => void;
  /** Stops syncing after a pending apply or queued write runs; does nothing while disconnected. */
  disconnect: () => void;
  /**
   * The engine's status: whether it is connected, and what failed. It is up to date whenever it
   * is read, including from a store listener or a sync event listener. The returned object is
   * frozen, and `getStatus` returns the same object until a field changes. A status without a
   * failure is always the same object for the same `connected` value, so comparing by identity
   * tells whether the status changed. Every change comes with a sync event, whose listeners
   * already see the new status, so `subscribe` tells when to read it again. See `SyncStatus`.
   */
  getStatus: () => SyncStatus;
  /**
   * The store's synced keys with the values the store holds, connected or not: a new object
   * holding the keys `keys`, `omit` and `filter` keep, without `__proto__` and functions. Its
   * values are the store's own, by identity, and are not turned into JSON.
   */
  getSyncedState: () => Record<string, unknown>;
  /**
   * Calls `listener` after every sync event until unsubscribed, across reconnects. Events are
   * sent synchronously once the work is done; see `SyncEvent` for when each one is sent. Each
   * listener runs on its own: what it throws goes to `console.error`, and the other listeners
   * still run.
   */
  subscribe: (listener: (event: SyncEvent) => void) => Unsubscribe;
}

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
   * while `apply` runs, such as a sync engine's write, is reported.
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
   * store `snapshot`. Updates appended after the `load` that returned `version` must be kept.
   */
  compact: (
    key: string,
    snapshot: Uint8Array,
    version: number,
  ) => Promise<void>;

  /** Remove everything stored under `key`. */
  clear: (key: string) => Promise<void>;
}

export interface PersistenceConfig {
  /** Name the document is stored under, such as its room name. */
  key: string;
  /**
   * Number of appended updates after which the stored log is merged into one snapshot;
   * defaults to 100. With `Infinity`, the log is compacted only on load and to repair a failed
   * write.
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
 * - `'partial'`: the log was read, but at least one stored update could not be applied, and
 *   possibly none could. `errors` holds what `apply` threw for each, in log order. The document
 *   holds the updates that could be applied, and the log is kept for recovery.
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
   * If a write failed and has not been repaired since, even one that failed before this call,
   * `flush` first compacts once, to store the whole document again. If that compaction fails
   * too, its error goes to `onError`, and `flush` rejects with the error of the earliest
   * unrepaired write: an append, the initial load or the initial snapshot. Any later snapshot,
   * or `clear()`, also repairs a failed write. Updates reported after the call need another
   * `flush()`.
   */
  flush: () => Promise<void>;
  /**
   * Merge the stored log into one snapshot now, as happens after every `compactAfter` appends.
   * Resolves once the snapshot is written, and rejects with the storage error when that fails.
   * Does nothing once storing has stopped. When a stored update cannot be applied, its error goes
   * to `onError`, the log is kept as it is, and the promise still resolves. If a failed write is
   * unrepaired at that point, the snapshot is appended to the log instead.
   */
  compact: () => Promise<void>;
  /**
   * What is stored, read once every update reported so far has been written. Rejects when
   * storage cannot be read.
   */
  stats: () => Promise<PersistenceStats>;
  /**
   * Stop storing updates; stored data is kept. Like `flush()`, it settles once pending writes
   * finish, after the same repair of a failed write. Storing stops even when it rejects, and later
   * calls to `destroy()` or `flush()` repair nothing more.
   */
  destroy: () => Promise<void>;
  /**
   * Stop storing updates and remove the stored document, including a log that holds updates
   * that cannot be applied. Resolves once the document is removed, even after earlier writes
   * failed, and rejects with the storage error when it cannot be removed.
   */
  clear: () => Promise<void>;
}
