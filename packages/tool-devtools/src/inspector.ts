import {
  defaultSyncFilter,
  type CrdtBackend,
  type StoreAdapter,
  type SyncEngine,
  type Unsubscribe,
} from "@homeostate/core";
import {
  deepEqual,
  diffJson,
  isRecord,
  setIn,
  share,
  toJsonObject,
  type DiffLine,
  type JsonObject,
  type JsonPath,
} from "./json";

/**
 * One store the devtools inspect, with the pieces of its sync setup they can reach.
 * Pass the same `adapter`, `backend` and `engine` the app syncs with.
 */
// `any` so a `StoreAdapter<TodoState>` fits: `setState` makes the adapter invariant in `S`.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface DevtoolsSource<S extends object = any> {
  /** Shown in the source switcher; also how the selected source is remembered. */
  name: string;
  /** Read, watched and written: every edit goes through `adapter.setState`. */
  adapter: StoreAdapter<S>;
  /** Shown read-only on the Sync tab next to the store. */
  backend?: CrdtBackend;
  /** Adds the connection status and a connect / disconnect switch. */
  engine?: SyncEngine;
  /** The engine's `filter`, if it has one, so keys it keeps out of sync are marked local. */
  filter?: (key: string, value: unknown) => boolean;
}

/**
 * Where a logged change came from. `remote` is a change a peer made that reached the store
 * through the backend; `devtools` is an edit made in the panel.
 */
export type LogOrigin = "initial" | "local" | "remote" | "devtools";

export interface LogEntry {
  id: number;
  /** Epoch milliseconds. */
  at: number;
  origin: LogOrigin;
  /** What a devtools edit did, e.g. `Edited todos[0].title`. */
  label?: string;
  /** The store's JSON after the change; restoring an entry writes it back. */
  state: JsonObject;
  /** The change from the previous observed state. */
  diff: DiffLine[];
}

/**
 * How a top-level store key relates to the backend:
 * - `synced`: the backend holds the same value
 * - `diverged`: the backend holds another value, typically while disconnected
 * - `pending`: the filter syncs the key but the backend does not hold it yet
 * - `local`: the filter keeps the key out of sync
 * - `backend-only`: the backend holds a key the store does not
 */
export type KeyStatus =
  "synced" | "diverged" | "pending" | "local" | "backend-only";

export interface InspectorSnapshot {
  /** The JSON view of `adapter.getState()`: functions and `undefined` are left out. */
  store: JsonObject;
  /** Why the store could not be read as JSON, e.g. a cycle. */
  storeError: string | null;
  /** `backend.read()`, or `null` without a backend. */
  backend: JsonObject | null;
  /** `engine.isConnected()`, or `null` without an engine. */
  connected: boolean | null;
  keyStatus: Readonly<Record<string, KeyStatus>>;
  /** Oldest first. */
  log: readonly LogEntry[];
  paused: boolean;
}

export interface Inspector {
  getSnapshot: () => InspectorSnapshot;
  subscribe: (listener: () => void) => Unsubscribe;
  /** Start watching the store, the backend and the engine. */
  start: () => void;
  stop: () => void;
  /** Swap in a source with the same adapter, backend and engine but a new name or filter. */
  update: (source: DevtoolsSource) => void;
  /** Replace the store's JSON keys with `state`; keys that are not JSON, such as actions, stay. */
  replaceState: (state: JsonObject, label: string) => void;
  /** Set the value at `path`; `undefined` removes the key or array item. */
  setAt: (path: JsonPath, value: unknown, label: string) => void;
  /** Write a logged state back into the store, and through the engine to every peer. */
  restore: (entryId: number) => void;
  connect: () => void;
  disconnect: () => void;
  clearLog: () => void;
  setPaused: (paused: boolean) => void;
}

export interface InspectorOptions {
  /** Log entries kept; older ones are dropped. Defaults to 200. */
  logLimit?: number;
  /** How often to check `engine.isConnected()`, which has no events. Defaults to 1000 ms. */
  pollInterval?: number;
}

type Plain = Record<string, unknown>;

/** A remote change reaches the store through the engine within the same task, so it outranks local. */
const originRank: Record<LogOrigin, number> = {
  initial: 0,
  local: 1,
  remote: 2,
  devtools: 3,
};

const messageOf = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const keyStatusOf = (
  store: JsonObject,
  localKeys: readonly string[],
  backend: JsonObject | null,
): Record<string, KeyStatus> => {
  const status: Record<string, KeyStatus> = {};
  for (const key of Object.keys(store)) {
    if (localKeys.includes(key)) status[key] = "local";
    else if (backend === null) continue;
    else if (!(key in backend)) status[key] = "pending";
    else
      status[key] = deepEqual(store[key], backend[key]) ? "synced" : "diverged";
  }
  if (backend !== null)
    for (const key of Object.keys(backend))
      if (!(key in store)) status[key] = "backend-only";
  return status;
};

/**
 * Watches one source and keeps a log of its store's changes. The store and backend
 * notifications of one task are read together in a microtask, so a remote change that the
 * engine applies to the store is logged once, as remote.
 */
export function createInspector(
  initialSource: DevtoolsSource,
  { logLimit = 200, pollInterval = 1000 }: InspectorOptions = {},
): Inspector {
  let source = initialSource;
  let nextId = 1;
  let running = false;
  let unsubscribers: Unsubscribe[] = [];
  let timer: ReturnType<typeof setInterval> | undefined;
  let scheduled = false;
  let pendingOrigin: LogOrigin | null = null;
  let pendingLabel: string | undefined;
  const listeners = new Set<() => void>();

  const read = (previous: InspectorSnapshot | null) => {
    let store = previous?.store ?? {};
    let storeError: string | null = null;
    let localKeys: string[] = [];
    try {
      const raw = source.adapter.getState() as Plain;
      store = toJsonObject(raw);
      const filter = source.filter ?? defaultSyncFilter;
      localKeys = Object.keys(store).filter((key) => !filter(key, raw[key]));
    } catch (error) {
      storeError = messageOf(error);
    }

    let backend: JsonObject | null = null;
    if (source.backend) {
      try {
        const value = source.backend.read();
        backend = isRecord(value) ? toJsonObject(value) : {};
      } catch {
        backend = {};
      }
    }

    // Keep the previous objects when nothing changed, so memoized views stay quiet.
    if (previous && deepEqual(previous.store, store)) store = previous.store;
    if (previous?.backend && deepEqual(previous.backend, backend))
      backend = previous.backend;

    return {
      store,
      storeError,
      backend,
      connected: source.engine ? source.engine.isConnected() : null,
      keyStatus: keyStatusOf(store, localKeys, backend),
    };
  };

  const first = read(null);
  let snapshot: InspectorSnapshot = {
    ...first,
    log: [
      {
        id: 0,
        at: Date.now(),
        origin: "initial",
        state: first.store,
        diff: [],
      },
    ],
    paused: false,
  };

  const emit = (next: InspectorSnapshot): void => {
    snapshot = next;
    listeners.forEach((listener) => listener());
  };

  const flush = (): void => {
    scheduled = false;
    const origin = pendingOrigin ?? "local";
    const label = pendingLabel;
    pendingOrigin = null;
    pendingLabel = undefined;
    if (!running) return;

    const next = read(snapshot);
    let log = snapshot.log;
    if (next.store !== snapshot.store && !snapshot.paused) {
      const entry: LogEntry = {
        id: nextId++,
        at: Date.now(),
        origin,
        label,
        state: next.store,
        diff: diffJson(snapshot.store, next.store),
      };
      log = [...log, entry].slice(-logLimit);
    }

    const changed =
      log !== snapshot.log ||
      next.store !== snapshot.store ||
      next.backend !== snapshot.backend ||
      next.connected !== snapshot.connected ||
      next.storeError !== snapshot.storeError ||
      !deepEqual(next.keyStatus, snapshot.keyStatus);
    if (changed) emit({ ...snapshot, ...next, log });
  };

  const schedule = (origin: LogOrigin, label?: string): void => {
    if (
      pendingOrigin === null ||
      originRank[origin] > originRank[pendingOrigin]
    ) {
      pendingOrigin = origin;
      pendingLabel = label;
    } else if (origin === pendingOrigin && label !== undefined) {
      pendingLabel = label;
    }
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(flush);
  };

  const commit = (next: unknown, label: string): void => {
    source.adapter.setState(next as object);
    schedule("devtools", label);
  };

  const replaceState = (state: JsonObject, label: string): void => {
    const current = source.adapter.getState() as Plain;
    const next: Plain = { ...current };
    for (const key of Object.keys(toJsonObject(current)))
      if (!(key in state)) delete next[key];
    for (const [key, value] of Object.entries(state))
      next[key] = share(current[key], value);
    commit(next, label);
  };

  const start = (): void => {
    if (running) return;
    running = true;
    unsubscribers = [source.adapter.subscribe(() => schedule("local"))];
    if (source.backend)
      unsubscribers.push(source.backend.subscribe(() => schedule("remote")));
    if (source.engine) {
      const engine = source.engine;
      timer = setInterval(() => {
        if (engine.isConnected() !== snapshot.connected) schedule("local");
      }, pollInterval);
    }
    // Pick up whatever changed while stopped.
    schedule("local");
  };

  const stop = (): void => {
    if (!running) return;
    running = false;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribers = [];
    clearInterval(timer);
    timer = undefined;
  };

  return {
    getSnapshot: () => snapshot,

    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start,
    stop,

    update: (next) => {
      source = next;
      schedule("local");
    },

    replaceState,

    setAt: (path, value, label) => {
      commit(setIn(source.adapter.getState(), path, value), label);
    },

    restore: (entryId) => {
      const entry = snapshot.log.find(({ id }) => id === entryId);
      if (entry) replaceState(entry.state, `Restored #${entryId}`);
    },

    connect: () => {
      source.engine?.connect();
      // Connecting adopts the backend's values, which is a remote change to the store.
      schedule("remote", "Connected: adopted the backend");
    },

    disconnect: () => {
      source.engine?.disconnect();
      schedule("local");
    },

    clearLog: () => emit({ ...snapshot, log: [] }),

    setPaused: (paused) => emit({ ...snapshot, paused }),
  };
}
