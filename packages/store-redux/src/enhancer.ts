import type { StoreEnhancer } from "redux";
import {
  createSyncEngine,
  type JsonObject,
  type SetupOptions,
  type SyncEngine,
} from "@homeostate/core";
import {
  createReduxAdapter,
  withHomeostate,
  type ReduxLikeStore,
} from "./adapter.js";

/**
 * The `homeostate` enhancer's options for a store whose root state is `S`: the backend, the
 * connect mode and the engine's config, whose `filter`, `keys` and `omit` are typed by `S`.
 */
export type HomeostateOptions<S extends object = JsonObject> = SetupOptions<S>;

/**
 * Redux store enhancer that mirrors the store into a CRDT backend for peer-to-peer
 * synchronization. It takes one options object: the `backend`, any `CrdtBackend` such as
 * `@homeostate/crdt-yjs`, `@homeostate/crdt-loro` or `@homeostate/crdt-automerge`, the
 * `connect` mode, and the sync engine's config (`filter`, `keys`, `omit`, `seed`, `schedule`,
 * `onError`). Pass the root state type, `homeostate<RootState>(...)`, to check key names
 * against it. The enhancer wraps the root reducer, and any reducer later given to
 * `replaceReducer`, in {@link withHomeostate}, creates the store adapter and the sync engine,
 * and exposes the engine as `store.homeostate`, so `store.homeostate.disconnect()` stops
 * syncing.
 *
 * The store connects when it is created. With `connect: "manual"`, nothing reads or writes the
 * backend until the app calls `store.homeostate.connect()`, for example once its provider has
 * synced.
 *
 * Remote changes are applied by dispatching {@link replaceState} on the store the enhancer
 * wraps. Put the enhancer before the middleware, as Redux Toolkit's `prepend` does, so that
 * the action goes through the middleware, as a `store.dispatch` does, and listener middleware
 * and sagas see remote changes. Placed after it, with `concat`, the store still syncs, but
 * remote changes skip the middleware.
 *
 * @example
 * ```typescript
 * import * as Y from "yjs";
 * import { configureStore } from "@reduxjs/toolkit";
 * import { createYjsBackend } from "@homeostate/crdt-yjs";
 * import { homeostate } from "@homeostate/store-redux";
 *
 * const store = configureStore({
 *   reducer: { todos: todos.reducer, ui: ui.reducer },
 *   enhancers: (getDefaultEnhancers) =>
 *     getDefaultEnhancers().prepend(
 *       homeostate({ backend: createYjsBackend(new Y.Doc(), "shared") }),
 *     ),
 * });
 * ```
 */
export function homeostate<S extends object = JsonObject>(
  options: HomeostateOptions<S>,
): StoreEnhancer<{ homeostate: SyncEngine }> {
  const { backend, connect = "auto", ...config } = options;
  return (createStore) => (reducer, preloadedState) => {
    const store = createStore(withHomeostate(reducer), preloadedState);
    const engine = createSyncEngine(
      backend,
      createReduxAdapter(store as unknown as ReduxLikeStore<S>),
      config,
    );
    if (connect === "auto") engine.connect();
    return {
      ...store,
      replaceReducer: (
        nextReducer: Parameters<typeof store.replaceReducer>[0],
      ) => store.replaceReducer(withHomeostate(nextReducer)),
      homeostate: engine,
    };
  };
}
