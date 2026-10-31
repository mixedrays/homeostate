import {
  createSyncEngine,
  type SetupOptions,
  type SyncEngine,
} from "@homeostate/core";
import {
  createMobxAdapter,
  type DataKey,
  type MobxAdapterOptions,
} from "./adapter.js";

/**
 * The `syncMobxStore` options for a store `S`: the backend, the connect mode and the engine's
 * config, whose `filter` is typed by the synced fields, with the store adapter's `keys` or `omit`,
 * which choose those fields.
 */
export type SyncMobxStoreOptions<
  S extends object,
  K extends DataKey<S> = DataKey<S>,
  O extends DataKey<S> = never,
> = Omit<SetupOptions<Pick<S, Exclude<K, O>>>, "keys" | "omit"> &
  MobxAdapterOptions<S, K, O>;

/**
 * Syncs a MobX store with a CRDT backend in one call. It takes the store, already made observable,
 * and its options: the `backend`, any `CrdtBackend` such as `@homeostate/crdt-yjs`,
 * `@homeostate/crdt-loro` or `@homeostate/crdt-automerge`, the `connect` mode, the store adapter's
 * `keys` or `omit`, and the sync engine's config (`filter`, `seed`, `schedule`, `onError`). It
 * creates the store adapter and the sync engine and returns the engine, so `engine.disconnect()`
 * stops syncing and `engine.connect()` syncs again.
 *
 * The store connects before the helper returns. With `connect: "manual"`, the helper lists the
 * store's fields when it is called unless `keys` names them, but reads and writes no state until
 * the app calls `engine.connect()`, for example once its provider has synced. A field added
 * afterwards to an `observable({...})` store is not synced unless `keys` names it.
 *
 * `keys` and `omit` choose the synced fields as in {@link createMobxAdapter}, and without them the
 * helper syncs every observable data field. A key the room holds outside the store's synced fields,
 * such as one a peer running a newer version of the app adds, is removed from the room. Passing
 * `keys` does not prevent this, so every peer sharing a room should sync the same fields.
 *
 * @param store - The MobX store instance, already made observable
 * @param options - The backend, the connect mode, the adapter's options and the engine's config
 * @returns The sync engine, connected unless `connect` is `"manual"`
 * @throws When `keys` is not given and the store is not observable, whatever the connect mode
 *
 * @example
 * ```typescript
 * import * as Y from "yjs";
 * import { makeAutoObservable } from "mobx";
 * import { createYjsBackend } from "@homeostate/crdt-yjs";
 * import { syncMobxStore } from "@homeostate/store-mobx";
 *
 * class TodoStore {
 *   todos: { id: string; title: string }[] = [];
 *   draft = "";
 *   constructor() { makeAutoObservable(this); }
 * }
 *
 * export const store = new TodoStore();
 * export const engine = syncMobxStore(store, {
 *   backend: createYjsBackend(new Y.Doc(), "shared"),
 *   omit: ["draft"],
 * });
 * ```
 */
export function syncMobxStore<
  S extends object,
  K extends DataKey<S> = DataKey<S>,
  O extends DataKey<S> = never,
>(store: S, options: SyncMobxStoreOptions<S, K, O>): SyncEngine {
  const { backend, connect = "auto", keys, omit, ...config } = options;
  const engine = createSyncEngine(
    backend,
    createMobxAdapter(store, { keys, omit } as MobxAdapterOptions<S, K, O>),
    config,
  );
  if (connect === "auto") engine.connect();
  return engine;
}
