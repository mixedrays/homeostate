---
description: The sync engine that keeps a store adapter in sync with a CRDT backend, plus document persistence.
label: Introduction
---

# @homeostate/core

The sync engine. It keeps a store, reached through a `StoreAdapter`, in sync with a
`CrdtBackend` such as [Yjs](../../crdt-yjs/docs/introduction.md),
[Loro](../../crdt-loro/docs/introduction.md) or
[Automerge](../../crdt-automerge/docs/introduction.md). [Concepts](/docs/concepts) explains
how the pieces fit together.

## Install

```bash install
npm install @homeostate/core @homeostate/crdt-yjs yjs
```

`@homeostate/core` has no runtime dependencies.

## Usage

```ts
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";

const engine = createSyncEngine(createYjsBackend(doc, "shared"), adapter, {
  filter: (key, value) => typeof value !== "function" && key !== "draft",
  seed: "if-empty",
});

engine.connect();
engine.isConnected(); // true
engine.disconnect();
```

Here, `doc` is your Yjs document and `adapter` comes from your state manager's `store-*`
package. On `connect()` the backend's values win over the store's. See the
[sync engine reference](./sync-engine.md) for all options, lifecycle methods and adapter
contracts, or [Connecting](/docs/concepts#connecting) for the reconciliation model.

## API reference

| Page                            | APIs and types                                                                                                                          |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| [Sync engine](./sync-engine.md) | `createSyncEngine`, `SyncEngineConfig`, `SeedStrategy`, `SyncEngine`, `defaultSyncFilter`, `StoreAdapter`, `CrdtBackend`, `Unsubscribe` |
| [Persistence](./persistence.md) | `createPersistence`, `PersistenceConfig`, `Persistence`, `PersistableDoc`, `PersistenceAdapter`, `StoredUpdates`                        |
| [Diff and apply](./diffing.md)  | `getChanges`, `Diffable`, `Change`, `ChangeType`, `toJsonValue`, `applyChanges`, `ApplyOps`                                             |
| [Testing](./testing.md)         | `createMemoryBackend`, `MemoryBackend`, `createMemoryPersistenceAdapter`, `MemoryPersistenceAdapter` from `@homeostate/core/testing`    |

## Persistence

`createPersistence(doc, adapter, { key })` keeps a CRDT document in browser storage, so its
state survives reloads, offline starts and every peer leaving the room. `doc` comes from a
backend package, such as `createYjsPersistable(ydoc)`, and `adapter` from
[`@homeostate/persist-indexeddb`](../../persist-indexeddb/docs/introduction.md) or
[`@homeostate/persist-local-storage`](../../persist-local-storage/docs/introduction.md). See
the [persistence guide](/docs/persistence) for setup and the
[persistence reference](./persistence.md) for configuration, lifecycle and error handling.

## Testing

`@homeostate/core/testing` has in-memory doubles: `createMemoryBackend()`, a plain JSON
backend without replication, and `createMemoryPersistenceAdapter()`. The
[testing reference](./testing.md) covers their methods and examples.

## Writing a backend

`getChanges(current, next)` turns a `write(next)` into fine-grained changes, so a backend can
apply small edits instead of replacing the document. Pass `next` through `toJsonValue` first,
so `undefined` and functions never reach the CRDT library. `applyChanges` applies them to a
mutable target through your own set, remove and splice operations. See the
[diff and apply reference](./diffing.md) for tuple formats, ordered array edits, UTF-16 string
offsets and a complete `ApplyOps` example.
