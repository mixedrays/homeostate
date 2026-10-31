import { addDisposer, isAlive } from "mobx-state-tree";
import {
  createSyncEngine,
  type JsonObject,
  type SetupOptions,
  type SyncEngine,
} from "@homeostate/core";
import { createMobxStateTreeAdapter, type SnapshotNode } from "./adapter.js";

const DESTROYED_MESSAGE =
  "[homeostate] syncStateTree cannot connect a destroyed node, since nothing could stop its " +
  "sync. Pass a live node to syncStateTree instead.";

/**
 * The `syncStateTree` options for a node whose snapshot is `S`: the backend, the connect mode and
 * the engine's config, whose `filter`, `keys` and `omit` are typed by `S`.
 */
export type SyncStateTreeOptions<S extends object = JsonObject> =
  SetupOptions<S>;

/**
 * Syncs a MobX-State-Tree node with a CRDT backend in one call, for as long as the node lives. It
 * takes the node, a root instance or a subtree, and its options: the `backend`, any `CrdtBackend`
 * such as `@homeostate/crdt-yjs`, `@homeostate/crdt-loro` or `@homeostate/crdt-automerge`, the
 * `connect` mode, and the sync engine's config (`filter`, `keys`, `omit`, `seed`, `schedule`,
 * `onError`). It creates the store adapter and the sync engine and returns the engine, so
 * `engine.disconnect()` stops syncing and `engine.connect()` syncs again.
 *
 * The node connects before the helper returns. With `connect: "manual"`, nothing reads or writes
 * the node's state or the backend until the app calls `engine.connect()`, for example once its
 * provider has synced. The node's snapshot must be an object, as a model's or a map's is: an array
 * node makes `connect()` throw a `TypeError`.
 *
 * Destroying the node disconnects the engine, whether `destroy` is called on the node or on an
 * ancestor, or a change to its parent removes it from the tree. This writes nothing to the backend.
 * A later remote change does not touch the node, and one still waiting for `schedule` is not
 * applied to it and stays in the backend. A local change does not reach the backend if it is made
 * in the same batch as the destroy: in the action that destroys the node, in `beforeDestroy` or in
 * any disposer. `engine.disconnect()` is safe before and after the destroy. A node MST reconciles
 * in place stays alive and keeps syncing, and so does a detached node.
 *
 * `connect()` on a destroyed node throws before it touches the node or the backend, whatever MST's
 * liveliness checking is set to. With `connect: "manual"`, the helper returns the engine even for
 * a node already destroyed, and that `connect()` throws; otherwise the helper throws. So a deferred
 * `connect()` that fires after `destroy` throws from its callback.
 *
 * A key the room holds outside the model, such as one a peer running a newer version of the app
 * adds, never reaches the node, and is removed from the room at the latest with this peer's next
 * local change. Passing `keys` does not prevent this, so every peer sharing a room should sync the
 * same keys.
 *
 * @param node - The tree node to sync; a root instance or a subtree
 * @param options - The backend, the connect mode and the engine's config
 * @returns The sync engine, connected unless `connect` is `"manual"`
 * @throws Unless `connect` is `"manual"`, what `engine.connect()` throws, as for a destroyed node
 *
 * @example
 * ```typescript
 * import * as Y from "yjs";
 * import { types } from "mobx-state-tree";
 * import { createYjsBackend } from "@homeostate/crdt-yjs";
 * import { syncStateTree } from "@homeostate/store-mobx-state-tree";
 *
 * const Counter = types
 *   .model({ count: 0 })
 *   .actions((self) => ({ increment() { self.count++; } }));
 *
 * const counter = Counter.create();
 * const engine = syncStateTree(counter, {
 *   backend: createYjsBackend(new Y.Doc(), "shared"),
 * });
 * counter.increment();
 * ```
 */
export function syncStateTree<S extends object>(
  // `null` and `undefined`: a node in a `types.maybe` prop is typed by the prop's snapshot.
  node: SnapshotNode<S | null | undefined>,
  options: SyncStateTreeOptions<S>,
): SyncEngine {
  const { backend, connect = "auto", ...config } = options;
  let alive = isAlive(node);
  const adapter = createMobxStateTreeAdapter<S>(node);
  const engine = createSyncEngine(
    backend,
    {
      getState: () => adapter.getState(),
      // `disconnect()` runs a pending apply. On a dying node, it would run `beforeDestroy` hooks
      // again, and abort the destroy if the remote state does not fit the model.
      setState: (state) => {
        if (alive) adapter.setState(state);
      },
      subscribe: (onStoreChange) => adapter.subscribe(onStoreChange),
    },
    config,
  );
  addDisposer(node, () => {
    alive = false;
    engine.disconnect();
  });
  const synced: SyncEngine = {
    ...engine,
    connect: () => {
      if (!alive) throw new Error(DESTROYED_MESSAGE);
      engine.connect();
    },
  };
  if (connect === "auto") synced.connect();
  return synced;
}
