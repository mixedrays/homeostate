---
description: Keep a synced document in localStorage or IndexedDB, so its state survives reloads, offline starts and every peer leaving the room.
order: 3
---

# Persistence

A sync server such as `y-websocket` keeps each room in memory. When the last peer
disconnects, or the server restarts, the room and its state are gone. Persistence keeps a
copy of the document in each browser: on the next start the page restores it, works offline
from it, and hands it back to the server once it reconnects.

For complete signatures, options and method behavior, see the
[persistence API reference](../../../packages/core/docs/persistence.md).

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

If you use the Zustand middleware, which connects as soon as the store is created, create the
store after `whenLoaded`, or seed the document identically in every peer before persisting
it, as the [playground](https://github.com/mixedrays/homeostate/tree/main/apps/playground)
does.

## Choosing storage

- **IndexedDB** stores each update as a row, so appending stays cheap as the document grows.
  Use it by default.
- **localStorage** keeps each document as one JSON entry, rewritten on every update and
  limited to about 5 MB per origin. It suits small documents and environments without
  IndexedDB. Pass `sessionStorage` to keep a document only for the tab's session.

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

## Several tabs

Tabs of one origin may persist the same key at once. Each update is appended to a log, and
every `compactAfter` updates (100 by default) a tab merges the log into its document and
replaces the part it merged with one snapshot. Updates another tab appended meanwhile are
kept, so no tab loses another's edits.

## Custom storage

A `PersistenceAdapter` is an append-only log of binary updates per key:

```ts
interface PersistenceAdapter {
  load: (key: string) => Promise<{ updates: Uint8Array[]; version: number }>;
  append: (key: string, update: Uint8Array) => Promise<void>;
  compact: (
    key: string,
    snapshot: Uint8Array,
    version: number,
  ) => Promise<void>;
  clear: (key: string) => Promise<void>;
}
```

`version` identifies the newest update `load` returned. `compact` must, atomically, remove
the updates up to that version and store the snapshot, keeping anything appended since.
[`createMemoryPersistenceAdapter()`](../../../packages/core/docs/testing.md#creatememorypersistenceadapter)
from `@homeostate/core/testing` is an in-memory one for tests.
