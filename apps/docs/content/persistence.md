---
description: Keep a synced document in localStorage or IndexedDB, so its state survives reloads, offline starts and every peer leaving the room.
order: 3
---

# Persistence

A sync server such as `y-websocket` keeps each room in memory. When the last peer
disconnects, or the server restarts, the room and its state are gone. Persistence keeps a
copy of the document in each browser: on the next start the page restores it, works offline
from it, and hands it back to the server once it reconnects.

The [persistence API reference](../../../packages/core/docs/persistence.md) has the complete
API.

## What is stored

Persistence stores the CRDT document, not the store's JSON state. A document restored from
its own history merges with its peers like any other replica. Restoring JSON would instead
write the same values again as new operations, and every peer doing that would compete over
the same keys.

Three pieces work together:

| Piece                | Provided by                                                                                                                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPersistence`  | [`@homeostate/core`](../../../packages/core/docs/persistence.md#createpersistence)                                                                                                                            |
| `PersistableDoc`     | Each CRDT backend: `createYjsPersistable`, `createLoroPersistable`, `createAutomergePersistable`                                                                                                              |
| `PersistenceAdapter` | [`@homeostate/persist-indexeddb`](../../../packages/persist-indexeddb/docs/introduction.md), [`@homeostate/persist-local-storage`](../../../packages/persist-local-storage/docs/introduction.md), or your own |

## Install

```bash install
npm install @homeostate/persist-indexeddb
```

## Usage

Create the persistence next to the document, then connect the sync engine once it has
loaded:

```ts {9-13,17}
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";
import { createPersistence, createSyncEngine } from "@homeostate/core";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createIndexedDbAdapter } from "@homeostate/persist-indexeddb";

const doc = new Y.Doc();

const persistence = createPersistence(
  createYjsPersistable(doc),
  createIndexedDbAdapter(),
  { key: "todos" },
);

new WebsocketProvider("wss://sync.example.com", "todos", doc);

await persistence.whenLoaded;
createSyncEngine(createYjsBackend(doc, "shared"), adapter).connect();
```

The whole document is stored, including shared types outside the synced map. Every update is
stored, local edits and those from peers alike.

> [!IMPORTANT]
> Connect the engine after `whenLoaded`. Before it resolves the document is still empty, so
> `connect()` would seed the store's defaults as new operations, and they could win over the
> restored values. The provider may connect at any time.

With the Zustand middleware, pass `connect: "manual"` and connect the store the same way:

```ts
const useTodos = create<TodoState>()(
  homeostate(creator, {
    backend: createYjsBackend(doc, "shared"),
    connect: "manual",
  }),
);

await persistence.whenLoaded;
useTodos.homeostate.connect();
```

## Choosing storage

- **IndexedDB** stores each update as a row, so appending stays cheap as the document grows.
  Use it by default.
- **localStorage** keeps each document as one JSON entry, rewritten on every update and
  limited to about 5 MB per origin. It suits small documents and environments without
  IndexedDB. Pass `sessionStorage` to keep a document only for the tab's session.

## The CRDT library's own storage

The backends sync a document however it is stored, so you can keep it with the CRDT library's
own tooling instead of `createPersistence`. As with `whenLoaded`, connect the engine once that
tooling has loaded the document.

| CRDT      | Own storage                                                                                   | How to use it                                             |
| --------- | --------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Yjs       | [`y-indexeddb`](https://github.com/yjs/y-indexeddb)                                           | Attach it to the same `Y.Doc`                             |
| Automerge | [automerge-repo](https://automerge.org/docs/reference/repositories/storage/) storage adapters | Pass the `Repo`'s `DocHandle` to `createAutomergeBackend` |
| Loro      | None                                                                                          | Use `createPersistence` with `createLoroPersistable`      |

### Yjs: y-indexeddb

```ts {9,12}
import * as Y from "yjs";
import { IndexeddbPersistence } from "y-indexeddb";
import { WebsocketProvider } from "y-websocket";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";

const doc = new Y.Doc();

const stored = new IndexeddbPersistence("todos", doc);
new WebsocketProvider("wss://sync.example.com", "todos", doc);

await stored.whenSynced;
createSyncEngine(createYjsBackend(doc, "shared"), storeAdapter).connect();
```

It stores the document much as `createPersistence` does: one row per update, merged into one
snapshot on load and once 500 updates pile up. Unlike `createPersistence`:

- `whenSynced` never settles if IndexedDB fails to open, so an app that waits for it never
  connects. Race it against a timeout to start without the stored state instead.
- It has no error callback, no `flush`, `compact` or `stats`, and no localStorage storage.
- `clearData()` resolves before the database is deleted.
- The [devtools](../../../packages/tool-devtools/docs/introduction.md) Storage tab works with
  `createPersistence` only.

### Automerge: automerge-repo

A `Repo` stores its documents through a storage adapter, such as `IndexedDBStorageAdapter` from
`@automerge/automerge-repo-storage-indexeddb`, and syncs them through network adapters, so it
replaces both `createPersistence` and the provider. Pass its `DocHandle` to the backend once
`repo.find` has loaded it:

```ts
const repo = new Repo({
  storage: new IndexedDBStorageAdapter(),
  network: [new BrowserWebSocketClientAdapter("wss://sync.example.com")],
});
const docHandle = await repo.find(url);
createSyncEngine(
  createAutomergeBackend(docHandle, "shared"),
  storeAdapter,
).connect();
```

See [With automerge-repo](../../../packages/crdt-automerge/docs/introduction.md#with-automerge-repo)
for the imports and details.

### Loro

Loro has no storage package. Its [persistence guide](https://loro.dev/docs/tutorial/persistence)
suggests storing a snapshot plus the updates since, which is what `createPersistence` does with
`createLoroPersistable`.

## Lifecycle

```ts
await persistence.flush(); // every update so far is written
await persistence.compact(); // merge the stored log into one snapshot now
await persistence.stats(); // { updates, bytes } stored under the key
await persistence.destroy(); // stop storing; the stored document stays
await persistence.clear(); // stop storing and delete the stored document, e.g. on sign-out
```

`whenLoaded` never rejects. If storage is unavailable or fails, the error goes to `onError`
(`console.error` by default) and the app starts without its stored state.

## Unreadable stored updates

A stored update can fail to apply: its bytes were damaged, or the key was used before for a
document of another CRDT library. The error goes to `onError`, the rest of the log is applied,
and the stored log is kept as it is: compaction leaves it alone, so nothing that failed to
restore is deleted. To recover, read the log with the adapter's `load(key)`, keep what the app
can use, then call `persistence.clear()` to delete it on purpose. Use a distinct key for each
CRDT library. The
[API reference](../../../packages/core/docs/persistence.md#stored-updates-that-cannot-be-applied)
describes what happens on load and on each compaction.

## Several tabs

Tabs of one origin may persist the same key at once. Each update is appended to a log, and
every `compactAfter` updates (100 by default) a tab merges the log into its document and
replaces the part it merged with one snapshot. Updates another tab appended meanwhile are
kept, so no tab loses another's edits.

## Custom storage

A [`PersistenceAdapter`](../../../packages/core/docs/persistence.md#persistenceadapter-and-storedupdates)
is an append-only log of binary updates per key, with `load`, `append`, `compact` and `clear`.
`compact` must atomically replace the updates up to the version `load` returned with one
snapshot, keeping anything appended since.
[`createMemoryPersistenceAdapter()`](../../../packages/core/docs/testing.md#creatememorypersistenceadapter)
from `@homeostate/core/testing` is an in-memory one for tests.
