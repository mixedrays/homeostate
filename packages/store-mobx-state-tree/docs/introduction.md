---
description: Keep a MobX-State-Tree node in sync with a Yjs, Loro or Automerge document.
label: Introduction
---

# @homeostate/store-mobx-state-tree

[MobX-State-Tree](https://mobx-state-tree.js.org) store adapter for
[`@homeostate/core`](../../core/docs/introduction.md).
It keeps a state tree node in sync with a CRDT backend such as
[Yjs](../../crdt-yjs/docs/introduction.md), [Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md).

## Install

```bash install
npm install @homeostate/core @homeostate/store-mobx-state-tree mobx mobx-state-tree @homeostate/crdt-yjs yjs
```

`mobx` 6 or 7 and `mobx-state-tree` 7 or 8 are peer dependencies.

## Usage

Call `syncStateTree` with the node and the backend. It creates the store adapter and the sync
engine, and returns the engine:

```ts
import * as Y from "yjs";
import { types } from "mobx-state-tree";
import { createYjsBackend } from "@homeostate/crdt-yjs";
import { syncStateTree } from "@homeostate/store-mobx-state-tree";

const Todo = types.model({
  id: types.identifier,
  title: types.string,
  done: false,
});

const TodoStore = types.model({ todos: types.array(Todo) }).actions((self) => ({
  add(title: string) {
    self.todos.push({ id: crypto.randomUUID(), title });
  },
}));

const store = TodoStore.create();

const engine = syncStateTree(store, {
  backend: createYjsBackend(new Y.Doc(), "shared"),
});

engine.disconnect(); // stop syncing
engine.connect(); // sync again
```

The node connects before the helper returns: a key the room holds replaces the node's value, and
the keys the room lacks are seeded from the node unless `seed` is `false`.

| Option                                                  | Default  | Description                                                                                                        |
| ------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------ |
| `backend`                                               |          | The `CrdtBackend` the node syncs with                                                                              |
| `connect`                                               | `"auto"` | `"manual"` leaves `engine.connect()` to the app; see below                                                         |
| `filter`, `keys`, `omit`, `seed`, `schedule`, `onError` |          | The engine's `SyncEngineConfig`, typed by the node's snapshot                                                      |
| `onInvalidSnapshot`                                     |          | What to do with a remote state that does not fit the model; see [below](#remote-state-that-does-not-fit-the-model) |

The helper syncs the node's snapshot: local changes go to the backend once per action, and remote
changes are applied with `applySnapshot`, so instances with an identifier are reconciled in place
instead of being recreated. Pass the root instance, or any subtree node to sync only that part. The
snapshot must be an object, as a model's or a map's is: an array node makes `connect()` throw a
`TypeError`.

A key the room holds outside the model, such as one a peer running a newer version of the app adds,
never reaches the node and stays in the room as it is, with or without `keys`: this peer deletes
only the keys of its snapshot that it removes. See
[Keys this peer does not sync](../../core/docs/sync-engine.md#keys-this-peer-does-not-sync).

### The node's lifetime

`destroy(node)` stops sync. The helper registers the engine's `disconnect()` with `addDisposer` on
the node, so this also holds when an ancestor is destroyed, or when a change to the parent removes
the node from the tree. A node MST reconciles in place stays alive and keeps syncing. Destroying
the node writes nothing to the room. A later remote change does not touch the node, and one still
waiting for `schedule` is not applied to it and stays in the room. `engine.disconnect()` is safe
before and after the destroy.

A local change does not reach the room if it is made in the same batch as the destroy: in the
action that destroys the node, in `beforeDestroy` or in any disposer. MST reports the snapshot when
the batch ends, and by then sync has stopped. Changes from earlier batches have already been sent.

A destroyed node cannot connect again. `engine.connect()` throws before it touches the node or the
backend, whatever MST's liveliness checking is set to. The helper throws the same error for a node
already destroyed, unless `connect` is `"manual"`: then it returns the engine, and `connect()` throws.

`detach(node)` does not stop sync. A detached node stays alive and keeps syncing, also when it is
attached again, until it is destroyed or `engine.disconnect()` is called.

### Connecting later

With `connect: "manual"`, nothing reads or writes the node's state or the backend until
`connect()`, so the app connects when it is ready, for example once its provider has received the
room's state:

```ts
const engine = syncStateTree(store, { backend, connect: "manual" });

provider.once("sync", () => engine.connect());
```

A deferred `connect()` like this one throws from its callback if it fires after `destroy(node)`.

Waiting this way keeps the node's initial state from competing with a populated room; see
[Waiting for the room](../../core/docs/sync-engine.md#waiting-for-the-room) for what to wait
for, such as `persistence.whenLoaded`.

### Without the helper

`syncStateTree` creates the store adapter and the sync engine, connects them and ties them to the
node. Doing it yourself leaves that last step to you: without `addDisposer`, the engine keeps
running after `destroy(node)`, and the next remote change reaches the dead node. The checks for a
destroyed node above belong to the helper. `createMobxStateTreeAdapter(store, { onInvalidSnapshot })`
takes the helper's `onInvalidSnapshot` option.

```ts
import { addDisposer } from "mobx-state-tree";
import { createSyncEngine } from "@homeostate/core";
import { createMobxStateTreeAdapter } from "@homeostate/store-mobx-state-tree";

const engine = createSyncEngine({
  backend,
  adapter: createMobxStateTreeAdapter(store),
});
addDisposer(store, () => engine.disconnect());
engine.connect();
```

## Errors

The engine writes a local change from inside the snapshot listener, which MST runs in a MobX
reaction. An error that escaped from there would leave MobX mid-batch and stop every reaction in
the app, so the adapter catches it. Without the engine's `onError` option, a backend `write` that
fails never reaches the code that changed the node: the action returns normally, the adapter logs
the error with `console.error`, and the backend keeps its old value until the next successful
write. [`getStatus()`](../../core/docs/sync-engine.md#sync-status) keeps the error until then. Pass `onError` to handle it yourself;
nothing is logged then:

```ts
const engine = syncStateTree(store, {
  backend: createYjsBackend(new Y.Doc(), "shared"),
  onError: (error, source) => reportSyncError(error, source),
});
```

A remote change is applied outside any reaction, so without `onError` an error from it
propagates to the provider as with any other store. See
[Reporting errors](../../core/docs/sync-engine.md#reporting-errors).

### Remote state that does not fit the model

A peer on another version of the app can send a state the node's type rejects, such as one with a
renamed field, a new `types.enumeration` member or a stricter type. By default `applySnapshot`
decides what happens to it, and that differs by build. In development it throws MST's type check
error, which goes to `onError` or, without it, to the provider. With type checking disabled, as in
production, it applies the state unchecked, so a field can hold a value of the wrong type, such as
a number in a `types.identifier`.

Pass `onInvalidSnapshot` to check each remote state against the node's type before it is applied,
in every build, whatever MST's type checking is set to. An invalid state is never applied, not even
its valid parts:

| `onInvalidSnapshot` | With an invalid remote state                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"throw"`           | Throws MST's type check error. The engine stays connected and hands it to `onError` with the source `"store"`, or without `onError` lets it reach the provider. `connect()` throws it |
| `"skip"`            | Leaves the node as it is and reports nothing                                                                                                                                          |
| a function          | Is called with MST's validation errors and the state, and the node is left as it is. What the function throws goes where `"throw"`'s error goes                                       |

```ts
const engine = syncStateTree(store, {
  backend,
  onInvalidSnapshot: (errors, snapshot) => reportInvalidState(errors, snapshot),
});
```

Each error holds the rejected `value`, and the path to it as `context`; its type is exported as
`SnapshotValidationError`. The check validates the whole state on every remote change.

Rejecting a state does not keep the peer's changes. The state stays in the room while the node
keeps its own, and the next local change writes the node's state over the room, for every peer:
what the peer changed is lost, its valid changes included. Peers on different versions of the model
need a migration strategy, such as a `types.snapshotProcessor` that reads the older shape, or a
version key the app checks before it connects.
