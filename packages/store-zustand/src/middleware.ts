import type { StateCreator, StoreMutatorIdentifier } from "zustand";
import {
  createSyncEngine,
  type SetupOptions,
  type SyncEngine,
} from "@homeostate/core";
import { createZustandAdapter } from "./adapter.js";

type Write<T, U> = Omit<T, keyof U> & U;
type WithHomeostate<S, A> = Write<S, { homeostate: A }>;

declare module "zustand/vanilla" {
  interface StoreMutators<S, A> {
    homeostate: WithHomeostate<S, A>;
  }
}

/** The `homeostate` middleware's options: the backend, the connect mode and the engine's config */
export type HomeostateOptions = SetupOptions;

export type HomeostateMiddleware = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  creator: StateCreator<T, [...Mps, ["homeostate", SyncEngine]], Mcs>,
  options: HomeostateOptions,
) => StateCreator<T, Mps, [["homeostate", SyncEngine], ...Mcs]>;

type HomeostateMiddlewareImpl = <T extends object>(
  creator: StateCreator<T, [], []>,
  options: HomeostateOptions,
) => StateCreator<T, [], []>;

/** The part of the `persist` middleware's `store.persist` API the middleware uses. */
interface PersistApi {
  hasHydrated: () => boolean;
  onFinishHydration: (listener: () => void) => () => void;
}

const OUTER_PERSIST_MESSAGE =
  "[homeostate] The persist middleware wraps the homeostate middleware, which writes the " +
  "store before persist hydrates it. Put persist inside instead: " +
  "homeostate(persist(creator, options), { backend }).";

/**
 * Throws when a `persist` middleware wrapping this one installs `store.persist`. It does so
 * right after the inner creator returns, in the same tick, so the trap is removed in a microtask.
 */
const rejectOuterPersist = (api: object, engine: SyncEngine): void => {
  const reject = (): never => {
    engine.disconnect();
    throw new Error(OUTER_PERSIST_MESSAGE);
  };
  Object.defineProperty(api, "persist", {
    configurable: true,
    enumerable: false,
    get: () => undefined,
    set: reject,
  });
  void Promise.resolve().then(() => {
    if (Object.getOwnPropertyDescriptor(api, "persist")?.set === reject) {
      delete (api as { persist?: unknown }).persist;
    }
  });
};

const homeostateImpl: HomeostateMiddlewareImpl = (creator, options) => {
  if (typeof creator !== "function") {
    throw new TypeError(
      "[homeostate] The middleware takes the state creator first and the backend in its " +
        "options: homeostate(creator, { backend }).",
    );
  }
  const { backend, connect = "auto", ...config } = options;
  return (set, get, api) => {
    const initialState = creator(set, get, api);
    const engine = createSyncEngine(backend, createZustandAdapter(api), config);
    /** Cancels a connect waiting for hydration; a no-op once it ran or was cancelled. */
    let stopWaiting: (() => void) | undefined;
    const cancelWaiting = (): void => {
      stopWaiting?.();
      stopWaiting = undefined;
    };
    /** Connects, or waits until `persist` has hydrated the store, so the room wins over it. */
    const connectWhenHydrated = (): void => {
      const persistApi = (api as { persist?: PersistApi }).persist;
      if (persistApi === undefined || persistApi.hasHydrated()) {
        cancelWaiting();
        engine.connect();
      } else if (stopWaiting === undefined) {
        stopWaiting = persistApi.onFinishHydration(() => {
          cancelWaiting();
          engine.connect();
        });
      }
    };
    (api as unknown as { homeostate: SyncEngine }).homeostate = {
      connect: connectWhenHydrated,
      disconnect: () => {
        cancelWaiting();
        engine.disconnect();
      },
      isConnected: engine.isConnected,
    };

    const persistApi = (api as { persist?: PersistApi }).persist;
    if (persistApi === undefined) rejectOuterPersist(api, engine);
    if (connect === "manual") return initialState;
    if (persistApi !== undefined && !persistApi.hasHydrated()) {
      connectWhenHydrated();
      return initialState;
    }

    api.setState(initialState, true);
    engine.connect();
    return api.getState();
  };
};

/**
 * Zustand middleware that mirrors the store into a CRDT backend for peer-to-peer synchronization.
 * It takes the state creator and its options: the `backend`, any `CrdtBackend` such as
 * `@homeostate/crdt-yjs`, `@homeostate/crdt-loro` or `@homeostate/crdt-automerge`, the
 * `connect` mode, and the sync engine's config (`filter`, `seed`, `schedule`, `onError`).
 * The engine is exposed as `store.homeostate`, so `store.homeostate.disconnect()` stops syncing.
 *
 * The store connects when it is created. With `connect: "manual"`, nothing reads or writes the
 * backend until the app calls `store.homeostate.connect()`, for example once its provider has
 * synced.
 *
 * Put Zustand's `persist` inside: `homeostate(persist(creator, options), { backend })`. The
 * store then connects once `persist` has hydrated it, and a `connect()` made before that waits
 * for it, so the room wins over the persisted state as on any `connect()`. With `persist`
 * outside, creating the store throws.
 *
 * Use the curried `create<T>()(...)` form: Zustand cannot infer the state type through a
 * middleware, so `create(homeostate(...))` types the state as `object`.
 *
 * @example
 * ```typescript
 * import * as Y from "yjs";
 * import { create } from "zustand";
 * import { createYjsBackend } from "@homeostate/crdt-yjs";
 * import { homeostate } from "@homeostate/store-zustand";
 *
 * type CounterState = { count: number; increment: () => void };
 *
 * const useStore = create<CounterState>()(
 *   homeostate(
 *     (set) => ({
 *       count: 0,
 *       increment: () => set((s) => ({ count: s.count + 1 })),
 *     }),
 *     { backend: createYjsBackend(new Y.Doc(), "shared") },
 *   ),
 * );
 * ```
 */
export const homeostate = homeostateImpl as unknown as HomeostateMiddleware;
