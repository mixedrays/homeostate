import type {
  CrdtBackend,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  Unsubscribe,
} from "./types.js";
import { defaultSyncFilter } from "./types.js";
import { patchState } from "./patching.js";
import { hasOwn, jsonEqual, PROTO_KEY } from "./diff.js";
import { isAbsent } from "./json.js";

type Plain = Record<string, unknown>;

/** The value of `key` in `state` as JSON would store it; `undefined` when it would be left out. */
const jsonEntry = (state: Plain, key: string): unknown =>
  hasOwn(state, key) && !isAbsent(state[key]) ? state[key] : undefined;

/** The top-level keys whose values differ between `a` and `b`, as JSON would store them. */
const changedKeys = (a: Plain, b: Plain): string[] => {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...keys].filter(
    (key) => !jsonEqual(jsonEntry(a, key), jsonEntry(b, key)),
  );
};

// Declared here so that core needs no Node types; bundlers replace `process.env.NODE_ENV`.
declare const process: { env: { NODE_ENV?: string } };

/** Whether the app runs a production build, where development warnings stay silent. */
const isProduction = (): boolean => {
  try {
    return process.env.NODE_ENV === "production";
  } catch {
    // No bundler replaced it, and `process` does not exist outside Node.
    return false;
  }
};

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
 * state, and a key removed from the backend is removed from the store. The store's own changes
 * while a remote change is applied, such as a key a reducer normalises or a subscriber derives,
 * are written once the apply ends. Once another peer changes the keys that write changed and the
 * store changes them again, they are no longer written, so the peers do not re-write each other's
 * changes forever; see `StoreAdapter.setState`.
 *
 * With `schedule`, remote changes are applied once per scheduled flush instead of one by one.
 * A local change made before the flush applies them first, and they replace the store's synced
 * state, so the local change keeps only what it did to keys the engine does not sync.
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
  const { filter = defaultSyncFilter, seed = "if-empty", schedule } = config;

  let connected = false;
  let storeUnsubscribe: Unsubscribe | null = null;
  let backendUnsubscribe: Unsubscribe | null = null;
  let applyingRemote = false;
  /**
   * What the backend holds as far as the engine knows: the synced state it last wrote, or the
   * whole state it last read. Passed to `backend.write` as `previous`; `undefined` when unknown.
   */
  let lastSynced: Plain | undefined;
  /** Counts backend reads after remote changes, so a write can tell that one ran during it. */
  let remoteReads = 0;
  /** Whether a remote change waits for the scheduled flush. */
  let applyPending = false;
  /** The flush handed to `schedule` and not run yet; a flush that is no longer it does nothing. */
  let scheduledFlush: (() => void) | null = null;
  /**
   * The engine's last write back, unless a local change was written since: the synced state it
   * wrote and the keys in which that differs from the remote state the store was given.
   */
  let lastWriteBack: { written: Plain; keys: string[] } | null = null;
  /** The key lists of the loops already reported, so each is reported once. */
  const reportedLoops = new Set<string>();

  const filterState = (state: object): Plain => {
    const filtered: Plain = {};
    for (const [key, value] of Object.entries(state)) {
      if (key !== PROTO_KEY && filter(key, value)) filtered[key] = value;
    }
    return filtered;
  };

  /** The backend's whole state, local keys included; `undefined` when it holds no object. */
  const readBackend = (): Plain | undefined => {
    const value = backend.read();
    return value !== null && typeof value === "object"
      ? (value as Plain)
      : undefined;
  };

  /** Builds the next store state from `current`, whose synced part `synced` becomes `target`. */
  const mergeStates = (current: S, synced: Plain, target: Plain): S => {
    const patched = patchState(synced, target);
    if (patched === synced) return current;

    const merged: Plain = { ...current, ...patched };
    for (const key of Object.keys(synced)) {
      if (!hasOwn(patched, key)) delete merged[key];
    }
    return merged as S;
  };

  /** Writes `next`, the store's synced state, passing what the backend holds as `previous`. */
  const writeSynced = (next: Plain): void => {
    const previous = lastSynced;
    const reads = remoteReads;
    // Unknown should the write throw.
    lastSynced = undefined;
    backend.write(next, previous);
    // A remote change applied during the write has already recorded what it read.
    if (remoteReads === reads) lastSynced = next;
  };

  /**
   * Makes the store's synced state `remote`, then writes what the store changed in response.
   * With `keepLocalOnly`, a synced key the backend does not hold is left in place instead of
   * being deleted; that is the connect-time reconciliation. Otherwise `remote` is the whole
   * synced state. `lastSynced` must already be what the backend holds.
   */
  const applyRemote = (remote: Plain, keepLocalOnly: boolean): void => {
    let current: S;
    let target: Plain;
    applyingRemote = true;
    try {
      current = adapter.getState();
      const synced = filterState(current);
      target = keepLocalOnly ? { ...synced, ...remote } : remote;
      const merged = mergeStates(current, synced, target);
      if (merged === current) return;
      adapter.setState(merged);
    } finally {
      applyingRemote = false;
    }
    const after = adapter.getState();
    // A store that ignored the change entirely, such as a Redux store without the replace case,
    // would otherwise write its old state back over every peer's.
    if (after === current) return;
    // The store's notifications were ignored meanwhile, so a key it normalised or derived from
    // `merged` reaches the backend only here. An echo of `merged` alone equals `target`.
    const applied = filterState(after);
    const keys = changedKeys(target, applied);
    if (keys.length === 0) return;
    if (rewritesLastWriteBack(target, keys)) {
      // Writing would only make the peer change these keys again, and so on forever. The store
      // keeps its values for them, which differ from the backend's.
      reportLoop(keys);
      return;
    }
    writeSynced(applied);
    lastWriteBack = { written: applied, keys };
  };

  /**
   * Whether every key the store changed in `remote` is one the last write back changed, and
   * `remote` holds another value for it than the one written: another peer changed what this
   * store changed, and this store changed it again. Peers in that state only re-write each
   * other's changes to those keys; a key the store changes anew, such as one it derives from
   * an edit, is written back.
   */
  const rewritesLastWriteBack = (remote: Plain, keys: string[]): boolean => {
    if (lastWriteBack === null) return false;
    const { written, keys: wroteBack } = lastWriteBack;
    return keys.every(
      (key) =>
        wroteBack.includes(key) &&
        !jsonEqual(jsonEntry(written, key), jsonEntry(remote, key)),
    );
  };

  const reportLoop = (keys: string[]): void => {
    const id = JSON.stringify([...keys].sort());
    if (reportedLoops.has(id) || isProduction()) return;
    reportedLoops.add(id);
    const names = keys.map((key) => JSON.stringify(key)).join(", ");
    console.warn(
      `[homeostate] stopped writing back ${names}: another peer changed what this store ` +
        "changed while a remote change was applied, and this store changed it again, so the " +
        "peers would keep re-writing each other's changes. The store keeps its values for " +
        "these keys, which differ from the backend's. What a store changes while a remote " +
        "change is applied must not change again when the same state is applied twice, and " +
        "every peer must agree on it.",
    );
  };

  const syncToStore = (): void => {
    remoteReads++;
    // Unknown should the read throw.
    lastSynced = undefined;
    // What was read, not the store's state after the apply: `setState` may reject or transform it.
    lastSynced = readBackend();
    applyRemote(filterState(lastSynced ?? {}), false);
  };

  /** Runs the apply deferred by `schedule`, if one is pending, and returns whether it ran. */
  const runPendingApply = (): boolean => {
    if (!applyPending) return false;
    applyPending = false;
    syncToStore();
    return true;
  };

  const onRemoteChange = (): void => {
    if (schedule === undefined) {
      syncToStore();
      return;
    }
    applyPending = true;
    if (scheduledFlush !== null) return;
    const flush = (): void => {
      // A flush handed out before `disconnect()` does nothing.
      if (scheduledFlush !== flush) return;
      scheduledFlush = null;
      runPendingApply();
    };
    scheduledFlush = flush;
    try {
      schedule(flush);
    } catch (error) {
      // Let the next remote change schedule again.
      scheduledFlush = null;
      throw error;
    }
  };

  const syncToBackend = (): void => {
    if (applyingRemote) return;
    // Otherwise the write would revert the pending remote changes. They win: applying them
    // replaces the store's synced state, local change included, and leaves the backend holding
    // what the store then holds, so there is nothing left to write. A store that ignored the
    // apply keeps its stale state out of the backend this way too.
    if (runPendingApply()) return;
    lastWriteBack = null;
    writeSynced(filterState(adapter.getState()));
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

      let held = readBackend();
      const remote = filterState(held ?? {});
      const local = filterState(adapter.getState());
      const remoteKeys = new Set(Object.keys(remote));
      const missing = Object.keys(local).filter((key) => !remoteKeys.has(key));

      if (seed === "if-empty" && missing.length > 0) {
        const seeded: Plain = { ...remote };
        for (const key of missing) seeded[key] = local[key];
        backend.write(seeded);
        held = seeded;
      }

      lastSynced = held;
      try {
        applyRemote(remote, true);
        backendUnsubscribe = backend.subscribe(onRemoteChange);
        storeUnsubscribe = adapter.subscribe(syncToBackend);
      } catch (error) {
        // `disconnect()` cannot reach a subscription made before the throw, so drop it here.
        unsubscribeAll();
        lastSynced = undefined;
        throw error;
      }
      connected = true;
    },

    disconnect: (): void => {
      if (!connected) return;

      // The store keeps what the backend held while connected; the scheduled flush is dropped.
      scheduledFlush = null;
      try {
        runPendingApply();
      } finally {
        unsubscribeAll();
        // A disconnected engine hears no remote change, so it reads the backend again on connect.
        lastSynced = undefined;
        lastWriteBack = null;
        connected = false;
      }
    },

    isConnected: (): boolean => connected,
  };
}
