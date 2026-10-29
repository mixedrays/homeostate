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
peers, are appended one at a time, including those made during the load. If a stored update
cannot be applied, the log is kept instead; see
[Stored updates that cannot be applied](#stored-updates-that-cannot-be-applied).

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
| `onError`      | Logs through `console.error` | Receives each storage failure and each stored update it cannot apply, once. What it throws is logged.                            |

Compaction loads the current log, merges it into the document, and replaces the loaded
portion with one snapshot; updates another writer appended after that load remain. When an
update in the loaded log cannot be applied, compaction leaves the log as it is.

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
`onError`, so the app starts without its saved state; it never rejects. If some stored updates
cannot be applied, it resolves after `onError` with the others applied. It may resolve before
the initial snapshot is written, and it does not wait for network peers. Await `flush()` to
wait for storage work too.

### flush

Waits for storage work queued at the time of the call, including any compaction it
triggers. Updates arriving later need another call.

It resolves when every update reported so far is stored, and otherwise rejects; see
[which failures a barrier reports](#which-failures-a-barrier-reports).

### compact

Queues a compaction now, as every `compactAfter` appends do, and resolves once it is written.
It rejects with the storage error when loading the log or writing the snapshot fails. When a
stored update cannot be applied, its error goes to `onError` and the log is not compacted,
though the promise still resolves. After `destroy()` or `clear()` it does nothing.

### stats

Waits for storage work queued at the time of the call, then loads the stored log and resolves
with a `PersistenceStats`: `updates` counts the stored entries, compacted snapshots included,
and `bytes` adds up their sizes as handed to the adapter, which may encode them larger. Unlike
the other methods, it rejects when storage cannot be read, rather than calling `onError`. The
[devtools](../../tool-devtools/docs/introduction.md) Storage tab shows it.

### destroy

Stops storing updates immediately and waits for queued work; calling it again is safe. It
settles as [`flush()`](#flush) does, and storing stops even when it rejects. The stored data
stays for a later `createPersistence` with the same adapter and key. It does not
destroy the document, disconnect its provider or sync engine, or close the storage adapter.

### clear

Stops storing updates and removes the stored document after pending work, also after
`destroy()` and after earlier writes failed. It resolves once the document is removed and
rejects with the storage error when it cannot be. It is how to delete a log holding updates that cannot be applied. The live
document and other peers keep their state, and other persistence instances using the same key
can write it again. To resume storing after `clear()` or `destroy()`, create a new
persistence.

### Error handling

Each storage error and each stored update that cannot be applied goes to `onError` once, as
it happens, and the queue moves on to the next operation. `onError` only observes: what it
throws is logged with `console.error`, and later storage work still runs.

The methods report the result of their own work through their promises, rejecting with the
same error object `onError` received, so an app can tell the two apart by identity:

```ts
try {
  await persistence.flush(); // every update so far is stored
  await persistence.clear(); // the stored document is gone
} catch (error) {
  showStorageFailure(error);
}
```

A promise the app does not await never becomes an unhandled rejection, since its failure has
already gone to `onError`. `whenLoaded` still never rejects, and `stats()` rejects only when
storage cannot be read.

#### Which failures a barrier reports

`flush()` and `destroy()` reject while storage may be missing an update the document
reported: after a failed append, or a failed initial load or initial snapshot, which may leave
what the document held before it was persisted unstored. This includes failures that happened
before the call, and it rejects with the earliest such failure's error. Concurrent barriers
reject alike, and `onError` is not called again.

A failure stops affecting barriers once storage holds its update again: when a compaction
writes a snapshot of the document, whether initial, automatic or from `compact()`, or the
initial load appends one, or `clear()` removes the stored document. A barrier whose own queued
work includes such a snapshot resolves. The operation that failed keeps its rejection.

A failed automatic compaction leaves the log as it was, so it reports to `onError` without
making barriers reject; neither does an update that cannot be applied.

### Stored updates that cannot be applied

A stored update the document cannot apply, such as damaged bytes or an update another CRDT
library stored under a reused key, goes to `onError` with the error `apply` threw. The other
updates are still applied, so the document holds what could be restored, and the stored log
is kept as it is:

- The initial load does not compact the log. It appends a snapshot of the document instead,
  so what the document held before it was persisted is still stored.
- Automatic and explicit compactions load the log again, report the same error again, and
  leave the log in place.
- Updates made after the load are appended as usual, and entries other writers stored remain.

The unreadable bytes stay available through the adapter's `load(key)` until something deletes
them. To recover, read the log, export or repair what the app can, then call `clear()`, or
`adapter.clear(key)`, and persist the document again. Once the log can be applied in full,
compaction resumes.

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
| `apply(update)`       | Merges binary updates or snapshots. Repeated and out-of-order updates must be safe. Throws for bytes it cannot apply, so that `createPersistence` keeps them in storage.                |
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
failed storage operations so `createPersistence` can report them through `onError` and the
promises of its methods.

Use [IndexedDB](../../persist-indexeddb/docs/introduction.md),
[localStorage](../../persist-local-storage/docs/introduction.md), or the
[in-memory testing adapter](./testing.md#creatememorypersistenceadapter).
`Unsubscribe` is defined in the [sync engine reference](./sync-engine.md#unsubscribe).

Source: [persistence.ts](../src/persistence.ts) and [types.ts](../src/types.ts).
