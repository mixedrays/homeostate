---
description: Signatures, options, lifecycle methods and adapter contracts for createSyncEngine and defaultSyncFilter.
label: Sync engine API
order: 1
---

# Sync engine API

Import these APIs and types from `@homeostate/core`. For an app you can run, start with
[Getting started](/docs/getting-started); for the architecture, read [Concepts](/docs/concepts).

## createSyncEngine

```ts
declare function createSyncEngine<S extends object>(
  backend: CrdtBackend,
  adapter: StoreAdapter<S>,
  config?: SyncEngineConfig,
): SyncEngine;
```

Creates a disconnected engine. Call `connect()` to reconcile the current state and start
watching both sides. Creation alone does not read, write or subscribe to either side.

| Parameter | Required | Description                                               |
| --------- | -------- | --------------------------------------------------------- |
| `backend` | Yes      | The replicated state, exposed through `CrdtBackend`.      |
| `adapter` | Yes      | The application store, exposed through `StoreAdapter<S>`. |
| `config`  | No       | Sync options. Defaults to `{}`.                           |

Returns a `SyncEngine`. The engine is synchronous and does not retry. `connect()` throws what
it runs into. Once connected, adapter and backend errors go to `onError` when it is given;
otherwise they, like filter errors, propagate to the caller of the operation that triggered them,
which is whoever calls `flush` for an apply deferred by `schedule`. See
[Reporting errors](#reporting-errors).

### Example

This example uses the [Zustand adapter](../../store-zustand/docs/introduction.md) and an
[in-memory backend](./testing.md#creatememorybackend) to show both directions without a server:

```ts title="sync-engine-example.ts"
import { createStore } from "zustand/vanilla";
import { createSyncEngine, defaultSyncFilter } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { createZustandAdapter } from "@homeostate/store-zustand";

const store = createStore(() => ({ count: 0, draft: "Only on this device" }));
const backend = createMemoryBackend({ count: 7 });
const engine = createSyncEngine(backend, createZustandAdapter(store), {
  filter: (key, value) => defaultSyncFilter(key, value) && key !== "draft",
  seed: "if-empty",
});

engine.connect();
console.log(store.getState().count); // 7: the existing backend value wins

store.setState({ count: 8 });
console.log(backend.read()); // { count: 8 }

backend.receive({ count: 9 });
console.log(store.getState()); // { count: 9, draft: "Only on this device" }

engine.disconnect();
console.log(engine.isConnected()); // false
```

## SyncEngineConfig

```ts
interface SyncEngineConfig {
  filter?: (key: string, value: unknown) => boolean;
  seed?: SeedStrategy;
  schedule?: (flush: () => void) => void;
  onError?: (error: unknown, source: SyncErrorSource) => void;
}

type SeedStrategy = "if-empty" | "never";
type SyncErrorSource = "store" | "backend";
```

| Option     | Default             | Behavior                                                                                                             |
| ---------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `filter`   | `defaultSyncFilter` | Selects top-level keys independently in the store and backend, in both directions. Excluded keys stay local.         |
| `seed`     | `"if-empty"`        | On connection, writes synced keys that exist only in the store into the backend. `"never"` skips this initial write. |
| `schedule` | none                | Defers remote changes to the `flush` it schedules, then applies them with one read and one `setState`. See below.    |
| `onError`  | none                | Receives what the adapter or backend throws once connected, with its source, instead of the notifier. See below.     |

A custom filter replaces the default. Call `defaultSyncFilter` within it if you also want
to exclude functions. Filtering is top-level; it does not remove nested functions or turn
non-JSON values into JSON. Use plain JSON for the synced data.

Despite its name, `"if-empty"` works per key, even when the backend already holds other
keys. With either strategy, a backend key wins over the corresponding store value, and a
store-only key remains in the store during connection. With `"never"`, the next local
change still writes the store's entire filtered state, including those store-only keys.

### Coalescing remote changes

Without `schedule`, each backend notification is applied to the store at once, so a provider
that applies 50 queued updates as 50 transactions causes 50 reads and 50 `setState` calls.
With `schedule`, the first notification hands it a `flush` and later ones wait for it, so the
whole burst is applied with one read and one `setState`:

```ts
createSyncEngine(backend, adapter, {
  schedule: (flush) => queueMicrotask(flush),
});
```

`queueMicrotask` coalesces what arrives in one task; `requestAnimationFrame` applies at most
once per frame. Until the flush, `getState()` does not show the pending remote changes.

Local changes are still written synchronously. One made while an apply is pending runs that
apply first, and the remote changes win: what the local change did to synced keys is lost,
and only its changes to keys the filter excludes stay. With `queueMicrotask` that only affects
code that changes the store in the same task as a remote update; a longer delay, such as
`requestAnimationFrame`, lets user input fall in the window too. A remote change another
listener hears of before the engine is applied the same way, with or without `schedule`; see
[SyncEngine](#syncengine). `disconnect()` also runs a pending apply, and a flush called after
it does nothing.

### Reporting errors

Once the engine is connected, it calls the adapter and the backend from their notifications,
from the `flush` and from `disconnect()`. Without `onError`, what they throw propagates there:
a store validation error in `setState` reaches the provider's message handler, and a failed
`write` reaches the code that changed the store. The engine stays connected either way, and the
store and backend differ until the next change succeeds.

With `onError`, the engine catches those errors and reports them with their source, so neither
side's notifier sees them:

```ts
createSyncEngine(backend, adapter, {
  onError: (error, source) => {
    // source: "store" for getState and setState, "backend" for read and write
    report(error);
  },
});
```

The next change is synced as usual. `connect()` still throws, since a failed connect leaves the
engine disconnected, and errors from `filter`, `schedule` and `onError` itself propagate.

A `read()` or `getState()` that returns something other than an object breaks its contract. The
engine throws a `TypeError` naming the method and what it returned, such as
`CrdtBackend.read() must return a plain object, got string`: from `connect()`, before seeding,
or through `onError` once connected.

`onError` also receives a `WriteLoopError`, with the source `"store"`, when the engine stops
writing back keys the store keeps changing while remote changes are applied; see
[Store adapters](/docs/concepts#store-adapters). Its `keys` names them, and each set of keys is
reported once, in every build. Without `onError`, the engine warns once in development instead.

## SyncEngine

```ts
interface SyncEngine {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
}
```

| Method          | Returns   | Behavior                                                                                                                                                                        |
| --------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`     | `void`    | Reconciles current state per key, then subscribes to backend and store changes. Calling it again while connected does nothing.                                                  |
| `disconnect()`  | `void`    | Applies a pending remote change, then removes both subscriptions. Calling it while disconnected does nothing. It does not destroy the store, document, provider or persistence. |
| `isConnected()` | `boolean` | Whether the engine is subscribed. This does not report network connectivity or whether a provider has received the room's state.                                                |

After connection, each local notification writes the full filtered store state to the
backend, along with what the backend holds, so the backend can diff against it instead of
reading its document; see [CrdtBackend](#crdtbackend). If the backend holds a remote change
the store has not been given yet, the engine applies it first, and it wins as a pending apply
does: what the local change did to synced keys is lost. That happens when a listener subscribed
to the document before `connect()` changes the store as it hears of a remote change, before the
engine does. Each backend notification, or each
flush with `schedule`, applies the backend's full filtered state to the store, including
deletions. Unchanged subtrees keep their identity. Store notifications raised synchronously
while the engine applies remote state are ignored to avoid echoing that state back.

Reconnecting runs reconciliation again: backend values replace disconnected local edits
for matching keys. For offline editing, leave the engine connected and disconnect the
network provider instead. See [Connecting](/docs/concepts#connecting).

## defaultSyncFilter

```ts
declare const defaultSyncFilter: (key: string, value: unknown) => boolean;
```

Returns `typeof value !== "function"`; the key does not affect the result. This keeps
top-level actions out of shared state. It is not a JSON validator: values such as `Date`,
`Map` and `Set` are outside the supported synced-state model.

## StoreAdapter

```ts
interface StoreAdapter<S extends object> {
  getState: () => S;
  setState: (state: S) => void;
  subscribe: (onStoreChange: () => void) => Unsubscribe;
}
```

| Member                | Contract                                                                                                               |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `getState()`          | Returns the current store state, as an object.                                                                         |
| `setState(state)`     | Replaces the state with the engine's reconciled state. Called for backend changes and, when needed, during connection. |
| `subscribe(callback)` | Calls the callback when the store changes; returns a function that removes that subscription.                          |

Use a `store-*` package for your state manager, or implement this interface for your own
store. `S` may include local actions, but the part selected for sync must be plain JSON.

Update the synced state immutably, with a new object for every container that changes. The
engine diffs each write against the state it last wrote, and a container that is the same
object in both is taken as unchanged, so an array or object changed in place is not written.
Adapters whose `getState()` returns a fresh copy, such as the MobX adapter, meet this anyway.

## CrdtBackend

```ts
interface CrdtBackend {
  read: () => unknown;
  write: (next: unknown, previous?: unknown) => void;
  revision?: () => unknown;
  subscribe: (onRemoteChange: () => void) => Unsubscribe;
}
```

| Member                   | Contract                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read()`                 | Returns a plain JSON snapshot that does not alias mutable backend internals. For the sync engine, expose the synced top-level state as an object.                |
| `write(next, previous?)` | Makes the synced subtree equal to `next` in one atomic transaction. The backend chooses how to turn that snapshot into CRDT operations.                          |
| `revision()`             | Optional. A value equal (`===`) to an earlier one only if the synced subtree has not changed since, reported or not; `undefined` while it cannot tell.           |
| `subscribe(callback)`    | Reports changes outside this backend's own `write`, including imports from peers and local edits made directly on the document. Returns an unsubscribe function. |

`previous`, when given, is what the synced subtree holds now: the synced state the engine last
wrote, or the whole state it last read after a remote change. A backend can diff `next`
against it with `applyChanges` and `json: true` instead of reading its document; unchanged
subtrees of `next` are then the same objects and compare by identity. Like `next`, it may
hold `undefined` and functions, which `json: true` treats as absent. The engine passes nothing
for the seed write during `connect()`, after a write that threw, and for a write back after
`setState` during which the revision moved. A backend may ignore `previous`.

A document can change before `subscribe` reports it: another listener may hear of a remote
change first, and some libraries report changes only once a transaction ends or is committed.
So before writing a local change, the engine checks that the backend still holds what it last
synced. It reads the backend unless `revision()` returns the revision it recorded then, and
applies what it finds first if that differs; see [SyncEngine](#syncengine). Without
`revision`, it reads the backend before every local change. A revision may change without the
subtree changing, which costs only that read: the Yjs backend counts the document's
transactions, the Loro backend its ops, and the Automerge backend uses the document's heads.

`read()` must return an object; the engine throws a `TypeError` for anything else. Objects in the
snapshot must inherit from `Object.prototype`: a library that builds them by assignment turns
a peer's `__proto__` entry into the prototype, which the Yjs and Loro backends undo before
returning. Keep document replication in your CRDT provider. To write small edits instead of
replacing the document, see the [Diff and apply API](./diffing.md).

## Unsubscribe

```ts
type Unsubscribe = () => void;
```

The cleanup function returned by a subscription. The engine calls it on disconnect.

Source: [sync-engine.ts](../src/sync-engine.ts) and [types.ts](../src/types.ts).
