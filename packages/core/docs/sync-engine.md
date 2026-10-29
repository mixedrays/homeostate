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
  config?: SyncEngineConfig<S>,
): SyncEngine;
```

Creates a disconnected engine. Call `connect()` to reconcile the current state and start
watching both sides. Creation alone does not read, write or subscribe to either side.

| Parameter | Required | Description                                               |
| --------- | -------- | --------------------------------------------------------- |
| `backend` | Yes      | The replicated state, exposed through `CrdtBackend`.      |
| `adapter` | Yes      | The application store, exposed through `StoreAdapter<S>`. |
| `config`  | No       | Sync options, typed by `S`. Defaults to `{}`.             |

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
import { createSyncEngine } from "@homeostate/core";
import { createMemoryBackend } from "@homeostate/core/testing";
import { createZustandAdapter } from "@homeostate/store-zustand";

const store = createStore(() => ({ count: 0, draft: "Only on this device" }));
const backend = createMemoryBackend({ count: 7 });
const engine = createSyncEngine(backend, createZustandAdapter(store), {
  omit: ["draft"],
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
type SyncEngineConfig<S extends object = JsonObject> = {
  filter?: (key: keyof S & string, value: S[keyof S]) => boolean;
  seed?: SeedStrategy;
  schedule?: (flush: () => void) => void;
  onError?: (error: unknown, source: SyncErrorSource) => void;
} & (
  | { keys: readonly (keyof S & string)[]; omit?: never }
  | { keys?: never; omit?: readonly (keyof S & string)[] }
);

type SeedStrategy = "if-empty" | "never";
type SyncErrorSource = "store" | "backend";
```

| Option     | Default             | Behavior                                                                                                             |
| ---------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `omit`     | none                | Top-level keys to keep local, by name. Every other key `filter` keeps is synced.                                     |
| `keys`     | none                | The only top-level keys to sync, by name, if `filter` keeps them. Give `keys` or `omit`, not both.                   |
| `filter`   | `defaultSyncFilter` | Selects top-level keys independently in the store and backend, in both directions. Excluded keys stay local.         |
| `seed`     | `"if-empty"`        | On connection, writes synced keys that exist only in the store into the backend. `"never"` skips this initial write. |
| `schedule` | none                | Defers remote changes to the `flush` it schedules, then applies them with one read and one `setState`. See below.    |
| `onError`  | none                | Receives what the adapter or backend throws once connected, with its source, instead of the notifier. See below.     |

`createSyncEngine` takes `S` from the adapter, so `keys` and `omit` accept only the state's key
names, and a typo fails to compile. Readonly lists work too, such as an `as const` constant
shared with other code. Without `S`, as `SyncEngineConfig`, a key is any string.

`omit` is the usual way to keep a key such as a draft or a search term on one device:

```ts
createSyncEngine(backend, adapter, { omit: ["draft", "searchTerm"] });
```

`keys` lists the synced keys instead. A key the backend holds that it does not list is ignored,
as if it were a local key, while under `omit` a backend key the state's type does not declare is
synced like any other.

A key is synced when `filter` keeps it and, by name, `keys` lists it or `omit` does not name
it, so `filter` still runs with either: a function under a key `keys` lists stays local by
default. A custom filter replaces the default, and `keys` or `omit` narrow what it keeps. Call
`defaultSyncFilter` within it if you also want to exclude functions. Its parameters are typed
by `S`, but it is also called with keys the backend holds that `S` does not declare; type its
`key` as `string` to compare it with such a key. Filtering is top-level; it does not remove
nested functions or turn non-JSON values into JSON. Use plain JSON for the synced data.

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

## SetupOptions

```ts
type SetupOptions<S extends object = JsonObject> = SyncEngineConfig<S> & {
  backend: CrdtBackend;
  connect?: "auto" | "manual";
};
```

The options shared by every setup helper: the one call in a store adapter package that creates
the adapter and the engine for one store, such as the
[Zustand `homeostate` middleware](../../store-zustand/docs/introduction.md). A helper takes the
store, or what builds it, then these options, flat, with its own added.

| Option    | Default  | Behavior                                                                                                                     |
| --------- | -------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `backend` |          | The CRDT backend the store syncs with.                                                                                       |
| `connect` | `"auto"` | `"auto"` connects once the store is ready. `"manual"` leaves `connect()` to the app, and until then neither side is touched. |

The other options are the engine's `SyncEngineConfig`, typed by the store's state like the
engine's, so a helper checks `keys` and `omit` against it.

## SyncEngine

```ts
interface SyncEngine {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
  getSyncedState: () => Record<string, unknown>;
  subscribe: (listener: (event: SyncEvent) => void) => Unsubscribe;
}

type SyncEvent = "local" | "remote" | "connect" | "disconnect";
```

| Method                | Returns                   | Behavior                                                                                                                                                                        |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`           | `void`                    | Reconciles current state per key, then subscribes to backend and store changes. Calling it again while connected does nothing.                                                  |
| `disconnect()`        | `void`                    | Applies a pending remote change, then removes both subscriptions. Calling it while disconnected does nothing. It does not destroy the store, document, provider or persistence. |
| `isConnected()`       | `boolean`                 | Whether the engine is subscribed. This does not report network connectivity or whether a provider has received the room's state.                                                |
| `getSyncedState()`    | `Record<string, unknown>` | The store's synced keys with the values the store holds, connected or not. See [Synced state](#synced-state).                                                                   |
| `subscribe(listener)` | `Unsubscribe`             | Calls `listener` after every sync event until unsubscribed, across reconnects. See [Sync events](#sync-events).                                                                 |

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

### Sync events

`subscribe` reports what the engine has just handled, so a tool such as the devtools can tell a
remote change from a local one and show the connection as it changes, without guessing from
timing or polling `isConnected()`:

```ts
const unsubscribe = engine.subscribe((event) => {
  if (event === "connect" || event === "disconnect")
    showStatus(engine.isConnected());
  if (event === "remote") markRemote();
});
```

| Event          | Sent                                                                   | Once per                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"local"`      | after the write to the backend                                         | store notification handled while connected, even one that changed only local keys. An echo raised while a remote change is applied sends none.                             |
| `"remote"`     | after `setState` and the write of the keys the store changed meanwhile | apply, so once per flush with `schedule`, even when the store is unchanged. A local change that first runs a pending apply sends `"remote"`, not `"local"`.                |
| `"connect"`    | after reconciliation and both subscriptions; `isConnected()` is `true` | `connect()` that connects. It covers seeding and the values adopted from the backend, which send no `"local"` or `"remote"` of their own.                                  |
| `"disconnect"` | after both subscriptions are removed; `isConnected()` is `false`       | `disconnect()` that disconnects. A pending apply it runs sends its `"remote"` first; if that apply throws, `"disconnect"` is still sent, since the engine is disconnected. |

Events are sent synchronously, once the work is done. Nothing is sent when the work throws,
whether the error goes to `onError` or to the caller, or when `connect()` or `disconnect()`
changes nothing. Listeners run inside a store's or a document's notification loop, and some,
such as Zustand's, stop at the first throw, so each listener runs on its own: what it throws goes
to `console.error`, and the other listeners and the store's subscribers still run. A listener
unsubscribed by an earlier one during the same event is not called.

### Synced state

`getSyncedState()` returns what the engine would write to the backend now: a new object holding
the store's keys that `filter`, `keys` and `omit` keep, without `__proto__`. It works while
disconnected. Its values are the store's own, by identity, and are not turned into JSON, so a
`Date` stays a `Date`; use it to tell the store's synced keys from its local keys, or compare it with the
backend's state after `JSON.parse(JSON.stringify(...))`. Like `connect()`, it throws a
`TypeError` when `getState()` does not return an object.

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
type JsonObject = Record<string, unknown>;
type JsonObjectInput = { [key: string]: any; [Symbol.iterator]?: never };

interface CrdtBackend {
  read: () => JsonObject;
  write: (next: JsonObjectInput, previous?: JsonObjectInput) => void;
  revision?: () => unknown;
  subscribe: (onRemoteChange: () => void) => Unsubscribe;
}
```

The engine only exchanges plain objects with a backend, so `read` returns a `JsonObject` and
`write` receives objects. `JsonObject` keeps its values `unknown`: they are meant to be JSON, but
`next` and `previous` may also hold what `JSON.stringify` leaves out or turns into `null`.

`write` takes a `JsonObjectInput`: any object but an array or another iterable, so state typed
with an `interface` passes as it is, while arrays, `Map`s, `Set`s and primitives fail to compile.
It is assignable to `JsonObject`, so a backend uses `next` as one without a cast. An interface
has no index signature, so `read()` converts to one through `unknown`:
`backend.read() as unknown as State`.

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

`read()` must return an object; the engine still checks, and throws a `TypeError` for anything
else, such as what a peer stored in place of the synced map. Objects in the snapshot may carry
a prototype: a library that builds them by assignment, as Yjs and Loro do in `toJSON`, turns a
peer's `__proto__` entry into the prototype of the object holding it. The engine copies every
object whose prototype is neither `Object.prototype` nor `null` into a plain object of its own
entries, and leaves out own `__proto__` keys, before they reach the store, so a backend needs
no guard of its own. Keep document replication in your CRDT provider. To write small edits
instead of replacing the document, see the [Diff and apply API](./diffing.md).

## Unsubscribe

```ts
type Unsubscribe = () => void;
```

The cleanup function returned by a subscription. The engine calls it on disconnect.

Source: [sync-engine.ts](../src/sync-engine.ts) and [types.ts](../src/types.ts).
