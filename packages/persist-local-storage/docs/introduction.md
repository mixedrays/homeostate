---
description: Store a Yjs, Loro or Automerge document in localStorage, so its state survives reloads, offline starts and every peer leaving the room.
label: Introduction
---

# @homeostate/persist-local-storage

localStorage storage for `createPersistence` from
[`@homeostate/core`](../../core/docs/introduction.md). It keeps a Yjs, Loro or Automerge
document in the browser, so its state survives reloads, offline starts and every peer leaving
the room.

## Install

```bash install
npm install @homeostate/core @homeostate/persist-local-storage @homeostate/crdt-yjs yjs
```

## Usage

```ts
import * as Y from "yjs";
import { createPersistence, createSyncEngine } from "@homeostate/core";
import { createYjsBackend, createYjsPersistable } from "@homeostate/crdt-yjs";
import { createLocalStorageAdapter } from "@homeostate/persist-local-storage";

const doc = new Y.Doc();
const persistence = createPersistence(
  createYjsPersistable(doc),
  createLocalStorageAdapter(),
  { key: "todos" },
);

await persistence.whenLoaded;
createSyncEngine({
  backend: createYjsBackend(doc, "shared"),
  adapter,
}).connect();
```

Connect the engine after `whenLoaded`, so it adopts the restored state instead of seeding the
store's defaults over it. Its result tells whether a stored document was found and restored in
full; see [checking what was restored](/docs/persistence#checking-what-was-restored). See the
[persistence guide](/docs/persistence) for the whole flow.

## Options

```ts
createLocalStorageAdapter({
  prefix: "homeostate:", // prepended to every key
  storage: sessionStorage, // defaults to localStorage
  coordination: "single-writer", // defaults to "locks"; see Several tabs
});
```

## Several tabs

localStorage has no transactions: every append, compaction and clear reads the document's
entry and writes it back. So that two tabs persisting the same key do not overwrite each
other's updates, each of those calls holds a
[Web Lock](https://developer.mozilla.org/docs/Web/API/Web_Locks_API) named
`@homeostate/persist-local-storage:<prefix><key>` meanwhile, and the tabs take turns. Different
keys and prefixes use different locks. `load` reads the entry once and takes no lock.

| `coordination`      | Writers of one key                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `"locks"` (default) | Any number of tabs and windows of the origin. Appends and compactions keep what the others stored, as the `PersistenceAdapter` contract requires. |
| `"single-writer"`   | One tab at a time. Two tabs writing the key at once can lose updates, or a compaction's snapshot.                                                 |

Browsers provide Web Locks in secure contexts only: pages served over https, or from
`localhost`. On a page opened over plain http from another address, such as a LAN IP, with
`"locks"` every append, compaction and clear rejects with an error naming the missing
`navigator.locks` and leaves storage as it was; `createPersistence` reports it through
`onError`, and `flush()` rejects. Serve the page over https, or pass `"single-writer"` when only
one tab writes the storage. A lock request the browser rejects fails the call the same way.

`sessionStorage` belongs to one tab, so `"single-writer"` is safe for it. With the default it
still works, and only waits for tabs using the same prefix and key. The same holds for a storage
you pass in: the lock is named after the prefix and key, not the storage, so give each storage
its own prefix to keep its writers from waiting for another's.

`clear()` removes the entry once the writes before it are done. Another tab that still persists
the key writes it again with its next update, starting a new log.

## Limits

Each document is one JSON entry holding its updates in base64, rewritten on every update.
Browsers allow about 5 MB per origin; a write past that fails and is reported through
`createPersistence`'s `onError`. The next write that succeeds, and `flush()`, try once to
store the whole document again, and `flush()` rejects until a compaction does. For larger
documents use
[`@homeostate/persist-indexeddb`](../../persist-indexeddb/docs/introduction.md).
