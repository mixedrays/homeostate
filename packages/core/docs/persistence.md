---
description: createPersistence, all PersistenceConfig options, loading and cleanup methods, and the document and storage adapter contracts.
label: Persistence API
order: 2
---

# Persistence API

Import these APIs and types from `@homeostate/core`. The [persistence guide](/docs/persistence)
shows how to combine them with a sync engine and choose browser storage.

## createPersistence

```ts
declare function createPersistence(
  doc: PersistableDoc,
  adapter: PersistenceAdapter,
  config: PersistenceConfig,
): Persistence;
```

Subscribes to document updates immediately and queues the initial load. Returns a
`Persistence` handle synchronously; await its `whenLoaded` promise before connecting a sync
engine that could seed initial state.

| Parameter | Required | Description                                                                                                                     |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `doc`     | Yes      | Binary encoding, merging and subscriptions for a CRDT document. Use the `create*Persistable` factory from your backend package. |
| `adapter` | Yes      | Storage implementing the append-only update log contract below.                                                                 |
| `config`  | Yes      | The storage key and optional compaction/error settings.                                                                         |

The initial load merges stored updates into the document and compacts them into a snapshot.
This also stores any state the document already held. Later local and remote updates are
appended serially. Updates made during loading are queued, so they are not missed.

### Example

This browser example stores a Yjs document using the
[IndexedDB adapter](../../persist-indexeddb/docs/introduction.md):

```ts title="persistence-example.ts"
import * as Y from "yjs";
import { createPersistence } from "@homeostate/core";
import { createYjsPersistable } from "@homeostate/crdt-yjs";
import { createIndexedDbAdapter } from "@homeostate/persist-indexeddb";

const doc = new Y.Doc();
const storage = createIndexedDbAdapter();
const persistence = createPersistence(createYjsPersistable(doc), storage, {
  key: "counter-room",
  compactAfter: 50,
  onError: (error) => console.error("Could not persist the counter", error),
});

await persistence.whenLoaded;
// Connect your sync engine here, after the saved state has been applied.
doc.getMap("shared").set("count", 1);
await persistence.flush();

// On teardown: finish queued work and release resources; stored data stays.
await persistence.destroy();
storage.close();
doc.destroy();
```

## PersistenceConfig

```ts
interface PersistenceConfig {
  key: string;
  compactAfter?: number;
  onError?: (error: unknown) => void;
}
```

| Option         | Default                      | Behavior                                                                                                                         |
| -------------- | ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `key`          | Required                     | Identifies the document in the storage adapter. Use different keys for independent documents.                                    |
| `compactAfter` | `100`                        | Number of successful appends between compactions. Use a positive integer, or `Infinity` to compact only during the initial load. |
| `onError`      | Logs through `console.error` | Receives storage failures and errors applying stored updates. Supply a handler that reports the error without throwing.          |

Compaction loads the current log, merges it into the document, and replaces the loaded
portion with one snapshot. Updates appended by another writer after that load must remain.
The initial load compacts even when `compactAfter` is `Infinity`.

These options are not validated at runtime. Choose a positive threshold; the implementation
compares its append count directly with `compactAfter`.

## Persistence

```ts
interface Persistence {
  whenLoaded: Promise<void>;
  flush: () => Promise<void>;
  destroy: () => Promise<void>;
  clear: () => Promise<void>;
}
```

### whenLoaded

Resolves once the initial stored updates have been applied. It also resolves if loading
fails, after the error is reported, so the app can start without its saved state. It does
not reject and is not a success indicator for storage.

On a successful load it can resolve before the initial compacted snapshot has finished
writing. Await `flush()` when you need to wait for queued storage work as well. It does not
wait for synchronization with network peers.

### flush

Waits for storage work queued at the time of the call, including any compaction that work
triggers. Updates arriving later may require another call. Returns `Promise<void>` and
keeps the document subscription active.

### destroy

Stops accepting document updates immediately and waits for already queued work. Returns
`Promise<void>`; calling it again is safe. Stored data stays available for a future
`createPersistence` call with the same adapter and key.

It does not destroy the CRDT document, disconnect its provider or sync engine, or close the
storage adapter. Clean up those resources separately.

### clear

Stops accepting updates and queues removal of the stored document after pending work.
Returns `Promise<void>`. It can also be called after `destroy()`.

Clearing storage does not erase the live document or other peers' state. Other active
persistence instances using the same key can write it again. Create a new persistence
instance if you want to resume saving after `clear()` or `destroy()`.

### Error handling

Storage errors go to `onError`; with a non-throwing handler, failed queued operations are
skipped and later work continues. The lifecycle promises wait for the queue; their
resolution does not guarantee that every write succeeded. An invalid stored update is
reported and skipped while the remaining updates are attempted.

A custom `onError` that throws can reject queued work. Keep it non-throwing and track
failures in your application if you need to show whether persistence is available.

## PersistableDoc

```ts
interface PersistableDoc {
  encode: () => Uint8Array;
  apply: (update: Uint8Array) => void;
  subscribe: (onUpdate: (update: Uint8Array) => void) => Unsubscribe;
}
```

| Member                | Contract                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `encode()`            | Encodes the entire document as an update accepted by `apply`.                                                                                                                           |
| `apply(update)`       | Merges binary updates or snapshots. Repeated and out-of-order updates must be safe.                                                                                                     |
| `subscribe(callback)` | Reports local changes and changes received from peers as binary updates. Changes made through this interface's own `apply` must not be reported again. Returns an unsubscribe function. |

The suppression on `apply` prevents restored updates from being saved again. Use
`createYjsPersistable`, `createLoroPersistable` or `createAutomergePersistable` from the
corresponding backend package. They preserve document history, including shared data outside
the subtree used by the sync engine.

## PersistenceAdapter and StoredUpdates

```ts
interface StoredUpdates {
  updates: Uint8Array[];
  version: number;
}

interface PersistenceAdapter {
  load: (key: string) => Promise<StoredUpdates>;
  append: (key: string, update: Uint8Array) => Promise<void>;
  compact: (
    key: string,
    snapshot: Uint8Array,
    version: number,
  ) => Promise<void>;
  clear: (key: string) => Promise<void>;
}
```

| Member                            | Contract                                                                                                                                            |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `load(key)`                       | Returns updates oldest first and the position of the newest returned update. For a missing key, return `{ updates: [], version: 0 }`.               |
| `append(key, update)`             | Adds one binary update to that key's log.                                                                                                           |
| `compact(key, snapshot, version)` | Atomically removes updates through the supplied version and stores the snapshot, retaining later appends and snapshots from concurrent compactions. |
| `clear(key)`                      | Removes all stored data for that key. Other keys are unaffected.                                                                                    |

`version` is a storage-log position, not an application schema version. Store the bytes in
the supplied `Uint8Array` view, which may cover only part of its backing buffer. Reject
failed storage operations so `createPersistence` can report them through `onError`.

Use [IndexedDB](../../persist-indexeddb/docs/introduction.md),
[localStorage](../../persist-local-storage/docs/introduction.md), or the
[in-memory testing adapter](./testing.md#creatememorypersistenceadapter).
`Unsubscribe` is defined in the [sync engine reference](./sync-engine.md#unsubscribe).

Source: [persistence.ts](../src/persistence.ts) and [types.ts](../src/types.ts).
