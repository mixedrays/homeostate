import type {
  CrdtBackend,
  StoreAdapter,
  SyncEngine,
  SyncEngineConfig,
  SyncErrorSource,
  SyncEvent,
  SyncFailure,
  SyncStatus,
  Unsubscribe,
} from "./types.js";
import { defaultSyncFilter } from "./types.js";
import { keepIdentity } from "./patching.js";
import { mergeConcurrent } from "./merge.js";
import {
  hasOwn,
  isAbsent,
  isRecord,
  jsonEqual,
  kindOf,
  PROTO_KEY,
} from "./json.js";

type Plain = Record<string, unknown>;

/** The value of `key` in `state` as JSON would store it; `undefined` when it would be left out. */
const jsonEntry = (state: Plain, key: string): unknown =>
  hasOwn(state, key) && !isAbsent(state[key]) ? state[key] : undefined;

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
 * `patched`, the synced state given to the store, with the store's own value, from `applied`, at
 * each key `applied` holds and no path of `paths` starts at, since the two are equal as JSON there.
 * So it equals `patched` as JSON, and holds the very objects of `applied` wherever the store left a
 * key as it was given, even for a store whose `getState` returns copies. At every other key it
 * holds `patched`'s value, which shares every object the store kept.
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

/** Identifies a path in a set. */
const pathId = (path: string[]): string => JSON.stringify(path);

/**
 * Whether `state` holds `key`: `undefined` reads as absent, as in JSON, while a function, which
 * JSON drops too, is held, so that `filter` can judge it.
 */
const holds = (state: object, key: string): boolean =>
  hasOwn(state, key) && (state as Plain)[key] !== undefined;

/** Whether `held` holds every entry of `state`, each the same value or object. */
const holdsAll = (held: Plain | undefined, state: Plain): boolean => {
  if (held === undefined) return false;
  for (const key of Object.keys(state))
    if (!hasOwn(held, key) || held[key] !== state[key]) return false;
  return true;
};

/** A copy of `state` without `keys`. */
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
  ready: false,
  failure: null,
});
const WAITING: SyncStatus = Object.freeze({
  connected: true,
  ready: false,
  failure: null,
});
const READY: SyncStatus = Object.freeze({
  connected: true,
  ready: true,
  failure: null,
});

/**
 * How many applies in a row must contradict what the store changed at a path before the engine
 * stops writing it back. Concurrent writes by other peers contradict it now and then, until the
 * other peers' own writes back end the contradiction; a loop contradicts it on every apply. Peers
 * that kept appending concurrently to a log a subscriber counts contradicted the count up to 5
 * times in a row, so a loop costs a few more round trips to stop. The docs and the contract on
 * `StoreAdapter.setState` name the number.
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
 * peers do not re-write each other's changes forever; see `StoreAdapter.setState`. Its message
 * lists the paths, from the root of the synced state, each as an array of keys. Reported once
 * per set of top-level keys holding them. The engine stays connected.
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

// Declared here so that core needs no Node types; bundlers replace `process.env.NODE_ENV`.
declare const process: { env: { NODE_ENV?: string } };

// Likewise, as the ES libs have no `console`.
declare const console: {
  error: (...data: unknown[]) => void;
  warn: (...data: unknown[]) => void;
};

// Likewise for `queueMicrotask`, which every browser and Node has.
declare const queueMicrotask: (callback: () => void) => void;

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
 * The one test of whether a top-level key is synced, in both directions: `keys` and `omit` by
 * name, then `filter`, which defaults to `defaultSyncFilter`.
 */
const syncPredicate = ({
  filter = defaultSyncFilter,
  keys,
  omit,
}: SyncEngineConfig): ((key: string, value: unknown) => boolean) => {
  if (keys === undefined && omit === undefined) return filter;
  const listed = keys === undefined ? undefined : new Set<string>(keys);
  const omitted = new Set<string>(omit);
  return (key, value) =>
    (listed === undefined || listed.has(key)) &&
    !omitted.has(key) &&
    filter(key, value);
};

/**
 * Creates a sync engine that keeps a store (via its adapter) and a CRDT backend
 * in sync in both directions.
 *
 * This is the core abstraction that makes the sync logic state-manager and
 * CRDT-library agnostic.
 *
 * `config` is typed by the adapter's state, so `keys` and `omit` take only its key names:
 * `{ omit: ['draft'] }` keeps one key local, `{ keys: ['todos'] }` syncs one alone. A key is
 * synced when `filter`, by default `defaultSyncFilter`, keeps it too. The store's value decides
 * what is written, and a backend value is read only when `filter` keeps it and the store's value
 * of the key, if the store holds one, so that a peer's value never replaces an action.
 *
 * On `connect()` the two sides are reconciled per key over the filtered view: a key the
 * backend holds wins over the store's value, and a synced key the backend lacks stays in
 * the store and is seeded into the backend unless `seed` is `false`. Afterwards every write
 * gives the backend the store's synced keys and deletes those the store removed, and a key
 * removed from the backend is removed from the store. Any other key the backend holds, such as
 * one a newer peer added that this store cannot hold or one `keys` or `omit` leaves out, stays
 * as it is, so a peer never deletes a key it does not sync. The store's own changes
 * while a remote change is applied, such as a key a reducer normalises or a subscriber derives,
 * are written once the apply ends. Once 6 applies in a row find another peer's value at a path the
 * store changed, and the store changes it again, that path is no longer written, so the peers do
 * not re-write each other's changes forever; see `StoreAdapter.setState`.
 *
 * With `schedule`, remote changes are applied once per scheduled flush instead of one by one.
 * A local change made before the flush applies them first, merged with the local change against
 * what the backend held before them, and writes the result, so neither side's change is lost; see
 * `SyncEngineConfig.schedule`. The same goes for a remote change the backend holds before the
 * engine hears of it, as when a listener subscribed to the document first changes the store as it
 * hears of it; see `CrdtBackend.revision`.
 *
 * With `ready`, `connect()` adopts what the backend holds and subscribes, and nothing is written
 * until `ready` resolves, when the engine reconciles; see `SyncEngineConfig.ready`.
 *
 * `connect()` throws what it runs into, including a `TypeError` for a `read()` or `getState()`
 * that does not return an object. Once connected, what the adapter or the backend throws goes to
 * `onError` when it is given, and otherwise to whoever triggered the work, as before. A rejected
 * `ready`, or a failure while reconciling after it, disconnects the engine and goes to `onError`,
 * and without it surfaces as an unhandled rejection. Whichever way an error goes, the engine
 * sends an `'error'` sync event, and `getStatus()` keeps it until the engine recovers; see
 * `SyncStatus`.
 *
 * @example
 * ```typescript
 * const backend = createYjsBackend(new Y.Doc(), 'shared');
 * const adapter = createZustandAdapter(store);
 * const engine = createSyncEngine(backend, adapter, { omit: ['draft'] });
 * engine.connect();
 * ```
 */
export function createSyncEngine<S extends object>(
  backend: CrdtBackend,
  adapter: StoreAdapter<S>,
  config: NoInfer<SyncEngineConfig<S>> = {},
): SyncEngine {
  const { seed = true, schedule, onError, ready } = config;
  // Untyped: the engine also judges keys the backend holds that `S` does not declare.
  const filter = syncPredicate(config as SyncEngineConfig);

  let connected = false;
  /** Identifies the wait for `ready` in progress; a wait that is no longer it does nothing. */
  let waiting: object | null = null;
  /** Whether `connect()`, and the wait for `ready` if any, have reconciled the two sides. */
  let reconciled = false;
  /** Whether a local change arrived during that wait; it writes what `seed: false` holds back. */
  let changedWhileWaiting = false;
  let storeUnsubscribe: Unsubscribe | null = null;
  let backendUnsubscribe: Unsubscribe | null = null;
  let applyingRemote = false;
  /**
   * What the backend holds as far as the engine knows: the whole state it last wrote or read,
   * keys this peer does not sync included. Passed to `backend.write` as `previous`; `undefined`
   * when unknown.
   */
  let lastSynced: Plain | undefined;
  /**
   * The synced keys the store held when the engine last wrote it or applied a remote change to
   * it. A key that leaves them is one the store removed, and the next write deletes it from the
   * backend; any other key the backend holds and the store lacks is left as it is.
   */
  let heldKeys: ReadonlySet<string> = new Set();
  /** The backend's revision when `lastSynced` was recorded. */
  let lastRevision: unknown;
  /** Counts backend reads after remote changes, so a write can tell that one ran during it. */
  let remoteReads = 0;
  /** Whether a remote change waits for the scheduled flush. */
  let applyPending = false;
  /** The flush handed to `schedule` and not run yet; a flush that is no longer it does nothing. */
  let scheduledFlush: (() => void) | null = null;
  /**
   * Queues the write of a local change, when the adapter batches its writes; see
   * `StoreAdapter.batchWrites`. Without it, each notification is written at once.
   */
  const scheduleWrite: ((flush: () => void) => void) | undefined =
    adapter.batchWrites === true ? queueMicrotask : undefined;
  /**
   * The flush queued with `scheduleWrite` and not run yet, while the store holds a local change
   * the engine has not written; a flush that is no longer it does nothing.
   */
  let queuedWrite: (() => void) | null = null;
  /**
   * The store's synced state after the last apply that it did not ignore, unless a local change
   * was written since; `null` when unknown.
   */
  let lastApplied: Plain | null = null;
  /**
   * By path id, on how many applies in a row that changed the path the remote state held another
   * value there than the store had, and the store changed it again; see `countContradictions`.
   */
  const contradictions = new Map<string, number>();
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
   * A failure the work in progress recorded and carries on after, as a stopped write loop or a
   * failed wait for `ready` does: `'error'` tells of it once the work's own event has been sent.
   */
  let untold: SyncFailure | null = null;
  /** What `getStatus` returned last with a failure. */
  let failedStatus: SyncStatus | null = null;

  const getStatus = (): SyncStatus => {
    const healthy = !connected ? DISCONNECTED : reconciled ? READY : WAITING;
    if (failure === null) return healthy;
    if (
      failedStatus?.failure !== failure ||
      failedStatus.connected !== healthy.connected ||
      failedStatus.ready !== healthy.ready
    ) {
      failedStatus = Object.freeze({ ...healthy, failure });
    }
    return failedStatus;
  };

  // `connect()` may come long after a promise rejects, and until then nothing else handles it.
  if (typeof ready === "object") ready.then(undefined, () => {});

  /**
   * Tells every listener that the engine has handled `event`, and then of the failure in
   * `untold`, if any, with `'error'`. A listener runs inside a store's or a document's
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
      // One unsubscribed by an earlier listener hears nothing more.
      if (!listeners.has(listener)) continue;
      try {
        listener(event);
      } catch (error) {
        console.error("[homeostate] a sync event listener threw:", error);
      }
    }
    // Unless a listener has cleared or replaced it since.
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
      if (key !== PROTO_KEY && filter(key, value)) filtered[key] = value;
    }
    return filtered;
  };

  /**
   * The synced state the store takes from `held`, the backend's whole state, given the store's
   * state `current` and its synced part `synced`. A key the store holds is read only when `filter`
   * keeps both its value and the backend's: one whose store value it rejects, such as an action,
   * is left alone, and one the store syncs keeps the store's value when `filter` rejects the
   * backend's. A key the store does not hold is judged by the backend's value alone.
   */
  const readRemote = (held: Plain, current: S, synced: Plain): Plain => {
    const remote: Plain = {};
    for (const [key, value] of Object.entries(held)) {
      if (key === PROTO_KEY) continue;
      const kept = filter(key, value);
      if (hasOwn(synced, key)) remote[key] = kept ? value : synced[key];
      else if (kept && !holds(current, key)) remote[key] = value;
    }
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

  /** The store's whole state. */
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
   * `removed` keys, which the store removed. Every other key the backend holds stays as it is,
   * such as one a newer peer added that this store cannot hold. Passes what the backend holds as
   * `previous`, or nothing when `stale`, so that the backend diffs against its document.
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
    // Unknown should the write throw.
    lastSynced = undefined;
    call("backend", () => backend.write(next, previous));
    // A remote change applied during the write has already recorded what it read.
    if (remoteReads !== reads) return;
    lastRevision = readRevision();
    lastSynced = next;
    heldKeys = new Set(Object.keys(synced));
  };

  /**
   * Merges `synced`, the store's synced state, which holds a change the engine has not written,
   * with `remote`, what the store reads from the backend's whole state, against `base`, the
   * backend's whole state when the two last agreed, read as `remote` was. So a key the store keeps
   * local is merged on neither side, and one whose backend value `filter` rejects keeps the
   * store's value. A key the store lacks and did not hold then, such as one it cannot hold, is
   * unchanged on the store's side rather than removed. See `mergeConcurrent` for the rules.
   */
  const mergeLocalChange = (
    base: Plain,
    current: S,
    synced: Plain,
    remote: Plain,
  ): Plain => {
    const seen = readRemote(base, current, synced);
    const local = { ...synced };
    for (const key of Object.keys(seen))
      if (!hasOwn(synced, key) && !heldKeys.has(key)) local[key] = seen[key];
    return mergeConcurrent(seen, local, remote) as Plain;
  };

  /**
   * Records `held`, the backend's whole state an apply read, as `lastSynced`, with the store's
   * objects in place of the backend's, so that the next write skips what is unchanged by identity,
   * as after a local write. `state`, which holds the store's objects, must equal `target` as JSON.
   * Only a key whose value in `target` came from `held` is taken: one whose backend value `filter`
   * rejected holds the store's value there, which the backend lacks. Does nothing when a newer
   * read has been recorded meanwhile, by a remote change applied while the store took this one.
   */
  const recordStoreObjects = (
    held: Plain,
    target: Plain,
    state: Plain,
  ): void => {
    if (lastSynced !== held) return;
    const shared = { ...held };
    for (const key of Object.keys(target))
      if (hasOwn(held, key) && target[key] === held[key] && hasOwn(state, key))
        shared[key] = state[key];
    lastSynced = shared;
  };

  /**
   * Makes the store's synced state what it reads from `held`, the backend's whole state, then
   * writes what the store changed in response; see `readRemote`. With `keepLocalOnly`, a synced
   * key the backend does not hold is left in place instead of being deleted, except the `removed`
   * keys; that is the connect-time reconciliation, and every apply while waiting for `ready`.
   * Otherwise what it reads is the whole synced state. `lastSynced` must already be what the
   * backend holds.
   *
   * With `base`, the store may hold a local change the engine has not written, made since the
   * backend held `base`, its whole state then. The store's synced state is then merged with what
   * it reads, against `base`, instead of being replaced, and when the merge keeps some of the
   * local change, the store's state after the apply is written as a local change.
   */
  const applyRemote = (
    held: Plain,
    keepLocalOnly: boolean,
    removed: string[] = [],
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
      const remote = readRemote(held, current, synced);
      if (keepLocalOnly)
        target = { ...withoutKeys(synced, removed), ...remote };
      else if (base === undefined) target = remote;
      else {
        const merged = mergeLocalChange(base, current, synced, remote);
        local = !jsonEqual(merged, remote);
        target = local ? merged : remote;
      }
      ({ next, patched } = mergeStates(current, synced, target));
      if (next !== current) call("store", () => adapter.setState(next));
      else if (!local) {
        heldKeys = new Set(Object.keys(synced));
        // Nothing changed, so `synced` equals `target`.
        recordStoreObjects(held, target, synced);
        return;
      }
    } finally {
      applyingRemote = false;
    }
    // What the store changed reaches the backend when reconciling after `ready`.
    if (waiting !== null) return;
    const after = readStore();
    // A store that ignored the change entirely, such as a Redux store without the replace case,
    // would otherwise write its old state back over every peer's.
    if (after === current && next !== current) {
      heldKeys = new Set(Object.keys(synced));
      return;
    }
    const applied = filterState(after);
    if (local) {
      writeLocalChange(applied, [...keysBefore, ...Object.keys(synced)]);
      return;
    }
    // The store's notifications were ignored meanwhile, so a key it normalised or derived from
    // `next` reaches the backend only here. An echo of `next` alone equals `target`.
    heldKeys = new Set(Object.keys(applied));
    // A key the store lacks after the apply and lacked before is one it cannot hold or does not
    // sync, such as a key a MobX class does not declare, so it stays in the backend. One it held
    // before, it removed. Compared with `patched` rather than `target`, which is equal as JSON but
    // shares no object with the store, so that what the apply left alone is skipped by identity.
    const paths = changedPaths(patched, applied).filter(
      ([key]) => hasOwn(applied, key) || hasOwn(synced, key),
    );
    countContradictions(target, paths);
    lastApplied = applied;
    // The backend still holds `held`, which the write-back below, if any, is diffed against.
    recordStoreObjects(held, target, keptObjects(patched, applied, paths));
    if (paths.length === 0) return;
    const stopped = paths.filter(
      (path) => (contradictions.get(pathId(path)) ?? 0) >= LOOP_THRESHOLD,
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

  /**
   * Writes `applied`, the store's synced state after an apply that merged a local change into
   * it, and deletes each of the `held` keys it lacks, which the store removed. It is a local
   * change, so the loop counts start again, as for any written local change.
   */
  const writeLocalChange = (applied: Plain, held: Iterable<string>): void => {
    lastApplied = null;
    contradictions.clear();
    const removed = [...new Set(held)].filter((key) => !hasOwn(applied, key));
    writeSynced(applied, removed, isStale());
  };

  /**
   * Counts, for each of the `paths` at which the store changed `remote`, whether `remote` holds
   * another value there than the store held after the apply before: another peer changed what
   * this store had there, and this store changed it again. Peers that keep doing so only re-write
   * each other's changes. When the store changed some path anew, such as a key it derives from an
   * edit, the apply contradicts none of them, and their counts restart. A path the store left as
   * `remote` holds it restarts too when `remote` changed it, since the store kept another peer's
   * value; one that neither changed keeps its count, so a loop over one path still counts while
   * remote changes to other paths come in between.
   */
  const countContradictions = (remote: Plain, paths: string[][]): void => {
    const previous = lastApplied;
    if (previous === null) {
      contradictions.clear();
      return;
    }
    const changed = new Set(paths.map(pathId));
    for (const id of [...contradictions.keys()]) {
      const path = JSON.parse(id) as string[];
      if (
        !changed.has(id) &&
        !jsonEqual(valueAt(previous, path), valueAt(remote, path))
      )
        contradictions.delete(id);
    }
    const contradicted = paths.every(
      (path) => !jsonEqual(valueAt(previous, path), valueAt(remote, path)),
    );
    for (const path of paths) {
      const id = pathId(path);
      if (contradicted)
        contradictions.set(id, (contradictions.get(id) ?? 0) + 1);
      else contradictions.delete(id);
    }
  };

  /**
   * Keeps a stopped loop as the status's failure, each time it comes back, and reports it once per
   * set of top-level keys: to `onError` in every build, and otherwise with a warning in
   * development. A loop new to the status is told with `'error'` after the `'remote'` that ends
   * the apply.
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
      else if (!isProduction())
        console.warn(`[homeostate] ${loopMessage(paths)}`);
    }
    stoppedLoop = true;
  };

  const syncToStore = (): void => {
    remoteReads++;
    const base = lastSynced;
    const known = base ?? {};
    // The apply writes the waiting local change, merged with the remote changes, so the queued
    // write is left with nothing to do. Without a base, the remote changes replace it, as in
    // `applyUnseenRemote`.
    const merging = queuedWrite !== null && base !== undefined;
    queuedWrite = null;
    // Unknown should the read throw.
    lastSynced = undefined;
    lastRevision = readRevision();
    // What was read, not the store's state after the apply: `setState` may reject or transform it.
    const held = readBackend();
    lastSynced = held;
    if (waiting === null)
      applyRemote(held, false, [], merging ? base : undefined);
    else {
      // A key only the store holds waits to be seeded; one the backend held, a peer deleted.
      const removed = Object.keys(known).filter((key) => !hasOwn(held, key));
      applyRemote(held, true, removed);
    }
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
   * Applies the remote changes the store has not been given before a local change is written,
   * and returns whether it did: those waiting for the scheduled flush, and those the backend holds
   * before the engine's own listener hears of them, as when another listener of the backend
   * changes the store first. Reads the backend unless its revision shows it unchanged, and applies
   * only what differs from what the engine last synced, so a notification for a change already
   * applied does not touch the local change. The local change is merged into the apply against
   * what the engine last synced, and written with it; see `applyRemote`.
   */
  const applyUnseenRemote = (): boolean => {
    const pending = applyPending;
    applyPending = false;
    const synced = lastSynced;
    // Without a base, after a read or a write that threw, nothing tells a remote change apart,
    // nor which side changed what, so only a pending apply runs, and the remote changes replace
    // the store's synced state, local change included. Writing the store's state instead would
    // revert them for every peer.
    if (synced === undefined) {
      if (pending) syncToStore();
      return pending;
    }
    const revision = readRevision();
    if (isUnchanged(revision)) return false;
    // Unknown should the read throw.
    lastSynced = undefined;
    const held = readBackend();
    lastRevision = revision;
    if (jsonEqual(held, synced)) {
      // Kept rather than `held`, since the store's unchanged subtrees share its objects.
      lastSynced = synced;
      return false;
    }
    remoteReads++;
    lastSynced = held;
    applyRemote(held, false, [], synced);
    emit("remote");
    return true;
  };

  const syncToBackend = (): void => {
    if (waiting !== null) {
      changedWhileWaiting = true;
      return;
    }
    // Otherwise the write would revert those remote changes. Applying them merges the local
    // change in and writes what it kept, so there is nothing left to write. A store that ignored
    // the apply keeps its stale state out of the backend this way too.
    if (applyUnseenRemote()) return;
    lastApplied = null;
    contradictions.clear();
    const synced = filterState(readStore());
    const removed = [...heldKeys].filter((key) => !hasOwn(synced, key));
    // A change to local keys only leaves every synced value the object the backend holds, and
    // writing it would only make the backend diff the two. A container changed in place looks
    // unchanged either way; see `StoreAdapter.getState`.
    if (removed.length === 0 && holdsAll(lastSynced, synced))
      heldKeys = new Set(Object.keys(synced));
    else writeSynced(synced, removed);
    emit("local");
  };

  /**
   * Hears a store notification: writes the local change at once, or, with `scheduleWrite`, queues
   * one write for every notification until it runs. An echo of `setState` is ignored, and a local
   * change while waiting for `ready` writes nothing, so neither queues a write.
   */
  const onStoreChange = (): void => {
    if (applyingRemote) return;
    if (scheduleWrite === undefined || waiting !== null) {
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

  /** Leaves the connected state: nothing heard, nothing waited for, and `'disconnect'` sent. */
  const stopSyncing = (): void => {
    waiting = null;
    queuedWrite = null;
    unsubscribeAll();
    // A disconnected engine hears no remote change, so it reads the backend again on connect.
    lastSynced = undefined;
    heldKeys = new Set();
    lastApplied = null;
    contradictions.clear();
    connected = false;
    reconciled = false;
    emit("disconnect");
  };

  /**
   * The per-key merge of `connect()`: a key the backend holds wins, and a key only the store holds
   * stays in the store and, with `seedMissing`, is written in one write.
   */
  const reconcile = (seedMissing: boolean): void => {
    let held = readBackend();
    const remote = filterState(held);
    const local = filterState(readStore());
    const remoteKeys = new Set(Object.keys(remote));
    const missing = Object.keys(local).filter((key) => !remoteKeys.has(key));

    if (seedMissing && missing.length > 0) {
      // Keys this peer does not sync stay as the backend holds them.
      const seeded: Plain = { ...held };
      for (const key of missing) seeded[key] = local[key];
      const reads = remoteReads;
      // Only the store has been read since, so the backend still holds `held`.
      call("backend", () => backend.write(seeded, held));
      // A remote change applied during the write has given the store what it read.
      if (remoteReads !== reads) return;
      held = seeded;
    }

    lastRevision = readRevision();
    lastSynced = held;
    applyRemote(held, true);
  };

  /**
   * Disconnects after a wait that cannot go on, and hands `error` to `onError`. With no `onError`
   * or no `source`, it throws, which nothing catches, so that `error` reaches the runtime as an
   * unhandled rejection: there is no caller of `connect()` left to tell.
   */
  const failConnect = (
    error: unknown,
    source: SyncErrorSource | undefined,
  ): void => {
    applyPending = false;
    scheduledFlush = null;
    // `'disconnect'` already shows it, so the status changes once; `'error'` follows.
    failure = { error, source };
    untold = failure;
    stopSyncing();
    if (onError === undefined || source === undefined) throw error;
    onError(error, source);
  };

  /** Ends `wait` once `ready` has resolved, unless the engine has left it since. */
  const onReady = (wait: object): void => {
    if (waiting !== wait) return;
    scheduledFlush = null;
    thrownBy = undefined;
    try {
      // Still waiting, so that a key a peer deleted leaves the store instead of being seeded.
      runPendingApply();
      // Code it notified may have disconnected the engine.
      if (waiting !== wait) return;
      waiting = null;
      reconcile(seed || changedWhileWaiting);
    } catch (error) {
      const source = thrownBy;
      thrownBy = undefined;
      failConnect(error, source);
      return;
    }
    // Code reconciling notified may have disconnected the engine, or started another wait.
    if (!connected || waiting !== null) return;
    reconciled = true;
    emit("ready");
  };

  /** Ends `wait` once `ready` has rejected, unless the engine has left it since. */
  const onRejected = (wait: object, error: unknown): void => {
    if (waiting === wait) failConnect(error, "ready");
  };

  return {
    connect: (): void => {
      if (connected) return;

      thrownBy = undefined;
      let settling: PromiseLike<unknown> | undefined;
      try {
        settling = typeof ready === "function" ? ready() : ready;
      } catch (error) {
        recordFailure(error, "ready");
        throw error;
      }
      const wait = settling === undefined ? null : {};
      waiting = wait;
      changedWhileWaiting = false;
      // Before anything can throw: a throw abandons the wait, which leaves this nothing to do.
      if (wait !== null) {
        void Promise.resolve(settling).then(
          () => onReady(wait),
          (error: unknown) => onRejected(wait, error),
        );
      }
      try {
        reconcile(wait === null && seed);
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
        waiting = null;
        recordFailure(error, thrownBy);
        throw error;
      }
      connected = true;
      reconciled = wait === null;
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
