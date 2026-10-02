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
propagate to the caller of the operation that triggered them. There is no engine-level
`onError` option or retry mechanism.

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
}

type SeedStrategy = "if-empty" | "never";
```

| Option   | Default             | Behavior                                                                                                             |
| -------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `filter` | `defaultSyncFilter` | Selects top-level keys independently in the store and backend, in both directions. Excluded keys stay local.         |
| `seed`   | `"if-empty"`        | On connection, writes synced keys that exist only in the store into the backend. `"never"` skips this initial write. |

A custom filter replaces the default. Call `defaultSyncFilter` within it if you also want
to exclude functions. Filtering is top-level; it does not remove nested functions or turn
non-JSON values into JSON. Use plain JSON for the synced data.

Despite its name, `"if-empty"` works per key, even when the backend already holds other
keys. With either strategy, a backend key wins over the corresponding store value, and a
store-only key remains in the store during connection. With `"never"`, the next local
change still writes the store's entire filtered state, including those store-only keys.

## SyncEngine

```ts
interface SyncEngine {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
}
```

| Method          | Returns   | Behavior                                                                                                                                  |
| --------------- | --------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`     | `void`    | Reconciles current state per key, then subscribes to backend and store changes. Calling it again while connected does nothing.            |
| `disconnect()`  | `void`    | Removes both subscriptions. Calling it while disconnected does nothing. It does not destroy the store, document, provider or persistence. |
| `isConnected()` | `boolean` | Whether the engine is subscribed. This does not report network connectivity or whether a provider has received the room's state.          |

After connection, each local notification writes the full filtered store state to the
backend. Each backend notification applies its full filtered state to the store, including
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

## CrdtBackend

```ts
interface CrdtBackend {
  read: () => unknown;
  write: (next: unknown) => void;
  subscribe: (onRemoteChange: () => void) => Unsubscribe;
}
```

| Member                | Contract                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `read()`              | Returns a plain JSON snapshot that does not alias mutable backend internals. For the sync engine, expose the synced top-level state as an object.                |
| `write(next)`         | Makes the synced subtree equal to `next` in one atomic transaction. The backend chooses how to turn that snapshot into CRDT operations.                          |
| `subscribe(callback)` | Reports changes outside this backend's own `write`, including imports from peers and local edits made directly on the document. Returns an unsubscribe function. |

Although `read()` has return type `unknown`, the engine treats a `null` or non-object
result as an empty state. Keep document replication in your CRDT provider. For writing a
backend that applies small edits, see [Diff and apply API](./diffing.md).

## Unsubscribe

```ts
type Unsubscribe = () => void;
```

The cleanup function returned by a subscription. The engine calls it on disconnect.

Source: [sync-engine.ts](../src/sync-engine.ts) and [types.ts](../src/types.ts).
