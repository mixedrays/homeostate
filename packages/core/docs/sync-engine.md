---
description: Signatures, options, lifecycle methods and adapter contracts for createSyncEngine, defaultSyncFilter and scopeAdapter.
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
engine's, so a helper checks `keys` and `omit` against it. The Jotai
[`atomWithSync`](../../store-jotai/docs/introduction.md) takes them without `connect`: it connects
when it is mounted.

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

## scopeAdapter

```ts
declare function scopeAdapter<S extends object, T extends JsonObjectInput>(
  adapter: StoreAdapter<S>,
  scope: AdapterScope<S, T>,
): StoreAdapter<T>;

interface AdapterScope<S extends object, T extends JsonObjectInput> {
  get: (state: S) => T;
  set: (state: S, slice: T) => S;
}
```

Turns a store adapter into one for a slice of the store, so that the engine treats the slice as
the store's whole state. It is for a nested slice, which `keys` and `omit` cannot reach because
they work on top-level keys, and for syncing several slices of one store to several rooms, with
one engine and one backend each:

```ts
const adapter = createZustandAdapter(store);

createSyncEngine(
  createYjsBackend(doc, "editor"),
  scopeAdapter(adapter, {
    get: (state) => state.shared.editor,
    set: (state, editor) => ({
      ...state,
      shared: { ...state.shared, editor },
    }),
  }),
).connect();

createSyncEngine(
  createYjsBackend(doc, "comments"),
  scopeAdapter(adapter, {
    get: (state) => state.shared.comments,
    set: (state, comments) => ({
      ...state,
      shared: { ...state.shared, comments },
    }),
  }),
).connect();
```

For a top-level key synced to one room, `keys` or `omit` is enough. A store change outside the
synced keys still makes the engine call `backend.write`, but with the Yjs, Loro and Automerge
backends that call produces no update to the document, since nothing differs. `scopeAdapter`
skips the call as well.

| Member              | Contract                                                                                                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `get(state)`        | Returns the slice as an object that is not an array, as a function of `state` alone. It may build a new object on every call.                                   |
| `set(state, slice)` | Returns the store's next state with `slice` in place of the slice, whole. `slice` lacks any key a peer removed. `state` is what the store holds at that moment. |

The engine's `keys`, `omit` and `filter` apply to the slice's keys, and are typed by the slice,
and `connect()` reconciles and seeds those keys. The backend holds them at the root of its
synced subtree.

A store change reaches the engine only when the slice differs as JSON: by identity first, then
with [`jsonEqual`](./diffing.md#jsonequal). So a change elsewhere in the store causes no
`backend.write` and no `'local'` sync event, also with a `get` that builds a new object and with an
adapter whose `getState` returns a fresh copy, such as the MobX adapter's.

### Array slices

The engine syncs objects, so an array needs a wrapper. A slice typed as an array fails to compile:

```ts
scopeAdapter(adapter, {
  get: (state) => ({ todos: state.todos }),
  set: (state, { todos }) => ({ ...state, todos: todos ?? [] }),
});
```

The fallback is for a peer removing the `todos` key, after which `set` receives an object without
it.

### An absent slice

A slice typed as possibly absent fails to compile. If `get` returns `undefined` or `null` all the
same, `connect()` throws a `TypeError` and leaves the room alone.

If the store removes the slice while connected, the engine writes nothing, so the room keeps its
state. The `TypeError` goes to `onError`, or without it to whoever changed the store, and each
remote change that arrives meanwhile fails the same way and is not applied to the store. When the
slice returns, it is written as a local change, so it overwrites the room, including the remote
changes made meanwhile.

To treat an absent slice as empty, say so in `get`:

```ts
scopeAdapter(adapter, {
  get: (state) => state.doc ?? ({} as Doc),
  set: (state, doc) => ({ ...state, doc }),
});
```

The engine then connects to an absent slice, and creates it through `set` if the room holds keys.
But removing the slice is now a local change to an empty state: it writes `{}` and wipes the room
for every peer.

### A store that changes the slice

What the store normalises or derives in the slice while a remote change is applied is written
back once, as with any adapter, and the store's change to another scoped slice reaches that
slice's engine as a local change.

When `get` returns the same object after `setState` as before it, the engine takes the store to
have ignored the change and writes nothing. That also holds for a reducer that rejects a remote
change by keeping the old slice's object in a new root state: the room holds the rejected value
and the store its old one, and they disagree until the store's next change to the slice. An
unscoped adapter differs here: the root state is a new object, so the engine writes the store's
values back over the room. So does a scoped adapter when the rejection makes a new object for the
slice, as `{ ...state.doc }` does.

### Rooms and keys

Each slice needs a synced subtree of its own, such as a `name` of its own on `createYjsBackend`.
Every write replaces the subtree, so two slices on one subtree overwrite each other.

Every peer sharing a room should sync the same keys, scoped the same way. A peer syncing fewer
keys removes the others from the room with its next local change, and from every peer's store, and
a peer syncing a slice removes the keys of one syncing the whole store on the same subtree.

A key the room holds reaches the slice even if `T` does not declare it, and stays in the room as
long as the slice keeps it. Under `keys`, it is ignored and removed from the room by the next
local change. A `set` that drops it removes it at once, as what the store changed in response.

### Setup helpers

The Zustand and Redux `homeostate` helpers build their own adapter and cannot take a scoped one,
so `scopeAdapter` means creating the adapter and the engine by hand. For Redux, that includes
wrapping the root reducer in `withHomeostate`.

Zustand's `homeostate` also waits for `persist` to hydrate the store, and by hand that wait is the
app's. It matters when hydration is async: connecting first lets the persisted state overwrite
the room when it arrives. With synchronous storage the store is hydrated before `connect()` runs.

```ts
if (store.persist.hasHydrated()) engine.connect();
else store.persist.onFinishHydration(() => engine.connect());
```

Other state managers reach a nested slice without `scopeAdapter`: `atomWithSync` takes a derived
writable atom, `syncMobxStore` a nested observable, `createValtioAdapter` a nested proxy and
`syncStateTree` a subtree. The MobX and Valtio forms are bound to that one object, so sync stops
if the app replaces it, while a scoped adapter reads the slice from the store every time.

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
against it with `applyChanges` and `json: true` instead of reading its document, as one built
with [`createCrdtBackend`](#createcrdtbackend) does; unchanged subtrees of `next` are then the
same objects and compare by identity. Like `next`, it may
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

## createCrdtBackend

```ts
function createCrdtBackend(
  build: (text: TextPolicy) => CrdtBackendParts,
  options?: CrdtBackendOptions,
): CrdtBackend;

interface CrdtBackendParts {
  read: () => JsonObject;
  transact: (
    edit: (root: object, ops: ApplyOps, created?: boolean) => void,
  ) => void;
  watch: (onChange: (own: boolean) => void) => Unsubscribe;
  revision?: () => unknown;
}

interface CrdtBackendOptions {
  text?: TextPolicy;
}
```

Builds a `CrdtBackend` for a CRDT library from the parts that differ by library. It imports no
CRDT library. `build` is called once with the text policy, `options.text` or, by default, one
that marks no string as text, so build the library's [`ApplyOps`](./diffing.md) with it.

| Part       | Supplies                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read`     | The backend's `read`: the synced subtree as a JSON snapshot that never aliases the document.                                                                                                                                   |
| `transact` | Runs `edit` as one transaction tagged as this backend's own, with the synced root and the `ApplyOps` that write into it. When the document holds no map there, it puts an empty one in its place and passes `created` as true. |
| `watch`    | Calls `onChange` after every change to the synced subtree, with `own` set when the change carries the tag `transact` gives. Returns the cleanup.                                                                               |
| `revision` | Optional. The backend's `revision`, as it is; see [CrdtBackend](#crdtbackend).                                                                                                                                                 |

The backend it returns:

- `write(next, previous)` runs `transact` once and applies `next` with `applyChanges` and
  `json: true`, diffing against `{}` when `transact` created the root, otherwise against
  `previous` when the engine gives it, and otherwise against `read()`, inside the transaction.
- `subscribe` reports only the changes `watch` does not call its own.
- `read` and `revision` are the parts' own functions, called directly.

The Loro backend, in short, with `createLoroOps` its `ApplyOps`:

```ts
import { createCrdtBackend, type CrdtBackend } from "@homeostate/core";

export const createLoroBackend = (
  doc: LoroDoc,
  name: string,
  options?: { text?: TextPolicy },
): CrdtBackend => {
  const map = doc.getMap(name);
  const origin = `homeostate:${name}`;
  return createCrdtBackend((text) => {
    const ops = createLoroOps(text);
    return {
      read: () => map.toJSON(),
      transact: (edit) => {
        edit(map, ops);
        doc.commit({ origin });
      },
      watch: (onChange) =>
        map.subscribe((event) => onChange(event.origin === origin)),
      revision: () => doc.opCount(),
    };
  }, options);
};
```

The Yjs, Loro and Automerge backends are built this way. A backend with members of its own, such
as the Yjs backend's `map` and `origin`, spreads the result into its own object.

## Unsubscribe

```ts
type Unsubscribe = () => void;
```

The cleanup function returned by a subscription. The engine calls it on disconnect.

Source: [sync-engine.ts](../src/sync-engine.ts), [crdt-backend.ts](../src/crdt-backend.ts) and
[types.ts](../src/types.ts).
