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

| Page                            | APIs and types                                                                                                                                                  |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Sync engine](./sync-engine.md) | `createSyncEngine`, `SyncEngineConfig`, `SeedStrategy`, `SyncEngine`, `defaultSyncFilter`, `StoreAdapter`, `CrdtBackend`, `Unsubscribe`                         |
| [Persistence](./persistence.md) | `createPersistence`, `PersistenceConfig`, `Persistence`, `PersistenceStats`, `PersistableDoc`, `PersistenceAdapter`, `StoredUpdates`                            |
| [Diff and apply](./diffing.md)  | `getChanges`, `Diffable`, `DiffOptions`, `TextPolicy`, `Change`, `ChangeType`, `toJsonValue`, `applyChanges`, `applyStringChanges`, `ApplyOps`, `ContainerKind` |
| [Testing](./testing.md)         | `createMemoryBackend`, `MemoryBackend`, `createMemoryPersistenceAdapter`, `MemoryPersistenceAdapter` from `@homeostate/core/testing`                            |

`createPersistence` keeps the document in browser storage through
[`@homeostate/persist-indexeddb`](../../persist-indexeddb/docs/introduction.md) or
[`@homeostate/persist-local-storage`](../../persist-local-storage/docs/introduction.md); the
[persistence guide](/docs/persistence) shows the setup.

## Writing a backend

Implement `write(next, previous)` with `applyChanges(root, current, next, ops, { text, json: true })`.
It diffs `current` against `next` and applies only the difference through your `ApplyOps`,
which read and write your library's maps, lists and texts:

- Pass `previous` as `current` when the engine gives it, and read your document only when it
  does not. Unchanged subtrees then match by identity instead of item by item.
- `json: true` keeps `undefined` and functions out of the CRDT library.
- Accept a `text` policy and pass it on. In `set` and `splice`, store the strings it marks in
  your library's text type and every other string as a plain value; text is then edited
  through `editText`.

The [diff and apply reference](./diffing.md) covers the edit script format and has a complete
`ApplyOps` example.
