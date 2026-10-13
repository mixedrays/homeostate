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
const engine = createSyncEngine(createYjsBackend(doc, "shared"), adapter);
engine.connect();
```

The synced state lives in `doc.getMap("shared")`. Attach any Yjs provider, such as
[y-websocket](https://github.com/yjs/y-websocket), to `doc` for replication.

`undefined` and functions are not JSON, so the backend leaves out object entries holding
either and stores such array items as `null`, as `JSON.stringify` does.

## Map and origin

Besides `read`, `write` and `subscribe`, the backend has `map`, the synced `Y.Map`, and
`origin`, which tags every transaction its `write` runs. `subscribe` skips transactions with
that origin, so the engine hears only other changes. Pass `origin` to choose the value; it
must be unique to this backend.

To keep the synced state in a map you already have, such as one nested in another map or in
a subdocument, pass the map instead of a document and a name:

```ts
const synced = doc.getMap("app").get("store") as Y.Map<unknown>;
const backend = createYjsBackend(synced, { origin: "store" });
```

The map must already be part of a document, or `createYjsBackend` throws a `TypeError`.
Create a nested map once, such as in the document's initial state: two peers that each set a
new map under the same key keep only one of them.

When a peer replaces the synced map, or a map holding it, the backend calls `onRemoved` once,
with an `Error`; by default it logs the error with `console.error`. No peer sees a write to the
removed map, so to keep syncing, disconnect the engine and connect a new one over the map that
replaced it. A backend notices the removal only while subscribed, as it is while its engine is
connected.

## Undo and redo

`Y.UndoManager` tracks only transactions without an origin by default, so it records none of
the backend's writes. Track the backend's origin instead:

```ts
const backend = createYjsBackend(doc, "shared");
createSyncEngine(backend, adapter).connect();
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

## Persistence

Pass `createYjsPersistable(doc)` to `createPersistence`. It stores Yjs updates, so every
shared type in the document is kept, not only the synced map. See the
[persistence guide](/docs/persistence).
