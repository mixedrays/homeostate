import type {
  SyncEngine,
  SyncEngineConfig,
  SyncEngineOptions,
  SyncErrorSource,
  SyncEvent,
  SyncFailure,
  SyncStatus,
  Unsubscribe,
} from "./types.js";
import { keepIdentity } from "./patching.js";
import { mergeConcurrent } from "./merge.js";
import { logError, warnInDevelopment } from "./env.js";
import {
  hasOwn,
  isRecord,
  jsonEntry,
  jsonEqual,
  kindOf,
  PROTO_KEY,
} from "./json.js";

/**
 * A state, the store's or the backend's, or a slice of one. It is the same type as `JsonObject`,
 * but named differently, because the store's state may hold values JSON cannot, such as
 * functions.
 */
type Plain = Record<string, unknown>;

/**
 * The paths of record keys, from the root, at which `a` and `b` differ as JSON would store them.
 * A difference inside an array or a string is at the path of that array or string, since their
 * items are keyed by position.
 */
const changedPaths = (
  a: Plain,
  b: Plain,
  at: string[] = [],
  paths: string[][] = [],
): string[][] => {
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (key === PROTO_KEY) continue;
    const x = jsonEntry(a, key);
    const y = jsonEntry(b, key);
    if (x === y) continue;
    if (isRecord(x) && isRecord(y)) changedPaths(x, y, [...at, key], paths);
    else if (!jsonEqual(x, y)) paths.push([...at, key]);
  }
  return paths;
};

/** The value at `path` in `state` as JSON would store it; `undefined` when it would be left out. */
const valueAt = (state: Plain, path: string[]): unknown => {
  let value: unknown = state;
  for (const key of path) {
    if (!isRecord(value)) return undefined;
    value = jsonEntry(value, key);
  }
  return value;
};

/**
 * A copy of `state` holding at each of `paths` what `source` holds there, or nothing where
 * `source` holds nothing. Every container above a path must be a record in both.
 */
const withValuesAt = (
  state: Plain,
  source: Plain,
  paths: string[][],
): Plain => {
  const copy = { ...state };
  for (const path of paths) {
    let to = copy;
    let from = source;
    for (const key of path.slice(0, -1)) {
      to = to[key] = { ...(to[key] as Plain) };
      from = from[key] as Plain;
    }
    const key = path[path.length - 1]!;
    if (jsonEntry(from, key) === undefined) delete to[key];
    else to[key] = from[key];
  }
  return copy;
};

/**
 * A copy of `patched`, the synced state given to the store, that takes the store's own value from
 * `applied` at each key that `applied` holds and no path in `paths` starts at; the two are equal
 * as JSON at those keys. The result equals `patched` as JSON. Wherever the store left a key as it
 * was given, the result holds the very objects of `applied`, even for a store whose `getState`
 * returns copies. At every other key it holds `patched`'s value, which shares every object the
 * store kept.
 */
const keptObjects = (
  patched: Plain,
  applied: Plain,
  paths: string[][],
): Plain => {
  const changed = new Set(paths.map(([key]) => key));
  const kept: Plain = {};
  for (const key of Object.keys(patched))
    kept[key] =
      !changed.has(key) && hasOwn(applied, key) ? applied[key] : patched[key];
  return kept;
};

const pathId = (path: string[]): string => JSON.stringify(path);

/** Whether `state` holds a function at `key`, such as an action, which stays local. */
const holdsFunction = (state: object, key: string): boolean =>
  hasOwn(state, key) && typeof (state as Plain)[key] === "function";

/** Whether `held` holds every entry of `state`, each the same value or object. */
const holdsAll = (held: Plain | undefined, state: Plain): boolean => {
  if (held === undefined) return false;
  for (const key of Object.keys(state))
    if (!hasOwn(held, key) || held[key] !== state[key]) return false;
  return true;
};

const withoutKeys = (state: Plain, keys: string[]): Plain => {
  const rest = { ...state };
  for (const key of keys) delete rest[key];
  return rest;
};

/** Returns `value` if it is a non-array object, and throws a `TypeError` naming `contract` otherwise. */
const expectRecord = (
  value: unknown,
  contract: string,
  expected: string,
): Plain => {
  if (isRecord(value)) return value;
  throw new TypeError(
    `${contract} must return ${expected}, got ${kindOf(value)}`,
  );
};

/** The statuses that hold no failure, shared so that equal fields mean the same object. */
const DISCONNECTED: SyncStatus = Object.freeze({
  connected: false,
  failure: null,
});
const CONNECTED: SyncStatus = Object.freeze({
  connected: true,
  failure: null,
});

/**
 * How many applies in a row must contradict what the store changed at a path before the engine
 * stops writing it back; see `countContradictions`. Concurrent writes by other peers contradict a
 * path now and then, until those peers' own write-backs end the contradiction; a loop contradicts
 * it on every apply. When peers kept appending concurrently to a log whose length a subscriber
 * stores in another key, that key was contradicted up to 5 times in a row, so the threshold makes
 * a loop cost a few more round trips before it stops.
 */
const LOOP_THRESHOLD = 6;

/** Why the engine stopped writing back `paths`, and what the store must do instead. */
const loopMessage = (paths: string[][]): string =>
  `stopped writing back ${paths.map(pathId).join(", ")}: on ${LOOP_THRESHOLD} remote changes in a ` +
  "row, another peer changed what this store had changed there while a remote change was " +
  "applied, and this store changed it again, so the peers would keep re-writing each other's " +
  "changes. The store keeps its values there, which differ from the backend's. What a store " +
  "changes while a remote change is applied must not change again when the same state is " +
  "applied twice, and every peer must agree on it.";

/**
 * Reported to `SyncEngineConfig.onError`, with the source `'store'`, when the engine stops
 * writing back paths the store keeps changing while remote changes are applied, so that the
 * peers do not re-write each other's changes forever. What a store changes while a remote change
 * is applied must not change again when the same state is applied a second time, and every peer
 * must agree on it. Its message lists the paths, from the root of the synced state, each as an
 * array of keys. It is reported once for each set of top-level keys that hold those paths. The
 * engine stays connected. See
 * {@link https://homeostate.pages.dev/docs/core/sync-engine#write-loops | Write loops}.
 */
export class WriteLoopError extends Error {
  /**
   * The top-level synced keys holding the paths no longer written back; the store and the
   * backend hold different values there.
   */
  readonly keys: string[];

  /** `paths` defaults to the `keys` themselves. */
  constructor(keys: string[], paths: string[][] = keys.map((key) => [key])) {
    super(loopMessage(paths));
    this.name = "WriteLoopError";
    this.keys = keys;
  }
}

// Declared here so that core needs no DOM or Node types; every browser and Node has it.
declare const queueMicrotask: (callback: () => void) => void;

/**
 * The one test of whether a top-level entry is synced, in both directions: never `__proto__` or a
 * function, then `keys` and `omit` by name, then `filter`.
 */
const syncPredicate = ({
  filter,
  keys,
  omit,
}: SyncEngineConfig): ((key: string, value: unknown) => boolean) => {
  const listed = keys === undefined ? undefined : new Set<string>(keys);
  const omitted = new Set<string>(omit);
  return (key, value) =>
    key !== PROTO_KEY &&
    typeof value !== "function" &&
    (listed === undefined || listed.has(key)) &&
    !omitted.has(key) &&
    (filter === undefined || filter(key));
};

/**
 * Creates a disconnected sync engine, which keeps a store, through its adapter, and a CRDT
 * backend in sync in both directions once `connect()` is called.
 *
 * @example
 * ```typescript
 * const backend = createYjsBackend(new Y.Doc(), 'shared');
 * const adapter = createZustandAdapter(store);
 * const engine = createSyncEngine({ backend, adapter, omit: ['draft'] });
 * engine.connect();
 * ```
 *
 * @see SyncEngineConfig
 */
export function createSyncEngine<S extends object>(
  options: SyncEngineOptions<S>,
): SyncEngine {
  const { backend, adapter, seed = true, schedule, onError } = options;
  // Untyped: the engine also tests keys the backend holds that `S` does not declare.
  const isSynced = syncPredicate(options as SyncEngineConfig);

  let connected = false;
  let storeUnsubscribe: Unsubscribe | null = null;
  let backendUnsubscribe: Unsubscribe | null = null;
  let applyingRemote = false;
  /**
   * What the backend holds as far as the engine knows: the whole state it last wrote or read,
   * keys this peer does not sync included, with the store's objects wherever an apply found them
   * equal; see `recordStoreObjects`. Passed to `backend.write` as `previous`; `undefined` when
   * unknown.
   */
  let lastSynced: Plain | undefined;
  /**
   * The synced keys the store held when the engine last handled a local change, written or not,
   * or applied a remote change. A key that leaves this set is one the store removed, and the next
   * write deletes it from the backend. Any other key that the backend holds and the store lacks
   * is left as it is.
   */
  let heldKeys: ReadonlySet<string> = new Set();
  /** The backend's revision when `lastSynced` was recorded. */
  let lastRevision: unknown;
  /** Counts backend reads after remote changes, so a write can tell that one ran during it. */
  let remoteReads = 0;
  /** Whether a remote change waits for the scheduled flush. */
  let applyPending = false;
  /** The flush handed to `schedule` and not run yet; any earlier flush does nothing when called. */
  let scheduledFlush: (() => void) | null = null;
  /**
   * Queues the write of a local change, when the adapter batches its writes; see
   * `StoreAdapter.batchWrites`. Without it, each notification is written at once.
   */
  const scheduleWrite: ((flush: () => void) => void) | undefined =
    adapter.batchWrites === true ? queueMicrotask : undefined;
  /**
   * The flush queued with `scheduleWrite` and not run yet, while the store holds a local change
   * the engine has not written. Any other flush does nothing when called.
   */
  let queuedWrite: (() => void) | null = null;
  /**
   * The store's synced state after the last apply that it did not ignore, unless the engine has
   * handled a local change or disconnected since; `null` when unknown.
   */
  let lastApplied: Plain | null = null;
  /**
   * Each counted path, by path id, with its count: on how many applies in a row the remote state
   * held a different value at the path than the store had held after the previous apply, and the
   * store changed it again. See `countContradictions`.
   */
  const contradictions = new Map<string, { path: string[]; count: number }>();
  /** The loops already reported, by their key lists, so each is reported once. */
  const reportedLoops = new Map<string, SyncFailure>();
  /** The side whose call threw the error now on its way out of the engine; see `call`. */
  let thrownBy: SyncErrorSource | undefined;
  /** What `subscribe` was given; kept across reconnects. */
  const listeners = new Set<(event: SyncEvent) => void>();

  /** The last failure the engine has not recovered from. */
  let failure: SyncFailure | null = null;
  /** Whether the apply in progress stopped a write loop, which leaves `failure` standing. */
  let stoppedLoop = false;
  /**
   * A failure that the work in progress recorded and then carried on, such as a stopped write
   * loop. `emit` sends `'error'` for it after the work's own event.
   */
  let untold: SyncFailure | null = null;
  /** What `getStatus` returned last with a failure. */
  let failedStatus: SyncStatus | null = null;

  const getStatus = (): SyncStatus => {
    if (failure === null) return connected ? CONNECTED : DISCONNECTED;
    if (
      failedStatus?.failure !== failure ||
      failedStatus.connected !== connected
    ) {
      failedStatus = Object.freeze({ connected, failure });
    }
    return failedStatus;
  };

  /**
   * Tells every listener that the engine has handled `event`, then sends `'error'` for the failure
   * in `untold`, if any. A listener runs inside a store's or a document's
   * notification loop, which may stop at the first throw, as Zustand's does, so what it throws is
   * logged and the other listeners still run.
   */
  const emit = (event: SyncEvent): void => {
    // What the event reports has completed, so the store and the backend agree again, unless the
    // engine has just stopped writing back keys that differ or the event is the failure itself. A
    // disconnected engine keeps its failure, to say why it stopped.
    if (event !== "error" && connected && !stoppedLoop) failure = null;
    stoppedLoop = false;
    const recorded = untold;
    untold = null;
    for (const listener of [...listeners]) {
      // A listener that an earlier listener unsubscribed hears nothing more.
      if (!listeners.has(listener)) continue;
      try {
        listener(event);
      } catch (error) {
        logError("a sync event listener threw:", error);
      }
    }
    // Only if no listener has cleared or replaced the failure since.
    if (recorded !== null && failure === recorded) emit("error");
  };

  /** Keeps `error` as the status's failure, and sends `'error'`. */
  const recordFailure = (
    error: unknown,
    source: SyncErrorSource | undefined,
  ): void => {
    failure = { error, source };
    emit("error");
  };

  /** Runs `run`, a call into the store adapter or the backend, recording `source` if it throws. */
  const call = <T>(source: SyncErrorSource, run: () => T): T => {
    try {
      return run();
    } catch (error) {
      thrownBy = source;
      throw error;
    }
  };

  /**
   * Runs `work`, which a notification, the scheduled flush or `disconnect()` started, and hands
   * what the store adapter or the backend threw to `onError`, so it does not reach the notifier
   * or the scheduler. Anything else, and everything without `onError`, propagates as it is.
   */
  const guarded = (work: () => void): void => {
    thrownBy = undefined;
    try {
      work();
    } catch (error) {
      const source = thrownBy;
      thrownBy = undefined;
      recordFailure(error, source);
      if (onError === undefined || source === undefined) throw error;
      onError(error, source);
    }
  };

  const filterState = (state: object): Plain => {
    const filtered: Plain = {};
    for (const [key, value] of Object.entries(state)) {
      if (isSynced(key, value)) filtered[key] = value;
    }
    return filtered;
  };

  /**
   * The synced state the store takes from `held`, the backend's whole state, given the store's
   * state `current`: every synced key but one `current` holds as a function, which stays local.
   */
  const readRemote = (held: Plain, current: S): Plain => {
    const remote: Plain = {};
    for (const [key, value] of Object.entries(held))
      if (isSynced(key, value) && !holdsFunction(current, key))
        remote[key] = value;
    return remote;
  };

  /** The backend's whole state, local keys included. */
  const readBackend = (): Plain =>
    call("backend", () =>
      expectRecord(backend.read(), "CrdtBackend.read()", "a plain object"),
    );

  /** The backend's revision; `undefined` while the backend cannot tell. */
  const readRevision = (): unknown => call("backend", () => backend.revision());

  /** Whether the backend's revision shows that it still holds `lastSynced`. */
  const isUnchanged = (revision: unknown): boolean =>
    revision !== undefined && revision === lastRevision;

  /** Records `state` as what the backend holds, at `revision`. */
  const recordSynced = (state: Plain, revision: unknown): void => {
    lastRevision = revision;
    lastSynced = state;
  };

  const recordHeldKeys = (state: Plain): void => {
    heldKeys = new Set(Object.keys(state));
  };

  const readStore = (): S =>
    call(
      "store",
      () =>
        expectRecord(
          adapter.getState(),
          "StoreAdapter.getState()",
          "an object",
        ) as S,
    );

  /**
   * Builds the next store state from `current`, whose synced part `synced` becomes `target`.
   * Returns it with its synced part, `patched`, which equals `target` as JSON and keeps every
   * object of `synced` that `target` leaves unchanged.
   */
  const mergeStates = (
    current: S,
    synced: Plain,
    target: Plain,
  ): { next: S; patched: Plain } => {
    const patched = keepIdentity(synced, target);
    if (patched === synced) return { next: current, patched };

    const merged: Plain = { ...current, ...patched };
    for (const key of Object.keys(synced)) {
      if (!hasOwn(patched, key)) delete merged[key];
    }
    return { next: merged as S, patched };
  };

  /**
   * Writes `synced`, the store's synced state, over what the backend holds and deletes the
   * `removed` keys, which the store removed. Every other key the backend holds stays as it is;
   * see `SyncEngineConfig`. Passes what the backend holds as `previous`, or nothing when `stale`,
   * so that the backend diffs against its document.
   */
  const writeSynced = (
    synced: Plain,
    removed: string[],
    stale = false,
  ): void => {
    const previous = stale ? undefined : lastSynced;
    // `write` makes the backend equal to what it is given, so the keys this peer leaves alone
    // must be given as the backend holds them.
    const held = previous ?? readBackend();
    const next = { ...withoutKeys(held, removed), ...synced };
    const reads = remoteReads;
    // Cleared first, so that `lastSynced` stays unknown if the write throws.
    lastSynced = undefined;
    call("backend", () => backend.write(next, previous));
    // A remote change applied during the write has already recorded what it read.
    if (remoteReads !== reads) return;
    recordSynced(next, readRevision());
    recordHeldKeys(synced);
  };

  /**
   * Merges `synced` with `remote` against `base`. `synced` is the store's synced state, which holds
   * a change the engine has not written. `remote` is what the store reads from the backend's whole
   * state. `base` is the backend's whole state when the two last agreed, read the same way as
   * `remote`, so a key the store keeps local is merged on neither side. A key the store lacks and
   * did not hold then, such as a key it cannot hold, counts as unchanged on the store's side
   * rather than removed. See `mergeConcurrent` for the rules.
   */
  const mergeLocalChange = (
    base: Plain,
    current: S,
    synced: Plain,
    remote: Plain,
  ): Plain => {
    const seen = readRemote(base, current);
    const local = { ...synced };
    for (const key of Object.keys(seen))
      if (!hasOwn(synced, key) && !heldKeys.has(key)) local[key] = seen[key];
    return mergeConcurrent(seen, local, remote) as Plain;
  };

  /**
   * Records `held`, the backend's whole state an apply read, as `lastSynced`, with the store's
   * objects in place of the backend's, so that the next write skips what is unchanged by identity,
   * as after a local write. `state`, which holds the store's objects, must equal the apply's
   * target as JSON, so it equals `held` at each key both hold. A key that only `state` holds is
   * left out, since the backend lacks it. Does nothing when a newer read has been recorded
   * meanwhile, by a remote change applied while the store was taking this one.
   */
  const recordStoreObjects = (held: Plain, state: Plain): void => {
    if (lastSynced !== held) return;
    const shared = { ...held };
    for (const key of Object.keys(state))
      if (hasOwn(held, key)) shared[key] = state[key];
    lastSynced = shared;
  };

  /**
   * Makes the store's synced state what it reads from `held`, the backend's whole state, then
   * writes what the store changed in response; see `readRemote`. With `keepLocalOnly`, a synced
   * key the backend does not hold is left in place instead of being deleted; that is the
   * connect-time reconciliation. Otherwise the store's synced state becomes exactly what it
   * reads. `lastSynced` must already be what the backend holds.
   *
   * `base`, when given, is the backend's whole state at an earlier point, and the store may hold a
   * local change made since then that the engine has not written. The store's synced state is
   * then merged with what it reads, against `base`, instead of being replaced. When the merge
   * keeps some of the local change, the store's state after the apply is written as a local
   * change.
   */
  const applyRemote = (
    held: Plain,
    keepLocalOnly: boolean,
    base?: Plain,
  ): void => {
    let current: S;
    let synced: Plain;
    let target: Plain;
    let next: S;
    /** The synced part of `next`; see `mergeStates`. */
    let patched: Plain;
    /** Whether `target` holds a local change the backend lacks. */
    let local = false;
    const keysBefore = heldKeys;
    applyingRemote = true;
    try {
      current = readStore();
      synced = filterState(current);
      const remote = readRemote(held, current);
      if (keepLocalOnly) target = { ...synced, ...remote };
      else if (base === undefined) target = remote;
      else {
        const merged = mergeLocalChange(base, current, synced, remote);
        local = !jsonEqual(merged, remote);
        target = local ? merged : remote;
      }
      ({ next, patched } = mergeStates(current, synced, target));
      if (next !== current) call("store", () => adapter.setState(next));
      else if (!local) {
        recordHeldKeys(synced);
        // Nothing changed, so `synced` equals `target`.
        recordStoreObjects(held, synced);
        return;
      }
    } finally {
      applyingRemote = false;
    }
    const after = readStore();
    // A store that ignored the change entirely, such as a Redux store without the replace case,
    // would otherwise write its old state back over every peer's.
    if (after === current && next !== current) {
      recordHeldKeys(synced);
      return;
    }
    const applied = filterState(after);
    if (local) {
      writeLocalChange(applied, [...keysBefore, ...Object.keys(synced)]);
      return;
    }
    // The store's notifications were ignored meanwhile, so a key it normalised or derived from
    // `next` reaches the backend only here. An echo of `next` alone equals `target`.
    recordHeldKeys(applied);
    // A key the store lacks after the apply is one it removed only if it held it before; see
    // `StoreAdapter.setState`. Compared with `patched` rather than `target`, which is equal as JSON
    // but shares no object with the store, so that what the apply left alone is skipped by identity.
    const paths = changedPaths(patched, applied).filter(
      ([key]) => hasOwn(applied, key) || hasOwn(synced, key),
    );
    countContradictions(target, paths);
    lastApplied = applied;
    // The backend still holds `held`, which the write-back below, if any, is diffed against.
    recordStoreObjects(held, keptObjects(patched, applied, paths));
    if (paths.length === 0) return;
    const stopped = paths.filter(
      (path) =>
        (contradictions.get(pathId(path))?.count ?? 0) >= LOOP_THRESHOLD,
    );
    // Writing these would only make the peer change them again, and so on forever. The store
    // keeps its values for them, which differ from the backend's.
    if (stopped.length > 0) reportLoop(stopped);
    if (stopped.length === paths.length) return;
    const written =
      stopped.length === 0 ? applied : withValuesAt(applied, target, stopped);
    writeSynced(
      written,
      paths
        .filter((path) => path.length === 1 && !hasOwn(written, path[0]))
        .map(([key]) => key),
      isStale(),
    );
  };

  /**
   * Whether the backend may have changed since an apply read it: code the store notified may
   * have changed it before the engine hears of it, as with an uncommitted Loro edit, or a Yjs
   * transaction whose observers run after the engine's.
   */
  const isStale = (): boolean => !isUnchanged(readRevision());

  /** Starts the loop counts again, as for a local change; see `countContradictions`. */
  const restartLoopCounts = (): void => {
    lastApplied = null;
    contradictions.clear();
  };

  /**
   * Writes `applied`, the store's synced state after an apply that merged a local change into
   * it, and deletes each of the `held` keys it lacks, which the store removed. It is a local
   * change, so the loop counts start again, as for any local change.
   */
  const writeLocalChange = (applied: Plain, held: Iterable<string>): void => {
    restartLoopCounts();
    const removed = [...new Set(held)].filter((key) => !hasOwn(applied, key));
    writeSynced(applied, removed, isStale());
  };

  /**
   * For each of the `paths` at which the store changed `remote`, counts whether `remote` holds a
   * different value there than the store held after the previous apply. If it does, another peer
   * changed what this store had there, and this store changed it again. Peers that keep doing so
   * only re-write each other's changes. When the store changed some path anew, such as a key it
   * derives from an edit, the apply contradicts none of the paths, and their counts restart. A
   * counted path that the store left as `remote` holds it also restarts when `remote` changed it,
   * since the store kept another peer's value. A counted path that neither side changed keeps its
   * count, so a loop over one path is still counted while remote changes to other paths come in
   * between. A local change restarts every count, even one that writes nothing; see
   * `restartLoopCounts`. `applyRemote` stops writing back a path whose count reaches
   * `LOOP_THRESHOLD`, until an apply no longer contradicts it.
   */
  const countContradictions = (remote: Plain, paths: string[][]): void => {
    const previous = lastApplied;
    if (previous === null) {
      contradictions.clear();
      return;
    }
    const changed = new Set(paths.map(pathId));
    for (const [id, { path }] of contradictions)
      if (
        !changed.has(id) &&
        !jsonEqual(valueAt(previous, path), valueAt(remote, path))
      )
        contradictions.delete(id);
    const contradicted = paths.every(
      (path) => !jsonEqual(valueAt(previous, path), valueAt(remote, path)),
    );
    for (const path of paths) {
      const id = pathId(path);
      const counted = contradictions.get(id);
      if (!contradicted) contradictions.delete(id);
      else if (counted !== undefined) counted.count++;
      else contradictions.set(id, { path, count: 1 });
    }
  };

  /**
   * Keeps a stopped loop as the status's failure, each time it comes back, and reports it once per
   * set of top-level keys: to `onError` in every build, and otherwise with a warning in
   * development. A loop that is not already the status's failure is announced with `'error'`
   * after the `'remote'` that ends the apply.
   */
  const reportLoop = (paths: string[][]): void => {
    const keys = [...new Set(paths.map(([key]) => key))];
    const id = JSON.stringify([...keys].sort());
    const reported = reportedLoops.get(id);
    const loop = reported ?? {
      error: new WriteLoopError(keys, paths),
      source: "store",
    };
    reportedLoops.set(id, loop);
    if (failure !== loop) untold = loop;
    failure = loop;
    if (reported === undefined) {
      if (onError !== undefined) onError(loop.error, "store");
      else warnInDevelopment(loopMessage(paths));
    }
    stoppedLoop = true;
  };

  const syncToStore = (): void => {
    remoteReads++;
    const base = lastSynced;
    // The apply writes the waiting local change, merged with the remote changes, so the queued
    // write is left with nothing to do. Without a base, the remote changes replace it, as in
    // `applyUnseenRemote`.
    const merging = queuedWrite !== null && base !== undefined;
    queuedWrite = null;
    // Cleared first, so that `lastSynced` stays unknown if the read throws.
    lastSynced = undefined;
    lastRevision = readRevision();
    // What was read, not the store's state after the apply: `setState` may reject or transform it.
    const held = readBackend();
    lastSynced = held;
    applyRemote(held, false, merging ? base : undefined);
    emit("remote");
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
      guarded(runPendingApply);
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

  /**
   * Before a local change is written, applies the remote changes the store has not been given
   * yet, and returns whether it applied any. These are the changes waiting for the scheduled
   * flush, and those the backend holds before the engine's own listener hears of them, as when
   * another listener of the backend changes the store first. Reads the backend unless its revision shows it unchanged, and applies
   * only what differs from what the engine last synced, so a notification for a change already
   * applied does not touch the local change. The local change is merged into the apply against
   * what the engine last synced, and written with it; see `applyRemote`.
   */
  const applyUnseenRemote = (): boolean => {
    const pending = applyPending;
    applyPending = false;
    const synced = lastSynced;
    // Without a base, after a read or a write threw, the engine cannot tell whether the backend
    // changed, nor which side changed what. So only a pending apply runs, and the remote changes
    // replace the store's synced state, local change included. Writing the store's state instead would
    // revert them for every peer.
    if (synced === undefined) {
      if (pending) syncToStore();
      return pending;
    }
    const revision = readRevision();
    if (isUnchanged(revision)) return false;
    // Cleared first, so that `lastSynced` stays unknown if the read throws.
    lastSynced = undefined;
    const held = readBackend();
    if (jsonEqual(held, synced)) {
      // Kept rather than `held`, since the store's unchanged subtrees share its objects.
      recordSynced(synced, revision);
      return false;
    }
    remoteReads++;
    recordSynced(held, revision);
    applyRemote(held, false, synced);
    emit("remote");
    return true;
  };

  const syncToBackend = (): void => {
    // Remote changes the store has not been given are applied first, or the write would revert
    // them. Applying them merges the local change in and writes what the merge kept, so there is
    // nothing left to write. A store that ignored the apply keeps its stale state out of the
    // backend this way too.
    if (applyUnseenRemote()) return;
    restartLoopCounts();
    const synced = filterState(readStore());
    const removed = [...heldKeys].filter((key) => !hasOwn(synced, key));
    // A change to local keys only leaves every synced value the object the backend holds, and
    // writing it would only make the backend diff the two. A container changed in place looks
    // unchanged either way; see `StoreAdapter.getState`.
    if (removed.length === 0 && holdsAll(lastSynced, synced))
      recordHeldKeys(synced);
    else writeSynced(synced, removed);
    emit("local");
  };

  /**
   * Handles a store notification: writes the local change at once or, with `scheduleWrite`,
   * queues one write that covers every notification until it runs. An echo of `setState` is ignored, so it queues
   * no write.
   */
  const onStoreChange = (): void => {
    if (applyingRemote) return;
    if (scheduleWrite === undefined) {
      guarded(syncToBackend);
      return;
    }
    if (queuedWrite !== null) return;
    const flush = (): void => {
      // A flush handed out before `disconnect()`, or before a remote change wrote the local
      // change, does nothing.
      if (queuedWrite !== flush) return;
      queuedWrite = null;
      guarded(syncToBackend);
    };
    queuedWrite = flush;
    scheduleWrite(flush);
  };

  const unsubscribeAll = (): void => {
    backendUnsubscribe?.();
    backendUnsubscribe = null;
    storeUnsubscribe?.();
    storeUnsubscribe = null;
  };

  /** Leaves the connected state: nothing heard, and `'disconnect'` sent. */
  const stopSyncing = (): void => {
    queuedWrite = null;
    unsubscribeAll();
    // A disconnected engine hears no remote change, so it reads the backend again on connect.
    lastSynced = undefined;
    heldKeys = new Set();
    restartLoopCounts();
    connected = false;
    emit("disconnect");
  };

  /**
   * The per-key merge of `connect()`: a key the backend holds wins, and a key only the store holds
   * stays in the store and, with `seed`, is written in one write. The engine subscribes to the
   * backend only afterwards, so no remote change is applied meanwhile.
   */
  const reconcile = (): void => {
    let held = readBackend();
    const remote = filterState(held);
    const local = filterState(readStore());
    const remoteKeys = new Set(Object.keys(remote));
    const missing = Object.keys(local).filter((key) => !remoteKeys.has(key));

    if (seed && missing.length > 0) {
      // Keys this peer does not sync stay as the backend holds them.
      const seeded: Plain = { ...held };
      for (const key of missing) seeded[key] = local[key];
      // Only the store has been read since, so the backend still holds `held`.
      call("backend", () => backend.write(seeded, held));
      held = seeded;
    }

    recordSynced(held, readRevision());
    applyRemote(held, true);
  };

  return {
    connect: (): void => {
      if (connected) return;

      thrownBy = undefined;
      try {
        reconcile();
        backendUnsubscribe = call("backend", () =>
          backend.subscribe(() => guarded(onRemoteChange)),
        );
        storeUnsubscribe = call("store", () =>
          adapter.subscribe(() => onStoreChange()),
        );
      } catch (error) {
        // `disconnect()` cannot reach a subscription made before the throw, so drop it here.
        unsubscribeAll();
        lastSynced = undefined;
        recordFailure(error, thrownBy);
        throw error;
      }
      connected = true;
      emit("connect");
    },

    disconnect: (): void => {
      if (!connected) return;

      // The store keeps what the backend held while connected; the scheduled flush is dropped.
      scheduledFlush = null;
      // A waiting local change is written, merged with a pending apply, or it would be lost: on
      // the next connect the backend wins for every key it holds.
      const write = queuedWrite !== null;
      queuedWrite = null;
      try {
        guarded(write ? syncToBackend : runPendingApply);
      } finally {
        // Also when the pending apply or write threw: the engine is disconnected all the same.
        stopSyncing();
      }
    },

    getStatus,

    getSyncedState: (): Plain => filterState(readStore()),

    subscribe: (listener): Unsubscribe => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
