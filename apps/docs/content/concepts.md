---
description: The sync engine, the StoreAdapter and CrdtBackend contracts, and how connect() reconciles a store with a document.
order: 2
---

# Concepts

Homeostate is one engine and two contracts. The engine,
[`createSyncEngine`](../../../packages/core/docs/sync-engine.md#createsyncengine), sits between a store and a
replicated document and moves plain JSON between them. It knows nothing about any particular
state manager or CRDT library: `store-*` packages implement `StoreAdapter` for a state manager,
and `crdt-*` packages implement `CrdtBackend` for a CRDT library.

The [sync engine reference](../../../packages/core/docs/sync-engine.md) lists the complete
signatures, options and lifecycle methods.

```ts
import { createSyncEngine } from "@homeostate/core";

const engine = createSyncEngine(backend, adapter, { seed: "if-empty" });
engine.connect();
engine.isConnected(); // true
engine.disconnect();
```

## Store adapters

A `StoreAdapter` reads, replaces and watches the store:

```ts
interface StoreAdapter<S extends object> {
  getState: () => S;
  setState: (state: S) => void;
  subscribe: (onStoreChange: () => void) => Unsubscribe;
}
```

`setState` is called only for changes that come from the backend. The engine ignores store
notifications raised while it runs, so an adapter needs no echo suppression of its own.

Synced state must be plain JSON: objects, arrays, strings, numbers, booleans and `null`.
Functions are dropped by the default filter. Other values such as `Date`, `Map` or `Set` are
neither diffed nor synced. The supplied backends store `undefined` and nested functions as
`JSON.stringify` does: object entries holding them are left out, and such array items become
`null`.

Keys sync as own properties, so a key such as `constructor` or `toString` behaves like any
other. A `__proto__` key is never synced: assigning it would replace an object's prototype, so
the engine leaves it out of remote state at any depth.

## CRDT backends

A `CrdtBackend` holds the synced part of the state in a CRDT or any other replicated store:

```ts
interface CrdtBackend {
  read: () => unknown;
  write: (next: unknown) => void;
  subscribe: (onRemoteChange: () => void) => Unsubscribe;
}
```

- `read` returns a plain JSON snapshot that does not alias the backend's internals.
- `write` makes the backend equal to `next` in one atomic transaction. The backend decides
  how fine-grained the operations are; core exports `getChanges` so a backend can turn a
  `write` into small edits instead of replacing the document.
- `subscribe` reports changes that did not come through the backend's own `write`: imports
  from peers and local edits made directly on the document.

[`createMemoryBackend()`](../../../packages/core/docs/testing.md#creatememorybackend) from
`@homeostate/core/testing` is a plain JSON backend without replication, meant for tests.

## Choosing what to sync

The `filter` option decides which top-level keys are synced, in both directions:

```ts
createSyncEngine(backend, adapter, {
  filter: (key, value) => typeof value !== "function" && key !== "draft",
});
```

The default, `defaultSyncFilter`, excludes functions. Keys the filter excludes are never read
into the store from the backend and never written out, so they stay local to each peer.

## Connecting

`connect()` reconciles the store and the backend per key, over the keys the filter allows:

- A key the backend holds wins over the store's value, so a peer joining a room that already
  has state adopts it instead of overwriting it.
- A synced key the backend does not hold stays in the store. With the default
  `seed: "if-empty"` those keys are written into the backend in one write. With
  `seed: "never"` they are left for the next local change.

After that, the backend owns the synced document. Each local change replaces it with the
store's filtered state, and a key removed from the backend is removed from the store.

> [!IMPORTANT]
> A reconnect adopts the backend again, so edits made while the engine was disconnected are
> dropped for every key the backend holds. To edit offline, disconnect the CRDT library's
> provider instead and keep the engine connected: the document records the edits and merges
> them when the provider reconnects.
