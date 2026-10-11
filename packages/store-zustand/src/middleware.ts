import type { StateCreator, StoreMutatorIdentifier } from "zustand";
import {
  createSyncEngine,
  type CrdtBackend,
  type SyncEngine,
  type SyncEngineConfig,
} from "@homeostate/core";
import { createZustandAdapter } from "./adapter.js";

type Write<T, U> = Omit<T, keyof U> & U;
type WithHomeostate<S, A> = Write<S, { homeostate: A }>;

declare module "zustand/vanilla" {
  interface StoreMutators<S, A> {
    homeostate: WithHomeostate<S, A>;
  }
}

export type HomeostateMiddleware = <
  T extends object,
  Mps extends [StoreMutatorIdentifier, unknown][] = [],
  Mcs extends [StoreMutatorIdentifier, unknown][] = [],
>(
  backend: CrdtBackend,
  creator: StateCreator<T, [...Mps, ["homeostate", SyncEngine]], Mcs>,
  config?: SyncEngineConfig,
) => StateCreator<T, Mps, [["homeostate", SyncEngine], ...Mcs]>;

type HomeostateMiddlewareImpl = <T extends object>(
  backend: CrdtBackend,
  creator: StateCreator<T, [], []>,
  config?: SyncEngineConfig,
) => StateCreator<T, [], []>;

/** The part of the `persist` middleware's `store.persist` API the middleware uses. */
interface PersistApi {
  hasHydrated: () => boolean;
  onFinishHydration: (listener: () => void) => () => void;
}

const OUTER_PERSIST_MESSAGE =
  "[homeostate] The persist middleware wraps the homeostate middleware, which writes the " +
  "store before persist hydrates it. Put persist inside instead: " +
  "homeostate(backend, persist(creator, options)).";

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

const homeostateImpl: HomeostateMiddlewareImpl =
  (backend, creator, config) => (set, get, api) => {
    const initialState = creator(set, get, api);
    const engine = createSyncEngine(backend, createZustandAdapter(api), config);
    /** Cancels the connect deferred until hydration; a no-op once it ran or was cancelled. */
    let stopWaiting = (): void => {};
    (api as unknown as { homeostate: SyncEngine }).homeostate = {
      connect: () => {
        stopWaiting();
        engine.connect();
      },
      disconnect: () => {
        stopWaiting();
        engine.disconnect();
      },
      isConnected: engine.isConnected,
    };

    const persistApi = (api as { persist?: PersistApi }).persist;
    if (persistApi === undefined) {
      rejectOuterPersist(api, engine);
    } else if (!persistApi.hasHydrated()) {
      // Connect once hydration has finished, so the room wins over the hydrated state.
      stopWaiting = persistApi.onFinishHydration(() => {
        stopWaiting();
        engine.connect();
      });
      return initialState;
    }

    api.setState(initialState, true);
    engine.connect();
    return api.getState();
  };

/**
 * Zustand middleware that mirrors the store into a CRDT backend for peer-to-peer synchronization.
 * Any `CrdtBackend` works: `@homeostate/crdt-yjs`, `@homeostate/crdt-loro`, `@homeostate/crdt-automerge`.
 * The engine is exposed as `store.homeostate`, so `store.homeostate.disconnect()` stops syncing.
 *
 * Put Zustand's `persist` inside: `homeostate(backend, persist(creator, options))`. The store
 * then connects once `persist` has hydrated it, and the room wins over the persisted state as on
 * any `connect()`. With `persist` outside, creating the store throws.
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
 *   homeostate(createYjsBackend(new Y.Doc(), "shared"), (set) => ({
 *     count: 0,
 *     increment: () => set((s) => ({ count: s.count + 1 })),
 *   })),
 * );
 * ```
 */
export const homeostate = homeostateImpl as unknown as HomeostateMiddleware;
