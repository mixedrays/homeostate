---
description: The sync engine, the StoreAdapter and CrdtBackend contracts, and how connect() reconciles a store with a document.
order: 2
---

# Concepts

Homeostate is one engine and two contracts. The engine,
[`createSyncEngine`](../../../packages/core/docs/sync-engine.md#createsyncengine), sits between
a store and a replicated document and moves plain JSON between them. It knows nothing about
any particular state manager or CRDT library: `store-*` packages implement `StoreAdapter` for
a state manager, and `crdt-*` packages implement `CrdtBackend` for a CRDT library. The
[sync engine reference](../../../packages/core/docs/sync-engine.md) has the complete API.

```ts
import { createSyncEngine } from "@homeostate/core";

const engine = createSyncEngine({ backend, adapter, seed: true });
engine.subscribe((event) => console.log(event)); // "connect", then "disconnect"
engine.connect();
engine.getStatus().connected; // true
engine.disconnect();
```

The engine reports a sync event after each local change it writes, remote change it applies,
connect, disconnect and failure, and `getSyncedState()` returns the store's synced keys; see [Sync events](../../../packages/core/docs/sync-engine.md#sync-events).

`getStatus()` gathers what the engine has done and what went wrong, and every change of it comes
with a sync event; see [Sync status](../../../packages/core/docs/sync-engine.md#sync-status). It
says nothing about the network.

## Store adapters

A `StoreAdapter` reads, replaces and watches the store:

```ts
interface StoreAdapter<S extends object> {
  getState: () => S;
  setState: (state: S) => void;
  subscribe: (onStoreChange: () => void) => Unsubscribe;
  batchWrites?: boolean;
}
```

`setState` is called only for changes that come from the backend. The engine ignores store
notifications raised while it runs, so an adapter needs no echo suppression of its own. What the
store changes meanwhile, such as a key a reducer normalises or a subscriber, reaction or hook
derives, is written to the backend once `setState` returns, in one write. A remote change the
store keeps as it is writes nothing back, and neither does one it ignores: when `getState`
returns the same object as before `setState`, the backend keeps the remote state.

What the store changes while a remote change is applied must not change again when the same
state is applied a second time, and every peer must agree on it. A store that breaks this, such
as one that stamps the time on every `setState`, or two app versions that normalise a key in
contradicting ways, would make the peers re-write each other's changes forever. The engine
stops such a loop after a few round trips: it stops writing back the paths the store keeps
changing against other peers' values, still writes the rest, and reports a `WriteLoopError`. A
concurrent write that wins over a write back is written over again and not reported.
[Write loops](../../../packages/core/docs/sync-engine.md#write-loops) says what counts and what
starts the count again.

Synced state must be plain JSON: objects, arrays, strings, numbers, booleans and `null`.
A top-level function, such as an action, stays local. Other values such as `Date`, `Map` or `Set` are
neither diffed nor synced. The supplied backends store `undefined` and nested functions as
`JSON.stringify` does: object entries holding them are left out, and such array items become
`null`. They store `NaN` and infinite numbers as `null`, as it does too.

Keys sync as own properties, so a key such as `constructor` or `toString` behaves like any
other. A `__proto__` key is never synced: assigning it would replace an object's prototype, so
the engine leaves it out of remote state at any depth, and copies an object a backend read with
another prototype into a plain object of its own entries.

## CRDT backends

A `CrdtBackend` holds the synced part of the state in a CRDT or any other replicated store:

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

- `read` returns a plain JSON snapshot, an object that does not alias the backend's internals.
- `write` makes the backend equal to `next` in one atomic transaction. `next` is any object
  but an array or another iterable, including state typed with an `interface`. The engine passes
  the whole document, with the keys it does not sync as the backend holds them. It also passes
  `previous`, what the backend holds as far as it knows. The supplied backends are built with
  core's `createCrdtBackend`, which diffs the two with `applyChanges`, so a write becomes small
  edits instead of replacing the document.
- `revision` tells the engine whether the document may have changed since it last synced,
  even before `subscribe` reports the change. If it has, the engine applies that change to the
  store before writing a local one, which loses what it did to synced keys. While the backend
  cannot tell, `revision` returns `undefined`, and the engine reads the backend before the local
  change.
- `subscribe` reports changes that did not come through the backend's own `write`: imports
  from peers and local edits made directly on the document.

[`createMemoryBackend()`](../../../packages/core/docs/testing.md#creatememorybackend) from
`@homeostate/core/testing` is a plain JSON backend without replication, meant for tests.

## Strings and text

Concurrent writes to one value keep one of them, whatever the backend. Strings are values by
default too: two peers setting a status to `"active"` and `"completed"` at once end with one
of the two, never a blend of their characters.

For prose such as a title or a note, mark the string as collaborative text with the backend's
`text` option. Text is stored in the library's text type (`Y.Text`, `LoroText` or Automerge
text) and edited character by character, so what two peers type into one title at once merges:

```ts
const isTitle = (path: readonly (string | number)[]) =>
  path.length === 3 && path[0] === "todos" && path[2] === "title";

createSyncEngine({
  backend: createYjsBackend(doc, "shared", { text: isTitle }),
  adapter,
});
```

The path runs from the synced root through record keys and array indices, as in
`["todos", 0, "title"]`. `read()` returns plain strings either way. Give every backend writing
to a document the same policy, seed scripts included.

A document can hold a string as the other kind: written before the policy changed, by a peer
with another policy, or by an earlier release of the backends, which stored every string as
text. It reads as usual and is stored as the configured kind the next time it changes. That
change replaces the string whole, so a concurrent edit to the old one is lost.

## Choosing what to sync

The engine syncs every top-level key of the store's state but its functions. `omit` keeps
the keys it names local, in both directions:

```ts
createSyncEngine({ backend, adapter, omit: ["draft", "searchTerm"] });
```

`keys: ["todos"]` syncs the keys it lists instead, and leaves any other key the backend holds
alone.
Both take only the key names of the adapter's state, so a typo fails to compile. For a rule
that `keys` and `omit` cannot list, `filter` decides by name, with a predicate, on top of them. To sync
a nested slice, or several slices to several rooms, wrap the adapter in
[`scopeAdapter`](../../../packages/core/docs/sync-engine.md#scopeadapter).

Excluded keys are never read from the backend or written to it, so they stay local to each
peer. So does a key the store holds as a function, such as an action, whatever the options say:
a value an older or buggy peer writes under its key never replaces the action.

A peer deletes a key from the backend only when its store removes a key it syncs: a key it
excludes, or one its store cannot hold, such as a field a newer version of the app adds, stays
in the room for the peers that sync it.

## Connecting

`connect()` reconciles the store and the backend per key, over the keys the filter allows:

- A key the backend holds wins over the store's value, so a peer joining a room that already
  has state adopts it instead of overwriting it.
- A synced key the backend does not hold stays in the store. With the default
  `seed: true` those keys are written into the backend in one write. With
  `seed: false` they are left for the next local change.

After that, each local change writes the store's synced keys to the backend and deletes the
synced keys the store removed, and a key removed from the backend is removed from the store.
Every other key the backend holds stays as it is.

A local change is written synchronously, as the store notifies, except for an adapter that sets
`batchWrites`, such as Valtio's, whose store notifies once per property set: one `splice`
notifies once per item it shifts. The engine then writes the changes of one task once, a
microtask later, and merges a remote change that arrives meanwhile with the waiting local change.
`disconnect()` writes a waiting change first. See
[Batched writes](../../../packages/core/docs/sync-engine.md#batched-writes).

A provider delivers the room's state some time after it starts, so a new document may still be
empty on `connect()`, and a key this peer seeds then competes with the room's. Call `connect()`
once the document holds what the peer should adopt, such as after `persistence.whenLoaded` or the
provider's first sync, with `connect: "manual"` on a setup helper; see
[Waiting for the room](../../../packages/core/docs/sync-engine.md#waiting-for-the-room). Until
then the engine reads and writes neither side, and local changes made meanwhile are provisional:
the room wins for every key it holds.

> [!IMPORTANT]
> A reconnect adopts the backend again, so edits made while the engine was disconnected are
> dropped for every key the backend holds. To edit offline, disconnect the CRDT library's
> provider instead and keep the engine connected: the document records the edits and merges
> them when the provider reconnects.

## Coalescing remote changes

By default the engine applies each remote change to the store as it arrives, so a burst of
updates, such as a peer catching up after a slow connection, re-renders once per update. The
`schedule` option applies the burst once:

```ts
createSyncEngine({
  backend,
  adapter,
  schedule: (flush) => queueMicrotask(flush),
});
```

Until the flush, the store does not show the pending changes. A local change made in the
meantime applies them first, merged with the local change, so neither is lost: records merge
key by key and arrays item by item, and where both sides changed the same value, the local value
wins. See [Coalescing remote changes](../../../packages/core/docs/sync-engine.md#coalescing-remote-changes)
for the merge rules and when it happens.
