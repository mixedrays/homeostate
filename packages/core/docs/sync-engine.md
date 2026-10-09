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

Returns a `SyncEngine`. The engine is synchronous: adapter, backend and filter errors
propagate to the caller of the operation that triggered them, which is whoever calls `flush`
for an apply deferred by `schedule`. There is no engine-level `onError` option or retry
mechanism.

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
}

type SeedStrategy = "if-empty" | "never";
```

| Option     | Default             | Behavior                                                                                                             |
| ---------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `filter`   | `defaultSyncFilter` | Selects top-level keys independently in the store and backend, in both directions. Excluded keys stay local.         |
| `seed`     | `"if-empty"`        | On connection, writes synced keys that exist only in the store into the backend. `"never"` skips this initial write. |
| `schedule` | none                | Defers remote changes to the `flush` it schedules, then applies them with one read and one `setState`. See below.    |

A custom filter replaces the default. Call `defaultSyncFilter` within it if you also want
to exclude functions. Filtering is top-level; it does not remove nested functions or turn
non-JSON values into JSON. Use plain JSON for the synced data.

Despite its name, `"if-empty"` works per key, even when the backend already holds other
keys. With either strategy, a backend key wins over the corresponding store value, and a
store-only key remains in the store during connection. With `"never"`, the next local
change still writes the store's entire filtered state, including those store-only keys.

### Coalescing remote changes

Without `schedule`, each backend notification is applied to the store at once: a provider that
applies 50 queued updates as 50 transactions makes the engine read the backend, diff it and
call `setState` 50 times. With `schedule`, the first notification hands it a `flush` and later
ones wait for it, so the whole burst is applied with one read and one `setState`:

```ts
createSyncEngine(backend, adapter, {
  schedule: (flush) => queueMicrotask(flush),
});
```

`queueMicrotask` coalesces what arrives in one task; `requestAnimationFrame` applies at most
once per frame. Until the flush, `getState()` does not show the pending remote changes, so
code that reads the store right after a remote update must wait for it.

Local changes are still written synchronously. One made while an apply is pending runs that
apply first, so its write does not revert the remote changes. The remote changes win: the
apply replaces the store's synced state, so what the local change did to synced keys is lost,
and only its changes to keys the filter excludes stay. With `queueMicrotask`, that affects
only code that changes the store in the same task as a remote update; a longer delay, such as
`requestAnimationFrame`, lets user input fall in the window too. `disconnect()` also runs a
pending apply, so the store keeps what the backend held while connected, and a flush called
after it does nothing.

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
reading its document; see [CrdtBackend](#crdtbackend). Each backend notification, or each
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
| `getState()`          | Returns the current store state.                                                                                       |
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
  subscribe: (onRemoteChange: () => void) => Unsubscribe;
}
```

| Member                   | Contract                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read()`                 | Returns a plain JSON snapshot that does not alias mutable backend internals. For the sync engine, expose the synced top-level state as an object.                |
| `write(next, previous?)` | Makes the synced subtree equal to `next` in one atomic transaction. The backend chooses how to turn that snapshot into CRDT operations.                          |
| `subscribe(callback)`    | Reports changes outside this backend's own `write`, including imports from peers and local edits made directly on the document. Returns an unsubscribe function. |

`previous`, when given, is what the synced subtree holds now, as `JSON.stringify` would store
it. The engine passes the synced state it last wrote, or the whole state it last read after a
remote change, local keys included, so the next write still removes those keys from the
backend as before. A backend can diff `next` against it, with `getChanges` and `json: true`,
instead of reading its document; unchanged subtrees of `next` are then the same objects and
compare by identity. Like `next`, it may hold `undefined` and functions where the
subtree holds nothing, which `json: true` treats as absent. The engine passes nothing for the
seed write during `connect()` and after a write that threw. A backend may ignore `previous`.
The engine keeps it exact only when `subscribe` reports every other change synchronously, so a
backend must read its document while a change may still be unreported: the Yjs backend does
inside another transaction, and the Loro backend while other code has uncommitted edits.

Although `read()` has return type `unknown`, the engine treats a `null` or non-object
result as an empty state. Objects in the snapshot must inherit from `Object.prototype`: a
library that builds them by assignment turns a peer's `__proto__` entry into the prototype,
which the Yjs and Loro backends undo before returning. Keep document replication in your CRDT
provider. For writing a backend that applies small edits, see
[Diff and apply API](./diffing.md).

## Unsubscribe

```ts
type Unsubscribe = () => void;
```

The cleanup function returned by a subscription. The engine calls it on disconnect.

Source: [sync-engine.ts](../src/sync-engine.ts) and [types.ts](../src/types.ts).
