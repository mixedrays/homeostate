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

Subscribes to document updates immediately and queues the initial load. Await `whenLoaded`
before connecting a sync engine that could seed initial state.

| Parameter | Required | Description                                                                                                                     |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `doc`     | Yes      | Binary encoding, merging and subscriptions for a CRDT document. Use the `create*Persistable` factory from your backend package. |
| `adapter` | Yes      | Storage implementing the append-only update log contract below.                                                                 |
| `config`  | Yes      | The storage key and optional compaction/error settings.                                                                         |

The initial load merges stored updates into the document and compacts them into one
snapshot, which also stores whatever the document already held. Later updates, local and from
peers, are appended one at a time, including those made during the load.

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
portion with one snapshot; updates another writer appended after that load remain.

## Persistence

```ts
interface Persistence {
  whenLoaded: Promise<void>;
  flush: () => Promise<void>;
  compact: () => Promise<void>;
  stats: () => Promise<PersistenceStats>;
  destroy: () => Promise<void>;
  clear: () => Promise<void>;
}

interface PersistenceStats {
  updates: number;
  bytes: number;
}
```

### whenLoaded

Resolves once the stored updates have been applied. If loading fails, it resolves after
`onError`, so the app starts without its saved state; it never rejects. It may resolve before
the initial snapshot is written, and it does not wait for network peers. Await `flush()` to
wait for storage work too.

### flush

Waits for storage work queued at the time of the call, including any compaction it
triggers. Updates arriving later need another call.

### compact

Queues a compaction now, as every `compactAfter` appends do, and resolves once it is written.
Failures go to `onError`. After `destroy()` or `clear()` it does nothing.

### stats

Waits for storage work queued at the time of the call, then loads the stored log and resolves
with a `PersistenceStats`: `updates` counts the stored entries, compacted snapshots included,
and `bytes` adds up their sizes as handed to the adapter, which may encode them larger. Unlike
the other methods, it rejects when storage cannot be read, rather than calling `onError`. The
[devtools](../../tool-devtools/docs/introduction.md) Storage tab shows it.

### destroy

Stops storing updates immediately and waits for queued work; calling it again is safe. The
stored data stays for a later `createPersistence` with the same adapter and key. It does not
destroy the document, disconnect its provider or sync engine, or close the storage adapter.

### clear

Stops storing updates and removes the stored document after pending work, also after
`destroy()`. The live document and other peers keep their state, and other persistence
instances using the same key can write it again. To resume storing after `clear()` or
`destroy()`, create a new persistence.

### Error handling

Storage errors and stored updates that cannot be applied go to `onError`, and the queue
moves on to the next operation. So the lifecycle promises resolving does not mean every
write succeeded: track failures in `onError` if the app needs to show whether persistence
works. Keep `onError` from throwing, or queued work rejects.

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

Not reporting `apply`'s own changes keeps restored updates from being stored again. Use
`createYjsPersistable`, `createLoroPersistable` or `createAutomergePersistable` from the
backend package; they store the whole document, including data outside the synced subtree.

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
