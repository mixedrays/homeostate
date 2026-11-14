---
description: Keep a Zustand, Redux, MobX or other store in sync with a Yjs document, mapping state onto Y.Map and Y.Array with fine-grained updates.
label: Introduction
---

# @homeostate/crdt-yjs

[Yjs](https://github.com/yjs/yjs) backend for
[`@homeostate/core`](../../core/docs/introduction.md). It maps the synced state onto a `Y.Map`
(objects become `Y.Map`, arrays `Y.Array`, and strings plain values or, where you choose,
`Y.Text`) and writes fine-grained operations, so a middle-of-array delete, a toggle or a
keystroke each produce one small update.

## Install

```bash install
npm install @homeostate/core @homeostate/crdt-yjs yjs
```

## Usage

```ts
import * as Y from "yjs";
import { createSyncEngine } from "@homeostate/core";
import { createYjsBackend } from "@homeostate/crdt-yjs";

const doc = new Y.Doc();
const engine = createSyncEngine({
  backend: createYjsBackend(doc, "shared"),
  adapter,
});
engine.connect();
```

The synced state lives in `doc.getMap("shared")`. Attach any Yjs provider, such as
[y-websocket](https://github.com/yjs/y-websocket), to `doc` for replication.

`undefined` and functions are not JSON, so the backend leaves out object entries holding
either and stores such array items as `null`, as `JSON.stringify` does.

## Map and origin

Besides `read`, `write` and `subscribe`, the backend has `map`, the synced `Y.Map`, and
`origin`, which tags every transaction its `write` runs. `subscribe` skips transactions with
that origin, so the engine hears only other changes. The origin is a `Symbol` unique to the
backend, so no other writer can share it; to track the backend's writes, pass it to
`Y.UndoManager` as in [Undo and redo](#undo-and-redo).

To keep the synced state in a map you already have, such as one nested in another map or in
a subdocument, pass the map instead of a document and a name:

```ts
const synced = doc.getMap("app").get("store") as Y.Map<unknown>;
const backend = createYjsBackend(synced);
```

The map must already be part of a document, or `createYjsBackend` throws a `TypeError`.
Create a nested map once, such as in the document's initial state: two peers that each set a
new map under the same key keep only one of them.

When a peer replaces the synced map, or a map holding it, no peer would see a write to the
removed map, so from then on the backend's `read` and `write` throw an `Error` whose message
says the synced `Y.Map` was removed. A subscribed backend notices the removal at once, as it is
while its engine is connected: the engine reads, and reports the error as a failure with the
source `'backend'`, to `onError` and in `getStatus().failure`. Without `onError`, the error
propagates from the Yjs update that removed the map, as for any backend failure in a remote
change. Each later store change fails the same way, and the store keeps its state. An engine
connected after the removal throws from `connect()`. To keep syncing, disconnect the engine and
connect a new one over the map that replaced it.

## Undo and redo

`Y.UndoManager` tracks only transactions without an origin by default, so it records none of
the backend's writes. Track the backend's origin instead:

```ts
const backend = createYjsBackend(doc, "shared");
createSyncEngine({ backend, adapter }).connect();
const undoManager = new Y.UndoManager(backend.map, {
  trackedOrigins: new Set([backend.origin]),
});

undoManager.undo();
```

Create the undo manager after `connect()`, so seeding is not a step to undo. It undoes only
this peer's writes; changes from other peers stay. An undo runs with the undo manager as its
origin, so the backend reports it as a remote change and the store follows. One step covers
the writes made within `captureTimeout`, 500 ms by default; `undoManager.stopCapturing()`
ends a step early.

## Strings and text

Strings are plain values by default, so two peers changing an id, a status or a timestamp at
once keep one of the two values. Pass `text` to store chosen strings as `Y.Text`, whose
concurrent edits merge character by character:

```ts
const backend = createYjsBackend(doc, "shared", {
  text: (path) => path[0] === "todos" && path[2] === "title",
});
```

`text` receives the path from the synced map, such as `["todos", 0, "title"]`. `read()`
returns plain strings either way. Give every backend writing to the document the same policy.
A string held as the other kind, such as a `Y.Text` written by an earlier release, reads as
usual and is stored as the configured kind when it next changes. See
[Strings and text](/docs/concepts#strings-and-text).

## Updates out of order

A provider can deliver a peer's update before an earlier one it depends on, as y-websocket
can for about one round trip after a reconnect, or a relay that reorders or drops messages.
Yjs then applies the update's deletes at once and keeps the rest waiting, so a value the
update replaces would vanish until the earlier update arrives.

While its document holds such a waiting update, a subscribed backend shows the state from
before it: `read()` returns what the map held then, `revision()` keeps its value, and
`subscribe` reports nothing. Once the earlier update arrives, the backend reports one change
and the store catches up. The store only ever shows states the document passed through.

Local changes still reach the document meanwhile. A write merges what the store changed into
what the document holds, with what the store was shown as the base, so it never puts back a
value the waiting update replaced, and keeps the changes other peers made in the meantime:

- Objects merge key by key, and a key the store left alone keeps the document's value.
- Arrays merge item by item, and `Y.Text` strings by UTF-16 unit: the store's inserts and
  deletes land among the items the document holds, and an item either side deleted stays
  deleted. A change inside an array item merges key by key.
- An array item is matched with the item the document holds by value, or else by a string,
  number or boolean entry no other item of either array holds, such as an `id`. So the store's change
  to a row lands on that row even where peers inserted or deleted rows beside it and changed
  that row too. Items with no such entry, such as plain strings or rows with duplicated ids, and
  a row whose `id` a peer changed, still match by position, so the store's change can land on a
  neighbour; [Matching array items](../../core/docs/diffing.md#matching-array-items) lists every
  such case.
- Where the store and the document both changed one value, as when both replaced a list item
  or a plain string, the store's value wins, as a later write would. A value the document
  lost stays lost if the store only changed what was inside it, as Yjs drops an edit inside a
  deleted map; if the store replaced it, the store's value is written.
- Object entries holding `undefined` or a function count as absent, and such array items as
  `null`, as the document stores them.
- A value the store holds equal to the document's is left as it is, so an item the store and
  a peer both inserted at one place appears once where the two arrays are otherwise equal,
  not twice, as two concurrent Yjs inserts would.

The merge is [`mergeConcurrent`](../../core/docs/diffing.md#mergeconcurrent) from
`@homeostate/core`, with the backend's `text` option.

The wait has two costs:

- Every other change waits too, such as a peer's change to another key or an undo, for as
  long as the earlier update is missing. A provider that never re-sends a lost update leaves
  the store behind until it resyncs, as y-websocket does on reconnect or with
  `resyncInterval`.
- Yjs tracks waiting updates per document, so one waiting in another shared type of the
  document holds the backend back as well.

## Persistence

Pass `createYjsPersistable(doc)` to `createPersistence`. It stores Yjs updates, so every
shared type in the document is kept, not only the synced map. See the
[persistence guide](/docs/persistence).
