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

| Option   | Default                                       | Description                                                                                                     |
| -------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `filter` | `defaultSyncFilter`, which excludes functions | Which top-level keys are synced, in both directions                                                             |
| `seed`   | `"if-empty"`                                  | On connect, write the keys only the store has into the backend; `"never"` leaves them for the next local change |

On `connect()` the backend's values win over the store's. See
[Connecting](/docs/concepts#connecting) for the full rules.

## Persistence

`createPersistence(doc, adapter, { key })` keeps a CRDT document in browser storage, so its
state survives reloads, offline starts and every peer leaving the room. `doc` comes from a
backend package, such as `createYjsPersistable(ydoc)`, and `adapter` from
[`@homeostate/persist-indexeddb`](../../persist-indexeddb/docs/introduction.md) or
[`@homeostate/persist-local-storage`](../../persist-local-storage/docs/introduction.md). See
the [persistence guide](/docs/persistence).

## Testing

`@homeostate/core/testing` has in-memory doubles: `createMemoryBackend()`, a plain JSON
backend without replication, and `createMemoryPersistenceAdapter()`.

## Writing a backend

`getChanges(current, next)` turns a `write(next)` into fine-grained changes, so a backend can
apply small edits instead of replacing the document. `applyChanges` applies them to a
mutable target through your own set, remove and splice operations.

String changes use UTF-16 offsets into the progressively edited string, as JavaScript
indexes strings. The diff never splits a surrogate pair, but it does split graphemes made of
several code points, such as a joined emoji. For a string `DELETE`, the third entry is the
number of UTF-16 units to remove (`undefined` means one), and a backend must remove them in
one operation:

```ts
getChanges("😀a😃b", "😀ab");
// [["delete", 3, 2]]: remove the whole 😃 surrogate pair
```

A backend whose text index is not UTF-16 must translate both offsets and lengths.
