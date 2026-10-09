---
description: In-memory backend and persistence adapter factories for testing sync behavior and document storage without external services.
label: Testing API
order: 4
---

# Testing API

Import these factories and types from `@homeostate/core/testing`. They implement the same
contracts as production backends and persistence adapters without network or browser storage.

## createMemoryBackend

```ts
declare const createMemoryBackend: (initial?: unknown) => MemoryBackend;

interface MemoryBackend extends CrdtBackend {
  receive: (next: unknown) => void;
}
```

Returns a [CrdtBackend](./sync-engine.md#crdtbackend) with an extra `receive` method. The
initial state defaults to `{}`. Values are copied through JSON, so use plain JSON.

| Member                | Returns       | Behavior                                                                                                                        |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `read()`              | `unknown`     | A fresh copy of the held state.                                                                                                 |
| `write(next)`         | `void`        | Replaces the held state with a copy, without notifying subscribers, and ignores `previous`. Models the engine's own write.      |
| `receive(next)`       | `void`        | Replaces the held state with a copy, then synchronously notifies every subscriber. Models a full snapshot arriving from a peer. |
| `subscribe(callback)` | `Unsubscribe` | Registers a callback; the returned function removes it.                                                                         |

Separate memory backends do not exchange state. See the
[sync engine example](./sync-engine.md#example) for testing local and remote changes together.

```ts title="memory-backend-example.ts"
import { createMemoryBackend } from "@homeostate/core/testing";

const backend = createMemoryBackend({ count: 0 });
let notifications = 0;
const unsubscribe = backend.subscribe(() => {
  notifications++;
});

backend.write({ count: 1 });
console.log(notifications); // 0

backend.receive({ count: 2 });
console.log(backend.read(), notifications); // { count: 2 }, 1

unsubscribe();
```

## createMemoryPersistenceAdapter

```ts
declare const createMemoryPersistenceAdapter: () => MemoryPersistenceAdapter;

interface MemoryPersistenceAdapter extends PersistenceAdapter {
  size: (key: string) => number;
}
```

Returns a [PersistenceAdapter](./persistence.md#persistenceadapter-and-storedupdates) with an
extra `size(key)` method. Each call creates independent storage: reuse one adapter to test a
document being destroyed and restored, or several documents sharing storage.

| Member                            | Returns                  | Behavior                                                                            |
| --------------------------------- | ------------------------ | ----------------------------------------------------------------------------------- |
| `load(key)`                       | `Promise<StoredUpdates>` | Copies the stored byte arrays and returns their current log version.                |
| `append(key, update)`             | `Promise<void>`          | Stores a copy of the update.                                                        |
| `compact(key, snapshot, version)` | `Promise<void>`          | Replaces entries through `version` with a copied snapshot, retaining later entries. |
| `clear(key)`                      | `Promise<void>`          | Removes that key's log.                                                             |
| `size(key)`                       | `number`                 | Counts update entries, not bytes or application records.                            |

```ts title="memory-persistence-example.ts"
import { createMemoryPersistenceAdapter } from "@homeostate/core/testing";

const storage = createMemoryPersistenceAdapter();
await storage.append("room", new Uint8Array([1]));
const loaded = await storage.load("room");

// Another writer appends after the load used for compaction.
await storage.append("room", new Uint8Array([2]));
await storage.compact("room", new Uint8Array([9]), loaded.version);
console.log(storage.size("room")); // 2: the later update and the snapshot

await storage.clear("room");
console.log(await storage.load("room")); // { updates: [], version: 0 }
```

Source: [memory-backend.ts](../src/memory-backend.ts) and
[memory-persistence.ts](../src/memory-persistence.ts).
