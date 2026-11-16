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

Create the persistence next to the document, and connect the sync engine once `whenLoaded`
resolves, so it writes nothing until the stored document is restored:

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
const engine = createSyncEngine({
  backend: createYjsBackend(doc, "shared"),
  adapter,
});
engine.connect();
```

The whole document is stored, including shared types outside the synced map. Every update is
stored, local edits and those from peers alike.

> [!IMPORTANT]
> Do not seed before `whenLoaded`. Until it resolves the document may still be empty, so the
> engine would write the store's defaults as new operations, and they could win over the restored
> values. Connect after `await persistence.whenLoaded`. The provider may connect at any time.

With a setup helper, pass `connect: "manual"` and connect the engine it exposes once
`whenLoaded` resolves. With the Zustand middleware:

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

Jotai's `atomWithSync` has no `connect` option: mount the atom once `whenLoaded` resolves.

### Waiting for the provider too

`whenLoaded` tells that the stored document is back, not that the room's state has
arrived. On a first visit nothing is stored, so a peer that seeds then competes with a populated
room. To wait for both, combine them, with the `synced` helper from
[Waiting for the room](../../../packages/core/docs/sync-engine.md#waiting-for-the-room):

```ts
await Promise.all([persistence.whenLoaded, synced(provider)]);
engine.connect();
```

This never settles while the provider cannot reach the server. An app that must start offline
can race the provider against a timeout, which trades safety for an offline start: if the room's
state arrives after the timeout, its values compete with what this peer seeded.

```ts
await Promise.all([
  persistence.whenLoaded,
  Promise.race([synced(provider), timeout(3000)]),
]);
engine.connect();
```

## Checking what was restored

`whenLoaded` resolves with a `PersistenceLoadResult`, so the app can tell a first visit from a
restored document, and both from a stored log it could not restore:

| `status`    | When                                                                     | Typical start                                       |
| ----------- | ------------------------------------------------------------------------ | --------------------------------------------------- |
| `"empty"`   | Nothing is stored under the key, as on a first visit                     | Connect; the store's defaults seed the document     |
| `"loaded"`  | Every stored update was applied                                          | Connect                                             |
| `"partial"` | Some stored updates could not be applied; `errors` holds what each threw | Offer recovery, or connect with what was restored   |
| `"failed"`  | Storage could not be read; `error` holds why                             | Offer recovery, or continue without the saved state |

```ts
const loaded = await persistence.whenLoaded;
if (loaded.status === "empty" || loaded.status === "loaded") {
  engine.connect();
} else {
  showRecovery(loaded);
}
```

Connecting after `"partial"` or `"failed"` can seed the store's defaults for what was not
restored, as on a first visit; a log that could not be applied stays in storage either way, see
[Unreadable stored updates](#unreadable-stored-updates). To hold writes back instead, leave the
engine disconnected, as above.

The errors are the ones `onError`
received while loading, not those of later writes. The result only describes restoring the
document: `"loaded"` does not mean the initial snapshot is written or that peers have synced.
Await `flush()` for storage writes.

## Choosing storage

- **IndexedDB** stores each update as a row, so appending stays cheap as the document grows.
  Use it by default.
- **localStorage** keeps each document as one JSON entry, rewritten on every update and
  limited to about 5 MB per origin. It suits small documents and environments without
  IndexedDB. Pass `sessionStorage` to keep a document only for the tab's session. Tabs take
  turns writing through Web Locks, which need https or localhost; see [Several tabs](#several-tabs).

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
createSyncEngine({
  backend: createYjsBackend(doc, "shared"),
  adapter: storeAdapter,
}).connect();
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
createSyncEngine({
  backend: createAutomergeBackend(docHandle, "shared"),
  adapter: storeAdapter,
}).connect();
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
(`console.error` by default) and `whenLoaded` resolves with `"failed"`; see
[Checking what was restored](#checking-what-was-restored).

The other methods reject when their storage work fails, with the error `onError` also
received. A failed write can leave later updates unrestorable, since they depend on it, so
persistence stores the whole document again after the next write that succeeds, and on each
`flush()` and `destroy()`. They reject only when that fails too, while an update the document
reported may still be missing from storage, also after a failure before the call;
`compact()` and `clear()` reject with their own storage error. So a sign-out can tell whether
local data was deleted:

```ts
try {
  await persistence.clear();
} catch (error) {
  showStorageFailure(error); // the stored document is still there
}
```

A promise left unawaited never becomes an unhandled rejection. The API reference says
[how a failed write is repaired](../../../packages/core/docs/persistence.md#repairing-a-failed-write)
and [which failures each method reports](../../../packages/core/docs/persistence.md#which-failures-a-barrier-reports).

## Unreadable stored updates

A stored update can fail to apply: its bytes were damaged, or the key was used before for a
document of another CRDT library. The error goes to `onError`, the rest of the log is applied,
`whenLoaded` resolves with `"partial"`, and the stored log is kept as it is: compaction leaves it alone, so nothing that failed to
restore is deleted. To recover, read the log with the adapter's `load(key)`, keep what the app
can use, then call `persistence.clear()` to delete it on purpose. Use a distinct key for each
CRDT library. The
[API reference](../../../packages/core/docs/persistence.md#stored-updates-that-cannot-be-applied)
describes what happens on load and on each compaction.

## Several tabs

Tabs of one origin may persist the same key at once. Each update is appended to a log, and
every `compactAfter` updates (100 by default) a tab merges the log into its document and
replaces the part it merged with one snapshot. Updates another tab appended meanwhile are
kept, so no tab loses another's edits:

- **IndexedDB** writes each append and compaction in one transaction.
- **localStorage** has no transactions, so the adapter holds a
  [Web Lock](https://developer.mozilla.org/docs/Web/API/Web_Locks_API) for the key while it
  reads and rewrites the document's entry. Browsers provide Web Locks in secure contexts only,
  https and `localhost`. On a page opened over plain http from another address, such as a LAN
  IP, every write rejects with an error saying so, through `onError` and `flush()`. Serve the
  page over https, or pass `coordination: "single-writer"` when only one tab writes the
  storage, as with `sessionStorage`; two tabs writing one key in that mode can lose each
  other's updates. The
  [adapter's documentation](../../../packages/persist-local-storage/docs/introduction.md#several-tabs)
  has the details.

`clear()` deletes the stored document for every tab, but another tab that still persists the
key writes it again with its next update.

## Custom storage

A [`PersistenceAdapter`](../../../packages/core/docs/persistence.md#persistenceadapter-and-storedupdates)
is an append-only log of binary updates per key, with `load`, `append`, `compact` and `clear`.
`compact` must atomically replace the updates up to the version `load` returned with one
snapshot, keeping anything appended since, also by another tab writing the same key.
[`createMemoryPersistenceAdapter()`](../../../packages/core/docs/testing.md#creatememorypersistenceadapter)
from `@homeostate/core/testing` is an in-memory one for tests.
