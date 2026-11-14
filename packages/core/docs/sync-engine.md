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
  options: SyncEngineOptions<S>,
): SyncEngine;

type SyncEngineOptions<S extends object = JsonObject> = SyncEngineConfig<S> & {
  backend: CrdtBackend;
  adapter: StoreAdapter<S>;
};
```

Creates a disconnected engine. Call `connect()` to reconcile the current state and start
watching both sides. Creation alone does not read, write or subscribe to either side.

| Option    | Required | Description                                                        |
| --------- | -------- | ------------------------------------------------------------------ |
| `backend` | Yes      | The replicated state, exposed through `CrdtBackend`.               |
| `adapter` | Yes      | The application store, exposed through `StoreAdapter<S>`.          |
| Others    | No       | The [`SyncEngineConfig`](#syncengineconfig) options, typed by `S`. |

Returns a `SyncEngine`. The engine is synchronous, except for the writes of an adapter that sets
`batchWrites` (see [Batched writes](#batched-writes)), and does not
retry. `connect()` throws what it runs into. Once connected, adapter and backend errors go to
`onError` when it is given; otherwise they, like filter errors, propagate to the caller of the
operation that triggered them, which is whoever calls `flush` for an apply deferred by `schedule`,
and the microtask for a batched write.
See [Reporting errors](#reporting-errors).

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
const engine = createSyncEngine({
  backend,
  adapter: createZustandAdapter(store),
  omit: ["draft"],
  seed: true,
});

engine.connect();
console.log(store.getState().count); // 7: the existing backend value wins

store.setState({ count: 8 });
console.log(backend.read()); // { count: 8 }

backend.receive({ count: 9 });
console.log(store.getState()); // { count: 9, draft: "Only on this device" }

engine.disconnect();
console.log(engine.getStatus().connected); // false
```

## SyncEngineConfig

```ts
type SyncEngineConfig<S extends object = JsonObject> = {
  filter?: (key: keyof S & string, value: S[keyof S]) => boolean;
  seed?: boolean;
  schedule?: (flush: () => void) => void;
  onError?: (error: unknown, source: SyncErrorSource) => void;
} & (
  | { keys: readonly (keyof S & string)[]; omit?: never }
  | { keys?: never; omit?: readonly (keyof S & string)[] }
);

type SyncErrorSource = "store" | "backend";
```

| Option     | Default             | Behavior                                                                                                           |
| ---------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `omit`     | none                | Top-level keys to keep local, by name. Every other key `filter` keeps is synced.                                   |
| `keys`     | none                | The only top-level keys to sync, by name, if `filter` keeps them. Give `keys` or `omit`, not both.                 |
| `filter`   | `defaultSyncFilter` | Selects top-level keys by value, judging the store's and the backend's. Excluded keys stay local.                  |
| `seed`     | `true`              | On connection, writes each synced key the backend lacks from the store's value, in one write. `false` writes none. |
| `schedule` | none                | Defers remote changes to the `flush` it schedules, then applies them with one read and one `setState`. See below.  |
| `onError`  | none                | Receives what the adapter or backend throws once connected, with its source, instead of the notifier. See below.   |

`createSyncEngine` takes `S` from the adapter, so `keys` and `omit` accept only the state's key
names, and a typo fails to compile. Readonly lists work too, such as an `as const` constant
shared with other code. Without `S`, as `SyncEngineConfig`, a key is any string.

`omit` is the usual way to keep a key such as a draft or a search term on one device:

```ts
createSyncEngine({ backend, adapter, omit: ["draft", "searchTerm"] });
```

`keys` lists the synced keys instead. A key the backend holds that it does not list is ignored,
as if it were a local key, and stays in the backend as it is, while under `omit` a backend key the
state's type does not declare is synced like any other.

A key is synced when `filter` keeps it and, by name, `keys` lists it or `omit` does not name
it, so `filter` still runs with either: a function under a key `keys` lists stays local by
default. A custom filter replaces the default, and `keys` or `omit` narrow what it keeps. Call
`defaultSyncFilter` within it if you also want to exclude functions. Its parameters are typed
by `S`, but it is also called with keys the backend holds that `S` does not declare; type its
`key` as `string` to compare it with such a key. Filtering is top-level; it does not remove
nested functions or turn non-JSON values into JSON. Use plain JSON for the synced data.

`filter` judges the value on each side. The store's value decides what this peer writes. A
backend value is read into the store only when `filter` keeps it and, if the store holds the key,
the store's value too:

| The store holds          | The backend holds        | The store gets         | This peer writes                         |
| ------------------------ | ------------------------ | ---------------------- | ---------------------------------------- |
| a value `filter` rejects | any value                | nothing, keeps its own | nothing, the backend's value stays       |
| a value `filter` keeps   | a value `filter` keeps   | the backend's value    | its value, on its next write             |
| a value `filter` keeps   | a value `filter` rejects | nothing, keeps its own | its value, on its next write or the seed |
| no value, or `undefined` | a value `filter` keeps   | the backend's value    | nothing                                  |
| no value, or `undefined` | a value `filter` rejects | nothing                | nothing, the backend's value stays       |

So a value an older or buggy peer writes under the key of an action never replaces the action.
A store that gives a synced key a value `filter` rejects still deletes the key from the room
with its next write; see [Keys this peer does not sync](#keys-this-peer-does-not-sync). `keys`
and `omit` judge a key by name, the same on both sides.

Seeding works per key, even when the backend already holds other keys. With either value, a
backend key wins over the corresponding store value, and a store-only key remains in the store
during connection. With `seed: false`, the next local change still writes the store's entire
filtered state, including those store-only keys. To keep a joining peer from seeding defaults
over a room, connect once the document holds the room; see
[Waiting for the room](#waiting-for-the-room).

### Keys this peer does not sync

A peer deletes a key from the room only when its store removes a key it syncs: the store drops
it, or gives it a value `filter` rejects, such as a function. Every other key the room holds stays
as it is, through connecting, remote changes and local changes:

- a key `keys` does not list, `omit` names or `filter` excludes;
- a key the store cannot hold, such as a field a MobX class or an MST model does not declare, or
  an atom a Jotai record does not list. The engine hands it to `setState`, the store leaves it
  out, and as the store never held it, the engine does not take that as a removal.

So peers on different versions of an app can share a room: a client still on the old version
keeps the fields a newer one adds, and peers can `omit` or list different keys of one document. The
cost is that a key no peer syncs any more stays in the room until a peer whose store holds it
removes it. Deleting another peer's data is worse than keeping a stale key.

A store that takes any key holds a newer peer's key once a remote change brings it. If it then
drops the key, that is a removal like any other, written with the next local change. Redux's
`combineReducers` does this on the next action; pass `keys` with the reducer's slices to keep such
a key out of the store and in the room. See
[Redux](../../store-redux/docs/introduction.md#keys-the-reducer-does-not-know).

### Coalescing remote changes

Without `schedule`, each backend notification is applied to the store at once, so a provider
that applies 50 queued updates as 50 transactions causes 50 reads and 50 `setState` calls.
With `schedule`, the first notification hands it a `flush` and later ones wait for it, so the
whole burst is applied with one read and one `setState`:

```ts
createSyncEngine({
  backend,
  adapter,
  schedule: (flush) => queueMicrotask(flush),
});
```

`queueMicrotask` coalesces what arrives in one task; `requestAnimationFrame` applies at most
once per frame. Until the flush, `getState()` does not show the pending remote changes.

Local changes are still written synchronously. One made while an apply is pending runs that
apply first, merged with the local change, and writes the result, so the write neither reverts
the remote changes nor loses the local one. With `queueMicrotask` that only happens for code
that changes the store in the same task as a remote update; a longer delay, such as
`requestAnimationFrame`, lets user input fall in the window too. A remote change another
listener hears of before the engine is applied the same way, with or without `schedule`; see
[SyncEngine](#syncengine). `disconnect()` also runs a pending apply, and a flush called after
it does nothing.

A local change waiting for a [batched write](#batched-writes) is merged into a remote apply in the
same way.

The merge compares the store's synced state and the backend's with what the backend held
before the pending changes, which both last agreed on, and keeps each side's changes from it:

| What changed                                                     | Result                                                                                                                                |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Different keys of a record                                       | Both. Records merge key by key, at any depth.                                                                                         |
| Different items of an array                                      | Both. Items match by value, or by a unique entry such as an `id`, so a local edit lands on its item after remote inserts and deletes. |
| Items inserted at the same place on both sides                   | Both, the remote ones first.                                                                                                          |
| The same value, changed differently on both sides                | The local value, as its write would. A string is one value, replaced whole and never merged as text.                                  |
| A record or array the store changed inside, which remote deleted | Deleted, as a CRDT loses an edit inside a deleted container. A value the store replaced whole, such as a string, is kept instead.     |
| A value the store deleted                                        | Deleted, also where the remote side changed it.                                                                                       |

The merge is [`mergeConcurrent`](./diffing.md#mergeconcurrent), without a text policy.
[Matching array items](./diffing.md#matching-array-items) says how it matches the items of a list
the remote change both moved and changed, and where it falls back to their positions.

Keys the filter keeps local take no part: the merge reads no backend value into them. A key whose
backend value the filter rejects keeps the store's value, as on every apply. The merged state
goes through `setState`, and what the store holds afterwards is written once, as a local change,
with the backend's state as `previous`; the event it sends is `"remote"`, as for every local
change that runs a pending apply. After a backend read or write threw, the engine no longer knows
what the backend held, so it cannot tell which side changed what: the pending changes then
replace what the local change did to synced keys, rather than the write reverting them for every
peer.

### Batched writes

A store adapter that sets `batchWrites`, such as the Valtio adapter, notifies once per
property set, so one array method like `splice`, `unshift`, `shift`, `sort` or `reverse` notifies
once per item it shifts, with an intermediate state each time. Written one by one, those states
make each shifted item look replaced, so a peer's concurrent edit lands on the wrong item and its
concurrent insert duplicates items. For such an adapter the engine batches local changes:

- The first notification queues one write with `queueMicrotask`, and later ones add nothing
  until it runs. It writes the store's synced state as it is then, and sends one `"local"`.
- A remote change applied while the write waits is merged with the waiting local change, as a
  local change is merged into a pending apply (see
  [Coalescing remote changes](#coalescing-remote-changes)), and the merged state is written at
  once, in place of the queued write. A local change that runs a pending apply when its write
  runs merges the same way.
- Echoes of `setState` write nothing, since the adapter still notifies synchronously.
- `disconnect()` writes a waiting local change, merged with a pending apply, before it removes
  the subscriptions, since on the next `connect()` the backend would win for every key it holds.
  If that write throws, the error goes to `onError`, or without it to the caller of
  `disconnect()`, and the engine is disconnected all the same.
- A write queued before `disconnect()` does nothing when it runs, also after a reconnect.
- A queued write that throws goes to `onError`. Without `onError` it is thrown from the
  microtask, where nothing catches it: the browser logs it as an uncaught error, and Node exits
  unless the process handles `uncaughtException`. Pass `onError` with such an adapter.

So a local change reaches the backend a microtask after the store changed. Code and tests that
read the backend right after changing the store wait for it first, such as with
`await Promise.resolve()`. Adapters without the flag are written synchronously.

An adapter that wraps one that sets `batchWrites` must keep the flag, as
[`scopeAdapter`](#scopeadapter) does:

```ts
const wrapped: StoreAdapter<State> = {
  getState: () => adapter.getState(),
  setState: (state) => adapter.setState(state),
  subscribe: (onStoreChange) => adapter.subscribe(onStoreChange),
  batchWrites: adapter.batchWrites,
};
```

Without it, the engine writes every intermediate state again, as if the store were not batched.

### Waiting for the room

A provider delivers the room's state some time after it starts, so a new document starts empty,
and an engine connected then seeds it. Those writes compete with the room's. Each CRDT library
keeps one value per key, so a peer joining a populated room can replace its state on every peer,
depending on replica IDs. `seed: false` does not prevent it: the next local change writes the
whole synced state.

Connect the engine once the document holds what this peer should adopt:

```ts
const engine = createSyncEngine({ backend, adapter });
await Promise.all([persistence.whenLoaded, synced(provider)]);
engine.connect();
```

With a setup helper, pass [`connect: "manual"`](#setupoptions) and call `connect()` on the engine
it exposes, such as Zustand's `store.homeostate`, in the same way. Until then the engine reads and
writes neither side: the store shows its own state, not the room's, and nothing is written.
`connect()` then reconciles as usual: a key the backend holds wins, and a key only the store holds
stays and is seeded. So with `connect()` called after the room's state reached the document, a
joining peer keeps the room whichever replica ID is higher. Two peers starting an empty room seed
concurrently and end with one consistent state. What each keeps of the other's values depends on
the library; see [How backends differ](#how-backends-differ).

Local changes made before `connect()` are provisional. A key the backend holds keeps the
backend's value, so the change is dropped. A key it lacks is seeded with the rest, or with
`seed: false` written with the first local change after `connect()`. To keep users from losing
edits, disable editing until [`getStatus().connected`](#sync-status) is `true`.

To start offline, race the wait against a timeout:

```ts
const timeout = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

await Promise.race([synced(provider), timeout(3000)]);
engine.connect();
```

A timeout trades safety for an offline start. The engine seeds when it expires and works
locally, and if the room's state arrives later, its values compete with what this peer wrote, as
they do when the engine connects at once. Not connecting means the opposite: the engine writes
nothing, as in [Checking what was restored](/docs/persistence#checking-what-was-restored).

On a reconnect, `connect()` reconciles with what the document holds then, which may be out of
date if the provider was disconnected too. Wait for the provider again before calling it.

#### What a provider's sync tells

The wait means only what its promise means. For y-websocket, resolve it from the provider's
`sync` event and `synced` flag, checking both: `sync` does not fire again for a provider that has
synced, so a promise waiting for it would hang on a reconnect, and it fires with `false` when the
provider disconnects, which must not resolve it:

```ts
const synced = (provider: WebsocketProvider) =>
  new Promise<void>((resolve) => {
    if (provider.synced) {
      resolve();
      return;
    }
    const onSync = (isSynced: boolean) => {
      if (!isSynced) return;
      provider.off("sync", onSync);
      resolve();
    };
    provider.on("sync", onSync);
  });
```

A provider's sync says its own document holds the room's state. If something relays between that
document and the one the backend reads, as the devtools
[network link](../../tool-devtools/docs/introduction.md#network-conditions) does with latency, the
promise can resolve before the state arrives. The engine then seeds, and its values compete
with the room's as they do when the engine connects at once.

#### How backends differ

All three backends take the same steps, and peers end up with one consistent state. How two
concurrent writes merge is up to the library, so waiting does not make these outcomes equal:

- Which value of a key survives depends on the library. Do not rely on either peer's.
- In a document that does not hold the synced map yet, Automerge creates it, and two peers that
  each do so keep one map whole. The other peer's keys are lost, even those no other peer wrote,
  so a peer whose timeout expires can remove keys only the room held. Yjs and Loro merge the two
  per key, and a document that already holds the map merges per key on all three.

### Reporting errors

Once the engine is connected, it calls the adapter and the backend from their notifications,
from the `flush`, from the microtask of a [batched write](#batched-writes) and from
`disconnect()`. Without `onError`, what they throw propagates there: a store validation error in
`setState` reaches the provider's message handler, and a failed `write` reaches the code that
changed the store, or the runtime as an uncaught error for a batched write. The engine stays connected either way, and the
store and backend differ until the next change succeeds.

With `onError`, the engine catches those errors and reports them with their source, so neither
side's notifier sees them:

```ts
createSyncEngine({
  backend,
  adapter,
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
writing back paths the store keeps changing while remote changes are applied: once 6 applies in a
row find another peer's value at a path the store changed, and the store changes it again. See
[Store adapters](/docs/concepts#store-adapters) for what counts and what starts the count again.
Its `keys` names the top-level keys holding the stopped paths, and its message lists the paths,
each as an array of record keys, such as `["seenBy","p2"]`. Each set of top-level keys is reported
once, in every build. Without `onError`, the engine warns once in development instead. A stopped
path is written back again, without a local change, once an apply no longer contradicts it.

However an error is reported, the engine sends an [`"error"`](#when-error-is-sent) sync event,
and [`getStatus()`](#sync-status) keeps it until the engine recovers.

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
store, or what builds it, then these options, flat, with its own added. They are the engine's
[options](#createsyncengine) with `connect` in place of `adapter`, which the helper creates.

| Option    | Default  | Behavior                                                                                                                                                                            |
| --------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend` |          | The CRDT backend the store syncs with.                                                                                                                                              |
| `connect` | `"auto"` | `"auto"` connects once the store is ready. `"manual"` leaves `connect()` to the app, and until then neither side is touched, such as to [wait for the room](#waiting-for-the-room). |

The other options are the engine's `SyncEngineConfig`, typed by the store's state like the
engine's, so a helper checks `keys` and `omit` against it. The Jotai
[`atomWithSync`](../../store-jotai/docs/introduction.md) takes them without `connect`: it connects
when it is mounted.

## SyncEngine

```ts
interface SyncEngine {
  connect: () => void;
  disconnect: () => void;
  getStatus: () => SyncStatus;
  getSyncedState: () => Record<string, unknown>;
  subscribe: (listener: (event: SyncEvent) => void) => Unsubscribe;
}

type SyncEvent = "local" | "remote" | "connect" | "disconnect" | "error";

interface SyncStatus {
  readonly connected: boolean;
  readonly failure: SyncFailure | null;
}

interface SyncFailure {
  readonly error: unknown;
  readonly source?: SyncErrorSource;
}
```

| Method                | Returns                   | Behavior                                                                                                                                                                                                                                    |
| --------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`           | `void`                    | Reconciles current state per key, then subscribes to backend and store changes. Calling it again while connected does nothing.                                                                                                              |
| `disconnect()`        | `void`                    | Applies a pending remote change and writes a [batched write](#batched-writes) still waiting, then removes both subscriptions. Calling it while disconnected does nothing. It does not destroy the store, document, provider or persistence. |
| `getStatus()`         | `SyncStatus`              | The engine's status, with what went wrong. It says nothing about the network. See [Sync status](#sync-status).                                                                                                                              |
| `getSyncedState()`    | `Record<string, unknown>` | The store's synced keys with the values the store holds, connected or not. See [Synced state](#synced-state).                                                                                                                               |
| `subscribe(listener)` | `Unsubscribe`             | Calls `listener` after every sync event until unsubscribed, across reconnects. See [Sync events](#sync-events).                                                                                                                             |

After connection, each local notification writes the full filtered store state to the
backend, a microtask later for an adapter that sets `batchWrites`, along with what the backend
holds, so the backend can diff against it instead of reading its document; see [CrdtBackend](#crdtbackend). A notification that changes no synced
key, such as one for a local key, writes nothing: every synced value is still the one the engine
last wrote or read, by identity. If the backend holds a remote change
the store has not been given yet, the engine applies it first, merged with the local change, as
it applies a pending one; see [Coalescing remote changes](#coalescing-remote-changes). That
happens when a listener subscribed
to the document before `connect()` changes the store as it hears of a remote change, before the
engine does. Each backend notification, or each
flush with `schedule`, applies the backend's full synced state to the store, as `filter` judges
it on both sides, including deletions. Unchanged subtrees keep their identity. Store
notifications raised synchronously while the engine applies remote state are ignored to avoid
echoing that state back.

Reconnecting runs reconciliation again: backend values replace disconnected local edits
for matching keys. For offline editing, leave the engine connected and disconnect the
network provider instead. See [Connecting](/docs/concepts#connecting).

### Sync events

`subscribe` reports what the engine has just handled, so a tool such as the devtools can tell a
remote change from a local one and show the connection as it changes, without guessing from
timing or polling `getStatus()`:

```ts
const unsubscribe = engine.subscribe((event) => {
  if (event === "connect" || event === "disconnect")
    showStatus(engine.getStatus().connected);
  if (event === "remote") markRemote();
});
```

| Event          | Sent                                                                           | Once per                                                                                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"local"`      | after the write to the backend, if any                                         | store notification handled while connected, even one that changed only local keys and wrote nothing, or [batched write](#batched-writes). An echo raised while a remote change is applied sends none. |
| `"remote"`     | after `setState` and the write of the keys the store changed meanwhile         | apply, so once per flush with `schedule`, even when the store is unchanged. A local change that first runs a pending apply sends `"remote"`, not `"local"`.                                           |
| `"connect"`    | after reconciliation and both subscriptions; `getStatus().connected` is `true` | `connect()` that connects. It covers seeding and the values adopted from the backend, which send no `"local"` or `"remote"` of their own.                                                             |
| `"disconnect"` | after both subscriptions are removed; `getStatus().connected` is `false`       | `disconnect()` that disconnects. A pending apply or batched write it runs sends its `"remote"` or `"local"` first; if that throws, `"disconnect"` is still sent, since the engine is disconnected.    |
| `"error"`      | once a failure is recorded; `getStatus().failure` holds it                     | failure; see [When `"error"` is sent](#when-error-is-sent).                                                                                                                                           |

Events are sent synchronously, once the work is done. Work that throws sends only `"error"`,
whether the error goes to `onError` or to the caller, and a `connect()` or `disconnect()` that
changes nothing sends nothing. Listeners run inside a store's or a document's notification loop, and some,
such as Zustand's, stop at the first throw, so each listener runs on its own: what it throws goes
to `console.error`, and the other listeners and the store's subscribers still run. A listener
unsubscribed by an earlier one during the same event is not called.

#### When `"error"` is sent

`"error"` tells of a failure as soon as the status holds it, so a listener can read
`getStatus().failure`:

| Failure                                                                          | Events                                                                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Work that throws: a write, read or `setState`, `connect()`, `filter`, `schedule` | `"error"` alone, before `onError` runs or the error propagates                                                   |
| A pending apply or batched write that throws in `disconnect()`                   | `"error"`, then `"disconnect"`                                                                                   |
| A [write loop](#reporting-errors)                                                | The `"remote"` of the apply that stopped it, then `"error"`; `onError` hears of the loop first, during the apply |

A write loop lets the apply finish first, and its `"remote"` already shows the failure, so the
status changes once. `"error"` then names the failure for a listener that switches on the event.
A write loop sends it again only once the loop has cleared and come back.

### Sync status

`getStatus()` says what the engine has done, and every change of it comes with a
[sync event](#sync-events), so a component can disable editing until the engine connects or show
that a change did not sync. For React, use [`useSyncStatus`](../../react/docs/introduction.md).

```ts
const unsubscribe = engine.subscribe(() => {
  const { connected, failure } = engine.getStatus();
  saveButton.disabled = !connected;
  if (failure) report(failure.error, failure.source);
});
```

> [!WARNING]
> The status describes the engine and says nothing about the network. `connected` means the engine
> is done reconciling and subscribed to the store and the backend, and it stays `true` while the
> provider is offline or the sync server is down. Read the provider's own state to show whether a
> peer is online.

| Field       | Value                                                                                                                                      |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `connected` | Whether the engine is done reconciling and subscribed to the store and the backend, so that local changes are written. `false` until then. |
| `failure`   | What went wrong and what it came from, or `null`. `error` may be anything the store or backend threw, even `undefined`, so test `failure`. |

`getStatus()` is current whenever it is read, also from a store subscriber or a listener during
reconciliation. It returns a frozen object, the same one until a field changes, so comparing by
identity tells whether it changed: `useSyncExternalStore` needs that. A sync event listener
already reads the new status, and local and remote changes leave the object as it was, so a
listener that compares it does nothing for them.

#### What sets and clears a failure

The engine keeps a failure with or without `onError`, which works as it did: `onError` is still
called, or the error still propagates. Each failure sends an [`"error"`](#when-error-is-sent)
event, and a component mounted later can still read it.

| Failure                                                                          | Status while it stands        | Cleared by                                                          |
| -------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------- |
| A failed write, or a failed read or `setState`, while syncing                    | Connected                     | The next `"local"` or `"remote"` event                              |
| `connect()` throws                                                               | Disconnected                  | The next `connect()` that connects                                  |
| A pending apply fails in `disconnect()`                                          | Connected, then disconnected  | The next `connect()` that connects                                  |
| [`WriteLoopError`](#reporting-errors), in every build, with or without `onError` | Connected                     | An apply that stops no path, a written local change, or a reconnect |
| `filter` or `schedule` throws                                                    | Connected, without a `source` | The next `"local"` or `"remote"` event                              |

`disconnect()` keeps a failure, to say why the engine stopped. `onError`
hears of a write loop once per set of top-level keys, but the status shows it each time it comes back.

The status holds only what reaches the engine:

- A provider's errors never do.
- A setup helper that throws before the engine runs, as `syncStateTree` does for a destroyed node,
  records nothing.
- A failure clears only once the engine hears of another change. With MobX-State-Tree and no
  `onError`, a failed write can stop the node's notifications, so the failure stays and later
  changes are not written. Pass `onError` there.

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
  batchWrites?: boolean;
}
```

| Member                | Contract                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `getState()`          | Returns the current store state, as an object.                                                                                                                                                                            |
| `setState(state)`     | Replaces the state with the engine's reconciled state. Called for backend changes and, when needed, during connection.                                                                                                    |
| `subscribe(callback)` | Calls the callback synchronously when the store changes; returns a function that removes that subscription.                                                                                                               |
| `batchWrites`         | `true` for a store that notifies once per property set, so that one change notifies several times. The engine then writes once per microtask, and a wrapping adapter must keep it; see [Batched writes](#batched-writes). |

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

createSyncEngine({
  backend: createYjsBackend(doc, "editor"),
  adapter: scopeAdapter(adapter, {
    get: (state) => state.shared.editor,
    set: (state, editor) => ({
      ...state,
      shared: { ...state.shared, editor },
    }),
  }),
}).connect();

createSyncEngine({
  backend: createYjsBackend(doc, "comments"),
  adapter: scopeAdapter(adapter, {
    get: (state) => state.shared.comments,
    set: (state, comments) => ({
      ...state,
      shared: { ...state.shared, comments },
    }),
  }),
}).connect();
```

For a top-level key synced to one room, `keys` or `omit` is enough. A store change outside the
synced keys makes the engine call no `backend.write`, though it still sends `'local'`.
`scopeAdapter` skips both.

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
adapter whose `getState` returns a fresh copy, such as the MobX adapter's. The scoped adapter
keeps the adapter's `batchWrites`, so a Valtio slice is written once per microtask too; see
[Batched writes](#batched-writes).

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
On one subtree, each slice's engine hands it the keys the other slice writes.

A key the room holds reaches the slice even if `T` does not declare it, and stays in the room as
long as the slice keeps it. Under `keys`, it is ignored and stays in the room. A `set` that drops
it leaves it in the room too, as the slice never held it; a key the slice held and drops is
removed. See [Keys this peer does not sync](#keys-this-peer-does-not-sync).

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
  revision: () => unknown;
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
| `revision()`             | A value equal (`===`) to an earlier one only if the synced subtree has not changed since, reported or not; `undefined` while it cannot tell.                     |
| `subscribe(callback)`    | Reports changes outside this backend's own `write`, including imports from peers and local edits made directly on the document. Returns an unsubscribe function. |

`previous`, when given, is what the synced subtree holds now: the whole state the engine last
wrote or read. `next` is the whole subtree too: the store's synced keys, and every other key as
the backend holds it, so that a write deletes only the keys the store removed. A backend can diff `next`
against it with `applyChanges` and `json: true` instead of reading its document, as one built
with [`createCrdtBackend`](#createcrdtbackend) does; unchanged subtrees of `next` are then the
same objects and compare by identity. Like `next`, it may
hold `undefined` and functions, which `json: true` treats as absent. The engine passes nothing
for the seed write during reconciliation, after a write that threw, and for a write back after
`setState` during which the revision moved, or when it cannot tell. A backend may ignore
`previous`.

A document can change before `subscribe` reports it: another listener may hear of a remote
change first, and some libraries report changes only once a transaction ends or is committed.
So before writing a local change, the engine checks that the backend still holds what it last
synced. It reads the backend unless `revision()` returns the revision it recorded then, and
applies what it finds first if that differs; see [SyncEngine](#syncengine). A backend whose
`revision()` always returns `undefined` is read before every local change. A revision may
change without the subtree changing, which costs only that read: the Yjs backend counts the
document's transactions, the Loro backend its ops, and the Automerge backend uses the
document's heads.

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
function createCrdtBackend(parts: CrdtBackendParts): CrdtBackend;

interface CrdtBackendParts {
  read: () => JsonObject;
  transact: (
    edit: (root: object, ops: ApplyOps, created?: boolean) => void,
  ) => void;
  watch: (onChange: (own: boolean) => void) => Unsubscribe;
  revision: () => unknown;
  text?: TextPolicy;
}
```

Builds a `CrdtBackend` for a CRDT library from the parts that differ by library. It imports no
CRDT library.

| Part       | Supplies                                                                                                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `read`     | The backend's `read`: the synced subtree as a JSON snapshot that never aliases the document.                                                                                                                                   |
| `transact` | Runs `edit` as one transaction tagged as this backend's own, with the synced root and the `ApplyOps` that write into it. When the document holds no map there, it puts an empty one in its place and passes `created` as true. |
| `watch`    | Calls `onChange` after every change to the synced subtree, with `own` set when the change carries the tag `transact` gives. Returns the cleanup.                                                                               |
| `revision` | The backend's `revision`, as it is; it returns `undefined` when the library cannot tell. See [CrdtBackend](#crdtbackend).                                                                                                      |
| `text`     | Optional. Which strings the library stores as its text type, by path from the synced root; by default none. Build the library's [`ApplyOps`](./diffing.md) from the same policy.                                               |

The backend it returns:

- `write(next, previous)` runs `transact` once and applies `next` with `applyChanges`,
  `json: true` and `text`, diffing against `{}` when `transact` created the root, otherwise
  against `previous` when the engine gives it, and otherwise against `read()`, inside the
  transaction.
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
  const ops = createLoroOps(options?.text);
  return createCrdtBackend({
    read: () => map.toJSON(),
    transact: (edit) => {
      edit(map, ops);
      doc.commit({ origin });
    },
    watch: (onChange) =>
      map.subscribe((event) => onChange(event.origin === origin)),
    revision: () => doc.opCount(),
    text: options?.text,
  });
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
